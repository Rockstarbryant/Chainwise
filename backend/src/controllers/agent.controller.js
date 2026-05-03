const { runAgent } = require('../agent/loop');
const { success, error: sendError } = require('../../utils/response');
const logger = require('../../utils/logger');

const chat = async (req, res, next) => {
  try {
    const { messages } = req.body;

    logger.debug(`[agent] user=${req.user?.id || 'anon'} | turns=${messages.length}`);

    const result = await runAgent(messages);

    return success(res, {
      message:    result.message,
      toolsUsed:  result.toolsUsed,
      usage: {
        inputTokens:  result.inputTokens,
        outputTokens: result.outputTokens,
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { chat };