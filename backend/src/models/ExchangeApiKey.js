const mongoose = require('mongoose');
const CryptoJS = require('crypto-js');

const ENCRYPTION_KEY = process.env.API_KEY_ENCRYPTION_SECRET || 'chainwise-secret-32-chars-pad!!!';

const ExchangeApiKeySchema = new mongoose.Schema({
  adminUserId:            { type: String, required: true, index: true },
  exchange:               { type: String, required: true, lowercase: true },
  apiKeyEncrypted:        { type: String, required: true },
  apiSecretEncrypted:     { type: String, required: true },
  apiPassphraseEncrypted: { type: String, default: null }, // ← KuCoin, Bitget
  isValid:     { type: Boolean, default: false },
  lastTested:  { type: Date },
  lastSync:    { type: Date },
  lastError:   { type: String, default: null },
  autoSync:    { type: Boolean, default: true },
}, { timestamps: true });

// Unique per admin per exchange
ExchangeApiKeySchema.index({ adminUserId: 1, exchange: 1 }, { unique: true });

// Encrypt before saving
ExchangeApiKeySchema.statics.encrypt = (text) => {
  return CryptoJS.AES.encrypt(text, ENCRYPTION_KEY).toString();
};

// Decrypt when reading
ExchangeApiKeySchema.statics.decrypt = (cipher) => {
  const bytes = CryptoJS.AES.decrypt(cipher, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
};

module.exports = mongoose.model('ExchangeApiKey', ExchangeApiKeySchema);