// routes/conversations.js
const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/conversation.controller');
const { requireAuth } = require('../middlewares/auth');
const { agentLimiter } = require('../middlewares/rateLimiter');

router.use(requireAuth); // all conversation routes need auth

router.get('/',                                controller.list);
router.post('/',                               controller.create);
router.get('/:id',                             controller.getOne);
router.post('/:id/message', agentLimiter,      controller.sendMessage);       // keep for compat
router.post('/:id/stream',  agentLimiter,      controller.sendMessageStream); // ← new SSE route
router.delete('/:id',                          controller.remove);

module.exports = router;