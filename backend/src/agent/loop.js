const Groq = require('groq-sdk');
const { tools, SYSTEM_PROMPT } = require('./tools');
const { executeTool } = require('./executor');
const logger = require('../../utils/logger');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const MODEL = 'llama-3.3-70b-versatile';

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Classify a user message to determine how many tool iterations it may need.
 * Simple queries (fees, prices) need 1–2. Complex routing needs up to 6.
 */
function getMaxIter(messages) {
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUser) return 4;
  const text = lastUser.content.toLowerCase();

  const complex = [
    'move', 'transfer', 'from.*to', 'bridge', 'stuck', 'recovery',
    'plan', 'route', 'compare all', 'best exchange', 'zero gas',
  ];
  const isComplex = complex.some(p => new RegExp(p).test(text));

  // Greetings / trivial
  if (/^(hi|hello|hey|sup|yo|gm|thanks|ok|cool)\b/.test(text.trim())) return 0;

  return isComplex ? 6 : 3;
}

/**
 * Keep conversation within a token budget.
 * Always preserves: system prompt + last N turns.
 * Never starts with a tool message (confuses Groq).
 */
function trimConversation(messages, maxItems = 24) {
  if (messages.length <= maxItems) return messages;
  const system = messages[0];
  const recent = messages.slice(-(maxItems - 1));
  // Don't start mid-tool-call
  const firstSafe = recent.findIndex(m => m.role === 'user' || m.role === 'assistant');
  return [system, ...recent.slice(Math.max(firstSafe, 0))];
}

/**
 * Truncate large tool results so they don't eat the 4096-token response budget.
 * Keeps the most useful top-level fields and trims deep arrays.
 */
function truncateToolResult(result, maxChars = 2500) {
  if (!result || typeof result !== 'object') return result;
  const str = JSON.stringify(result);
  if (str.length <= maxChars) return result;

  // Drop verbose array fields that tend to be large
  const DROPPABLE = [
    'allOptions', 'allRoutes', 'allNetworks', 'coins', 'comparison',
    'routes', 'topBuyAds', 'topSellAds', 'ads',
  ];

  const trimmed = { ...result, _truncated: true, _originalSize: str.length };

  for (const key of DROPPABLE) {
    if (Array.isArray(trimmed[key]) && trimmed[key].length > 3) {
      trimmed[key] = trimmed[key].slice(0, 3);
    }
  }

  // If still too big, hard-truncate the JSON string representation
  const reStr = JSON.stringify(trimmed);
  if (reStr.length > maxChars) {
    return { _hardTruncated: true, preview: reStr.slice(0, maxChars) };
  }
  return trimmed;
}

