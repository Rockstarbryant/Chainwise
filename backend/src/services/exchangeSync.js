const ccxt           = require('ccxt');
const ExchangeFee    = require('../models/ExchangeFee');
const ExchangeApiKey = require('../models/ExchangeApiKey');
const logger         = require('../../utils/logger');
const { cacheDelPattern } = require('../config/redis');

const CCXT_MAP = {
  binance: 'binance',
  bybit:   'bybit',
  kucoin:  'kucoin',
  bitget:  'bitget',
  gateio:  'gateio',
  coinex:  'coinex',
};

// FIX 1: Added `passphrase` as a proper parameter
function buildExchangeInstance(exchangeKey, apiKey, apiSecret, passphrase = '') {
  const className = CCXT_MAP[exchangeKey];
  if (!className || !ccxt[className]) {
    throw new Error(`No CCXT support for exchange: ${exchangeKey}`);
  }

  // Exchange-specific options
  const exchangeOptions = {
    binance: {
      apiKey,
      secret:          apiSecret,
      timeout:         30000,
      enableRateLimit: true,
      options:         { defaultType: 'spot' },
    },
    bybit: {
      apiKey,
      secret:          apiSecret,
      timeout:         30000,
      enableRateLimit: true,
      options: {
        defaultType: 'spot',
        accountType: 'UNIFIED',
        recvWindow:  10000,
      },
    },
    kucoin: {
      apiKey,
      secret:          apiSecret,
      password:        passphrase, // FIX: now uses the passed-in passphrase
      timeout:         30000,
      enableRateLimit: true,
      options:         { defaultType: 'spot' },
    },
    bitget: {
      apiKey,
      secret:          apiSecret,
      password:        passphrase, // FIX: now uses the passed-in passphrase
      timeout:         30000,
      enableRateLimit: true,
      options:         { defaultType: 'spot' },
    },
    gateio: {
      apiKey,
      secret:          apiSecret,
      timeout:         30000,
      enableRateLimit: true,
    },
    coinex: {
      apiKey,
      secret:          apiSecret,
      timeout:         30000,
      enableRateLimit: true,
      options: {
        defaultType: 'spot',
        api:         'v2',
      },
    },
  };

  const opts = exchangeOptions[exchangeKey] || {
    apiKey,
    secret:          apiSecret,
    timeout:         30000,
    enableRateLimit: true,
  };

  return new ccxt[className](opts);
}

async function getDecryptedKeys(exchangeKey, adminUserId) {
  const keyDoc = await ExchangeApiKey.findOne({ exchange: exchangeKey, adminUserId });
  if (!keyDoc) throw new Error(`No API keys for ${exchangeKey}`);
  return {
    apiKey:     ExchangeApiKey.decrypt(keyDoc.apiKeyEncrypted),
    apiSecret:  ExchangeApiKey.decrypt(keyDoc.apiSecretEncrypted),
    passphrase: keyDoc.apiPassphraseEncrypted
      ? ExchangeApiKey.decrypt(keyDoc.apiPassphraseEncrypted)
      : '',
  };
}

// ── Test API keys ─────────────────────────────────────────────────────────
// FIX 2: Added `passphrase` parameter and passed it to buildExchangeInstance
async function testApiKeys(exchangeKey, apiKey, apiSecret, passphrase = '') {
  try {
    const exchange = buildExchangeInstance(exchangeKey, apiKey, apiSecret, passphrase);
    await exchange.fetchBalance();
    return { valid: true };
  } catch (err) {
    logger.warn(`[sync] Key test failed for ${exchangeKey}: ${err.message}`);
    return {
      valid: false,
      error: err.message?.length > 120 ? err.message.slice(0, 120) + '...' : err.message,
    };
  }
}

// ── Fetch all currencies with network info ────────────────────────────────
// FIX 3: Added `passphrase` parameter and passed it to buildExchangeInstance
async function fetchExchangeFeeData(exchangeKey, apiKey, apiSecret, passphrase = '') {
  logger.info(`[sync] Fetching currencies from ${exchangeKey}...`);
  const exchange = buildExchangeInstance(exchangeKey, apiKey, apiSecret, passphrase);

  const currencies = await exchange.fetchCurrencies();
  logger.info(`[sync] ${exchangeKey}: ${Object.keys(currencies).length} currencies returned`);

  const coinMap = {};
  let networkCount = 0;

  for (const [symbol, currency] of Object.entries(currencies)) {
    if (!currency || !currency.active) continue;

    const networks  = [];
    const netData   = currency.networks || {};
    const netKeys   = Object.keys(netData);

    for (const networkId of netKeys) {
      const net = netData[networkId];
      if (!net) continue;

      // Some exchanges mark individual networks as inactive
      if (net.active === false) continue;

      const withdrawFee = parseFloat(
        net.fee ?? net.withdraw?.fee ?? currency.fee ?? 0
      ) || 0;

      const minWithdraw = parseFloat(
        net.limits?.withdraw?.min ??
        net.withdraw?.min ??
        currency.limits?.withdraw?.min ?? 0
      ) || 0;

      const minDeposit = parseFloat(
        net.limits?.deposit?.min ??
        net.deposit?.min ??
        currency.limits?.deposit?.min ?? 0
      ) || 0;

      networks.push({
        chain:          net.name || networkId.toUpperCase(),
        chainId:        networkId.toLowerCase(),
        withdrawFee,
        withdrawFeeUSD: null,
        minWithdraw,
        minDeposit,
        depositFee:     0,
        arrivalMins:    estimateArrivalMins(networkId),
        isActive:       true,
        dataSource:     'api',
        lastSynced:     new Date(),
      });
      networkCount++;
    }

    if (networks.length > 0) {
      coinMap[symbol.toUpperCase()] = networks;
    }
  }

  logger.info(`[sync] ${exchangeKey}: parsed ${Object.keys(coinMap).length} coins, ${networkCount} networks`);
  return coinMap;
}

