/**
 * backend/src/jobs/p2pCron.js
 */

const cron            = require('node-cron');
const { fetchP2PAds } = require('../services/p2p');
const P2PAd           = require('../models/P2PAd');
const logger          = require('../../utils/logger');
const { getCacheRedis } = require('../config/redis');
const { withLock }    = require('../../utils/redisLock');

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

// ─── Per-exchange limits ──────────────────────────────────────────────────
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

const ALL_EXCHANGES = [
  'binance', 'okx', 'kucoin', 'bybit', 'bitget',
  'htx', 'mexc', 'bingx', 'coinex', 'noones', 'remitano'
];

const CACHE_TTL = 900;

// ─── Helpers ──────────────────────────────────────────────────────────────
function exchangeSupports(exchange, asset, fiat) {
  const limits = EXCHANGE_LIMITS[exchange];
  if (!limits) return true;
  if (limits.assets && !limits.assets.includes(asset)) return false;
  if (limits.fiats  && !limits.fiats.includes(fiat))   return false;
  return true;
}

async function refreshPair(exchange, asset, fiat, tradeType) {
  if (!exchangeSupports(exchange, asset, fiat)) return 0;

  try {
    const result = await fetchP2PAds({ exchange, asset, fiat, tradeType, limit: 20 });

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
              await new Promise(r => setTimeout(r, 300));
            }
          }
        }
      }
    } catch (err) {
      logger.error(`[p2pCron] Unexpected error:`, err);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info(`[p2pCron] Refresh complete: ${total} ads cached in ${elapsed}s`);
  });
}

// ─── Cron entrypoint ─────────────────────────────────────────────────────
function startP2PCron() {
  cron.schedule('*/15 * * * *', () => {
    runP2PRefresh().catch(err =>
      logger.error(`[p2pCron] Unhandled error: ${err.stack || err.message}`)
    );
  });

  setTimeout(() => {
    runP2PRefresh().catch(err =>
      logger.error(`[p2pCron] Startup run error: ${err.stack || err.message}`)
    );
  }, 5000);

  logger.info('[p2pCron] P2P refresh cron started (every 15 minutes)');
}

// ── Graceful shutdown ─────────────────────────────────────────────────────
const stopP2PCron = () => {
  logger.info('[p2pCron] P2P cron stopped');
};

module.exports = { 
  startP2PCron, 
  runP2PRefresh,
  stopP2PCron 
};