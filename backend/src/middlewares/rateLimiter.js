const rateLimit = require('express-rate-limit');
const logger = require('../../utils/logger');

const onLimitReached = (req, res, options) => {
  logger.warn(`Rate limit hit — IP: ${req.ip} | Route: ${req.originalUrl}`);
};

// General API limit
const general = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { message: 'Too many requests. Please try again in 15 minutes.' },
  },
  handler: (req, res, next, options) => {
    onLimitReached(req, res, options);
    res.status(429).json(options.message);
  },
});

// Strict limit for the AI agent endpoint (expensive Claude calls)
const agentLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 150,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip + (req.user?.id || ''),
  message: {
    success: false,
    error: { message: 'Agent rate limit reached. Max 150 requests/minute.' },
  },
  handler: (req, res, next, options) => {
    onLimitReached(req, res, options);
    res.status(429).json(options.message);
  },
});

// Looser limit for fee reads (cheap DB queries)
const feesLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { message: 'Too many fee requests. Max 1000/minute.' },
  },
});

// P2P market data (public, refreshes every 15min so low limit is fine)
const p2pLimiter = rateLimit({
  windowMs: 60 * 1000,
  max:      30,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, error: { message: 'Too many P2P requests. Max 30/minute.' } },
});

// Auth routes — very strict
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { message: 'Too many auth attempts. Try again in 15 minutes.' },
  },
});

module.exports = { general, agentLimiter, feesLimiter, authLimiter, p2pLimiter };