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

// GET /api/fees/compare?coin=USDT&chain=arbitrum
const compareAcrossExchanges = async (req, res, next) => {
  try {
    const { coin, chain, amount } = req.query;
    if (!coin) return sendError(res, 'Query param `coin` is required', 400);

    const all = await ExchangeFee.find({}).lean();
    const results = [];

    for (const ex of all) {
      const coinData = ex.coins.find(c => c.symbol === coin.toUpperCase());
      if (!coinData) continue;

      let networks = [...coinData.networks];
      if (chain) {
        networks = networks.filter(
          n => n.chainId.toLowerCase().includes(chain.toLowerCase()) ||
               n.chain.toLowerCase().includes(chain.toLowerCase())
        );
      }
      if (amount) {
        networks = networks.filter(n => parseFloat(amount) >= n.minWithdraw);
      }
      if (!networks.length) continue;

      const cheapest = networks.sort((a, b) => a.withdrawFee - b.withdrawFee)[0];
      results.push({
        exchange:      ex.displayName,
        cheapestChain: cheapest.chain,
        withdrawFee:   cheapest.withdrawFee,
        withdrawFeeUSD: cheapest.withdrawFeeUSD,
        minWithdraw:   cheapest.minWithdraw,
        arrivalMins:   cheapest.arrivalMins,
      });
    }

    results.sort((a, b) => a.withdrawFee - b.withdrawFee);
    return success(res, { coin: coin.toUpperCase(), comparison: results }, 200, {
      count: results.length,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { listExchanges, getExchange, getCoinFees, compareAcrossExchanges };