function estimateArrivalMins(networkId) {
  const id   = networkId.toLowerCase();
  const fast = ['bsc', 'polygon', 'arb', 'arbitrum', 'base', 'op', 'optimism', 'sol', 'solana', 'trc', 'tron', 'ton'];
  const slow = ['eth', 'ethereum', 'btc', 'bitcoin'];
  if (fast.some(n => id.includes(n))) return 1;
  if (slow.some(n => id.includes(n))) return 5;
  return 2;
}

// ── Main sync orchestrator ────────────────────────────────────────────────
async function syncExchange(exchangeKey, adminUserId) {
  logger.info(`[sync] ▶ Starting full sync: ${exchangeKey}`);
  const startTime = Date.now();

  // 1. Get API keys from DB (including passphrase via getDecryptedKeys)
  // FIX 4: Use getDecryptedKeys so passphrase is always retrieved
  const { apiKey, apiSecret, passphrase } = await getDecryptedKeys(exchangeKey, adminUserId);

  const keyDoc = await ExchangeApiKey.findOne({ exchange: exchangeKey, adminUserId });
  if (!keyDoc) {
    throw new Error(`No API keys stored for ${exchangeKey}`);
  }

  // 2. Fetch fresh data from exchange
  let coinMap;
  try {
    // FIX 5: Pass passphrase through to fetchExchangeFeeData
    coinMap = await fetchExchangeFeeData(exchangeKey, apiKey, apiSecret, passphrase);
  } catch (err) {
    // Update key doc with error
    await ExchangeApiKey.findByIdAndUpdate(keyDoc._id, {
      lastError: err.message?.slice(0, 200),
      isValid:   false,
    });
    throw new Error(`Exchange API error for ${exchangeKey}: ${err.message}`);
  }

  if (Object.keys(coinMap).length === 0) {
    logger.warn(`[sync] ${exchangeKey}: no coin data returned — skipping DB update`);
    return { synced: 0, skipped: 0, exchange: exchangeKey };
  }

  // 3. Get existing exchange doc from DB
  let doc = await ExchangeFee.findOne({ exchange: exchangeKey });
  if (!doc) {
    logger.warn(`[sync] ${exchangeKey} not in ExchangeFee DB — creating it`);
    doc = await ExchangeFee.create({
      exchange:    exchangeKey,
      displayName: exchangeKey.charAt(0).toUpperCase() + exchangeKey.slice(1),
      coins:       [],
      dataSource:  'api',
    });
  }

  let synced  = 0;
  let skipped = 0; // manual overrides preserved

  // 4. Merge new data into DB
  for (const [symbol, newNetworks] of Object.entries(coinMap)) {
    let coinData = doc.coins.find(c => c.symbol === symbol);

    if (!coinData) {
      doc.coins.push({ symbol, networks: newNetworks });
      synced++;
      continue;
    }

    // Update existing networks
    let coinChanged = false;
    for (const newNet of newNetworks) {
      const existing = coinData.networks.find(
        n => n.chainId?.toLowerCase() === newNet.chainId?.toLowerCase()
      );

      if (!existing) {
        coinData.networks.push(newNet);
        coinChanged = true;
      } else if (existing.dataSource === 'manual') {
        skipped++;
        // Preserve manual — don't overwrite
      } else {
        // Safe to auto-update
        existing.withdrawFee    = newNet.withdrawFee;
        existing.minWithdraw    = newNet.minWithdraw;
        existing.minDeposit     = newNet.minDeposit;
        existing.isActive       = newNet.isActive;
        existing.dataSource     = 'api';
        existing.lastSynced     = new Date();
        coinChanged = true;
      }
    }
    if (coinChanged) synced++;
  }

  doc.lastUpdated = new Date();
  doc.dataSource  = 'api';
  await doc.save();

  // 5. Bust Redis cache for this exchange
  await cacheDelPattern(`fees:${exchangeKey}:*`);
  await cacheDelPattern(`compare:*`);

  // 6. Update sync status on key doc
  await ExchangeApiKey.findByIdAndUpdate(keyDoc._id, {
    lastSync:  new Date(),
    lastError: null,
    isValid:   true,
  });

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  logger.info(`[sync] ✓ ${exchangeKey} complete in ${duration}s — ${synced} coins synced, ${skipped} manual entries preserved`);

  return {
    exchange: exchangeKey,
    synced,
    skipped,
    totalCoins: Object.keys(coinMap).length,
    durationSecs: parseFloat(duration),
  };
}

module.exports = { syncExchange, testApiKeys, fetchExchangeFeeData };