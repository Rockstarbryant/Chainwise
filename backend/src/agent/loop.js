const { tools, SYSTEM_PROMPT } = require('./tools');
const { executeTool } = require('./executor');
const logger = require('../../utils/logger');

// ── Model fallback chain ───────────────────────────────────────────────────
// Ordered by preference. On rate-limit or tool-call failure, next model is tried.
const MODELS = [
  'openrouter/free',
  'meta-llama/llama-3.3-70b-instruct:free',
];
 
const TOOL_CAPABLE_MODELS = new Set([
  'openrouter/free',
  'meta-llama/llama-3.3-70b-instruct:free',
]);

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// ── Helpers ────────────────────────────────────────────────────────────────

function getMaxIter(messages) {
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUser) return 4;
  const text = lastUser.content.toLowerCase().trim();

  if (/^(hi|hello|hey|sup|yo|gm|thanks|thank you|ok|okay|cool|wassup|wsg|good morning|good afternoon|good evening|good night|howdy|greetings)\b/.test(text)) return 0;

  const AMBIGUOUS_ALONE = [
    'fees', 'fee', 'withdrawal', 'withdraw', 'transfer', 'move',
    'bridge', 'p2p', 'rates', 'rate', 'compare', 'cheapest',
    'deposit', 'networks', 'chains', 'price', 'convert',
  ];
  const words = text.split(/\s+/);
  if (words.length <= 2 && AMBIGUOUS_ALONE.includes(words[0])) return -1;

  const complex = ['move', 'transfer', 'from.*to', 'bridge', 'stuck', 'recovery', 'plan', 'route', 'compare all', 'best exchange', 'zero gas'];
  if (complex.some(p => new RegExp(p).test(text))) return 6;

  return 3;
}

function trimConversation(messages, maxItems = 24) {
  if (messages.length <= maxItems) return messages;
  const system = messages[0];
  const recent = messages.slice(-(maxItems - 1));
  const firstSafe = recent.findIndex(m => m.role === 'user' || m.role === 'assistant');
  return [system, ...recent.slice(Math.max(firstSafe, 0))];
}

function truncateToolResult(result, maxChars = 2500) {
  if (!result || typeof result !== 'object') return result;
  const str = JSON.stringify(result);
  if (str.length <= maxChars) return result;

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

  const reStr = JSON.stringify(trimmed);
  if (reStr.length > maxChars) {
    return { _hardTruncated: true, preview: reStr.slice(0, maxChars) };
  }
  return trimmed;
}

// ── Error classifier ───────────────────────────────────────────────────────
function classifyError(err) {
  const msg = (err?.message || err?.toString() || '').toLowerCase();
  const status = err?.status || err?.statusCode || 0;

  if (status === 429 || msg.includes('429') || msg.includes('rate limit') || msg.includes('too many')) {
    return {
      type: 'rate_limit',
      userFacing: '⏳ The AI service is temporarily busy (rate limit). Please wait 30–60 seconds and try again.\n\nIn the meantime, you can browse fee data directly in the **Fees** tab.',
      retryable: true,
    };
  }
  if (status === 503 || msg.includes('503') || msg.includes('service unavailable') || msg.includes('overloaded')) {
    return {
      type: 'overloaded',
      userFacing: '🔄 The AI model is temporarily overloaded. Please try again in a moment.',
      retryable: true,
    };
  }
  if (status === 402 || msg.includes('402') || msg.includes('credits') || msg.includes('quota')) {
    return {
      type: 'quota',
      userFacing: '⚠️ Free model quota reached. Trying next available model...',
      retryable: true,
    };
  }
  if (status === 401 || status === 403 || msg.includes('invalid api key') || msg.includes('unauthorized')) {
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

// ── OpenRouter API call ────────────────────────────────────────────────────
// Tries models in fallback order. Returns { data, modelUsed }.
async function openRouterCall(params, modelIndex = 0) {
  if (modelIndex >= MODELS.length) {
    throw { message: 'All models exhausted', _classified: { type: 'overloaded', userFacing: '🔄 All available models are temporarily overloaded. Please try again in a minute.', retryable: true } };
  }

  const model = MODELS[modelIndex];

  // If this call requires tools and the model isn't known to support them,
  // skip straight to the next tool-capable model.
  const needsTools = params.tools && params.tools.length > 0 && params.tool_choice !== 'none';
  if (needsTools && !TOOL_CAPABLE_MODELS.has(model)) {
    logger.warn(`[agent] Model ${model} not in tool-capable set — skipping to next`);
    return openRouterCall(params, modelIndex + 1);
  }

  const body = {
    model,
    messages:    params.messages,
    max_tokens:  params.max_tokens  ?? 4096,
    temperature: params.temperature ?? 0.2,
    ...(params.tools      ? { tools: params.tools }           : {}),
    ...(params.tool_choice ? { tool_choice: params.tool_choice } : {}),
    ...(params.stream     ? { stream: params.stream }         : {}),
  };

  logger.info(`[agent] openRouterCall model=${model} modelIndex=${modelIndex}`);

  const res = await fetch(OPENROUTER_API_URL, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'HTTP-Referer':  process.env.APP_URL || 'https://chainwise.app',
      'X-Title':       'ChainWise',
    },
    body: JSON.stringify(body),
  });

  // ── Handle non-OK responses ──────────────────────────────────────────────
  if (!res.ok) {
    let errBody = {};
    try { errBody = await res.json(); } catch {}
    const errMsg = errBody?.error?.message || errBody?.message || res.statusText || 'Unknown error';
    const err = { message: errMsg, status: res.status };
    const classified = classifyError(err);

    logger.warn(`[agent] openRouterCall HTTP ${res.status} model=${model}: ${errMsg}`);

    // Rate-limit or quota on this model → try next model
    if ((classified.type === 'rate_limit' || classified.type === 'quota' || classified.type === 'overloaded') && modelIndex + 1 < MODELS.length) {
      logger.warn(`[agent] Falling back from ${model} to ${MODELS[modelIndex + 1]}`);
      await new Promise(r => setTimeout(r, 1500));
      return openRouterCall(params, modelIndex + 1);
    }

    throw { ...err, _classified: classified };
  }

  // ── Streaming: return raw Response for the caller to consume ────────────
  if (params.stream) {
    return { stream: res, modelUsed: model };
  }

  // ── Non-streaming: parse JSON ────────────────────────────────────────────
  const data = await res.json();

  // OpenRouter sometimes returns a 200 with an error payload
  if (data?.error) {
    const err = { message: data.error.message || 'OpenRouter error', status: data.error.code || 500 };
    const classified = classifyError(err);
    if ((classified.type === 'rate_limit' || classified.type === 'quota') && modelIndex + 1 < MODELS.length) {
      logger.warn(`[agent] OpenRouter error payload, falling back from ${model}`);
      await new Promise(r => setTimeout(r, 1500));
      return openRouterCall(params, modelIndex + 1);
    }
    throw { ...err, _classified: classified };
  }

  // Sanity check
  if (!data?.choices?.[0]) {
    logger.error('[agent] Unexpected OpenRouter response shape:', JSON.stringify(data).slice(0, 400));
    throw { message: 'Invalid response from OpenRouter', _classified: classifyError({ message: 'parse' }) };
  }

  return { data, modelUsed: model };
}

