const ExchangeFee = require('../models/ExchangeFee');
const { success, error: sendError } = require('../../utils/response');

// GET /api/fees
const listExchanges = async (req, res, next) => {
  try {
    const exchanges = await ExchangeFee.find(
      {},
      'exchange displayName website twitterHandle p2p p2pMinUSD p2pCountries lastUpdated'
    ).lean();
    return success(res, exchanges, 200, { count: exchanges.length });
  } catch (err) {
    next(err);
  }
};

// GET /api/fees/:exchange
const getExchange = async (req, res, next) => {
  try {
    const doc = await ExchangeFee.findOne({ exchange: req.params.exchange }).lean();
    if (!doc) return sendError(res, `Exchange '${req.params.exchange}' not found`, 404);
    return success(res, doc);
  } catch (err) {
    next(err);
  }
};

// GET /api/fees/:exchange/:coin
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

// GET /api/fees/compare?coin=USDT&chain=arbitrum&amount=5
//
// Returns:
//   comparison[]     — one row per exchange (cheapest chain shown, or filtered chain if ?chain= provided)
//     .exchange        — display name
//     .exchangeSlug    — lowercase slug for metadata lookups on frontend
//     .cheapestChain   — chain name for the winning network
//     .withdrawFee     — fee in coin units
//     .withdrawFeeUSD  — approximate USD
//     .minWithdraw     — minimum withdrawal amount
//     .arrivalMins     — estimated arrival
//     .allNetworks[]   — ALL active networks for this coin on this exchange, sorted cheapest first
//                        frontend uses this for instant client-side chain switching (no re-fetch)
//
//   availableChains[]  — deduplicated list of { chain, chainId } across all exchanges for this coin
//                        frontend uses this to render the chain filter pills
const compareAcrossExchanges = async (req, res, next) => {
  try {
    const { coin, chain, amount } = req.query;
    if (!coin) return sendError(res, 'Query param `coin` is required', 400);

    const all = await ExchangeFee.find({}).lean();
    const results = [];

    // chainMap: chainId → { chain, chainId }
    // Deduplicate across exchanges so the frontend gets one canonical entry per chain.
    // We use chainId as the key because the same network can appear with slightly different
    // display names across exchanges (e.g. "Arbitrum One" vs "Arbitrum"), but chainId is the
    // stable slug used for matching.
    const chainMap = new Map();

    for (const ex of all) {
      const coinData = ex.coins.find(c => c.symbol === coin.toUpperCase());
      if (!coinData) continue;

      // Active networks only
      let networks = coinData.networks.filter(n => n.isActive !== false);

      // Register every active chain for this coin into the global chain map
      networks.forEach(n => {
        if (n.chainId && !chainMap.has(n.chainId.toLowerCase())) {
          chainMap.set(n.chainId.toLowerCase(), { chain: n.chain, chainId: n.chainId.toLowerCase() });
        }
      });

      // Apply amount filter before building allNetworks (same semantics as the original)
      if (amount) {
        networks = networks.filter(n => parseFloat(amount) >= n.minWithdraw);
      }

      if (!networks.length) continue;

      // Sort all networks cheapest first — this is the canonical order returned
      const sorted = [...networks].sort((a, b) => a.withdrawFee - b.withdrawFee);
      const cheapest = sorted[0];

      results.push({
        exchange:       ex.displayName,
        exchangeSlug:   ex.exchange,           // ← new: lets frontend join with listExchanges metadata
        cheapestChain:  cheapest.chain,
        withdrawFee:    cheapest.withdrawFee,
        withdrawFeeUSD: cheapest.withdrawFeeUSD,
        minWithdraw:    cheapest.minWithdraw,
        minDeposit:     cheapest.minDeposit,
        arrivalMins:    cheapest.arrivalMins,
        allNetworks:    sorted,                // ← new: full list, frontend does client-side chain switching
      });
    }

    // -----------------------------------------------------------------------
    // Optional server-side chain filter (used by AI agent tools that pass ?chain=)
    // The frontend doesn't use this path — it does client-side filtering via allNetworks.
    // -----------------------------------------------------------------------
    let filteredResults = results;
    if (chain) {
      filteredResults = results
        .map(r => {
          const net = r.allNetworks.find(
            n =>
              n.chainId?.toLowerCase().includes(chain.toLowerCase()) ||
              n.chain.toLowerCase().includes(chain.toLowerCase())
          );
          if (!net) return null;
          return {
            ...r,
            cheapestChain:  net.chain,
            withdrawFee:    net.withdrawFee,
            withdrawFeeUSD: net.withdrawFeeUSD,
            minWithdraw:    net.minWithdraw,
            minDeposit:     net.minDeposit,
            arrivalMins:    net.arrivalMins,
          };
        })
        .filter(Boolean);
    }

    filteredResults.sort((a, b) => a.withdrawFee - b.withdrawFee);

    // Sorted alphabetically by chain display name for consistent pill ordering
    const availableChains = [...chainMap.values()].sort((a, b) =>
      a.chain.localeCompare(b.chain)
    );

    return success(
      res,
      { coin: coin.toUpperCase(), comparison: filteredResults, availableChains },
      200,
      { count: filteredResults.length }
    );
  } catch (err) {
    next(err);
  }
};

module.exports = { listExchanges, getExchange, getCoinFees, compareAcrossExchanges };