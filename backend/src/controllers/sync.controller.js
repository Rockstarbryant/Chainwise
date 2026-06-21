const ExchangeApiKey = require('../models/ExchangeApiKey');
const { testApiKeys, getDecryptedKeys } = require('../services/exchangeSync');
const { queueSync, queueAllExchanges, getQueueStats } = require('../jobs/syncQueue');
const { success, error: sendError } = require('../../utils/response');
const logger = require('../../utils/logger');

// GET /api/sync/keys — get all stored API keys for admin (no secrets shown)
const listKeys = async (req, res, next) => {
  try {
    const keys = await ExchangeApiKey.find(
      { adminUserId: req.userId },
      'exchange isValid autoSync lastSync lastError lastTested createdAt'
    ).lean();
    return success(res, keys, 200, { count: keys.length });
  } catch (err) { next(err); }
};

// POST /api/sync/keys — save or update API keys for an exchange
const saveKeys = async (req, res, next) => {
  try {
    const { exchange, apiKey, apiSecret, apiPassphrase, autoSync = true } = req.body;
    if (!exchange || !apiKey || !apiSecret) {
      return sendError(res, 'exchange, apiKey, and apiSecret are required', 400);
    }

    const testResult = await testApiKeys(exchange, apiKey, apiSecret, apiPassphrase);

    const updateData = {
      apiKeyEncrypted:    ExchangeApiKey.encrypt(apiKey),
      apiSecretEncrypted: ExchangeApiKey.encrypt(apiSecret),
      isValid:    testResult.valid,
      lastTested: new Date(),
      lastError:  testResult.error || null,
      autoSync,
    };

    if (apiPassphrase) {
      updateData.apiPassphraseEncrypted = ExchangeApiKey.encrypt(apiPassphrase);
    }

    const doc = await ExchangeApiKey.findOneAndUpdate(
      { adminUserId: req.userId, exchange: exchange.toLowerCase() },
      updateData,
      { upsert: true, new: true }
    );

    return success(res, {
      exchange:  doc.exchange,
      isValid:   testResult.valid,
      lastTested: doc.lastTested,
      error:     testResult.error || null,
      message:   testResult.valid
        ? `✓ ${exchange} connected successfully`
        : `Keys saved but test failed: ${testResult.error}`,
    });
  } catch (err) { next(err); }
};

// DELETE /api/sync/keys/:exchange — remove API keys
const deleteKeys = async (req, res, next) => {
  try {
    await ExchangeApiKey.findOneAndDelete({
      adminUserId: req.userId,
      exchange:    req.params.exchange.toLowerCase(),
    });
    return success(res, { deleted: true });
  } catch (err) { next(err); }
};

// POST /api/sync/trigger/:exchange — manually trigger sync for one exchange
const triggerSync = async (req, res, next) => {
  try {
    const exchange = req.params.exchange.toLowerCase();
    const keyDoc   = await ExchangeApiKey.findOne({
      adminUserId: req.userId,
      exchange,
    });

    if (!keyDoc) {
      return sendError(res, `No API keys found for ${exchange}. Add them first.`, 404);
    }
    if (!keyDoc.isValid) {
      return sendError(res, `API keys for ${exchange} are invalid. Update them first.`, 400);
    }

    const jobId = await queueSync(exchange, req.userId, 1); // priority 1 = high
    return success(res, {
      jobId,
      exchange,
      message: `Sync queued for ${exchange}. Will complete in ~30 seconds.`,
    });
  } catch (err) { next(err); }
};

// POST /api/sync/trigger-all — sync all exchanges
const triggerAll = async (req, res, next) => {
  try {
    const jobs = await queueAllExchanges(req.userId);
    if (jobs.length === 0) {
      return sendError(res, 'No valid API keys configured. Add API keys first.', 400);
    }
    return success(res, {
      queued:    jobs.length,
      jobs,
      message: `Syncing ${jobs.length} exchange(s). Check status in a few minutes.`,
    });
  } catch (err) { next(err); }
};

// POST /api/sync/test/:exchange — test stored keys without re-entering them
const testStoredKeys = async (req, res, next) => {
  try {
    const exchange = req.params.exchange.toLowerCase();
    const { apiKey, apiSecret, passphrase } = await getDecryptedKeys(exchange, req.userId);
    const result = await testApiKeys(exchange, apiKey, apiSecret, passphrase);
    
    // Update isValid status in DB based on result
    await ExchangeApiKey.findOneAndUpdate(
      { adminUserId: req.userId, exchange },
      { isValid: result.valid, lastTested: new Date(), lastError: result.error || null }
    );

    return success(res, {
      exchange,
      isValid:   result.valid,
      lastTested: new Date(),
      error:     result.error || null,
      message:   result.valid
        ? `✓ ${exchange} connection is working`
        : `Connection failed: ${result.error}`,
    });
  } catch (err) { next(err); }
};

// GET /api/sync/status — queue stats + last sync times
const getStatus = async (req, res, next) => {
  try {
    const [keys, queueStats] = await Promise.all([
      ExchangeApiKey.find(
        { adminUserId: req.userId },
        'exchange isValid autoSync lastSync lastError'
      ).lean(),
      getQueueStats(),
    ]);

    return success(res, {
      exchanges: keys,
      queue:     queueStats,
    });
  } catch (err) { next(err); }
};

module.exports = { listKeys, saveKeys, deleteKeys, triggerSync, triggerAll, getStatus, testStoredKeys };