// ── Main agent runner (non-streaming) ─────────────────────────────────────
async function runAgent(messages) {
  const MAX_ITER = getMaxIter(messages);

  if (MAX_ITER === 0) {
    return {
      message:      "Hey! I'm ChainWise — I help you find the cheapest withdrawal routes, live P2P rates, bridge paths, giveaways, and more.\n\nWhat are you working on?",
      toolsUsed:    [],
      isError:      false,
      inputTokens:  0,
      outputTokens: 0,
    };
  }

  if (MAX_ITER === -1) {
    const clarifyConversation = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages.filter(m => m.content?.trim()).map(m => ({ role: m.role, content: m.content })),
    ];
    try {
      const { data } = await openRouterCall({
        messages:    clarifyConversation,
        max_tokens:  150,
        temperature: 0.3,
      });
      return {
        message:      data.choices[0].message.content?.trim() || "Could you give me a bit more detail?",
        toolsUsed:    [],
        isError:      false,
        inputTokens:  data.usage?.prompt_tokens,
        outputTokens: data.usage?.completion_tokens,
      };
    } catch {
      return {
        message:      "Could you be more specific? For example: *\"withdrawal fees on Binance for USDT\"* or *\"P2P rates in Kenya\"*",
        toolsUsed:    [],
        isError:      false,
        inputTokens:  0,
        outputTokens: 0,
      };
    }
  }

  const rawConversation = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages
      .filter(m => m.content?.trim())
      .map(m => ({ role: m.role, content: m.content })),
  ];
  const conversation = trimConversation(rawConversation, 24);

  const toolsUsed = [];
  let iterations  = 0;

  const baseParams = {
    messages:    conversation,
    tools,
    tool_choice: 'auto',
    max_tokens:  4096,
    temperature: 0.2,
  };

  let response, modelUsed;
  try {
    ({ data: response, modelUsed } = await openRouterCall(baseParams));
  } catch (err) {
    const classified = err._classified || classifyError(err);
    logger.error(`[agent] Initial call failed (${classified.type}):`, err.message || err);
    return { message: classified.userFacing, toolsUsed: [], isError: true, errorType: classified.type, inputTokens: 0, outputTokens: 0 };
  }

  // ── Agentic tool loop ─────────────────────────────────────────────────────
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
          role:         'tool',
          tool_call_id: call.id,
          content:      JSON.stringify(truncateToolResult(result)),
        };
      })
    );

    conversation.push(...toolResults);

    try {
      ({ data: response, modelUsed } = await openRouterCall({ ...baseParams, messages: trimConversation(conversation, 24) }));
    } catch (err) {
      const classified = err._classified || classifyError(err);
      logger.error(`[agent] Mid-loop failure iter=${iterations} (${classified.type}):`, err.message || err);
      const partialContent = conversation
        .filter(m => m.role === 'assistant' && typeof m.content === 'string' && m.content?.trim())
        .map(m => m.content)
        .join('\n\n');
      return {
        message:      partialContent ? `${partialContent}\n\n---\n${classified.userFacing}` : classified.userFacing,
        toolsUsed,
        isError:      true,
        errorType:    classified.type,
        inputTokens:  0,
        outputTokens: 0,
      };
    }
  }

  // ── Safety valve ──────────────────────────────────────────────────────────
  if (iterations >= MAX_ITER && response.choices[0].finish_reason === 'tool_calls') {
    logger.warn(`[agent] Hit MAX_ITER (${MAX_ITER}) — forcing final synthesis`);
    try {
      conversation.push({ role: 'user', content: 'Based on all the data retrieved above, please give your final answer now.' });
      ({ data: response, modelUsed } = await openRouterCall({
        ...baseParams,
        messages:    trimConversation(conversation, 24),
        tools:       undefined,
        tool_choice: undefined,
      }));
    } catch (err) {
      const classified = err._classified || classifyError(err);
      return { message: classified.userFacing, toolsUsed, isError: true, errorType: classified.type, inputTokens: 0, outputTokens: 0 };
    }
  }

  logger.info(`[agent] done model=${modelUsed} iters=${iterations}`);

  return {
    message:      response.choices[0].message.content?.trim() || 'No response generated.',
    toolsUsed,
    isError:      false,
    inputTokens:  response.usage?.prompt_tokens,
    outputTokens: response.usage?.completion_tokens,
  };
}

