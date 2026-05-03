const { v4: uuidv4 } = require('uuid');
const logger = require('../../utils/logger');

// Attaches a unique request ID and logs every inbound request
const requestLogger = (req, res, next) => {
  req.requestId = req.headers['x-request-id'] || uuidv4();
  res.setHeader('X-Request-ID', req.requestId);

  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error'
                : res.statusCode >= 400 ? 'warn'
                : 'info';

    logger[level](
      `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms | ` +
      `IP: ${req.ip} | ID: ${req.requestId}`
    );
  });

  next();
};

module.exports = requestLogger;