const { Redis } = require('ioredis');
const logger    = require('../../utils/logger');

// ── Config: supports REDIS_URL (Render/Railway/etc) or host+port for local ──
const REDIS_CONFIG = process.env.REDIS_URL
  ? {
      url:                  process.env.REDIS_URL,
      maxRetriesPerRequest: null, // REQUIRED by BullMQ
      enableReadyCheck:     false,
      retryStrategy: (times) => {
        if (times > 10) return null;
        return Math.min(times * 300, 3000);
      },
    }
  : {
      host:                 process.env.REDIS_HOST     || '127.0.0.1',
      port:                 parseInt(process.env.REDIS_PORT || '6379'),
      password:             process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null, // REQUIRED by BullMQ
      enableReadyCheck:     false,
      retryStrategy: (times) => {
        if (times > 10) return null;
        return Math.min(times * 300, 3000);
      },
    };

// ── Separate connection factories for BullMQ ──────────────────────────────
// BullMQ needs a NEW connection instance per Queue/Worker/QueueEvents
// Never share one Redis instance between them
const createBullConnection = () => {
  const conn = new Redis(REDIS_CONFIG);
  conn.on('error', (e) => logger.warn(`BullMQ Redis error: ${e.message}`));
  return conn;
};

// ── Single shared connection for cache operations ─────────────────────────
let _cacheClient = null;
const getCacheRedis = () => {
  if (!_cacheClient) {
    _cacheClient = new Redis({
      ...REDIS_CONFIG,
      maxRetriesPerRequest: 3, // cache reads can retry
    });
    _cacheClient.on('connect', () => logger.info('Redis cache connected'));
    _cacheClient.on('error',   (e) => logger.warn(`Redis cache error: ${e.message}`));
  }
  return _cacheClient;
};

// ── Cache helpers ─────────────────────────────────────────────────────────
const CACHE_TTL = 60 * 60; // 1 hour

const cacheGet = async (key) => {
  try {
    const val = await getCacheRedis().get(key);
    return val ? JSON.parse(val) : null;
  } catch { return null; }
};

const cacheSet = async (key, value, ttl = CACHE_TTL) => {
  try {
    await getCacheRedis().setex(key, ttl, JSON.stringify(value));
  } catch {}
};

const cacheDel = async (key) => {
  try { await getCacheRedis().del(key); } catch {}
};

const cacheDelPattern = async (pattern) => {
  try {
    const keys = await getCacheRedis().keys(pattern);
    if (keys.length > 0) await getCacheRedis().del(...keys);
  } catch {}
};

module.exports = {
  createBullConnection,
  getCacheRedis,
  cacheGet, cacheSet, cacheDel, cacheDelPattern,
  CACHE_TTL,
};