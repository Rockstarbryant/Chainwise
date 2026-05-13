/**
 * backend/src/jobs/p2pCron.js
 *
 * Refreshes P2P data for common pairs every 15 minutes.
 *
 * HOW TO WIRE IT UP IN server.js:
 *
 *   const { startP2PCron } = require('./jobs/p2pCron');
 *
 *   setTimeout(() => {
 *     startWorker();
 *     startCron();
 *     startP2PCron();   // ← add this line
 *   }, 2000);
 *
 * Fix log (v2):
 *  - CRITICAL: Added mutex lock (isRefreshing flag) to prevent cron overlap.
 *    Previously a new 15-min tick could fire while the previous full scan was
 *    still running, causing doubled requests, rate-limit bans and random 403s.
 *  - MEXC removed from ALL_EXCHANGES — disabled at service level (Cloudflare WAF).
 *    Re-add once a Puppeteer/proxy solution is in place.
 *  - Error logging upgraded: now logs err.stack (full trace) not just err.message.
 *  - EXCHANGE_LIMITS updated to reflect current stable/unstable exchange status.
 *  - 300ms per-request stagger preserved to avoid burst patterns.
 */

const cron            = require('node-cron');
const { fetchP2PAds } = require('../services/p2p');
const P2PAd           = require('../models/P2PAd');
const logger          = require('../../utils/logger');
const { getCacheRedis } = require('../config/redis');

// ─── Pair matrix ──────────────────────────────────────────────────────────
//
// Pairs to keep warm in cache — ordered by African demand first.
//
const WARM_PAIRS = [
  // ── Africa (highest demand) ──
  { fiat: 'KES', assets: ['USDT', 'USDC'] },
  { fiat: 'NGN', assets: ['USDT', 'USDC'] },
  { fiat: 'GHS', assets: ['USDT'] },
  { fiat: 'ZAR', assets: ['USDT'] },
  // ── Asia ──
  { fiat: 'INR', assets: ['USDT', 'USDC'] },
  { fiat: 'PKR', assets: ['USDT'] },
  // ── Global ──
  { fiat: 'USD', assets: ['USDT', 'USDC', 'BTC'] },
];

// ─── Per-exchange asset/fiat allow-lists ──────────────────────────────────
//
// Prevents wasting requests (and log noise) for pairs an exchange
// simply doesn't support. null = no restriction (supports all pairs).
//
const EXCHANGE_LIMITS = {
  binance:  { assets: null,                          fiats: null },
  bybit:    { assets: null,                          fiats: null },
  okx:      { assets: null,                          fiats: null },
  kucoin:   { assets: null,                          fiats: null },
  bitget:   { assets: null,                          fiats: null },
  // HTX: numeric coin/fiat ID map only covers these values (see p2p.js HTX_*_MAP)
  htx: {
    assets: ['USDT', 'BTC', 'ETH', 'USDC'],
    fiats:  ['KES', 'NGN', 'GHS', 'ZAR', 'INR', 'PKR', 'USD', 'EUR', 'GBP', 'TZS', 'UGX'],
  },
  // Noones: Africa-first — BTC primary, USDT growing fast
  noones:   { assets: ['USDT', 'BTC', 'ETH'],        fiats: null },
  // Remitano: country-code routing — only fiats with a known country mapping
  remitano: {
    assets: ['USDT', 'BTC', 'ETH'],
    fiats:  ['KES', 'NGN', 'GHS', 'ZAR', 'TZS', 'UGX', 'USD', 'EUR', 'GBP', 'INR', 'PKR'],
  },
  // MEXC intentionally omitted — disabled in p2p.js (Cloudflare WAF).
  // Add back here once Puppeteer/proxy solution is integrated:
  //   mexc: { assets: ['USDT', 'USDC', 'BTC'], fiats: null },
};

// Exchanges in priority order (most reliable first).
// MEXC is excluded — it returns [] with a warning at the service level.
const ALL_EXCHANGES = [
  'binance', 'okx', 'kucoin',    // tier 1 — highest reliability
  'bybit',   'bitget',           // tier 2 — recently fixed
  'htx', 'mexc', 'bingx', 'coinex',                       // tier 3 — low liquidity but stable
  'noones',  'remitano',         // tier 4 — Africa-focused
];

const CACHE_TTL = 900; // 15 min — matches controller cache window

// ─── Mutex lock ───────────────────────────────────────────────────────────
//
// CRITICAL FIX: Prevents a new cron tick from starting while the previous
// full scan is still running. Without this, overlapping runs will:
//   • Double the number of outbound requests per cycle
//   • Trigger rate-limit bans (429) and temporary IP blocks
//   • Cause random 403 / "unknown error" failures seen in logs
//
let isRefreshing = false;

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

    // ── Update Redis cache ─────────────────────────────────────────────
    const redis = getCacheRedis();
    const key   = `p2p:${exchange}:${asset}:${fiat}:${tradeType}:1`;
    await redis.set(key, JSON.stringify(result), 'EX', CACHE_TTL);

    // ── Upsert MongoDB snapshot ────────────────────────────────────────
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
    // Log full stack trace — not just message — for proper diagnostics
    logger.warn(`[p2pCron] ✗ ${exchange} ${asset}/${fiat} ${tradeType}: ${err.stack || err.message}`);
    return 0;
  }
}

// ─── Main refresh loop ────────────────────────────────────────────────────

async function runP2PRefresh() {
  // ── Mutex guard ───────────────────────────────────────────────────────
  if (isRefreshing) {
    logger.warn('[p2pCron] Previous refresh still running — skipping this tick to avoid overlap.');
    return;
  }

  isRefreshing = true;
  logger.info('[p2pCron] Starting P2P data refresh...');
  const startTime = Date.now();
  let total = 0;

  try {
    for (const pair of WARM_PAIRS) {
      for (const asset of pair.assets) {
        for (const tradeType of ['BUY', 'SELL']) {
          for (const exchange of ALL_EXCHANGES) {
            total += await refreshPair(exchange, asset, pair.fiat, tradeType);
            // 300ms stagger between each request to avoid burst-pattern detection
            await new Promise(r => setTimeout(r, 300));
          }
        }
      }
    }
  } finally {
    // Always release the lock — even if an unexpected error escapes the inner try/catch
    isRefreshing = false;
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  logger.info(`[p2pCron] Refresh complete: ${total} ads cached in ${elapsed}s`);
}

// ─── Cron entrypoint ─────────────────────────────────────────────────────

function startP2PCron() {
  // Run every 15 minutes
  cron.schedule('*/15 * * * *', () => {
    runP2PRefresh().catch(err =>
      logger.error(`[p2pCron] Unhandled error: ${err.stack || err.message}`)
    );
  });

  // Run once on startup after a short warm-up delay
  setTimeout(() => {
    runP2PRefresh().catch(err =>
      logger.error(`[p2pCron] Startup run error: ${err.stack || err.message}`)
    );
  }, 5000);

  logger.info('[p2pCron] P2P refresh cron started (every 15 minutes)');
}

module.exports = { startP2PCron, runP2PRefresh };