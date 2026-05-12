/**
 * backend/src/routes/p2p.js
 *
 * Mount in server.js:
 *   const p2pRoutes = require('./routes/p2p');
 *   app.use('/api/p2p', p2pRoutes);
 */

const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/p2p.controller');
const { p2pLimiter } = require('../middlewares/rateLimiter');

// Public — no auth required
router.get('/',          p2pLimiter, controller.getP2PAds);       // GET /api/p2p?exchange=all&asset=USDT&fiat=KES&tradeType=BUY
router.get('/rates',     p2pLimiter, controller.getP2PRates);     // GET /api/p2p/rates?asset=USDT&fiat=KES
router.get('/supported', controller.getSupportedPairs);           // GET /api/p2p/supported

module.exports = router;