require('dotenv').config();
const express     = require('express');
const helmet      = require('helmet');
const compression = require('compression');
const connectDB   = require('./config/db');
const corsMiddleware  = require('./middlewares/cors');
const requestLogger   = require('./middlewares/requestLogger');
const { general }     = require('./middlewares/rateLimiter');
const { notFound, globalError } = require('./middlewares/errorHandler');
const logger = require('../utils/logger');
const conversationsRoute = require('./routes/conversations');
const adminRoute         = require('./routes/admin');
const agentRoute = require('./routes/agent');
const feesRoute  = require('./routes/fees');
const syncRoute  = require('./routes/sync');

const app = express();

// ── Security ───────────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: process.env.NODE_ENV === 'production',
}));
app.use(corsMiddleware);
app.options('*', corsMiddleware);

// ── Performance ────────────────────────────────────────────────────────────
app.use(compression());

// ── Body parsing ───────────────────────────────────────────────────────────
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// ── Request logging ────────────────────────────────────────────────────────
app.use(requestLogger);

// ── Global rate limit ──────────────────────────────────────────────────────
app.use(general);

// ── Health check ───────────────────────────────────────────────────────────
app.get('/health', (_, res) => {
  res.json({
    status: 'ok',
    environment: process.env.NODE_ENV,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// ── API routes ─────────────────────────────────────────────────────────────
app.use('/api/agent',         agentRoute);
app.use('/api/fees',          feesRoute);
app.use('/api/conversations', conversationsRoute);
app.use('/api/sync',          syncRoute);
app.use('/api/admin',         adminRoute);

// ── 404 + Global error handlers ───────────────────────────────────────────
app.use(notFound);
app.use(globalError);

// ── Redis readiness check ──────────────────────────────────────────────────
// Builds the probe connection the same way redis.js does — URL as first arg,
// options as second — so TLS and all settings are applied identically.
const waitForRedisAndStartWorker = async (retries = 20, delayMs = 3000) => {
  const { Redis } = require('ioredis');
  const REDIS_URL = process.env.REDIS_URL || null;

  // Mirror the TLS detection from redis.js
  const isTlsUrl = (url) =>
    url.startsWith('rediss://') ||
    url.includes('redislabs.com') ||
    url.includes('upstash.io') ||
    url.includes('redis.cloud');

  // Build probe options — must match what makeRedis() does in redis.js
  const makeProbe = () => {
    if (REDIS_URL) {
      const tlsOptions = isTlsUrl(REDIS_URL) ? { tls: { rejectUnauthorized: false } } : {};
      return new Redis(REDIS_URL, {
        maxRetriesPerRequest: 1,
        enableReadyCheck:     false,
        lazyConnect:          true,
        ...tlsOptions,
      });
    }
    return new Redis({
      host:                 process.env.REDIS_HOST || '127.0.0.1',
      port:                 parseInt(process.env.REDIS_PORT || '6379'),
      password:             process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: 1,
      enableReadyCheck:     false,
      lazyConnect:          true,
    });
  };

  for (let i = 1; i <= retries; i++) {
    let probe = null;
    try {
      probe = makeProbe();
      await probe.connect();
      await probe.ping();
      await probe.quit();

      logger.info('[startup] Redis is ready — starting BullMQ worker and cron');
      const { startWorker } = require('./jobs/syncQueue');
      const { startCron }   = require('./jobs/cronJob');
      startWorker();
      startCron();
      logger.info('✓ BullMQ worker and hourly cron started');
      return;

    } catch (err) {
      try { if (probe) await probe.quit(); } catch (_) {}
      logger.warn(`[startup] Redis not ready (attempt ${i}/${retries}): ${err.message}`);
      if (i < retries) await new Promise(r => setTimeout(r, delayMs));
    }
  }

  logger.warn('[startup] Redis unavailable after all retries — worker/cron skipped. Agent + fees still operational.');
};

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

  // Non-blocking — HTTP is already up when this runs
  waitForRedisAndStartWorker();
};

// ── Graceful shutdown ──────────────────────────────────────────────────────
const shutdown = async (signal) => {
  try { const { stopCron } = require('./jobs/cronJob'); stopCron(); } catch (_) {}
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