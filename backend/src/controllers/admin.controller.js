const ExchangeFee = require('../models/ExchangeFee');
const { success, error: sendError } = require('../../utils/response');

// GET /api/admin/fees — full fee data for admin UI
const getAllFees = async (req, res, next) => {
  try {
    const data = await ExchangeFee.find({}).lean();
    return success(res, data, 200, { count: data.length });
  } catch (err) { next(err); }
};

// PATCH /api/admin/fees/:exchange/:coin/:chain — update one network's fees
// Body: { withdrawFee, withdrawFeeUSD, minWithdraw, minDeposit, depositFee, arrivalMins }
const updateNetwork = async (req, res, next) => {
  try {
    const { exchange, coin, chain } = req.params;
    const updates = req.body;

    const doc = await ExchangeFee.findOne({ exchange: exchange.toLowerCase() });
    if (!doc) return sendError(res, `Exchange ${exchange} not found`, 404);

    const coinData = doc.coins.find(c => c.symbol === coin.toUpperCase());
    if (!coinData) return sendError(res, `Coin ${coin} not found on ${exchange}`, 404);

    const network = coinData.networks.find(
      n => n.chain.toLowerCase() === chain.toLowerCase() ||
           n.chainId.toLowerCase() === chain.toLowerCase()
    );
    if (!network) return sendError(res, `Chain ${chain} not found`, 404);

    // Apply only provided fields
    const allowed = ['withdrawFee', 'withdrawFeeUSD', 'minWithdraw', 'minDeposit', 'depositFee', 'arrivalMins', 'isActive'];
    for (const key of allowed) {
      if (updates[key] !== undefined) network[key] = updates[key];
    }
    doc.lastUpdated = new Date();
    doc.dataSource  = 'manual';
    await doc.save();

    return success(res, { exchange, coin, chain, updated: network });
  } catch (err) { next(err); }
};

// POST /api/admin/fees/:exchange/:coin/networks — add a new network to a coin
const addNetwork = async (req, res, next) => {
  try {
    const { exchange, coin } = req.params;
    const { chain, chainId, withdrawFee, withdrawFeeUSD, minWithdraw, minDeposit, depositFee, arrivalMins } = req.body;

    if (!chain || !chainId || withdrawFee === undefined || minWithdraw === undefined) {
      return sendError(res, 'chain, chainId, withdrawFee, minWithdraw are required', 400);
    }

    const doc = await ExchangeFee.findOne({ exchange: exchange.toLowerCase() });
    if (!doc) return sendError(res, `Exchange ${exchange} not found`, 404);

    let coinData = doc.coins.find(c => c.symbol === coin.toUpperCase());
    if (!coinData) {
      doc.coins.push({ symbol: coin.toUpperCase(), networks: [] });
      coinData = doc.coins[doc.coins.length - 1];
    }

    // Check for duplicate
    const exists = coinData.networks.find(n => n.chainId === chainId);
    if (exists) return sendError(res, `Chain ${chainId} already exists for ${coin} on ${exchange}`, 409);

    coinData.networks.push({
      chain, chainId,
      withdrawFee:    withdrawFee    ?? 0,
      withdrawFeeUSD: withdrawFeeUSD ?? 0,
      minWithdraw:    minWithdraw    ?? 0,
      minDeposit:     minDeposit     ?? 0,
      depositFee:     depositFee     ?? 0,
      arrivalMins:    arrivalMins    ?? 1,
      isActive: true,
    });

    doc.lastUpdated = new Date();
    await doc.save();

    return success(res, { added: true, exchange, coin, chain }, 201);
  } catch (err) { next(err); }
};

// DELETE /api/admin/fees/:exchange/:coin/:chain
const removeNetwork = async (req, res, next) => {
  try {
    const { exchange, coin, chain } = req.params;

    const doc = await ExchangeFee.findOne({ exchange: exchange.toLowerCase() });
    if (!doc) return sendError(res, 'Exchange not found', 404);

    const coinData = doc.coins.find(c => c.symbol === coin.toUpperCase());
    if (!coinData) return sendError(res, 'Coin not found', 404);

    const before = coinData.networks.length;
    coinData.networks = coinData.networks.filter(
      n => n.chain.toLowerCase() !== chain.toLowerCase() &&
           n.chainId.toLowerCase() !== chain.toLowerCase()
    );

    if (coinData.networks.length === before) {
      return sendError(res, `Chain ${chain} not found`, 404);
    }

    doc.lastUpdated = new Date();
    await doc.save();

    return success(res, { deleted: true });
  } catch (err) { next(err); }
};

// PATCH /api/admin/fees/:exchange — update exchange-level info (p2p, countries, etc.)
const updateExchange = async (req, res, next) => {
  try {
    const { exchange } = req.params;
    const allowed = ['p2p', 'p2pMinUSD', 'p2pCountries', 'displayName', 'website', 'twitterHandle'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    updates.lastUpdated = new Date();

    const doc = await ExchangeFee.findOneAndUpdate(
      { exchange: exchange.toLowerCase() },
      updates,
      { new: true }
    );
    if (!doc) return sendError(res, 'Exchange not found', 404);

    return success(res, doc);
  } catch (err) { next(err); }
};

module.exports = { getAllFees, updateNetwork, addNetwork, removeNetwork, updateExchange };