const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/sync.controller');
const { requireAdmin } = require('../middlewares/auth');
const { authLimiter }  = require('../middlewares/rateLimiter');

// All sync routes require admin
router.use(requireAdmin);

router.get('/keys',                  controller.listKeys);
router.post('/keys',                 authLimiter, controller.saveKeys);
router.delete('/keys/:exchange',     controller.deleteKeys);
router.post('/test/:exchange',       controller.testStoredKeys);
//router.post('/test/:exchange', adminAuth, controller.testStoredKeys);
router.post('/trigger/:exchange',    controller.triggerSync);
router.post('/trigger-all',          controller.triggerAll);
router.get('/status',                controller.getStatus);

module.exports = router;