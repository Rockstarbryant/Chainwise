const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/admin.controller');
const { requireAdmin } = require('../middlewares/auth');

// All admin routes require authenticated admin user
router.use(requireAdmin);

router.get('/fees',                           controller.getAllFees);
router.patch('/fees/:exchange',               controller.updateExchange);
router.post('/fees/:exchange/:coin/networks', controller.addNetwork);
router.patch('/fees/:exchange/:coin/:chain',  controller.updateNetwork);
router.delete('/fees/:exchange/:coin/:chain', controller.removeNetwork);

module.exports = router;