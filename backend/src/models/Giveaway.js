const mongoose = require('mongoose');

const GiveawaySchema = new mongoose.Schema({
  exchange: { type: String, required: true, lowercase: true },
  title: { type: String, required: true },
  description: { type: String },
  prize: { type: String },
  deadline: { type: Date },
  participationSteps: [{ type: String }],
  tweetId: { type: String },
  tweetUrl: { type: String },
  isActive: { type: Boolean, default: true },
  sourceRaw: { type: String }, // raw tweet text
}, { timestamps: true });

module.exports = mongoose.model('Giveaway', GiveawaySchema);