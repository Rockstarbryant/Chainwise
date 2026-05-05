const { Redis } = require('ioredis');
const logger    = require('../../utils/logger');

// ── Detect if we're using a URL-based connection (Render/Railway/Redis Cloud) ──
const REDIS_URL = process.env.REDIS_URL || null;

// ── For host+port mode only (local dev) ───────────────────────────────────
const HOST_CONFIG = {
  host:             process.env.REDIS_HOST || '127.0.0.1',
  port:             parseInt(process.env.REDIS_PORT || '6379'),
  password:         process.env.REDIS_PASSWORD || undefined,
  enableReadyCheck: false,
  retryStrategy: (times) => {
    if (times > 10) return null;
    return Math.min(times * 300, 3000);
  },
};

// ── Build a Redis instance correctly for both URL and host+port modes ─────
// CRITICAL: ioredis does NOT accept { url: '...' } in an options object.
// When using a URL it must be passed as the FIRST argument: new Redis(url, options).
// Redis Cloud (redislabs.com) also requires TLS — detected via rediss:// or
// the host containing 'redislabs.com' / 'upstash.io' / 'redis.cloud'.
const isTlsUrl = (url) => {
  if (!url) return false;
  return (
    url.startsWith('rediss://') ||
    url.includes('redislabs.com') ||
    url.includes('upstash.io') ||
    url.includes('redis.cloud')
  );
};

const makeRedis = (extraOptions = {}) => {
  if (REDIS_URL) {
    const tlsOptions = isTlsUrl(REDIS_URL)
      ? { tls: { rejectUnauthorized: false } }
      : {};
    return new Redis(REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck:     false,
      retryStrategy: (times) => {
        if (times > 10) return null;
        return Math.min(times * 300, 3000);
      },
      ...tlsOptions,
      ...extraOptions,
    });
  }
  return new Redis({ ...HOST_CONFIG, ...extraOptions });
};

// ── Separate connection factories for BullMQ ──────────────────────────────
// BullMQ needs a NEW connection instance per Queue/Worker/QueueEvents.
// maxRetriesPerRequest MUST be null for BullMQ — never override this here.
const createBullConnection = () => {
  const conn = makeRedis({ maxRetriesPerRequest: null });
  conn.on('error', (e) => logger.warn(`BullMQ Redis error: ${e.message}`));
  return conn;
};

// ── Single shared connection for cache operations ─────────────────────────
let _cacheClient = null;
const getCacheRedis = () => {
  if (!_cacheClient) {
    _cacheClient = makeRedis({ maxRetriesPerRequest: 3 });
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