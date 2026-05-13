const { getCacheRedis } = require('../src/config/redis');
const logger = require('../utils/logger');

const LOCK_PREFIX = 'global_job_lock:';
const DEFAULT_TTL = 300; // 5 minutes max lock time

/**
 * Acquire a distributed lock
 */
async function acquireLock(lockName, ttlSeconds = DEFAULT_TTL) {
  const redis = getCacheRedis();
  const key = LOCK_PREFIX + lockName;

  try {
    const acquired = await redis.set(key, '1', 'NX', 'EX', ttlSeconds);
    return acquired === 'OK';
  } catch (err) {
    logger.error(`[redisLock] Failed to acquire ${lockName}:`, err.message);
    return false;
  }
}

/**
 * Release a lock
 */
async function releaseLock(lockName) {
  const redis = getCacheRedis();
  const key = LOCK_PREFIX + lockName;

  try {
    await redis.del(key);
  } catch (err) {
    logger.warn(`[redisLock] Failed to release ${lockName}:`, err.message);
  }
}

/**
 * Execute function with exclusive lock (recommended)
 */
async function withLock(lockName, fn, ttlSeconds = DEFAULT_TTL) {
  const acquired = await acquireLock(lockName, ttlSeconds);

  if (!acquired) {
    logger.info(`[redisLock] ${lockName} is already running — skipping this run`);
    return { skipped: true, reason: 'locked' };
  }

  try {
    logger.info(`[redisLock] ✅ Acquired lock for: ${lockName}`);
    return await fn();
  } finally {
    await releaseLock(lockName);
    logger.info(`[redisLock] ✅ Released lock for: ${lockName}`);
  }
}

module.exports = { acquireLock, releaseLock, withLock };