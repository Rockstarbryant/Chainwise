// controllers/conversation.controller.js

const Conversation = require('../models/Conversation');
const { success, error: sendError } = require('../../utils/response');
const { runAgent, runAgentStream }  = require('../agent/loop');
const logger = require('../../utils/logger');

// ── GET /api/conversations ─────────────────────────────────────────────────
const list = async (req, res, next) => {
  try {
    const conversations = await Conversation.find(
      { userId: req.userId, isActive: true },
      'title messageCount lastActive createdAt'
    ).sort({ lastActive: -1 }).limit(50).lean();
    return success(res, conversations, 200, { count: conversations.length });
  } catch (err) { next(err); }
};

// ── POST /api/conversations ────────────────────────────────────────────────
const create = async (req, res, next) => {
  try {
    const conversation = await Conversation.create({ userId: req.userId, messages: [] });
    return success(res, conversation, 201);
  } catch (err) { next(err); }
};

// ── GET /api/conversations/:id ─────────────────────────────────────────────
const getOne = async (req, res, next) => {
  try {
    const conversation = await Conversation.findOne({
      _id: req.params.id,
      userId: req.userId,
    }).lean();
    if (!conversation) return sendError(res, 'Conversation not found', 404);
    return success(res, conversation);
  } catch (err) { next(err); }
};

// ── POST /api/conversations/:id/message ───────────────────────────────────
//
// Two modes:
//
//  A) skipAgentCall=true  (streaming persist path)
//     useChat.ts already streamed via /api/agent/stream and has the full
//     reply. Save both messages and return — no Groq call made.
//     Body: { content, assistantReply, toolsUsed, skipAgentCall: true }
//
//  B) Normal (legacy JSON / fallback path)
//     Runs the agent synchronously and saves both messages.
//     Body: { content }
//
const sendMessage = async (req, res, next) => {
  try {
    const { content, assistantReply, toolsUsed, skipAgentCall } = req.body;

    if (!content?.trim()) return sendError(res, 'content is required', 400);

    // Use findById + verify ownership separately so we get a full Mongoose
    // document (not lean) — required for the pre-save hook to fire.
    const conversation = await Conversation.findOne({
      _id:    req.params.id,
      userId: req.userId,
    });

    if (!conversation) {
      logger.warn(`[conv/message] Not found or wrong user — id=${req.params.id} userId=${req.userId}`);
      return sendError(res, 'Conversation not found', 404);
    }

    // ── Mode A: streaming already ran — just persist ─────────────────────
    if (skipAgentCall) {
      if (!assistantReply?.trim()) {
        return sendError(res, 'assistantReply is required when skipAgentCall=true', 400);
      }

      const isFirstExchange = conversation.messages.length === 0;

      conversation.messages.push(
        { role: 'user',      content: content.trim(),      timestamp: new Date() },
        { role: 'assistant', content: assistantReply.trim(), toolsUsed: toolsUsed ?? [], timestamp: new Date() },
      );

      // Safety net: if somehow the pre-save hook won't catch it
      // (e.g. title was already mutated to something other than the default),
      // force-set it from the user message on the very first exchange.
      if (isFirstExchange && conversation.title === 'New Conversation') {
        const trimmed = content.trim();
        conversation.title = trimmed.slice(0, 60) + (trimmed.length > 60 ? '...' : '');
        logger.debug(`[conv/message] Title set explicitly: "${conversation.title}"`);
      }

      await conversation.save(); // pre-save hook fires here → sets title + messageCount + lastActive

      logger.info(
        `[conv/message] skipAgentCall persist — id=${conversation._id} ` +
        `msgs=${conversation.messages.length} title="${conversation.title}"`
      );

      return success(res, {
        message:        assistantReply,
        toolsUsed:      toolsUsed ?? [],
        conversationId: conversation._id,
        title:          conversation.title,
      });
    }

    // ── Mode B: run agent synchronously (legacy / fallback) ──────────────
    const isFirstExchange = conversation.messages.length === 0;

    conversation.messages.push({ role: 'user', content: content.trim(), timestamp: new Date() });

    // Safety net for title (same logic as Mode A)
    if (isFirstExchange && conversation.title === 'New Conversation') {
      const trimmed = content.trim();
      conversation.title = trimmed.slice(0, 60) + (trimmed.length > 60 ? '...' : '');
    }

    const agentMessages = conversation.messages.map(m => ({ role: m.role, content: m.content }));
    const result        = await runAgent(agentMessages);

    conversation.messages.push({
      role:      'assistant',
      content:   result.message,
      toolsUsed: result.toolsUsed,
      timestamp: new Date(),
    });

    await conversation.save();

    logger.info(
      `[conv/message] agent persist — id=${conversation._id} ` +
      `msgs=${conversation.messages.length} title="${conversation.title}"`
    );

    return success(res, {
      message:        result.message,
      toolsUsed:      result.toolsUsed,
      conversationId: conversation._id,
      title:          conversation.title,
      usage: {
        inputTokens:  result.inputTokens,
        outputTokens: result.outputTokens,
      },
    });
  } catch (err) { next(err); }
};

