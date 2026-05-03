const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/fees.controller');
const { feesLimiter } = require('../middlewares/rateLimiter');
const { exchangeParams } = require('../middlewares/validate');

// GET /api/fees
router.get('/', feesLimiter, controller.listExchanges);

// GET /api/fees/compare?coin=USDT&chain=arbitrum&amount=5
router.get('/compare', feesLimiter, controller.compareAcrossExchanges);

// GET /api/fees/:exchange
router.get('/:exchange', feesLimiter, exchangeParams, controller.getExchange);

// GET /api/fees/:exchange/:coin
router.get('/:exchange/:coin', feesLimiter, exchangeParams, controller.getCoinFees);

module.exports = router;