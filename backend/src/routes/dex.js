/**
 * backend/src/routes/dex.js
 *
 * Add to server.js:
 *   const dexRoute = require('./routes/dex');
 *   app.use('/api/dex', dexRoute);
 */

const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/dex.controller');
const { feesLimiter } = require('../middlewares/rateLimiter');

// GET /api/dex/search?q=PEPE
// GET /api/dex/search?q=0x6982508145454Ce325dDbE47a25d4ec3d2311933
router.get('/search', feesLimiter, controller.searchDEX);

// GET /api/dex/chains
router.get('/chains', feesLimiter, controller.listChains);

module.exports = router;