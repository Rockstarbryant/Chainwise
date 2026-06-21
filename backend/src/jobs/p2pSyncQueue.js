const { Queue, Worker, QueueEvents } = require('bullmq');
const { createBullConnection } = require('../config/redis');
const { fetchP2PAds }          = require('../services/p2p');
const P2PAd                    = require('../models/P2PAd');
const logger                   = require('../../utils/logger');
const { getCacheRedis }        = require('../config/redis');

const QUEUE_NAME = 'p2p-sync';
const CACHE_TTL  = 900;

let p2pQueue  = null;
let p2pWorker = null;
let p2pEvents = null;

// ── Exchange support matrix (unchanged from p2pCron.js) ───────────────────
const EXCHANGE_LIMITS = {
  binance:  { assets: null, fiats: null },
  bybit:    { assets: null, fiats: null },
  okx:      { assets: null, fiats: null },
  kucoin:   { assets: null, fiats: null },
  bitget:   { assets: null, fiats: null },
  htx: {
    assets: ['USDT', 'BTC', 'ETH', 'USDC'],
    fiats:  ['KES', 'NGN', 'GHS', 'ZAR', 'INR', 'PKR', 'USD', 'EUR', 'GBP', 'TZS', 'UGX'],
  },
  noones:   { assets: ['USDT', 'BTC', 'ETH'], fiats: null },
  remitano: {
    assets: ['USDT', 'BTC', 'ETH'],
    fiats:  ['KES', 'NGN', 'GHS', 'ZAR', 'TZS', 'UGX', 'USD', 'EUR', 'GBP', 'INR', 'PKR'],
  },
};

function exchangeSupports(exchange, asset, fiat) {
  const limits = EXCHANGE_LIMITS[exchange];
  if (!limits) return true;
  if (limits.assets && !limits.assets.includes(asset)) return false;
  if (limits.fiats  && !limits.fiats.includes(fiat))   return false;
  return true;
}

// ── Queue — for adding jobs ───────────────────────────────────────────────
const getP2PQueue = () => {
  if (!p2pQueue) {
    p2pQueue = new Queue(QUEUE_NAME, {
      connection: createBullConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff:  { type: 'exponential', delay: 3000 },
        removeOnComplete: { count: 100 },
        removeOnFail:     { count: 50 },
      },
    });
    logger.info('[p2pQueue] P2P sync queue initialized');
  }
  return p2pQueue;
};

// ── Worker — processes one (exchange, asset, fiat, tradeType) job at a time ─
// concurrency > 1 here is safe because each job hits a DIFFERENT exchange's
// API, so they don't contend with each other — only with the main process
// if concurrency is set too high. Keep it modest.
const startP2PWorker = () => {
  if (p2pWorker) return;

  p2pWorker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { exchange, asset, fiat, tradeType } = job.data;

      if (!exchangeSupports(exchange, asset, fiat)) {
        return { skipped: true, count: 0 };
      }

      // Circuit breaker check — skip exchanges that have failed repeatedly
      const redis = getCacheRedis();
      const breakerKey = `p2p:breaker:${exchange}`;
      const failCount = parseInt((await redis.get(breakerKey)) || '0', 10);
      if (failCount >= 3) {
        logger.debug(`[p2pWorker] ⏭ ${exchange} circuit open (${failCount} fails) — skipping`);
        return { skipped: true, circuitOpen: true, count: 0 };
      }

      try {
        const result = await fetchP2PAds({ exchange, asset, fiat, tradeType, limit: 20 });

        const cacheKey = `p2p:${exchange}:${asset}:${fiat}:${tradeType}:1`;
        await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL);

        if (result.ads.length > 0) {
          await P2PAd.deleteMany({ exchange, asset, fiat, tradeType });
          await P2PAd.insertMany(
            result.ads.map(ad => ({ ...ad, fetchedAt: new Date() })),
            { ordered: false }
          );
        }

        // Reset circuit breaker on success
        if (failCount > 0) await redis.del(breakerKey);

        logger.info(`[p2pWorker] ✓ ${exchange} ${asset}/${fiat} ${tradeType}: ${result.ads.length} ads`);
        return { count: result.ads.length };

      } catch (err) {
        // Increment circuit breaker — expires after 2 hours so it self-heals
        await redis.set(breakerKey, String(failCount + 1), 'EX', 7200);
        logger.warn(`[p2pWorker] ✗ ${exchange} ${asset}/${fiat} ${tradeType}: ${err.message}`);
        throw err; // let BullMQ retry (max 2 attempts)
      }
    },
    {
      connection:  createBullConnection(),
      concurrency: 3, // a few jobs in parallel — different exchanges, no shared contention
      limiter: {
        max:      10,
        duration: 1000, // max 10 jobs/sec across all workers — gentle on event loop
      },
    }
  );

  p2pWorker.on('failed', (job, err) => {
    logger.warn(`[p2pWorker] Job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`);
  });

  p2pWorker.on('error', (err) => {
    logger.error(`[p2pWorker] Worker error: ${err.message}`);
  });

  p2pEvents = new QueueEvents(QUEUE_NAME, { connection: createBullConnection() });

  logger.info('[p2pWorker] ✓ P2P sync worker started (concurrency=3, rate=10/s)');
};

// ── Pair matrix (unchanged) ────────────────────────────────────────────────
const WARM_PAIRS = [
  { fiat: 'KES', assets: ['USDT', 'USDC'] },
  { fiat: 'NGN', assets: ['USDT', 'USDC'] },
  { fiat: 'GHS', assets: ['USDT'] },
  { fiat: 'ZAR', assets: ['USDT'] },
  { fiat: 'INR', assets: ['USDT', 'USDC'] },
  { fiat: 'PKR', assets: ['USDT'] },
  { fiat: 'USD', assets: ['USDT', 'USDC', 'BTC'] },
];

const ALL_EXCHANGES = [
  'binance', 'okx', 'kucoin', 'bybit', 'bitget',
  'htx', 'mexc', 'bingx', 'coinex', 'noones', 'remitano'
];

// ── Enqueue a full refresh cycle (replaces the old sequential for-loop) ────
const queueP2PRefresh = async () => {
  const queue = getP2PQueue();
  let queued = 0;

  for (const pair of WARM_PAIRS) {
    for (const asset of pair.assets) {
      for (const tradeType of ['BUY', 'SELL']) {
        for (const exchange of ALL_EXCHANGES) {
          const jobId = `p2p:${exchange}:${asset}:${pair.fiat}:${tradeType}`;
          await queue.add(
            'refresh-pair',
            { exchange, asset, fiat: pair.fiat, tradeType },
            { jobId, removeOnComplete: true, removeOnFail: false }
          );
          queued++;
        }
      }
    }
  }

  logger.info(`[p2pQueue] Queued ${queued} P2P refresh jobs`);
  return queued;
};

const getP2PQueueStats = async () => {
  try {
    const queue  = getP2PQueue();
    const counts = await queue.getJobCounts('wait', 'active', 'completed', 'failed', 'delayed');
    return counts;
  } catch (err) {
    logger.warn(`[p2pQueue] Could not get stats: ${err.message}`);
    return { wait: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
  }
};

module.exports = {
  getP2PQueue,
  startP2PWorker,
  queueP2PRefresh,
  getP2PQueueStats,
};