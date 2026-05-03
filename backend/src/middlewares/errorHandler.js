const logger = require('../../utils/logger');
const { error: sendError } = require('../../utils/response');

// 404 — no route matched
const notFound = (req, res, next) => {
  next({ status: 404, message: `Route not found: ${req.method} ${req.originalUrl}` });
};

// Global error handler — must be last app.use()
const globalError = (err, req, res, next) => {
  // CORS errors
  if (err.message?.includes('not allowed by CORS')) {
    return sendError(res, err.message, 403);
  }

  // Mongoose validation
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(e => e.message);
    return sendError(res, 'Validation failed', 400, { fields: messages });
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'field';
    return sendError(res, `Duplicate value for ${field}`, 409);
  }

  // JWT / auth
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return sendError(res, 'Invalid or expired token', 401);
  }

  // Rate limiter (express-rate-limit already sends response, but just in case)
  if (err.status === 429) {
    return sendError(res, err.message, 429);
  }

  const statusCode = err.status || err.statusCode || 500;
  const message    = err.message || 'Internal server error';

  if (statusCode >= 500) {
    logger.error(`[${req.requestId}] ${message}`, { stack: err.stack, url: req.originalUrl });
  }

  sendError(
    res,
    process.env.NODE_ENV === 'production' && statusCode === 500
      ? 'Internal server error'
      : message,
    statusCode,
    process.env.NODE_ENV === 'development' ? err : null
  );
};

module.exports = { notFound, globalError };