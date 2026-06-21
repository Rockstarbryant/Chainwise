/**
 * toolCache.js
 *
 * Redis-backed cache for expensive tool calls.
 * Drop this into executor.js by wrapping executeTool:
 *
 *   const { cachedExecuteTool } = require('./toolCache');
 *   // replace: return await fn(sanitizeInput(name, input));
 *   // with:    return await cachedExecuteTool(name, input, fn);
 *
 * TTLs are tuned per tool:
 *   - Withdrawal fees / exchange info: 1 hour  (changes infrequently)
 *   - CoinGecko prices:                2 min   (fast-moving)
 *   - P2P rates / ads:                 3 min   (live market data)
 *   - Bridge routes:                   1 min   (highly dynamic)
 *   - Giveaways:                       10 min  (already cached in MongoDB)
 */

const logger = require('../../utils/logger');

// ── TTL map (seconds) ──────────────────────────────────────────────────────
const TOOL_TTL = {
  // Exchange fee DB — hourly sync, safe to cache aggressively
  get_withdrawal_fees:           43200,
  find_cheapest_withdrawal:      43200,
  get_deposit_networks:          43200,
  find_common_networks:          43200,
  compare_exchanges:             43200,
  check_coin_listed_on_exchange: 43200,
  get_exchange_supported_chains: 43200,
  get_all_exchange_coins:        43200,
  search_coin_across_exchanges:  43200,
  check_withdrawal_minimums:     43200,
  get_exchange_info:             43200,
  compare_deposit_fees:          43200,
  estimate_transfer_cost:        43200,
  plan_cross_exchange_transfer:  43200,
  find_common_networks:          43200,
  find_conversion_route:         43200,
  find_cheapest_stable_exit:     43200,
  plan_deposit_to_exchange:      43200,

  // CoinGecko — prices move fast
  get_coin_price:     120,
  convert_amount:     120,
  get_coin_chains:    600,
  get_coin_exchanges: 600,

  // P2P — live market, short cache
  get_p2p_rates:           180,
  get_p2p_ads:             180,
  find_p2p_best_rate:      180,
  check_p2p_availability:  180,

  // Bridge routes — very dynamic
  get_bridge_route: 60,

  // Giveaways — already cached in MongoDB by the scan cron
  scan_giveaways: 600,

  // Network congestion — static estimates anyway
  get_network_congestion: 3600,

  // These are planning tools that combine data — cache at medium TTL
  plan_zero_gas_recovery: 300,
};

// ── Cache key builder ──────────────────────────────────────────────────────
function makeCacheKey(toolName, input) {
  // Normalize input to get a stable key regardless of property order
  const sorted = Object.keys(input)
    .sort()
    .reduce((acc, k) => {
      // Lowercase string values that are exchange/coin names for key stability
      acc[k] = typeof input[k] === 'string' ? input[k].toLowerCase() : input[k];
      return acc;
    }, {});
  return `cw:tool:${toolName}:${JSON.stringify(sorted)}`;
}

// ── Redis client reference (lazy) ─────────────────────────────────────────
// We import lazily to avoid circular deps and to tolerate Redis being
// unavailable (cache miss = just call the tool directly).
let _redis = null;
function getRedis() {
  if (_redis) return _redis;
  try {
    const { createBullConnection } = require('../config/redis');
    _redis = createBullConnection();
    _redis.on('error', (err) => {
      logger.warn('[toolCache] Redis error — caching disabled:', err.message);
      _redis = null;
    });
    return _redis;
  } catch {
    return null;
  }
}

// ── Main cached executor ───────────────────────────────────────────────────
async function cachedExecuteTool(name, input, fn) {
  const ttl = TOOL_TTL[name];

  // No TTL defined = don't cache this tool
  if (!ttl) return fn(input);

  const redis = getRedis();
  const key   = makeCacheKey(name, input);

  // ── Try cache read ───────────────────────────────────────────────────────
  if (redis) {
    try {
      const cached = await redis.get(key);
      if (cached) {
        logger.debug(`[toolCache] HIT  ${name} key=${key.slice(0, 80)}`);
        return JSON.parse(cached);
      }
    } catch (err) {
      logger.warn(`[toolCache] read error for ${name}:`, err.message);
    }
  }

  // ── Cache miss — execute the tool ────────────────────────────────────────
  logger.debug(`[toolCache] MISS ${name}`);
  const result = await fn(input);

  // ── Write to cache (don't cache errors) ─────────────────────────────────
  if (redis && result && !result.error) {
    try {
      await redis.set(key, JSON.stringify(result), 'EX', ttl);
    } catch (err) {
      logger.warn(`[toolCache] write error for ${name}:`, err.message);
    }
  }

  return result;
}

/**
 * Invalidate a cached tool result (call after admin data changes).
 * Example: invalidateToolCache('get_withdrawal_fees', { exchange: 'binance', coin: 'USDT' })
 */
async function invalidateToolCache(name, input) {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(makeCacheKey(name, input));
  } catch (err) {
    logger.warn(`[toolCache] invalidate error:`, err.message);
  }
}

/**
 * Flush ALL tool caches (e.g. after a full exchange sync).
 */
async function flushToolCache() {
  const redis = getRedis();
  if (!redis) return 0;
  try {
    const keys = await redis.keys('cw:tool:*');
    if (keys.length > 0) await redis.del(...keys);
    logger.info(`[toolCache] flushed ${keys.length} keys`);
    return keys.length;
  } catch (err) {
    logger.warn('[toolCache] flush error:', err.message);
    return 0;
  }
}

module.exports = { cachedExecuteTool, invalidateToolCache, flushToolCache };