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
const giveawayRoutes     = require('./routes/giveaways');
const adminRoute         = require('./routes/admin');
const telegramRoute      = require('./routes/telegram');
const usersRoute         = require('./routes/users');
const agentRoute         = require('./routes/agent');
const p2pRoutes          = require('./routes/p2p');
const feesRoute          = require('./routes/fees');
const syncRoute          = require('./routes/sync');
const feedbackRoute = require('./routes/feedback');

const app = express();

// ── Security & Performance ───────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: process.env.NODE_ENV === 'production',
}));
app.use(corsMiddleware);
app.options('*', corsMiddleware);
app.use(compression());

// ── Body parsing & Logging ───────────────────────────────────────────────
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(requestLogger);
app.use(general);

// ── Routes ───────────────────────────────────────────────────────────────
app.get('/health', (_, res) => {
  res.json({
    status: 'ok',
    environment: process.env.NODE_ENV,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/agent',         agentRoute);
app.use('/api/fees',          feesRoute);
app.use('/api/conversations', conversationsRoute);
app.use('/api/feedback', feedbackRoute);
app.use('/api/giveaways',     giveawayRoutes);
app.use('/api/telegram',      telegramRoute);
app.use('/api/sync',          syncRoute);
app.use('/api/p2p',           p2pRoutes);
app.use('/api/admin',         adminRoute);
app.use('/api/admin/users',   usersRoute);

// ── Error handlers ───────────────────────────────────────────────────────
app.use(notFound);
app.use(globalError);

// ── Redis + Background Services ──────────────────────────────────────────
// ── Redis + Background Services ──────────────────────────────────────────
const waitForRedisAndStartWorker = async (retries = 25, delayMs = 4000) => {
  const { createBullConnection } = require('./config/redis'); // make sure path is correct

  logger.info('[startup] Waiting for Redis...');

  for (let i = 1; i <= retries; i++) {
    let probe = null;
    try {
      probe = createBullConnection();
      
      await probe.ping();
      await probe.quit();

      logger.info('[startup] ✅ Redis is ready — starting background services');

      const { startWorker } = require('./jobs/syncQueue');
      const { startCron }   = require('./jobs/cronJob');
      const { startP2PCron } = require('./jobs/p2pCron');

      startWorker();
      startCron();
      startP2PCron();

      logger.info('✅ BullMQ Worker + All Crons started successfully');
      return;

    } catch (err) {
      if (probe) {
        try { await probe.quit(); } catch (_) {}
      }
      logger.warn(`[startup] Redis not ready (attempt ${i}/${retries}): ${err.message}`);
      
      if (i < retries) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }

  logger.warn('[startup] ❌ Redis unavailable after all retries — running in API-only mode');
};

// ── Start Server ─────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '5000', 10);
let server;

const start = async () => {
  await connectDB();
  server = app.listen(PORT, () => {
    logger.info(`⚡ ChainWise API running on http://localhost:${PORT}`);
  });

  // Validate required env vars at startup — crash loudly if missing
const REQUIRED_ENV = ['GROQ_API_KEY', 'MONGODB_URI', 'ADMIN_EMAILS', 'API_KEY_ENCRYPTION_SECRET', 'TELEGRAM_BOT_TOKEN', 'TWITTER_BEARER_TOKEN', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL', 'TELEGRAM_RATE_LIMIT'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length > 0) {
  logger.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}
logger.info('✅ Environment variables validated');

  waitForRedisAndStartWorker();
  const { startGiveawayScanCron } = require('./jobs/giveawayScan');
  startGiveawayScanCron();

   // ── Telegram Giveaway Scanner (24-hour cycle, free — no API key) ──
   const { startTelegramGiveawayScanCron } = require('./jobs/telegramGiveawayScan');
  startTelegramGiveawayScanCron();

  // Start Telegram Bot if token is provided
// Start Telegram Bot if token is provided
try {
  const telegramBot = require('./telegram/bot');
  telegramBot.start();
} catch (err) {
  logger.error('❌ Failed to initialize Telegram bot:', err.message);
  logger.error('   Stack:', err.stack);   // ← Added for better debugging
}
};

// ── Graceful Shutdown ────────────────────────────────────────────────────
const shutdown = async (signal) => {
  logger.info(`${signal} received — shutting down gracefully...`);

  try { const { stopCron } = require('./jobs/cronJob'); stopCron(); } catch (_) {}
  try { const { stopGiveawayScanCron } = require('./jobs/giveawayScan'); stopGiveawayScanCron(); } catch (_) {}
   try { const { stopTelegramGiveawayScanCron } = require('./jobs/telegramGiveawayScan'); stopTelegramGiveawayScanCron(); } catch (_) {}
  try { 
    const syncMod = require('./jobs/syncQueue'); 
    if (typeof syncMod.stopWorker === 'function') syncMod.stopWorker();
  } catch (_) {}
  try { 
    const p2pMod = require('./jobs/p2pCron'); 
    if (typeof p2pMod.stopP2PCron === 'function') p2pMod.stopP2PCron();
  } catch (_) {}

  server.close(async () => {
    logger.info('HTTP server closed');
    try {
      const mongoose = require('mongoose');
      await mongoose.connection.close();
      logger.info('MongoDB closed');
      process.exit(0);
    } catch (err) {
      logger.error('Error closing MongoDB:', err);
      process.exit(1);
    }
  });

  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => logger.error('Unhandled Rejection:', reason));
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  shutdown('uncaughtException');
});

start();