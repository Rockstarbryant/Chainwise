const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/agent.controller');
const { agentLimiter } = require('../middlewares/rateLimiter');
const { agentRequest } = require('../middlewares/validate');
const { optionalAuth } = require('../middlewares/auth');

// POST /api/agent          — standard JSON response (backward compat)
router.post('/',        agentLimiter, optionalAuth, agentRequest, controller.chat);

// POST /api/agent/stream   — SSE streaming response
router.post('/stream',  agentLimiter, optionalAuth, agentRequest, controller.streamChat);

module.exports = router;