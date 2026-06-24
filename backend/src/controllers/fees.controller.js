const ExchangeFee = require('../models/ExchangeFee');
const { success, error: sendError } = require('../../utils/response');
const { cacheGet, cacheSet, cacheDel, cacheDelPattern } = require('../config/redis');
const ccxt = require('ccxt');

// ─────────────────────────────────────────────────────────────────────────────
// Cache TTL constants
// ─────────────────────────────────────────────────────────────────────────────
const FEES_CACHE_TTL    = 60 * 60 * 6;  // 6 hours — fee data changes rarely
const EXCHANGE_CACHE_TTL = 60 * 60 * 6; // 6 hours — exchange list/metadata

// Cache key helpers — centralised so invalidation is never mismatched
const cacheKeys = {
  compare:   (coin) => `fees:compare:${coin.toUpperCase()}`,
  exchanges: ()     => 'fees:exchanges',
};

// ─────────────────────────────────────────────────────────────────────────────
// Live price fetch (intentionally NOT cached — always real-time)
// ─────────────────────────────────────────────────────────────────────────────
async function getCoinPrice(coin) {
  try {
    const exchange = new ccxt.binance({ enableRateLimit: true, timeout: 8000 });
    const ticker = await exchange.fetchTicker(`${coin}/USDT`);
    return parseFloat(ticker.last);
  } catch (err) {
    console.warn(`[price] Binance failed for ${coin}:`, err.message);
    const fallbacks = ['bybit', 'okx', 'mexc', 'huobi', 'kucoin', 'gateio', 'bitget', 'bingx'];
    for (const name of fallbacks) {
      try {
        const ex = new ccxt[name]({ enableRateLimit: true });
        const ticker = await ex.fetchTicker(`${coin}/USDT`);
        return parseFloat(ticker.last);
      } catch (_) {}
    }
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Re-calculates withdrawFeeUSD for every network in a cached payload using a
// freshly-fetched live price.  The fee data itself stays cached; only the USD
// figures are updated on each request so callers always see current values.
// ─────────────────────────────────────────────────────────────────────────────
function injectLivePrice(cachedPayload, priceUSD) {
  if (!priceUSD) return { ...cachedPayload, priceUSD };

  const comparison = cachedPayload.comparison.map(row => ({
    ...row,
    withdrawFeeUSD: row.withdrawFee === 0
      ? 0
      : parseFloat((row.withdrawFee * priceUSD).toFixed(2)),
    allNetworks: row.allNetworks.map(n => ({
      ...n,
      withdrawFeeUSD: n.withdrawFee === 0
        ? 0
        : parseFloat((n.withdrawFee * priceUSD).toFixed(2)),
    })),
  }));

  return { ...cachedPayload, priceUSD, comparison };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/fees
// ─────────────────────────────────────────────────────────────────────────────
const listExchanges = async (req, res, next) => {
  try {
    // Try cache first
    const cached = await cacheGet(cacheKeys.exchanges());
    if (cached) {
      return success(res, cached, 200, { count: cached.length, source: 'cache' });
    }

    const exchanges = await ExchangeFee.find(
      {},
      'exchange displayName website twitterHandle p2p p2pMinUSD p2pCountries lastUpdated'
    ).lean();

    await cacheSet(cacheKeys.exchanges(), exchanges, EXCHANGE_CACHE_TTL);

    return success(res, exchanges, 200, { count: exchanges.length, source: 'db' });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/fees/:exchange
// ─────────────────────────────────────────────────────────────────────────────
const getExchange = async (req, res, next) => {
  try {
    const doc = await ExchangeFee.findOne({ exchange: req.params.exchange }).lean();
    if (!doc) return sendError(res, `Exchange '${req.params.exchange}' not found`, 404);
    return success(res, doc);
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/fees/:exchange/:coin
// ─────────────────────────────────────────────────────────────────────────────
const getCoinFees = async (req, res, next) => {
  try {
    const doc = await ExchangeFee.findOne({ exchange: req.params.exchange }).lean();
    if (!doc) return sendError(res, `Exchange '${req.params.exchange}' not found`, 404);

    const coin = doc.coins.find(c => c.symbol === req.params.coin.toUpperCase());
    if (!coin) {
      return sendError(res, `${req.params.coin.toUpperCase()} not listed on ${doc.displayName}`, 404, {
        availableCoins: doc.coins.map(c => c.symbol),
      });
    }

    const sorted = [...coin.networks].sort((a, b) => a.withdrawFee - b.withdrawFee);
    return success(res, {
      exchange:    doc.displayName,
      coin:        coin.symbol,
      networks:    sorted,
      lastUpdated: doc.lastUpdated,
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/fees/compare?coin=USDT&chain=arbitrum&amount=5
//
// Caching strategy
// ────────────────
//  • The heavy work (MongoDB scan + network sorting + chain map building) is
//    cached under `fees:compare:{COIN}` for 6 hours.
//
//  • The coin price is ALWAYS fetched live and is NOT stored in the cache.
//    After loading the cached payload we call injectLivePrice() to overwrite
//    every withdrawFeeUSD field with a value derived from the fresh price.
//
//  • The optional ?chain= and ?amount= filters are applied AFTER cache lookup
//    because they represent a small, cheap slice of the cached data — caching
//    every permutation would waste memory and complicate invalidation.
//
//  • Cache miss path is identical to the original logic so behaviour is
//    unchanged on the first request for any coin.
// ─────────────────────────────────────────────────────────────────────────────
const compareAcrossExchanges = async (req, res, next) => {
  try {
    const { coin, chain, amount } = req.query;
    if (!coin) return sendError(res, 'Query param `coin` is required', 400);

    const coinUpper = coin.toUpperCase();
    const cacheKey  = cacheKeys.compare(coinUpper);

    // ── 1. Fetch live price in parallel with the cache lookup ────────────────
    // Both operations run concurrently so neither waits on the other.
    const [priceUSD, cachedPayload] = await Promise.all([
      getCoinPrice(coinUpper),
      cacheGet(cacheKey),
    ]);

    // ── 2. Cache HIT — inject fresh price and return ─────────────────────────
    if (cachedPayload) {
      let payload = injectLivePrice(cachedPayload, priceUSD);

      // Apply optional server-side filters on the cached data
      payload = applyFilters(payload, chain, amount);

      return success(res, payload, 200, { count: payload.comparison.length, source: 'cache' });
    }

    // ── 3. Cache MISS — build from DB (original logic) ───────────────────────
    const all     = await ExchangeFee.find({}).lean();
    const results = [];
    const chainMap = new Map();

    for (const ex of all) {
      const coinData = ex.coins.find(c => c.symbol === coinUpper);
      if (!coinData) continue;

      let networks = coinData.networks.filter(n => n.isActive !== false);

      networks.forEach(n => {
        if (n.chainId && !chainMap.has(n.chainId.toLowerCase())) {
          chainMap.set(n.chainId.toLowerCase(), {
            chain:   n.chain,
            chainId: n.chainId.toLowerCase(),
          });
        }
      });

      // NOTE: we do NOT apply the ?amount= filter here when building the cache
      // payload — we cache the full unfiltered data and filter per-request below.
      const sorted = [...networks]
        .sort((a, b) => a.withdrawFee - b.withdrawFee)
        .map(n => ({
          ...n,
          // Store null for USD — will be calculated from live price on each
          // request via injectLivePrice(), so the cache never has stale USD values.
          withdrawFeeUSD: null,
        }));

      if (!sorted.length) continue;

      const cheapest = sorted[0];

      results.push({
        exchange:       ex.displayName,
        exchangeSlug:   ex.exchange,
        cheapestChain:  cheapest.chain,
        withdrawFee:    cheapest.withdrawFee,
        withdrawFeeUSD: null,  // injected live
        minWithdraw:    cheapest.minWithdraw,
        minDeposit:     cheapest.minDeposit,
        arrivalMins:    cheapest.arrivalMins,
        allNetworks:    sorted,
      });
    }

    results.sort((a, b) => a.withdrawFee - b.withdrawFee);

    const availableChains = [...chainMap.values()].sort((a, b) =>
      a.chain.localeCompare(b.chain)
    );

    // Payload stored in cache — no priceUSD, no amount/chain filters applied
    const cacheablePayload = {
      coin:            coinUpper,
      priceUSD:        null,       // always null in cache; injected live
      comparison:      results,
      availableChains,
    };

    // Fire-and-forget cache write — don't await so the response isn't delayed
    cacheSet(cacheKey, cacheablePayload, FEES_CACHE_TTL).catch(() => {});

    // Build the full response with live price + filters applied
    let payload = injectLivePrice(cacheablePayload, priceUSD);
    payload = applyFilters(payload, chain, amount);

    return success(res, payload, 200, { count: payload.comparison.length, source: 'db' });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Applies ?chain= and ?amount= filters to a fully-formed compare payload.
// Pure function — does not mutate the input object.
// ─────────────────────────────────────────────────────────────────────────────
function applyFilters(payload, chain, amount) {
  let comparison = payload.comparison;

  // Amount filter — remove networks where minWithdraw > amount, then drop
  // exchanges that have no networks left after filtering.
  if (amount) {
    const amt = parseFloat(amount);
    comparison = comparison
      .map(row => {
        const nets = row.allNetworks.filter(n => amt >= n.minWithdraw);
        if (!nets.length) return null;
        const cheapest = nets[0];
        return {
          ...row,
          cheapestChain:  cheapest.chain,
          withdrawFee:    cheapest.withdrawFee,
          withdrawFeeUSD: cheapest.withdrawFeeUSD,
          minWithdraw:    cheapest.minWithdraw,
          minDeposit:     cheapest.minDeposit,
          arrivalMins:    cheapest.arrivalMins,
          allNetworks:    nets,
        };
      })
      .filter(Boolean);
  }

  // Chain filter — keep only the specified network per exchange
  if (chain) {
    comparison = comparison
      .map(row => {
        const net = row.allNetworks.find(
          n =>
            n.chainId?.toLowerCase().includes(chain.toLowerCase()) ||
            n.chain.toLowerCase().includes(chain.toLowerCase())
        );
        if (!net) return null;
        return {
          ...row,
          cheapestChain:  net.chain,
          withdrawFee:    net.withdrawFee,
          withdrawFeeUSD: net.withdrawFeeUSD,
          minWithdraw:    net.minWithdraw,
          minDeposit:     net.minDeposit,
          arrivalMins:    net.arrivalMins,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.withdrawFee - b.withdrawFee);
  }

  return { ...payload, comparison };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache invalidation helpers — call these from your sync job / admin routes
// whenever fee data is updated so users don't see stale fees.
//
//   invalidateCoin('USDT')  → clears fees:compare:USDT
//   invalidateAll()         → clears all fees:compare:* + fees:exchanges
// ─────────────────────────────────────────────────────────────────────────────
const invalidateCoin = async (coin) => {
  await cacheDel(cacheKeys.compare(coin.toUpperCase()));
};

const invalidateAll = async () => {
  await cacheDelPattern('fees:compare:*');
  await cacheDel(cacheKeys.exchanges());
};

module.exports = {
  listExchanges,
  getExchange,
  getCoinFees,
  compareAcrossExchanges,
  // Export for use in sync jobs / admin routes
  invalidateCoin,
  invalidateAll,
};