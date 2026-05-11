import mongoose from 'mongoose';

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
    // ─── Identity ────────────────────────────────────────────────────────────
    tweetId:             { type: String, required: true, unique: true },
    exchange:            { type: String, required: true, lowercase: true, trim: true },
    exchangeHandle:      { type: String },           // "Bybit_Official"
    exchangeDisplayName: { type: String },           // "Bybit"
    tweetUrl:            { type: String },
    tweetText:           { type: String, required: true },
    authorName:          { type: String },
    authorHandle:        { type: String },

    // ─── Parsed Content ──────────────────────────────────────────────────────
    prizePool:           { type: String, default: null },    // "$10,000 USDT"
    prizeAmountUSD:      { type: Number, default: 0 },       // numeric estimate
    coins:               [{ type: String }],                 // ["USDT","BNB"]
    requirements:        [RequirementSchema],                // structured
    requirementsRaw:     [{ type: String }],                 // plain text list
    endDateRaw:          { type: String, default: null },    // mentioned deadline if any
    hashtags:            [{ type: String }],                 // extracted hashtags

    // ─── Confidence ──────────────────────────────────────────────────────────
    confidence:          { type: Number, default: 0, min: 0, max: 1 },
    confidenceScore:     { type: Number, default: 0, min: 0, max: 100 },
    keywordsMatched:     [{ type: String }],
    isVerifiedGiveaway:  { type: Boolean, default: false },  // confidence >= 0.6

    // ─── Twitter Metrics ─────────────────────────────────────────────────────
    likeCount:           { type: Number, default: 0 },
    retweetCount:        { type: Number, default: 0 },
    replyCount:          { type: Number, default: 0 },
    impressionCount:     { type: Number, default: 0 },

    // ─── Lifecycle ───────────────────────────────────────────────────────────
    tweetCreatedAt:      { type: Date },
    scannedAt:           { type: Date, default: Date.now },
    expiresAt:           { type: Date },   // TTL index — auto-remove after 7 days
    isActive:            { type: Boolean, default: true },
  },
  { timestamps: true }
);

// ─── Indexes ─────────────────────────────────────────────────────────────────
GiveawaySchema.index({ tweetId: 1 }, { unique: true });
GiveawaySchema.index({ exchange: 1, tweetCreatedAt: -1 });
GiveawaySchema.index({ isActive: 1, confidence: -1 });
GiveawaySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL auto-delete

export default mongoose.model('Giveaway', GiveawaySchema);