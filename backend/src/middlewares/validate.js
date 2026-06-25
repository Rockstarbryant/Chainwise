const { error: sendError } = require('../../utils/response');
const ExchangeFee = require('../models/ExchangeFee');

// Validate agent chat body
const agentRequest = (req, res, next) => {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return sendError(res, '`messages` must be a non-empty array', 400);
  }
  if (messages.length === 0) {
    return sendError(res, '`messages` array cannot be empty', 400);
  }
  if (messages.length > 50) {
    return sendError(res, 'Conversation history too long. Max 50 messages.', 400);
  }

  for (const [i, msg] of messages.entries()) {
    if (!msg.role || !['user', 'assistant'].includes(msg.role)) {
      return sendError(res, `messages[${i}].role must be "user" or "assistant"`, 400);
    }
    if (!msg.content || typeof msg.content !== 'string' || !msg.content.trim()) {
      return sendError(res, `messages[${i}].content must be a non-empty string`, 400);
    }
    if (msg.content.length > 4000) {
      return sendError(res, `messages[${i}].content exceeds 4000 characters`, 400);
    }
  }

  if (messages[messages.length - 1].role !== 'user') {
    return sendError(res, 'Last message must have role "user"', 400);
  }

  next();
};

// Validate exchange fee params — dynamic from DB, no hardcoded list
const exchangeParams = async (req, res, next) => {
  try {
    const { exchange } = req.params;
    const slug = exchange.toLowerCase();

    const doc = await ExchangeFee.findOne({ exchange: slug }, '_id').lean();
    if (!doc) {
      const valid = await ExchangeFee.distinct('exchange');
      return sendError(
        res,
        `Unknown exchange '${exchange}'. Valid: ${valid.sort().join(', ')}`,
        400
      );
    }

    req.params.exchange = slug;
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { agentRequest, exchangeParams };