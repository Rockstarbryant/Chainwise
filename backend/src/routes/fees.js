const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/fees.controller');
const { feesLimiter } = require('../middlewares/rateLimiter');
const { success, error: sendError } = require('../../utils/response');
const { exchangeParams } = require('../middlewares/validate');
const { getExchangeTickers } = require('../services/coingecko');

// GET /api/fees
router.get('/', feesLimiter, controller.listExchanges);

// GET /api/fees/compare?coin=USDT&chain=arbitrum&amount=5
router.get('/compare', feesLimiter, controller.compareAcrossExchanges);

// GET /api/fees/search?q=US  → ["USDT", "USDC", "UST"]
router.get('/search', feesLimiter, async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 1) return success(res, []);

    const ExchangeFee = require('../models/ExchangeFee');
    const docs = await ExchangeFee.find({}, 'coins.symbol').lean();
    const allSymbols = [...new Set(
      docs.flatMap(d => d.coins.map(c => c.symbol))
    )];

    const matches = allSymbols
      .filter(s => s.startsWith(q.toUpperCase()))
      .sort()
      .slice(0, 10);

    return success(res, matches);
  } catch (err) { next(err); }
});

router.get('/:exchange/coins', feesLimiter, exchangeParams, async (req, res, next) => {
  try {
    const { page = 1 } = req.query;
    const result = await getExchangeTickers(req.params.exchange, parseInt(page));
    if (result.error) return sendError(res, result.error, 400);
    return success(res, result);
  } catch (err) { next(err); }
});


// GET /api/fees/:exchange
router.get('/:exchange', feesLimiter, exchangeParams, controller.getExchange);

// GET /api/fees/:exchange/:coin
router.get('/:exchange/:coin', feesLimiter, exchangeParams, controller.getCoinFees);

module.exports = router;