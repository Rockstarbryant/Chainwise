const { runAgent, runAgentStream } = require('../agent/loop');
const { success, error: sendError } = require('../../utils/response');
const logger = require('../../utils/logger');

// ── POST /api/agent  (standard JSON — kept for backward compat) ────────────
const chat = async (req, res, next) => {
  try {
    const { messages } = req.body;
    logger.debug(`[agent] user=${req.user?.id || 'anon'} | turns=${messages.length}`);

    const result = await runAgent(messages);

    return success(res, {
      message:   result.message,
      toolsUsed: result.toolsUsed,
      usage: {
        inputTokens:  result.inputTokens,
        outputTokens: result.outputTokens,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/agent/stream  (SSE streaming) ────────────────────────────────
//
// Emits newline-delimited JSON events:
//
//   data: {"type":"tool_start","tool":"get_withdrawal_fees","input":{...}}
//   data: {"type":"tool_end","tool":"get_withdrawal_fees","result":{...}}
//   data: {"type":"delta","content":"Here are the cheapest "}
//   data: {"type":"delta","content":"withdrawal options..."}
//   data: {"type":"done","toolsUsed":[...],"inputTokens":312,"outputTokens":88}
//   data: {"type":"error","message":"...","errorType":"rate_limit"}
//
// The frontend accumulates 'delta' events into the message bubble in real time.
//
const streamChat = async (req, res, next) => {
  try {
    const { messages } = req.body;
    logger.debug(`[agent:stream] user=${req.user?.id || 'anon'} | turns=${messages.length}`);

    // ── SSE headers ──────────────────────────────────────────────────────
    res.setHeader('Content-Type',  'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection',    'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable Nginx buffering
    res.flushHeaders();

    // Helper: write a single SSE event
    const emit = (data) => {
      if (res.writableEnded) return;
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      // Force flush for proxies / compression middleware
      if (typeof res.flush === 'function') res.flush();
    };

    // Keep-alive ping every 15 s so proxies don't close the connection
    const keepAlive = setInterval(() => {
      if (!res.writableEnded) res.write(': ping\n\n');
    }, 15_000);

    // Handle client disconnect
    req.on('close', () => {
      clearInterval(keepAlive);
    });

    try {
      for await (const event of runAgentStream(messages)) {
        emit(event);
        if (event.type === 'done' || event.type === 'error') break;
      }
    } catch (err) {
      logger.error('[agent:stream] generator error:', err);
      emit({ type: 'error', message: '⚠️ Something went wrong. Please try again.', errorType: 'unknown' });
    } finally {
      clearInterval(keepAlive);
      if (!res.writableEnded) res.end();
    }

  } catch (err) {
    // Headers not sent yet — fall back to normal error handler
    if (!res.headersSent) return next(err);
    logger.error('[agent:stream] unhandled:', err);
    if (!res.writableEnded) res.end();
  }
};

module.exports = { chat, streamChat };