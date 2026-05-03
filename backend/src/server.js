require('dotenv').config();
const express    = require('express');
const helmet     = require('helmet');
const compression = require('compression');
const connectDB  = require('./config/db');
const corsMiddleware  = require('./middlewares/cors');
const requestLogger   = require('./middlewares/requestLogger');
const { general }     = require('./middlewares/rateLimiter');
const { notFound, globalError } = require('./middlewares/errorHandler');
const logger = require('../utils/logger');
const conversationsRoute = require('./routes/conversations');
const adminRoute         = require('./routes/admin');
const agentRoute = require('./routes/agent');
const feesRoute  = require('./routes/fees');

const app = express();

// ── Security ───────────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: process.env.NODE_ENV === 'production',
}));
app.use(corsMiddleware);
app.options('*', corsMiddleware); // preflight

// ── Performance ────────────────────────────────────────────────────────────
app.use(compression());

// ── Body parsing ───────────────────────────────────────────────────────────
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// ── Request logging ────────────────────────────────────────────────────────
app.use(requestLogger);

// ── Global rate limit ──────────────────────────────────────────────────────
app.use(general);

// ── Health check (no rate limit, no auth) ─────────────────────────────────
app.get('/health', (_, res) => {
  res.json({
    status: 'ok',
    environment: process.env.NODE_ENV,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// ── API routes ─────────────────────────────────────────────────────────────
app.use('/api/agent', agentRoute);
app.use('/api/fees',  feesRoute);
app.use('/api/conversations', conversationsRoute);
app.use('/api/admin',         adminRoute);

// ── 404 + Global error handlers (must be last) ────────────────────────────
app.use(notFound);
app.use(globalError);

// ── Start server ───────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '5000', 10);
let server;

const start = async () => {
  await connectDB();
  server = app.listen(PORT, () => {
    logger.info(`⚡ ChainWise API  →  http://localhost:${PORT}`);
    logger.info(`   Health check   →  http://localhost:${PORT}/health`);
    logger.info(`   Environment    →  ${process.env.NODE_ENV || 'development'}`);
  });
};

// ── Graceful shutdown ──────────────────────────────────────────────────────
const shutdown = async (signal) => {
  logger.info(`${signal} received — shutting down gracefully...`);

  server.close(async () => {
    logger.info('HTTP server closed');
    try {
      const mongoose = require('mongoose');
      await mongoose.connection.close();
      logger.info('MongoDB connection closed');
      process.exit(0);
    } catch (err) {
      logger.error('Error during shutdown:', err);
      process.exit(1);
    }
  });

  // Force exit after 10s if still hanging
  setTimeout(() => {
    logger.error('Forced exit after 10s timeout');
    process.exit(1);
  }, 10_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection:', { reason, promise });
});
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  shutdown('uncaughtException');
});

start();