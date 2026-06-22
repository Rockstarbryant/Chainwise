/**
 * backend/src/routes/giveaways.js
 */
const { Router }      = require('express');
const {
  getGiveaways,
  getGiveawayStats,
  triggerScan,
  triggerTelegramScan,
}                      = require('../controllers/giveaway.controller');
const { requireAdmin } = require('../middlewares/auth');
const { general }      = require('../middlewares/rateLimiter');

const router = Router();

// ─── Public ───────────────────────────────────────────────────────────────────
// GET /api/giveaways?exchange=binance&source=telegram&sort=confidence&page=1&limit=20
router.get('/',      general, getGiveaways);

// GET /api/giveaways/stats
router.get('/stats', general, getGiveawayStats);

// ─── Admin ────────────────────────────────────────────────────────────────────
// POST /api/giveaways/scan?exchange=bybit          (X/Twitter — requires subscription)
router.post('/scan',          requireAdmin, triggerScan);

// POST /api/giveaways/scan/telegram?exchange=bybit  (Telegram — free, no API key)
router.post('/scan/telegram', triggerTelegramScan);

module.exports = router;