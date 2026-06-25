/**
 * backend/src/controllers/dex.controller.js
 */

const { aggregateDEXData } = require('../services/dexAggregator');
const { success, error: sendError } = require('../../utils/response');
const { cacheGet, cacheSet } = require('../config/redis');
const logger = require('../../utils/logger');

const CACHE_TTL_PRICES  = 60 * 3;    // 3 min — prices move fast
const CACHE_TTL_META    = 60 * 30;   // 30 min — DEX metadata is stable

function makeCacheKey(query) {
  return `dex:search:${query.toLowerCase().trim()}`;
}

const searchDEX = async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) {
      return sendError(res, 'Query param `q` is required (min 2 characters)', 400);
    }

    const key = makeCacheKey(q);

    // ── Cache check ──────────────────────────────────────────────────────
    const cached = await cacheGet(key);
    if (cached) {
      logger.debug(`[dex] cache hit for: ${q}`);
      return success(res, cached, 200, { source: 'cache' });
    }

    // ── Fetch + aggregate ────────────────────────────────────────────────
    const result = await aggregateDEXData(q);

    if (!result.coin && result.pools.length === 0) {
      return sendError(res, `No DEX data found for "${q}". Try a contract address or different symbol.`, 404);
    }

    // ── Cache with shorter TTL if price data present ─────────────────────
    const ttl = result.coin?.priceUSD ? CACHE_TTL_PRICES : CACHE_TTL_META;
    await cacheSet(key, result, ttl);

    return success(res, result, 200, {
      source:     'live',
      totalPools: result.totalPools,
      chains:     result.chains.length,
    });

  } catch (err) {
    logger.error('[dex] search error:', err.message);
    next(err);
  }
};

// GET /api/dex/chains — list all chains we have DEX data for
const listChains = async (req, res, next) => {
  try {
    const SUPPORTED_CHAINS = [
      { id: 'ethereum',  name: 'Ethereum',  symbol: 'ETH' },
      { id: 'bsc',       name: 'BNB Chain', symbol: 'BNB' },
      { id: 'polygon',   name: 'Polygon',   symbol: 'MATIC' },
      { id: 'arbitrum',  name: 'Arbitrum',  symbol: 'ETH' },
      { id: 'base',      name: 'Base',      symbol: 'ETH' },
      { id: 'optimism',  name: 'Optimism',  symbol: 'ETH' },
      { id: 'avalanche', name: 'Avalanche', symbol: 'AVAX' },
      { id: 'solana',    name: 'Solana',    symbol: 'SOL' },
      { id: 'fantom',    name: 'Fantom',    symbol: 'FTM' },
      { id: 'cronos',    name: 'Cronos',    symbol: 'CRO' },
    ];
    return success(res, SUPPORTED_CHAINS);
  } catch (err) {
    next(err);
  }
};

module.exports = { searchDEX, listChains };