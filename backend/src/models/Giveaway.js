/**
 * backend/src/models/Giveaway.js
 *
 * Updated: added `source` field ('twitter' | 'telegram') so posts from
 * both pipelines share the same collection without clashing.
 *
 * Note: tweetId is used as the universal unique message ID for both sources.
 *  - Twitter: the tweet ID string   e.g. "1234567890123456789"
 *  - Telegram: "<channel_handle>_<message_id>"  e.g. "binance_announcements_5812"
 *
 * The tweetId unique index therefore guarantees no duplicates across runs
 * regardless of source.
 */

const mongoose = require('mongoose');

const { Schema } = mongoose;

const RequirementSchema = new Schema(
  {
    type:        { type: String, enum: ['follow', 'repost', 'reply', 'tag', 'like', 'other'] },
    description: { type: String },
  },
  { _id: false }
);

const GiveawaySchema = new Schema(
  {
    // ─── Source ──────────────────────────────────────────────────────────────
    source: {
      type:    String,
      enum:    ['twitter', 'telegram'],
      default: 'twitter',
      index:   true,
    },

    // ─── Identity ────────────────────────────────────────────────────────────
    tweetId:             { type: String, required: true, unique: true },
    exchange:            { type: String, required: true, lowercase: true, trim: true },
    exchangeHandle:      { type: String },
    exchangeDisplayName: { type: String },
    tweetUrl:            { type: String },   // works for both tweet URLs and t.me links
    tweetText:           { type: String, required: true },
    authorName:          { type: String },
    authorHandle:        { type: String },

    // ─── Parsed Content ──────────────────────────────────────────────────────
    prizePool:       { type: String, default: null },
    prizeAmountUSD:  { type: Number, default: 0 },
    coins:           [{ type: String }],
    requirements:    [RequirementSchema],
    requirementsRaw: [{ type: String }],
    endDateRaw:      { type: String, default: null },
    hashtags:        [{ type: String }],

    embeddedLinks: [{ text: String, url: String }],  // NEW
    telegramHtml: { type: String },                   // NEW - for rich rendering
    isFreeToEnter: { type: Boolean, default: false }, // NEW - computed
    effortLevel: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' }, // NEW

    // ─── Confidence ──────────────────────────────────────────────────────────
    confidence:         { type: Number, default: 0, min: 0, max: 1 },
    confidenceScore:    { type: Number, default: 0, min: 0, max: 100 },
    keywordsMatched:    [{ type: String }],
    isVerifiedGiveaway: { type: Boolean, default: false },

    // ─── Metrics (Twitter only; zeroed for Telegram) ─────────────────────────
    likeCount:       { type: Number, default: 0 },
    retweetCount:    { type: Number, default: 0 },
    replyCount:      { type: Number, default: 0 },
    impressionCount: { type: Number, default: 0 },

    // ─── Lifecycle ───────────────────────────────────────────────────────────
    tweetCreatedAt: { type: Date },
    scannedAt:      { type: Date, default: Date.now },
    expiresAt:      { type: Date },
    isActive:       { type: Boolean, default: true },
  },
  { timestamps: true }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
GiveawaySchema.index({ tweetId: 1 }, { unique: true });
GiveawaySchema.index({ exchange: 1, tweetCreatedAt: -1 });
GiveawaySchema.index({ isActive: 1, confidence: -1 });
GiveawaySchema.index({ source: 1, isActive: 1, confidence: -1 });   // for Telegram queries
GiveawaySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });  // TTL auto-delete

module.exports = mongoose.model('Giveaway', GiveawaySchema);