// ── Streaming agent runner ─────────────────────────────────────────────────
// Yields events:
//   { type: 'tool_start',  tool, input }
//   { type: 'tool_end',    tool, result }
//   { type: 'delta',       content }
//   { type: 'done',        toolsUsed, inputTokens, outputTokens }
//   { type: 'error',       message, errorType }
//
async function* runAgentStream(messages) {
  const MAX_ITER = getMaxIter(messages);

  if (MAX_ITER === 0) {
    const greeting = "Hey! I'm ChainWise — I help you find the cheapest withdrawal routes, live P2P rates, bridge paths, giveaways, and more.\n\nWhat are you working on?";
    for (const chunk of greeting.split(' ')) {
      yield { type: 'delta', content: chunk + ' ' };
      await new Promise(r => setTimeout(r, 18));
    }
    yield { type: 'done', toolsUsed: [], inputTokens: 0, outputTokens: 0 };
    return;
  }

  if (MAX_ITER === -1) {
    const clarifyConversation = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages.filter(m => m.content?.trim()).map(m => ({ role: m.role, content: m.content })),
    ];
    try {
      const { data } = await openRouterCall({
        messages:    clarifyConversation,
        max_tokens:  150,
        temperature: 0.3,
      });
      const text = data.choices[0].message.content?.trim() || "Could you give me more detail?";
      for (const chunk of text.split(/(?<=\s)/)) {
        yield { type: 'delta', content: chunk };
        await new Promise(res => setTimeout(res, 12));
      }
    } catch {
      yield { type: 'delta', content: "Could you be more specific? For example: *\"fees on Binance for USDT\"* or *\"P2P rates in Kenya\"*" };
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
  let iterations  = 0;

  const baseParams = {
    messages:    conversation,
    tools,
    tool_choice: 'auto',
    max_tokens:  4096,
    temperature: 0.2,
  };

  // ── Non-streaming tool loop ──────────────────────────────────────────────
  let response, modelUsed;
  try {
    logger.info('[agent:stream] initial call');
    ({ data: response, modelUsed } = await openRouterCall(baseParams));
  } catch (err) {
    logger.error('[agent:stream] initial call failed:', err?.message || err);
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
        role:         'tool',
        tool_call_id: call.id,
        content:      JSON.stringify(truncateToolResult(result)),
      });
    }

    conversation.push(...toolResults);
    conversation = trimConversation(conversation, 24);

    try {
      ({ data: response, modelUsed } = await openRouterCall({ ...baseParams, messages: conversation }));
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
      ({ data: response, modelUsed } = await openRouterCall({
        ...baseParams,
        messages:    trimConversation(conversation, 24),
        tools:       undefined,
        tool_choice: undefined,
      }));
    } catch (err) {
      const classified = err._classified || classifyError(err);
      yield { type: 'error', message: classified.userFacing, errorType: classified.type };
      return;
    }
  }

  // ── Stream the final text response word-by-word ──────────────────────────
  // We fake-stream from the already-received text to avoid a redundant API call.
  // OpenRouter streaming is reserved for future use when we want true token streaming.
  const finalText = response.choices[0].message.content?.trim() || '';

  if (finalText) {
    for (const chunk of finalText.split(/(?<=\s)/)) {
      yield { type: 'delta', content: chunk };
      await new Promise(r => setTimeout(r, 8));
    }
  }

  logger.info(`[agent:stream] done model=${modelUsed} iters=${iterations}`);

  yield {
    type:         'done',
    toolsUsed,
    inputTokens:  response.usage?.prompt_tokens  ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
  };
}

module.exports = { runAgent, runAgentStream };