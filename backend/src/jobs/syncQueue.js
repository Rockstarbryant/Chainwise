const { Queue, Worker, QueueEvents } = require('bullmq');
const { createBullConnection } = require('../config/redis');
const { syncExchange }         = require('../services/exchangeSync');
const logger                   = require('../../utils/logger');
const { withLock }             = require('../../utils/redisLock');

const QUEUE_NAME = 'exchange-sync';

let syncQueue   = null;
let syncWorker  = null;
let syncEvents  = null;

// ── Queue — for adding jobs ───────────────────────────────────────────────
const getQueue = () => {
  if (!syncQueue) {
    syncQueue = new Queue(QUEUE_NAME, {
      connection: createBullConnection(),
      defaultJobOptions: {
        attempts:  3,
        backoff:   { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 50 },
        removeOnFail:     { count: 20 },
      },
    });
    logger.info('[queue] Exchange sync queue initialized');
  }
  return syncQueue;
};

// ── Worker with Global Lock ───────────────────────────────────────────────
const startWorker = () => {
  if (syncWorker) return;

  syncWorker = new Worker(
    QUEUE_NAME,
    async (job) => {
      return await withLock('exchange-sync', async () => {
        const { exchangeKey, adminUserId } = job.data;
        logger.info(`[worker] ▶ Processing: ${exchangeKey} | job ${job.id}`);

        try {
          const result = await syncExchange(exchangeKey, adminUserId);
          logger.info(`[worker] ✓ Done: ${exchangeKey} — ${result.synced} coins synced`);
          return result;
        } catch (err) {
          logger.error(`[worker] ✕ Failed: ${exchangeKey} — ${err.message}`);
          throw err; // let BullMQ retry
        }
      });
    },
    {
      connection:  createBullConnection(),
      concurrency: 1,                    // Important: Reduced to 1
      limiter: {
        max:      5,
        duration: 60000,
      },
    }
  );

  // ── Worker event listeners ────────────────────────────────────────────
  syncWorker.on('completed', (job, result) => {
    logger.info(`[worker] ✓ Job ${job.id} completed: ${JSON.stringify(result)}`);
  });

  syncWorker.on('failed', (job, err) => {
    logger.error(`[worker] ✕ Job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`);
  });

  syncWorker.on('active', (job) => {
    logger.info(`[worker] ⚡ Job ${job.id} started: ${job.data.exchangeKey}`);
  });

  syncWorker.on('error', (err) => {
    logger.error(`[worker] Worker error: ${err.message}`);
  });

  // ── Queue Events ──────────────────────────────────────────────────────
  syncEvents = new QueueEvents(QUEUE_NAME, {
    connection: createBullConnection(),
  });

  syncEvents.on('completed', ({ jobId }) => {
    logger.info(`[events] Job ${jobId} completed`);
  });

  syncEvents.on('failed', ({ jobId, failedReason }) => {
    logger.error(`[events] Job ${jobId} failed: ${failedReason}`);
  });

  logger.info('[worker] ✓ Exchange sync worker started with global lock');
};

// ── Add a single sync job ─────────────────────────────────────────────────
const queueSync = async (exchangeKey, adminUserId, priority = 3) => {
  const queue = getQueue();

  const dedupKey = `${exchangeKey}-${adminUserId}`;
  const existing = await queue.getJob(dedupKey);

  if (existing) {
    const state = await existing.getState();
    if (state === 'active' || state === 'waiting') {
      logger.info(`[queue] Skipping ${exchangeKey} — job already ${state}`);
      return existing.id;
    }
  }

  const jobId = `${dedupKey}-${Date.now()}`;

  const job = await queue.add(
    `sync:${exchangeKey}`,
    { exchangeKey, adminUserId },
    {
      priority,
      jobId,
      removeOnComplete: true,
      removeOnFail:     false,
    }
  );

  logger.info(`[queue] ✓ Queued: ${exchangeKey} | jobId: ${job.id}`);
  return job.id;
};

// ── Queue all valid exchanges for a user ──────────────────────────────────
const queueAllExchanges = async (adminUserId) => {
  const ExchangeApiKey = require('../models/ExchangeApiKey');
  const keys = await ExchangeApiKey.find({
    adminUserId,
    autoSync: true,
    isValid:  true,
  });

  if (keys.length === 0) {
    logger.info(`[queue] No valid API keys for admin ${adminUserId}`);
    return [];
  }

  const jobIds = [];
  for (const key of keys) {
    try {
      const id = await queueSync(key.exchange, adminUserId);
      jobIds.push({ exchange: key.exchange, jobId: id });
    } catch (err) {
      logger.error(`[queue] Failed to queue ${key.exchange}: ${err.message}`);
    }
  }

  logger.info(`[queue] Queued ${jobIds.length} sync jobs`);
  return jobIds;
};

// ── Get queue stats ────────────────────────────────────────────────────────
const getQueueStats = async () => {
  try {
    const queue  = getQueue();
    const counts = await queue.getJobCounts('wait', 'active', 'completed', 'failed', 'delayed');
    return counts;
  } catch (err) {
    logger.warn(`[queue] Could not get stats: ${err.message}`);
    return { wait: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
  }
};

// ── Clean up old jobs ──────────────────────────────────────────────────────
const cleanQueue = async () => {
  const queue = getQueue();
  await queue.clean(24 * 60 * 60 * 1000, 10, 'completed');
  await queue.clean(7 * 24 * 60 * 60 * 1000, 10, 'failed');
  logger.info('[queue] Old jobs cleaned');
};

module.exports = {
  getQueue,
  startWorker,
  queueSync,
  queueAllExchanges,
  getQueueStats,
  cleanQueue,
};