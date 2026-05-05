const Groq = require('groq-sdk');
const { tools, SYSTEM_PROMPT } = require('./tools');
const { executeTool } = require('./executor');
const logger = require('../../utils/logger');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const MODEL    = 'llama-3.3-70b-versatile';
const MAX_ITER = 8; // increased from 5 — complex routing needs more iterations

// ── Error classifier ───────────────────────────────────────────────────────
function classifyError(err) {
  const msg = (err?.message || err?.toString() || '').toLowerCase();

  if (err?.status === 429 || msg.includes('429') || msg.includes('rate limit') || msg.includes('too many')) {
    return {
      type: 'rate_limit',
      userFacing: '⏳ The AI service is temporarily busy (rate limit reached). Please wait 30–60 seconds and try again.\n\nIn the meantime, you can browse fee data directly at the **Fees** tab.',
      retryable: true,
    };
  }
  if (err?.status === 503 || msg.includes('503') || msg.includes('service unavailable') || msg.includes('overloaded')) {
    return {
      type: 'overloaded',
      userFacing: '🔄 The AI model is temporarily overloaded. Please try again in a moment.',
      retryable: true,
    };
  }
  if (err?.status === 401 || err?.status === 403 || msg.includes('invalid api key') || msg.includes('unauthorized')) {
    return {
      type: 'auth',
      userFacing: '🔑 There\'s a configuration issue on our end. Please try again shortly or contact support.',
      retryable: false,
    };
  }
  if (msg.includes('context_length') || msg.includes('max tokens') || msg.includes('too long')) {
    return {
      type: 'context_limit',
      userFacing: '📏 This conversation has grown very long. Please start a **New Chat** and re-ask your question — I\'ll have full capacity again.',
      retryable: false,
    };
  }
  if (msg.includes('econnrefused') || msg.includes('etimedout') || msg.includes('enotfound') || msg.includes('network')) {
    return {
      type: 'network',
      userFacing: '🔌 Network connectivity issue. Please check your connection and try again.',
      retryable: true,
    };
  }
  if (msg.includes('json') || msg.includes('parse') || msg.includes('syntax')) {
    return {
      type: 'parse',
      userFacing: '⚙️ I encountered a data parsing issue. Please rephrase your question and try again.',
      retryable: true,
    };
  }

  return {
    type: 'unknown',
    userFacing: '⚠️ Something went wrong on our end. Please try again in a moment.',
    retryable: true,
  };
}

// ── Groq call with retry on transient errors ───────────────────────────────
async function groqCall(params, attempt = 1) {
  try {
    return await groq.chat.completions.create(params);
  } catch (err) {
    const classified = classifyError(err);

    // Retry once on rate limit / overload with backoff
    if (classified.retryable && attempt === 1 && (classified.type === 'rate_limit' || classified.type === 'overloaded')) {
      const delay = classified.type === 'rate_limit' ? 8000 : 3000;
      logger.warn(`[agent] Groq ${classified.type} on attempt ${attempt} — retrying in ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
      return groqCall(params, 2);
    }

    throw { ...err, _classified: classified };
  }
}

// ── Main agent runner ──────────────────────────────────────────────────────
async function runAgent(messages) {
  // Build conversation — strip any empty content to avoid Groq validation errors
  const conversation = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages
      .filter(m => m.content?.trim())
      .map(m => ({ role: m.role, content: m.content })),
  ];

  const toolsUsed  = [];
  let   iterations = 0;

  const requestParams = {
    model:       MODEL,
    messages:    conversation,
    tools,
    tool_choice: 'auto',
    max_tokens:  4096,
    temperature: 0.2, // lower = more deterministic for routing/fee answers
  };

  let response;
  try {
    response = await groqCall(requestParams);
  } catch (err) {
    const classified = err._classified || classifyError(err);
    logger.error(`[agent] Initial Groq call failed (${classified.type}):`, err.message || err);
    return {
      message:     classified.userFacing,
      toolsUsed:   [],
      isError:     true,
      errorType:   classified.type,
      inputTokens:  0,
      outputTokens: 0,
    };
  }

  // ── Agentic loop ─────────────────────────────────────────────────────────
  while (
    response.choices[0].finish_reason === 'tool_calls' &&
    iterations < MAX_ITER
  ) {
    iterations++;

    const assistantMessage = response.choices[0].message;
    const toolCalls        = assistantMessage.tool_calls || [];

    if (toolCalls.length === 0) break;

    // Append assistant tool_calls message
    conversation.push(assistantMessage);

    // Execute all tool calls in parallel
    const toolResults = await Promise.all(
      toolCalls.map(async (call) => {
        const toolName = call.function.name;
        let input = {};

        try {
          input = JSON.parse(call.function.arguments);
        } catch {
          logger.warn(`[agent] Failed to parse args for tool ${toolName}: ${call.function.arguments}`);
        }

        logger.debug(`[agent] iter=${iterations} tool=${toolName} input=${JSON.stringify(input)}`);

        const result = await executeTool(toolName, input);

        // Log tool errors without crashing the loop
        if (result?.error) {
          logger.warn(`[agent] tool=${toolName} returned error: ${result.error}`);
        }

        toolsUsed.push({ tool: toolName, input, result });

        return {
          role:         'tool',
          tool_call_id: call.id,
          content:      JSON.stringify(result),
        };
      })
    );

    conversation.push(...toolResults);

    // Continue the loop with updated conversation
    try {
      response = await groqCall({ ...requestParams, messages: conversation });
    } catch (err) {
      const classified = err._classified || classifyError(err);
      logger.error(`[agent] Groq call failed mid-loop iter=${iterations} (${classified.type}):`, err.message || err);

      // Return partial result with what we have so far + error message
      const partialContent = conversation
        .filter(m => m.role === 'assistant' && typeof m.content === 'string' && m.content.trim())
        .map(m => m.content)
        .join('\n\n');

      return {
        message: partialContent
          ? `${partialContent}\n\n---\n${classified.userFacing}`
          : classified.userFacing,
        toolsUsed,
        isError:     true,
        errorType:   classified.type,
        inputTokens:  0,
        outputTokens: 0,
      };
    }
  }

  // ── Safety valve: if loop hit max iterations ───────────────────────────
  if (iterations >= MAX_ITER && response.choices[0].finish_reason === 'tool_calls') {
    logger.warn(`[agent] Hit MAX_ITER (${MAX_ITER}) — forcing final synthesis`);

    // Force a final response without tools
    try {
      conversation.push({
        role:    'user',
        content: 'Based on all the data retrieved above, please give your final answer now.',
      });
      response = await groqCall({
        ...requestParams,
        messages:    conversation,
        tools:       undefined,
        tool_choice: undefined,
      });
    } catch (err) {
      const classified = err._classified || classifyError(err);
      return {
        message:     classified.userFacing,
        toolsUsed,
        isError:     true,
        errorType:   classified.type,
        inputTokens:  0,
        outputTokens: 0,
      };
    }
  }

  const finalMessage = response.choices[0].message.content?.trim() || 'No response generated.';

  return {
    message:      finalMessage,
    toolsUsed,
    isError:      false,
    inputTokens:  response.usage?.prompt_tokens,
    outputTokens: response.usage?.completion_tokens,
  };
}

module.exports = { runAgent };