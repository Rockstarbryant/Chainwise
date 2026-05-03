const { error: sendError } = require('../../utils/response');

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

  // Last message must be from user
  if (messages[messages.length - 1].role !== 'user') {
    return sendError(res, 'Last message must have role "user"', 400);
  }

  next();
};

// Validate exchange fee params
const exchangeParams = (req, res, next) => {
  const { exchange } = req.params;
  const validExchanges = ['binance', 'bybit', 'coinex', 'bitget', 'kucoin', 'gateio', 'okx'];

  if (!validExchanges.includes(exchange.toLowerCase())) {
    return sendError(
      res,
      `Unknown exchange '${exchange}'. Valid: ${validExchanges.join(', ')}`,
      400
    );
  }
  req.params.exchange = exchange.toLowerCase();
  next();
};

module.exports = { agentRequest, exchangeParams };