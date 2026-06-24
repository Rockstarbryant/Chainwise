/**
 * backend/src/jobs/p2pCron.js
 *
 * Warms the Redis cache and MongoDB snapshot store for the 4 active exchanges:
 * binance, bybit, okx, kucoin.
 *
 * v7: Removed bitget, coinex, bingx, remitano, noones, mexc.
 *     Cron now calls fetchP2PAds with multiPage:true so each warming run
 *     collects up to ~300 ads per exchange instead of 20.
 */

const cron              = require('node-cron');
const { fetchP2PAds }   = require('../services/p2p');
const P2PAd             = require('../models/P2PAd');
const logger            = require('../../utils/logger');
const { getCacheRedis } = require('../config/redis');
const { withLock }      = require('../../utils/redisLock');

// ─── Pair matrix ──────────────────────────────────────────────────────────
const WARM_PAIRS = [
  { fiat: 'KES', assets: ['USDT', 'USDC'] },
  { fiat: 'NGN', assets: ['USDT', 'USDC'] },
  { fiat: 'GHS', assets: ['USDT'] },
  { fiat: 'ZAR', assets: ['USDT'] },
  { fiat: 'INR', assets: ['USDT', 'USDC'] },
  { fiat: 'PKR', assets: ['USDT'] },
  { fiat: 'USD', assets: ['USDT', 'USDC', 'BTC'] },
];

const ALL_EXCHANGES = ['binance', 'okx', 'kucoin', 'bybit'];

const CACHE_TTL = 900; // 15 minutes

// ─── Single pair refresh ──────────────────────────────────────────────────
async function refreshPair(exchange, asset, fiat, tradeType) {
  try {
    // multiPage:true — fetch all available pages for this exchange
    const result = await fetchP2PAds({
      exchange,
      asset,
      fiat,
      tradeType,
      multiPage: true,
    });

    const redis = getCacheRedis();
    const key   = `p2p:${exchange}:${asset}:${fiat}:${tradeType}:1`;
    await redis.set(key, JSON.stringify(result), 'EX', CACHE_TTL);

    if (result.ads.length > 0) {
      await P2PAd.deleteMany({ exchange, asset, fiat, tradeType });
      await P2PAd.insertMany(
        result.ads.map(ad => ({ ...ad, fetchedAt: new Date() })),
        { ordered: false }
      );
    }

    logger.info(`[p2pCron] ✓ ${exchange} ${asset}/${fiat} ${tradeType}: ${result.ads.length} ads`);
    return result.ads.length;

  } catch (err) {
    logger.warn(`[p2pCron] ✗ ${exchange} ${asset}/${fiat} ${tradeType}: ${err.stack || err.message}`);
    return 0;
  }
}

// ─── Main refresh with global lock ────────────────────────────────────────
async function runP2PRefresh() {
  return withLock('p2p-refresh', async () => {
    logger.info('[p2pCron] Starting P2P data refresh...');
    const startTime = Date.now();
    let total = 0;

    try {
      for (const pair of WARM_PAIRS) {
        for (const asset of pair.assets) {
          for (const tradeType of ['BUY', 'SELL']) {
            for (const exchange of ALL_EXCHANGES) {
              total += await refreshPair(exchange, asset, pair.fiat, tradeType);
              // Small delay between exchange calls to be polite to APIs
              await new Promise(r => setTimeout(r, 500));
            }
          }
        }
      }
    } catch (err) {
      logger.error('[p2pCron] Unexpected error:', err);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info(`[p2pCron] Refresh complete: ${total} ads cached in ${elapsed}s`);
  });
}

// ─── Cron entrypoint ─────────────────────────────────────────────────────
// ─── Cron entrypoint ─────────────────────────────────────────────────────
const LAST_RUN_KEY = 'p2p:last_run_ts';
const INTERVAL_MS  = 60 * 60 * 1000; // 60 minutes in milliseconds

async function shouldRun() {
  try {
    const redis = getCacheRedis();
    const last  = await redis.get(LAST_RUN_KEY);
    if (!last) return true; // never run before — go ahead

    const elapsed = Date.now() - parseInt(last, 10);
    if (elapsed < INTERVAL_MS) {
      const remaining = Math.ceil((INTERVAL_MS - elapsed) / 60000);
      logger.info(`[p2pCron] Skipping startup run — last run was ${Math.floor(elapsed / 60000)}m ago (${remaining}m remaining)`);
      return false;
    }
    return true;
  } catch (err) {
    logger.warn('[p2pCron] Could not check last run time — proceeding anyway:', err.message);
    return true; // fail open so data doesn't go stale forever
  }
}

async function markRun() {
  try {
    const redis = getCacheRedis();
    await redis.set(LAST_RUN_KEY, Date.now().toString(), 'EX', 60 * 60 * 2); // expire after 2h
  } catch (err) {
    logger.warn('[p2pCron] Could not mark last run time:', err.message);
  }
}

// Wrap runP2PRefresh to always stamp the timestamp after a real run
async function runP2PRefreshAndMark() {
  const result = await runP2PRefresh();
  await markRun();
  return result;
}

function startP2PCron() {
  // Scheduled cron — always runs at the 60 minute mark
  cron.schedule('*/60 * * * *', () => {
    runP2PRefreshAndMark().catch(err =>
      logger.error(`[p2pCron] Unhandled error: ${err.stack || err.message}`)
    );
  });

  // Startup run — only executes if 60 minutes have elapsed since last run
  setTimeout(async () => {
    try {
      const ok = await shouldRun();
      if (!ok) return; // skip — too soon since last run
      await runP2PRefreshAndMark();
    } catch (err) {
      logger.error(`[p2pCron] Startup run error: ${err.stack || err.message}`);
    }
  }, 5000);

  logger.info('[p2pCron] P2P refresh cron started (every 60 minutes) — exchanges: binance, bybit, okx, kucoin');
}

const stopP2PCron = () => {
  logger.info('[p2pCron] P2P cron stopped');
};

module.exports = {
  startP2PCron,
  runP2PRefresh,
  runP2PRefreshAndMark,
  stopP2PCron,
};