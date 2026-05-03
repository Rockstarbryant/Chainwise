const Conversation = require('../models/Conversation');
const { success, error: sendError } = require('../../utils/response');
const { runAgent } = require('../agent/loop');

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
    const conversation = await Conversation.create({
      userId: req.userId,
      messages: [],
    });
    return success(res, conversation, 201);
  } catch (err) { next(err); }
};

// GET /api/conversations/:id
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

// POST /api/conversations/:id/message — send a message and get agent response
const sendMessage = async (req, res, next) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return sendError(res, 'content is required', 400);

    const conversation = await Conversation.findOne({
      _id: req.params.id,
      userId: req.userId,
    });
    if (!conversation) return sendError(res, 'Conversation not found', 404);

    // Add user message
    conversation.messages.push({ role: 'user', content: content.trim() });

    // Run agent with full history
    const agentMessages = conversation.messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    const result = await runAgent(agentMessages);

    // Add assistant response
    conversation.messages.push({
      role: 'assistant',
      content: result.message,
      toolsUsed: result.toolsUsed,
    });

    await conversation.save();

    return success(res, {
      message:       result.message,
      toolsUsed:     result.toolsUsed,
      conversationId: conversation._id,
      usage: {
        inputTokens:  result.inputTokens,
        outputTokens: result.outputTokens,
      },
    });
  } catch (err) { next(err); }
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

module.exports = { list, create, getOne, sendMessage, remove };