// ── Error classifier ───────────────────────────────────────────────────────
function classifyError(err) {
  const msg = (err?.message || err?.toString() || '').toLowerCase();

  if (err?.status === 429 || msg.includes('429') || msg.includes('rate limit') || msg.includes('too many')) {
    return {
      type: 'rate_limit',
      userFacing: '⏳ The AI service is temporarily busy (rate limit). Please wait 30–60 seconds and try again.\n\nIn the meantime, you can browse fee data directly in the **Fees** tab.',
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

// ── Groq call with retry ───────────────────────────────────────────────────
async function groqCall(params, attempt = 1) {
  try {
    return await groq.chat.completions.create(params);
  } catch (err) {
    const classified = classifyError(err);
    if (classified.retryable && attempt === 1 && (classified.type === 'rate_limit' || classified.type === 'overloaded')) {
      const delay = classified.type === 'rate_limit' ? 8000 : 3000;
      logger.warn(`[agent] Groq ${classified.type} on attempt ${attempt} — retrying in ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
      return groqCall(params, 2);
    }
    throw { ...err, _classified: classified };
  }
}

// ── Streaming Groq call ────────────────────────────────────────────────────
async function groqStream(params) {
  return groq.chat.completions.create({ ...params, stream: true });
}

// ── Main agent runner (non-streaming) ─────────────────────────────────────
async function runAgent(messages) {
  const MAX_ITER = getMaxIter(messages);

  // If it's a greeting, respond immediately without any tool calls
  if (MAX_ITER === 0) {
    return {
      message: "Hey! I'm ChainWise — I help you find the cheapest withdrawal routes, live P2P rates, bridge paths, giveaways, and more.\n\nWhat are you working on?",
      toolsUsed: [],
      isError: false,
      inputTokens: 0,
      outputTokens: 0,
    };
  }

  const rawConversation = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages
      .filter(m => m.content?.trim())
      .map(m => ({ role: m.role, content: m.content })),
  ];
  const conversation = trimConversation(rawConversation, 24);

  const toolsUsed = [];
  let iterations = 0;

  const requestParams = {
    model: MODEL,
    messages: conversation,
    tools,
    tool_choice: 'auto',
    max_tokens: 4096,
    temperature: 0.2,
  };

  let response;
  try {
    response = await groqCall(requestParams);
  } catch (err) {
    const classified = err._classified || classifyError(err);
    logger.error(`[agent] Initial Groq call failed (${classified.type}):`, err.message || err);
    return { message: classified.userFacing, toolsUsed: [], isError: true, errorType: classified.type, inputTokens: 0, outputTokens: 0 };
  }

  // ── Agentic loop ──────────────────────────────────────────────────────────
  while (response.choices[0].finish_reason === 'tool_calls' && iterations < MAX_ITER) {
    iterations++;
    const assistantMessage = response.choices[0].message;
    const toolCalls = assistantMessage.tool_calls || [];
    if (toolCalls.length === 0) break;

    conversation.push(assistantMessage);

    const toolResults = await Promise.all(
      toolCalls.map(async (call) => {
        const toolName = call.function.name;
        let input = {};
        try { input = JSON.parse(call.function.arguments); } catch {
          logger.warn(`[agent] Failed to parse args for tool ${toolName}`);
        }

        logger.debug(`[agent] iter=${iterations} tool=${toolName} input=${JSON.stringify(input)}`);
        const result = await executeTool(toolName, input);
        if (result?.error) logger.warn(`[agent] tool=${toolName} error: ${result.error}`);

        toolsUsed.push({ tool: toolName, input, result });

        return {
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(truncateToolResult(result)),
        };
      })
    );

    conversation.push(...toolResults);

    try {
      response = await groqCall({ ...requestParams, messages: trimConversation(conversation, 24) });
    } catch (err) {
      const classified = err._classified || classifyError(err);
      logger.error(`[agent] Groq mid-loop failure iter=${iterations} (${classified.type}):`, err.message || err);
      const partialContent = conversation
        .filter(m => m.role === 'assistant' && typeof m.content === 'string' && m.content?.trim())
        .map(m => m.content)
        .join('\n\n');
      return {
        message: partialContent ? `${partialContent}\n\n---\n${classified.userFacing}` : classified.userFacing,
        toolsUsed,
        isError: true,
        errorType: classified.type,
        inputTokens: 0,
        outputTokens: 0,
      };
    }
  }

  // ── Safety valve ──────────────────────────────────────────────────────────
  if (iterations >= MAX_ITER && response.choices[0].finish_reason === 'tool_calls') {
    logger.warn(`[agent] Hit MAX_ITER (${MAX_ITER}) — forcing final synthesis`);
    try {
      conversation.push({ role: 'user', content: 'Based on all the data retrieved above, please give your final answer now.' });
      response = await groqCall({ ...requestParams, messages: trimConversation(conversation, 24), tools: undefined, tool_choice: undefined });
    } catch (err) {
      const classified = err._classified || classifyError(err);
      return { message: classified.userFacing, toolsUsed, isError: true, errorType: classified.type, inputTokens: 0, outputTokens: 0 };
    }
  }

  return {
    message: response.choices[0].message.content?.trim() || 'No response generated.',
    toolsUsed,
    isError: false,
    inputTokens: response.usage?.prompt_tokens,
    outputTokens: response.usage?.completion_tokens,
  };
}

// ── Streaming agent runner ─────────────────────────────────────────────────
// Yields events via an async generator so the controller can pipe them to SSE.
//
// Event types emitted:
//   { type: 'tool_start',  tool: string, input: object }
//   { type: 'tool_end',    tool: string, result: object }
//   { type: 'delta',       content: string }             ← streamed text chunk
//   { type: 'done',        toolsUsed: array, inputTokens: number, outputTokens: number }
//   { type: 'error',       message: string, errorType: string }
//
async function* runAgentStream(messages) {
  const MAX_ITER = getMaxIter(messages);

  if (MAX_ITER === 0) {
    const greeting = "Hey! I'm ChainWise — I help you find the cheapest withdrawal routes, live P2P rates, bridge paths, giveaways, and more.\n\nWhat are you working on?";
    // Stream greeting word by word for a natural feel
    for (const chunk of greeting.split(' ')) {
      yield { type: 'delta', content: chunk + ' ' };
      await new Promise(r => setTimeout(r, 18));
    }
    yield { type: 'done', toolsUsed: [], inputTokens: 0, outputTokens: 0 };
    return;
  }

  const rawConversation = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages
      .filter(m => m.content?.trim())
      .map(m => ({ role: m.role, content: m.content })),
  ];
  let conversation = trimConversation(rawConversation, 24);

  const toolsUsed = [];
  let iterations = 0;

  const baseParams = {
    model: MODEL,
    messages: conversation,
    tools,
    tool_choice: 'auto',
    max_tokens: 4096,
    temperature: 0.2,
  };

  // ── Tool-call loop (non-streaming, same as before) ─────────────────────
  // We only stream the FINAL text response. Tool calls happen synchronously
  // so we can emit tool_start / tool_end events cleanly.
  let response;
  try {
    response = await groqCall(baseParams);
  } catch (err) {
    const classified = err._classified || classifyError(err);
    yield { type: 'error', message: classified.userFacing, errorType: classified.type };
    return;
  }

  while (response.choices[0].finish_reason === 'tool_calls' && iterations < MAX_ITER) {
    iterations++;
    const assistantMessage = response.choices[0].message;
    const toolCalls = assistantMessage.tool_calls || [];
    if (toolCalls.length === 0) break;

    conversation.push(assistantMessage);

    const toolResults = [];
    for (const call of toolCalls) {
      const toolName = call.function.name;
      let input = {};
      try { input = JSON.parse(call.function.arguments); } catch {}

      yield { type: 'tool_start', tool: toolName, input };

      const result = await executeTool(toolName, input);
      toolsUsed.push({ tool: toolName, input, result });

      yield { type: 'tool_end', tool: toolName, result: truncateToolResult(result, 800) };

      toolResults.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(truncateToolResult(result)),
      });
    }

    conversation.push(...toolResults);
    conversation = trimConversation(conversation, 24);

    try {
      response = await groqCall({ ...baseParams, messages: conversation });
    } catch (err) {
      const classified = err._classified || classifyError(err);
      yield { type: 'error', message: classified.userFacing, errorType: classified.type };
      return;
    }
  }

  // Safety valve
  if (iterations >= MAX_ITER && response.choices[0].finish_reason === 'tool_calls') {
    conversation.push({ role: 'user', content: 'Based on all the data retrieved above, please give your final answer now.' });
    try {
      response = await groqCall({ ...baseParams, messages: trimConversation(conversation, 24), tools: undefined, tool_choice: undefined });
    } catch (err) {
      const classified = err._classified || classifyError(err);
      yield { type: 'error', message: classified.userFacing, errorType: classified.type };
      return;
    }
  }

  // ── Stream the final text response ────────────────────────────────────
  try {
    const streamParams = {
      model: MODEL,
      messages: [
        ...trimConversation(conversation, 24),
        // Replace last assistant tool-call message with the synthesized answer
        // by appending a user turn that asks for final answer
      ],
      max_tokens: 4096,
      temperature: 0.2,
      stream: true,
    };

    // The response already has the final text if finish_reason is 'stop'
    // Stream it chunk by chunk from the existing content
    const finalText = response.choices[0].message.content?.trim() || '';

    if (finalText) {
      // Re-stream using Groq streaming API for the true word-by-word effect
      // Build a minimal conversation: system + the already-synthesized answer
      // Actually — just chunk the existing response to avoid a redundant API call
      const words = finalText.split(/(?<=\s)/); // split keeping whitespace
      for (const chunk of words) {
        yield { type: 'delta', content: chunk };
        // Small delay for natural streaming feel
        await new Promise(r => setTimeout(r, 8));
      }
    }

    yield {
      type: 'done',
      toolsUsed,
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    };

  } catch (err) {
    const classified = classifyError(err);
    yield { type: 'error', message: classified.userFacing, errorType: classified.type };
  }
}

module.exports = { runAgent, runAgentStream };