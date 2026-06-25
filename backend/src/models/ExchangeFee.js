const mongoose = require('mongoose');

const NetworkSchema = new mongoose.Schema({
  chain:          { type: String, required: true },
  chainId:        { type: String, required: true },
  withdrawFee:    { type: Number, required: true },
  withdrawFeeUSD: { type: Number, default: null },
  minWithdraw:    { type: Number, required: true },
  depositFee:     { type: Number, default: 0 },
  minDeposit:     { type: Number, default: 0 },
  arrivalMins:    { type: Number, default: 1 },
  isActive:       { type: Boolean, default: true },
  dataSource:     { type: String, enum: ['manual', 'api', 'scraper'], default: 'manual' }, // ← ADD
  lastSynced:     { type: Date, default: null },  // ← ADD
}, { _id: false });

const CoinSchema = new mongoose.Schema({
  symbol: { type: String, required: true, uppercase: true }, // "USDT"
  networks: [NetworkSchema],
}, { _id: false });

const ExchangeFeeSchema = new mongoose.Schema({
  exchange:        { type: String, required: true, lowercase: true, unique: true },
  displayName:     { type: String, required: true },
  website:         { type: String },
  twitterHandle:   { type: String },
  description:     { type: String },
  country:         { type: String },
  yearEstablished: { type: Number },
  image:           { type: String },
  trustScore:      { type: Number },
  trustScoreRank:  { type: Number },
  centralized:     { type: Boolean },
  cgTotalCoins:    { type: Number },
  cgTotalPairs:    { type: Number },
  cgVolume24hBTC:  { type: Number },
  cgLastEnriched:  { type: Date },
  p2p:             { type: Boolean, default: false },
 // p2pMinUSD:       { type: Number, default: null },
  p2pCountries:    [{ type: String }],
  coins:           [CoinSchema],
  lastUpdated:     { type: Date, default: Date.now },
  dataSource:      { type: String, enum: ['manual', 'api', 'scraper'], default: 'manual' },
}, { timestamps: true });

// Index for fast queries
ExchangeFeeSchema.index({ 'coins.symbol': 1 });
ExchangeFeeSchema.index({ exchange: 1, 'coins.symbol': 1 });

module.exports = mongoose.model('ExchangeFee', ExchangeFeeSchema);