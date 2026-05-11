/**
 * backend/src/routes/giveaways.js
 *
 * Mount in server.js:
 *   const giveawayRoutes = require('./routes/giveaways');
 *   app.use('/api/giveaways', giveawayRoutes);
 *
 * Route order matters — specific before parameterised.
 */
const { Router }      = require('express');
const {
  getGiveaways,
  getGiveawayStats,
  triggerScan,
}                      = require('../controllers/giveaway.controller');
const { requireAdmin } = require('../middlewares/auth');
const { general }  = require('../middlewares/rateLimiter');

const router = Router();

// ─── Public ───────────────────────────────────────────────────────────────────
// GET /api/giveaways?exchange=binance&sort=confidence&page=1&limit=20
router.get('/',      general, getGiveaways);

// GET /api/giveaways/stats — per-exchange counts
router.get('/stats', general, getGiveawayStats);

// ─── Admin ────────────────────────────────────────────────────────────────────
// POST /api/giveaways/scan?exchange=bybit   (optional — omit for all exchanges)
router.post('/scan', requireAdmin, triggerScan);

module.exports = router;