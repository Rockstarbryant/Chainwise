/**
 * feedback.js — Express route + controller for 👍/👎 message feedback
 *
 * POST /api/feedback
 * Body: { conversationId?, messageIndex, vote: 'up'|'down', message?, toolsUsed? }
 *
 * Stores to MongoDB Feedback collection.
 * No auth required — works for both anon and authenticated users.
 *
 * ── SETUP ──────────────────────────────────────────────────────────────────
 * 1. Add this model to models/Feedback.js (schema below)
 * 2. Register the route in server.js:
 *      const feedbackRoute = require('./routes/feedback');
 *      app.use('/api/feedback', feedbackRoute);
 */

// ── Model: models/Feedback.js ─────────────────────────────────────────────
// Copy this block into a new file at src/models/Feedback.js

/*
const mongoose = require('mongoose');

const FeedbackSchema = new mongoose.Schema({
  conversationId: { type: String, default: null },
  messageIndex:   { type: Number, required: true },
  vote:           { type: String, enum: ['up', 'down'], required: true },
  message:        { type: String, default: '' },    // first 200 chars of response
  toolsUsed:      { type: [String], default: [] },  // which tools were called
  userId:         { type: String, default: null },  // from auth if available
  ip:             { type: String, default: null },
}, { timestamps: true });

module.exports = mongoose.model('Feedback', FeedbackSchema);
*/

// ── Route ─────────────────────────────────────────────────────────────────
const express = require('express');
const router  = express.Router();
const mongoose = require('mongoose');
const logger  = require('../../utils/logger');
const { optionalAuth } = require('../middlewares/auth');
const { success, error: sendError } = require('../../utils/response');

// Lazy-load the model so this file doesn't crash if Feedback.js doesn't exist yet
function getFeedbackModel() {
  if (mongoose.models.Feedback) return mongoose.models.Feedback;
  const schema = new mongoose.Schema({
    conversationId: { type: String, default: null },
    messageIndex:   { type: Number, required: true },
    vote:           { type: String, enum: ['up', 'down'], required: true },
    message:        { type: String, default: '' },
    toolsUsed:      { type: [String], default: [] },
    userId:         { type: String, default: null },
    ip:             { type: String, default: null },
  }, { timestamps: true });
  return mongoose.model('Feedback', schema);
}

router.post('/', optionalAuth, async (req, res, next) => {
  try {
    const { conversationId, messageIndex, vote, message, toolsUsed } = req.body;

    if (!['up', 'down'].includes(vote)) {
      return sendError(res, 400, 'Invalid vote value');
    }
    if (typeof messageIndex !== 'number') {
      return sendError(res, 400, 'messageIndex must be a number');
    }

    const Feedback = getFeedbackModel();
    await Feedback.create({
      conversationId: conversationId || null,
      messageIndex,
      vote,
      message:   (message || '').slice(0, 200),
      toolsUsed: Array.isArray(toolsUsed) ? toolsUsed : [],
      userId:    req.user?.id || null,
      ip:        req.ip,
    });

    logger.debug(`[feedback] ${vote} on msg[${messageIndex}] conv=${conversationId || 'anon'}`);
    return success(res, { recorded: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;