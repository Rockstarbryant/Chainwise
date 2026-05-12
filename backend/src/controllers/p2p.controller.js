/**
 * backend/src/controllers/p2p.controller.js
 *
 * Handles all /api/p2p/* routes.
 * Uses a Redis cache layer (15-min TTL for live data) backed
 * by MongoDB for historical snapshots.
 */

const p2pService          = require('../services/p2p');
const P2PAd               = require('../models/P2PAd');
const { success, error }  = require('../../utils/response');
const logger              = require('../../utils/logger');
const { getCacheRedis }   = require('../config/redis');

const CACHE_TTL_SECS = 900; // 15 minutes

// ─── Cache helpers ────────────────────────────────────────────────────────

function cacheKey(exchange, asset, fiat, tradeType, page) {
  return `p2p:${exchange}:${asset}:${fiat}:${tradeType}:${page}`;
}

async function fromCache(key) {
  try {
    const redis = getCacheRedis();
    const raw   = await redis.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function toCache(key, data) {
  try {
    const redis = getCacheRedis();
    await redis.set(key, JSON.stringify(data), 'EX', CACHE_TTL_SECS);
  } catch { /* non-fatal */ }
}

// ─── GET /api/p2p ─────────────────────────────────────────────────────────
// Query params: exchange, asset, fiat, tradeType, page, limit
//
// exchange = 'all' | 'binance' | 'bybit' | ...
// asset    = 'USDT' | 'USDC' | 'BTC' | 'ETH'
// fiat     = 'KES' | 'NGN' | 'GHS' | 'ZAR' | ...
// tradeType = 'BUY' | 'SELL'
// page     = 1 (default)
// limit    = 10 (default, max 20)

async function getP2PAds(req, res) {
  const {
    exchange  = 'all',
    asset     = 'USDT',
    fiat      = 'KES',
    tradeType = 'BUY',
    page      = 1,
    limit     = 10,
  } = req.query;

  const limitNum = Math.min(parseInt(limit) || 10, 20);
  const pageNum  = parseInt(page) || 1;
  const key      = cacheKey(exchange, asset.toUpperCase(), fiat.toUpperCase(), tradeType.toUpperCase(), pageNum);

  // 1. Try Redis cache
  const cached = await fromCache(key);
  if (cached) {
    logger.info(`[p2p] Cache hit: ${key}`);
    return success(res, { ...cached, cached: true });
  }

  // 2. Fetch live
  try {
    const result = await p2pService.fetchP2PAds({
      exchange,
      asset:     asset.toUpperCase(),
      fiat:      fiat.toUpperCase(),
      tradeType: tradeType.toUpperCase(),
      page:      pageNum,
      limit:     limitNum,
    });

    // 3. Persist snapshot to MongoDB (non-blocking)
    if (result.ads.length > 0) {
      const docs = result.ads.map(ad => ({ ...ad, fetchedAt: new Date() }));
      P2PAd.insertMany(docs, { ordered: false }).catch(e =>
        logger.warn(`[p2p] MongoDB insert error: ${e.message}`)
      );
    }

    // 4. Cache the response
    await toCache(key, result);

    return success(res, result);
  } catch (err) {
    logger.error(`[p2p] Fetch error: ${err.message}`);

    // 5. Fallback to MongoDB cached ads (last known good data)
    const query = { asset: asset.toUpperCase(), fiat: fiat.toUpperCase(), tradeType: tradeType.toUpperCase() };
    if (exchange !== 'all') query.exchange = exchange.toLowerCase();

    const fallback = await P2PAd.find(query).sort({ price: tradeType === 'BUY' ? 1 : -1 }).limit(limitNum * 3).lean();

    if (fallback.length > 0) {
      const oldest = new Date(Math.min(...fallback.map(a => new Date(a.fetchedAt))));
      return success(res, {
        asset:     asset.toUpperCase(),
        fiat:      fiat.toUpperCase(),
        tradeType: tradeType.toUpperCase(),
        totalAds:  fallback.length,
        ads:       fallback,
        summary:   buildSummary(fallback, tradeType),
        stale:     true,
        staleAge:  Math.round((Date.now() - oldest) / 60000) + ' minutes old',
        warning:   'Live data unavailable — showing last cached snapshot',
      });
    }

    return error(res, `P2P fetch failed: ${err.message}`, 502);
  }
}

// ─── GET /api/p2p/rates ───────────────────────────────────────────────────
// Returns just the rate summary (best BUY + SELL rates) for a pair.
// Lightweight endpoint for the agent tools.
//
// Query: asset, fiat

async function getP2PRates(req, res) {
  const { asset = 'USDT', fiat = 'KES' } = req.query;

  const key = `p2p:rates:${asset.toUpperCase()}:${fiat.toUpperCase()}`;
  const cached = await fromCache(key);
  if (cached) return success(res, { ...cached, cached: true });

  try {
    const [buyResult, sellResult] = await Promise.all([
      p2pService.fetchP2PAds({ exchange: 'all', asset, fiat, tradeType: 'BUY',  limit: 5 }),
      p2pService.fetchP2PAds({ exchange: 'all', asset, fiat, tradeType: 'SELL', limit: 5 }),
    ]);

    const result = {
      asset: asset.toUpperCase(),
      fiat:  fiat.toUpperCase(),
      buy: {
        bestRate:    buyResult.summary.lowestRate,
        worstRate:   buyResult.summary.highestRate,
        averageRate: buyResult.summary.averageRate,
        topAds:      buyResult.ads.slice(0, 3),
      },
      sell: {
        bestRate:    sellResult.summary.highestRate,
        worstRate:   sellResult.summary.lowestRate,
        averageRate: sellResult.summary.averageRate,
        topAds:      sellResult.ads.slice(0, 3),
      },
      spread: buyResult.summary.lowestRate && sellResult.summary.highestRate
        ? parseFloat((buyResult.summary.lowestRate - sellResult.summary.highestRate).toFixed(4))
        : null,
      fetchedAt: new Date().toISOString(),
    };

    await toCache(key, result);
    return success(res, result);
  } catch (err) {
    return error(res, err.message, 502);
  }
}

// ─── GET /api/p2p/supported ───────────────────────────────────────────────
// Returns supported exchanges, fiats, and assets — for frontend dropdowns.

async function getSupportedPairs(req, res) {
  return success(res, p2pService.getSupportedPairs());
}

// ─── Helper ───────────────────────────────────────────────────────────────

function buildSummary(ads, tradeType) {
  const prices = ads.map(a => a.price).filter(Boolean);
  return {
    lowestRate:          prices.length ? Math.min(...prices) : null,
    highestRate:         prices.length ? Math.max(...prices) : null,
    averageRate:         prices.length ? parseFloat((prices.reduce((s, p) => s + p, 0) / prices.length).toFixed(2)) : null,
    exchangesWithData:   [...new Set(ads.map(a => a.exchange))].length,
  };
}

module.exports = { getP2PAds, getP2PRates, getSupportedPairs };