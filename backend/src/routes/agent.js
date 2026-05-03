const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/agent.controller');
const { agentLimiter } = require('../middlewares/rateLimiter');
const { agentRequest } = require('../middlewares/validate');
const { optionalAuth } = require('../middlewares/auth');

// POST /api/agent
router.post('/', agentLimiter, optionalAuth, agentRequest, controller.chat);

module.exports = router;