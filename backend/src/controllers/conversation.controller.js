// controllers/conversation.controller.js
const Conversation = require('../models/Conversation');
const { success, error: sendError } = require('../../utils/response');
const { runAgent, runAgentStream } = require('../agent/loop');

// GET /api/conversations
const list = async (req, res, next) => {
  try {
    const conversations = await Conversation.find(
      { userId: req.userId, isActive: true },
      'title messageCount lastActive createdAt'
    ).sort({ lastActive: -1 }).limit(50).lean();
    return success(res, conversations, 200, { count: conversations.length });
  } catch (err) { next(err); }
};

// POST /api/conversations
const create = async (req, res, next) => {
  try {
    const conversation = await Conversation.create({ userId: req.userId, messages: [] });
    return success(res, conversation, 201);
  } catch (err) { next(err); }
};

// GET /api/conversations/:id
const getOne = async (req, res, next) => {
  try {
    const conversation = await Conversation.findOne({ _id: req.params.id, userId: req.userId }).lean();
    if (!conversation) return sendError(res, 'Conversation not found', 404);
    return success(res, conversation);
  } catch (err) { next(err); }
};

// POST /api/conversations/:id/message  — non-streaming (kept for backwards compat)
const sendMessage = async (req, res, next) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return sendError(res, 'content is required', 400);

    const conversation = await Conversation.findOne({ _id: req.params.id, userId: req.userId });
    if (!conversation) return sendError(res, 'Conversation not found', 404);

    conversation.messages.push({ role: 'user', content: content.trim() });

    const agentMessages = conversation.messages.map(m => ({ role: m.role, content: m.content }));
    const result = await runAgent(agentMessages);

    conversation.messages.push({ role: 'assistant', content: result.message, toolsUsed: result.toolsUsed });
    await conversation.save();

    return success(res, {
      message:        result.message,
      toolsUsed:      result.toolsUsed,
      conversationId: conversation._id,
      usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens },
    });
  } catch (err) { next(err); }
};

// POST /api/conversations/:id/stream  — SSE streaming
//
// Flow:
//   1. Validate + load conversation.
//   2. Persist the user message immediately (so page reloads show it).
//   3. Hand off to runAgentStream — it owns the SSE response lifecycle.
//   4. Listen for the 'done' event on the stream's finish to persist the
//      assistant reply *after* the stream ends cleanly.
//
// The client should listen for { type:'done', message, toolsUsed } and save
// the assistant content into its local state.
//
const sendMessageStream = async (req, res, next) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return sendError(res, 'content is required', 400);

    const conversation = await Conversation.findOne({ _id: req.params.id, userId: req.userId });
    if (!conversation) return sendError(res, 'Conversation not found', 404);

    // Persist user message before streaming starts
    conversation.messages.push({ role: 'user', content: content.trim() });
    await conversation.save();

    // Build message history for the agent
    const agentMessages = conversation.messages.map(m => ({ role: m.role, content: m.content }));

    // We need to capture what the agent produces so we can persist it.
    // Wrap res.write to intercept the 'done' event payload.
    let donePayload = null;
    const originalWrite = res.write.bind(res);
    res.write = (chunk, ...rest) => {
      // Intercept SSE lines to find the 'done' event
      if (typeof chunk === 'string' && chunk.startsWith('data:')) {
        try {
          const json = JSON.parse(chunk.slice(5).trim());
          if (json.type === 'done') donePayload = json;
        } catch {}
      } else if (Buffer.isBuffer(chunk)) {
        try {
          const str = chunk.toString('utf8');
          if (str.startsWith('data:')) {
            const json = JSON.parse(str.slice(5).trim());
            if (json.type === 'done') donePayload = json;
          }
        } catch {}
      }
      return originalWrite(chunk, ...rest);
    };

    // When the SSE stream ends, persist the assistant message
    res.on('finish', async () => {
      if (!donePayload) return;
      try {
        // Reload to avoid stale-save conflicts (user message already saved above)
        const fresh = await Conversation.findById(conversation._id);
        if (!fresh) return;
        fresh.messages.push({
          role:      'assistant',
          content:   donePayload.message || '',
          toolsUsed: donePayload.toolsUsed || [],
        });
        await fresh.save();
      } catch (err) {
        // Non-fatal — message may be missing from history but the stream succeeded
        const logger = require('../../utils/logger');
        logger.error('[conv/stream] Failed to persist assistant message:', err.message);
      }
    });

    await runAgentStream(agentMessages, res);

  } catch (err) {
    if (!res.headersSent) {
      next(err);
    } else {
      const logger = require('../../utils/logger');
      logger.error('[conv/stream] Unhandled error after headers sent:', err);
      try {
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'Unexpected server error', errorType: 'unknown' })}\n\n`);
        res.end();
      } catch (_) {}
    }
  }
};

// DELETE /api/conversations/:id
const remove = async (req, res, next) => {
  try {
    await Conversation.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      { isActive: false }
    );
    return success(res, { deleted: true });
  } catch (err) { next(err); }
};

module.exports = { list, create, getOne, sendMessage, sendMessageStream, remove };