// ── POST /api/conversations/:id/stream  (SSE) ─────────────────────────────
//
// Direct SSE streaming from conversation context.
// Available as an alternative to the stateless /api/agent/stream path.
//
// Flow:
//   1. Validate + load conversation.
//   2. Persist user message immediately.
//   3. Stream via runAgentStream.
//   4. Intercept 'done' event to persist the assistant reply.
//
const sendMessageStream = async (req, res, next) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return sendError(res, 'content is required', 400);

    const conversation = await Conversation.findOne({
      _id:    req.params.id,
      userId: req.userId,
    });
    if (!conversation) return sendError(res, 'Conversation not found', 404);

    const isFirstExchange = conversation.messages.length === 0;

    // Persist user message before streaming so a page reload shows it
    conversation.messages.push({ role: 'user', content: content.trim(), timestamp: new Date() });

    // Set title on first message (safety net alongside pre-save hook)
    if (isFirstExchange && conversation.title === 'New Conversation') {
      const trimmed = content.trim();
      conversation.title = trimmed.slice(0, 60) + (trimmed.length > 60 ? '...' : '');
    }

    await conversation.save();

    const agentMessages = conversation.messages.map(m => ({ role: m.role, content: m.content }));

    // ── SSE headers ────────────────────────────────────────────────────
    res.setHeader('Content-Type',      'text/event-stream');
    res.setHeader('Cache-Control',     'no-cache, no-transform');
    res.setHeader('Connection',        'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const keepAlive = setInterval(() => {
      if (!res.writableEnded) res.write(': ping\n\n');
    }, 15_000);

    req.on('close', () => clearInterval(keepAlive));

    let finalMessage = '';
    let finalTools   = [];
    let gotDone      = false;

    const emit = (data) => {
      if (res.writableEnded) return;
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      if (typeof res.flush === 'function') res.flush();

      if (data.type === 'done') {
        finalMessage = data.message  || '';
        finalTools   = data.toolsUsed || [];
        gotDone      = true;
      }
    };

    try {
      for await (const event of runAgentStream(agentMessages)) {
        emit(event);
        if (event.type === 'done' || event.type === 'error') break;
      }
    } catch (streamErr) {
      logger.error('[conv/stream] generator error:', streamErr);
      emit({ type: 'error', message: '⚠️ Something went wrong. Please try again.', errorType: 'unknown' });
    } finally {
      clearInterval(keepAlive);

      if (gotDone && finalMessage) {
        try {
          const fresh = await Conversation.findById(conversation._id);
          if (fresh) {
            fresh.messages.push({
              role:      'assistant',
              content:   finalMessage,
              toolsUsed: finalTools,
              timestamp: new Date(),
            });
            await fresh.save();
            logger.info(`[conv/stream] assistant persisted — id=${fresh._id} title="${fresh.title}"`);
          }
        } catch (saveErr) {
          logger.error('[conv/stream] Failed to persist assistant message:', saveErr);
        }
      }

      if (!res.writableEnded) res.end();
    }

  } catch (err) {
    if (!res.headersSent) {
      next(err);
    } else {
      logger.error('[conv/stream] Unhandled error after headers sent:', err);
      try {
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'Unexpected server error', errorType: 'unknown' })}\n\n`);
        res.end();
      } catch (_) {}
    }
  }
};

// ── DELETE /api/conversations/:id ─────────────────────────────────────────
const remove = async (req, res, next) => {
  try {
    await Conversation.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      { isActive: false },
    );
    return success(res, { deleted: true });
  } catch (err) { next(err); }
};

module.exports = { list, create, getOne, sendMessage, sendMessageStream, remove };