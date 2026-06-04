const ccxt           = require('ccxt');
const crypto         = require('crypto');
const https          = require('https');
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
  okx:     'okx',
  mexc:    'mexc',
  bingx:   'bingx',
  bitmart: 'bitmart',
  huobi:   'htx',
  htx:     'htx', // Huobi rebranded to HTX but CCXT still uses 'huobi' as the key
};

function buildExchangeInstance(exchangeKey, apiKey, apiSecret, passphrase = '') {
  const className = CCXT_MAP[exchangeKey];
  if (!className || !ccxt[className]) {
    throw new Error(`No CCXT support for exchange: ${exchangeKey}`);
  }

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
     okx: {
      apiKey,
      secret:          apiSecret,
      password:        passphrase,   // OKX calls this "passphrase" but CCXT uses `password`
      timeout:         30000,
      enableRateLimit: true,
      options:         { defaultType: 'spot' },
    },
    kucoin: {
      apiKey,
      secret:          apiSecret,
      password:        passphrase,
      timeout:         30000,
      enableRateLimit: true,
      options:         { defaultType: 'spot' },
    },
    bitget: {
      apiKey,
      secret:          apiSecret,
      password:        passphrase,
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
    mexc: {
    apiKey,
    secret:          apiSecret,
    timeout:         30000,
    enableRateLimit: true,
    options:         { defaultType: 'spot' },
    },
    bingx: {
      apiKey,
      secret:          apiSecret,
      timeout:         30000,
      enableRateLimit: true,
      options: {
        defaultType: 'spot',        // Very important
      },
    },
    bitmart: {
      apiKey,
      secret:          apiSecret,
      uid:             passphrase,   // ← Make sure this is correctly passed (BitMart Memo/UID)
      timeout:         30000,
      enableRateLimit: true,
      options: {
        defaultType: 'spot',        // Very important
      },
    },
   htx: {
  apiKey,
  secret:          apiSecret,
  timeout:         30000,
  enableRateLimit: true,
  options: {
    defaultType: 'spot',           // Force spot
    defaultSubType: 'spot',        // Extra safety
    fetchMarkets: ['spot'],        // Optional but helpful
  },
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
async function testApiKeys(exchangeKey, apiKey, apiSecret, passphrase = '') {
  // BitMart: CCXT fetchBalance is broken, test with direct API call instead
  if (exchangeKey === 'bitmart') {
    try {
      const result = await bitmartRequest(
        '/account/v1/currencies',  // ← change this line
        apiKey, apiSecret, passphrase
      );
      if (result?.data) return { valid: true };
      return { valid: false, error: 'BitMart API returned unexpected response' };
    } catch (err) {
      logger.warn(`[sync] Key test failed for bitmart: ${err.message} | code: ${err.code} | type: ${err.constructor?.name}`);
      return {
        valid: false,
        error: err.message || err.code || 'Unknown connection error',
      };
    }
  }

  // All other exchanges use CCXT as normal
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

// ── Gate.io direct API helper ─────────────────────────────────────────────
// CCXT's fetchCurrencies for Gate.io never populates fee/limit fields because
// Gate.io's /wallet/withdraw_status uses dynamic per-chain keys (e.g.
// usdt_erc20_withdraw_txfee) that CCXT doesn't normalise. We call it directly.

function gateioSign(method, path, queryString, apiSecret) {
  const timestamp  = Math.floor(Date.now() / 1000).toString();
  const bodyHash   = crypto.createHash('sha512').update('').digest('hex');
  const signString = `${method}\n${path}\n${queryString}\n${bodyHash}\n${timestamp}`;
  const signature  = crypto.createHmac('sha512', apiSecret).update(signString).digest('hex');
  return { timestamp, signature };
}

function gateioRequest(method, path, queryString, apiKey, apiSecret) {
  return new Promise((resolve, reject) => {
    const { timestamp, signature } = gateioSign(method, path, queryString, apiSecret);
    const fullPath = queryString ? `${path}?${queryString}` : path;

    const options = {
      hostname: 'api.gateio.ws',
      path:     fullPath,
      method,
      headers: {
        'Accept':    'application/json',
        'KEY':       apiKey,
        'SIGN':      signature,
        'Timestamp': timestamp,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          if (res.statusCode >= 400) {
            return reject(new Error(`Gate.io API ${res.statusCode}: ${data.slice(0, 200)}`));
          }
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Gate.io parse error: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Gate.io request timeout')); });
    req.end();
  });
}

// ── Gate.io-specific fee fetcher ──────────────────────────────────────────
// Strategy:
//   1. GET /wallet/withdraw_status  → per-currency fee info, including dynamic
//      per-chain keys like `usdt_erc20_withdraw_txfee` and `usdt_trc20_withdraw_txfee`,
//      plus a `chains` array in newer API versions with explicit per-chain fees.
//   2. CCXT fetchCurrencies         → network list + active status per coin.
//      We use CCXT only for the coin/network structure, not fees.
async function fetchGateioFeeData(apiKey, apiSecret) {
  logger.info('[sync] Fetching currencies from gateio...');

  // Fetch both in parallel
  const [withdrawStatus, spotCoins] = await Promise.all([
    gateioRequest('GET', '/api/v4/wallet/withdraw_status', '', apiKey, apiSecret),
    buildExchangeInstance('gateio', apiKey, apiSecret).fetchCurrencies(),
  ]);

  logger.info(`[sync] gateio: ${Object.keys(spotCoins).length} currencies returned`);

  // Index withdraw_status by symbol for O(1) lookup
  // statusMap: { "USDT" -> { withdraw_fix, withdraw_amount_mini, deposit, chains?, ... } }
  const statusMap = {};
  for (const item of withdrawStatus) {
    if (item.currency) {
      statusMap[item.currency.toUpperCase()] = item;
    }
  }

  const coinMap    = {};
  let networkCount = 0;

  for (const [symbol, currency] of Object.entries(spotCoins)) {
    if (!currency || !currency.active) continue;

    const upperSymbol = symbol.toUpperCase();
    const statusInfo  = statusMap[upperSymbol];
    const networks    = [];
    const netData     = currency.networks || {};

    for (const networkId of Object.keys(netData)) {
      const net = netData[networkId];
      if (!net) continue;

      // Gate.io marks nearly all networks active=false. Check the raw info flags.
      // is_withdraw_disabled / is_deposit_disabled: 0 = enabled, 1 = disabled
      if (net.active === false) {
        const info      = net.info || {};
        const wEnabled  = info.is_withdraw_disabled === 0 || info.is_withdraw_disabled === false;
        const dEnabled  = info.is_deposit_disabled  === 0 || info.is_deposit_disabled  === false;
        if (!wEnabled && !dEnabled) continue;
      }

      let withdrawFee = 0;
      let minWithdraw = 0;
      let minDeposit  = 0;

      if (statusInfo) {
        const chainId   = networkId.toLowerCase();
        const chainName = (net.name || networkId).toLowerCase();

        // FORMAT A — newer Gate.io API: statusInfo.chains[] with per-chain objects
        // { chain: "ETH", withdraw_fix: "0.003", withdraw_amount_mini: "0.006", deposit: "0" }
        const chainEntry = Array.isArray(statusInfo.chains)
          ? statusInfo.chains.find(c => {
              const c_id = c.chain?.toLowerCase() || '';
              return c_id === chainId || c_id === chainName;
            })
          : null;

        if (chainEntry) {
          withdrawFee = parseFloat(chainEntry.withdraw_fix)         || 0;
          minWithdraw = parseFloat(chainEntry.withdraw_amount_mini) || 0;
          minDeposit  = parseFloat(chainEntry.deposit)              || 0;
        } else {
          // FORMAT B — older / single-chain currencies.
          // For multi-chain tokens Gate.io adds dynamic keys:
          //   {symbol_lower}_{chain_lower}_withdraw_txfee
          //   {symbol_lower}_{chain_lower}_withdraw_amount_mini
          // e.g. usdt_erc20_withdraw_txfee, usdt_trc20_withdraw_txfee
          const sym = upperSymbol.toLowerCase();
          const chn = chainId;

          const dynFeeKey = `${sym}_${chn}_withdraw_txfee`;
          const dynMinKey = `${sym}_${chn}_withdraw_amount_mini`;

          withdrawFee = parseFloat(
            statusInfo[dynFeeKey]         ??
            statusInfo.withdraw_fix       ?? 0
          ) || 0;

          minWithdraw = parseFloat(
            statusInfo[dynMinKey]              ??
            statusInfo.withdraw_amount_mini    ?? 0
          ) || 0;

          minDeposit = parseFloat(statusInfo.deposit ?? 0) || 0;
        }
      }

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
      coinMap[upperSymbol] = networks;
    }
  }

  logger.info(`[sync] gateio: parsed ${Object.keys(coinMap).length} coins, ${networkCount} networks`);
  return coinMap;
}

// ── BitMart HMAC signing ──────────────────────────────────────────────────
function bitmartSign(timestamp, apiKey, apiSecret, memo) {
  const message = `${timestamp}#${memo}#`;
  return crypto.createHmac('sha256', apiSecret).update(message).digest('hex');
}

const axios = require('axios');

async function bitmartRequest(path, apiKey, apiSecret, memo) {
  const timestamp = Date.now().toString();
  const message   = `${timestamp}#${memo}#`;
  const signature = crypto.createHmac('sha256', apiSecret).update(message).digest('hex');

  const response = await axios.get(`https://api-cloud.bitmart.com${path}`, {
    headers: {
      'Content-Type':   'application/json',
      'X-BM-KEY':       apiKey,
      'X-BM-SIGN':      signature,
      'X-BM-TIMESTAMP': timestamp,
    },
    timeout: 30000,
  });

  return response.data;
}

// ── BitMart-specific fee fetcher ──────────────────────────────────────────
async function fetchBitmartFeeData(apiKey, apiSecret, memo) {
  logger.info('[sync] Fetching currencies from bitmart (direct API)...');

  const response = await bitmartRequest(
    '/account/v1/currencies',
    apiKey, apiSecret, memo
  );

  // Response shape: { data: { currencies: [...] } }
  const currencies = response?.data?.currencies ?? [];
  logger.info(`[sync] bitmart: ${currencies.length} currencies returned`);

  // BitMart uses {SYMBOL}-{NETWORK} as the currency field
  // Group by base symbol, each entry is one network
  const symbolMap = {};

  for (const item of currencies) {
    if (!item.withdraw_enabled && !item.deposit_enabled) continue;

    // currency field is like "USDT-ERC20" or "BTC-Bitcoin"
    const parts   = item.currency.split('-');
    const symbol  = parts[0].toUpperCase();
    const chainId = parts.slice(1).join('-').toLowerCase();

    const network = {
      chain:          item.currency,       // e.g. "USDT-ERC20"
      chainId,                             // e.g. "erc20"
      withdrawFee:    parseFloat(item.withdraw_minfee)  || 0,
      withdrawFeeUSD: null,
      minWithdraw:    parseFloat(item.withdraw_minsize) || 0,
      minDeposit:     parseFloat(item.recharge_minsize) || 0,
      depositFee:     0,
      arrivalMins:    estimateArrivalMins(chainId),
      isActive:       item.withdraw_enabled || item.deposit_enabled,
      dataSource:     'api',
      lastSynced:     new Date(),
    };

    if (!symbolMap[symbol]) symbolMap[symbol] = [];
    symbolMap[symbol].push(network);
  }

  logger.info(`[sync] bitmart: parsed ${Object.keys(symbolMap).length} coins`);
  return symbolMap;
}

// ── Standard fee fetcher (all exchanges except Gate.io) ───────────────────
async function fetchExchangeFeeData(exchangeKey, apiKey, apiSecret, passphrase = '') {
  // Gate.io requires a direct API approach — CCXT never populates its fee fields
  if (exchangeKey === 'gateio') {
    return fetchGateioFeeData(apiKey, apiSecret);
  }
  // BitMart also has a non-standard API for fee data
  if (exchangeKey === 'bitmart') {
    return fetchBitmartFeeData(apiKey, apiSecret, passphrase);
  }

  logger.info(`[sync] Fetching currencies from ${exchangeKey}...`);
  const exchange = buildExchangeInstance(exchangeKey, apiKey, apiSecret, passphrase);

  const currencies = await exchange.fetchCurrencies();
  logger.info(`[sync] ${exchangeKey}: ${Object.keys(currencies).length} currencies returned`);

  const coinMap = {};
  let networkCount = 0;

  for (const [symbol, currency] of Object.entries(currencies)) {
    if (!currency || !currency.active) continue;

    const networks = [];
    const netData  = currency.networks || {};

    for (const networkId of Object.keys(netData)) {
      const net = netData[networkId];
      if (!net) continue;
      if (net.active === false) continue;

      const withdrawFee = parseFloat(
        net.fee ?? net.withdraw?.fee ?? currency.fee ?? 0
      ) || 0;

      const minWithdraw = parseFloat(
        net.limits?.withdraw?.min ??
        net.withdraw?.min         ??
        currency.limits?.withdraw?.min ?? 0
      ) || 0;

      const minDeposit = parseFloat(
        net.limits?.deposit?.min ??
        net.deposit?.min         ??
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

// ── Fetch coin prices from CoinGecko (free, no key needed) ────────────────
async function fetchCoinPricesUSD(symbols) {
  // CoinGecko uses lowercase IDs, but their /simple/price endpoint accepts symbols too
  // via the `ids` param. We'll use the search by symbol approach via a known map,
  // or just hit the simple price endpoint with common symbols.
  const ids = symbols.join(',').toLowerCase();
  return new Promise((resolve) => {
    https.get(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
      { headers: { 'Accept': 'application/json' } },
      (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { resolve({}); }
        });
      }
    ).on('error', () => resolve({}));
  });
}

// Map CCXT/exchange symbols → CoinGecko IDs for common coins
const COINGECKO_ID_MAP = {
  USDT: 'tether',
  USDC: 'usd-coin',
  BTC:  'bitcoin',
  ETH:  'ethereum',
  BNB:  'binancecoin',
  SOL:  'solana',
  XRP:  'ripple',
  TRX:  'tron',
  TON:  'the-open-network',
  MATIC: 'matic-network',
  // add more as needed
};

async function enrichWithUSDPrices(coinMap) {
  // Collect unique symbols that have a known CoinGecko ID
  const symbols = Object.keys(coinMap).filter(s => COINGECKO_ID_MAP[s]);
  if (!symbols.length) return coinMap;

  // Build reverse map: geckoId → symbol
  const geckoIds    = symbols.map(s => COINGECKO_ID_MAP[s]);
  const reverseMap  = {};
  symbols.forEach(s => { reverseMap[COINGECKO_ID_MAP[s]] = s; });

  let prices = {};
  try {
    prices = await fetchCoinPricesUSD(geckoIds);
  } catch {
    logger.warn('[sync] Could not fetch USD prices from CoinGecko — skipping USD enrichment');
    return coinMap;
  }

  // Apply prices
  for (const [geckoId, priceObj] of Object.entries(prices)) {
    const symbol = reverseMap[geckoId];
    if (!symbol || !coinMap[symbol]) continue;
    const usdPrice = priceObj?.usd ?? null;
    if (!usdPrice) continue;

    for (const network of coinMap[symbol]) {
      network.withdrawFeeUSD = network.withdrawFee > 0
        ? parseFloat((network.withdrawFee * usdPrice).toFixed(4))
        : 0;
    }
  }

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

  const { apiKey, apiSecret, passphrase } = await getDecryptedKeys(exchangeKey, adminUserId);

  const keyDoc = await ExchangeApiKey.findOne({ exchange: exchangeKey, adminUserId });
  if (!keyDoc) {
    throw new Error(`No API keys stored for ${exchangeKey}`);
  }

  let coinMap;
  try {
    coinMap = await fetchExchangeFeeData(exchangeKey, apiKey, apiSecret, passphrase);
    coinMap = await enrichWithUSDPrices(coinMap);
  } catch (err) {
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
  let skipped = 0;

  for (const [symbol, newNetworks] of Object.entries(coinMap)) {
    let coinData = doc.coins.find(c => c.symbol === symbol);

    if (!coinData) {
      doc.coins.push({ symbol, networks: newNetworks });
      synced++;
      continue;
    }

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
      } else {
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

  await cacheDelPattern(`fees:${exchangeKey}:*`);
  await cacheDelPattern(`compare:*`);

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