/**
 * backend/src/models/P2PAd.js
 *
 * Caches P2P ad snapshots in MongoDB so the agent tools
 * and the frontend can query without hitting exchange APIs
 * on every request. Cache is refreshed by the cron job.
 *
 * TTL index auto-deletes documents after 2 hours so stale
 * data never accumulates.
 */

const mongoose = require('mongoose');

const P2PAdSchema = new mongoose.Schema({
  // ── Identity ──────────────────────────────────────────────────────────
  exchange:   { type: String, required: true, lowercase: true }, // 'binance'
  asset:      { type: String, required: true, uppercase: true }, // 'USDT'
  fiat:       { type: String, required: true, uppercase: true }, // 'KES'
  tradeType:  { type: String, required: true, enum: ['BUY', 'SELL'] },

  // ── Ad data ───────────────────────────────────────────────────────────
  price:      { type: Number, required: true },
  minAmount:  { type: Number, default: 0 },   // in fiat
  maxAmount:  { type: Number, default: 0 },   // in fiat
  available:  { type: Number, default: 0 },   // in asset units
  paymentMethods: [{ type: String }],

  // ── Merchant ──────────────────────────────────────────────────────────
  merchant: {
    name:           { type: String, default: 'Unknown' },
    completionRate: { type: Number, default: 0 },   // 0–100
    orderCount:     { type: Number, default: 0 },
    isVerified:     { type: Boolean, default: false },
  },

  // ── Cache control ─────────────────────────────────────────────────────
  fetchedAt:  { type: Date, default: Date.now },
}, {
  timestamps: false,
  // TTL: documents expire 2 hours after fetchedAt
  expireAfterSeconds: 0, // applied via index below
});

// TTL index — MongoDB deletes documents 2 hours after fetchedAt
P2PAdSchema.index({ fetchedAt: 1 }, { expireAfterSeconds: 7200 });

// Query indexes
P2PAdSchema.index({ exchange: 1, asset: 1, fiat: 1, tradeType: 1 });
P2PAdSchema.index({ asset: 1, fiat: 1, tradeType: 1, price: 1 });
P2PAdSchema.index({ fiat: 1, tradeType: 1 });

module.exports = mongoose.model('P2PAd', P2PAdSchema);