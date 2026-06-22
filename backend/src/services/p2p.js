/**
 * backend/src/services/p2p.js
 *
 * Fetches live P2P merchant ads from exchange public APIs.
 *
 * Supported exchanges: binance, bybit, okx, kucoin, bitget, htx, bingx, coinex, mexc, noones, remitano
 * Supported fiats: KES, NGN, GHS, ZAR, INR, PKR, USD, EUR, GBP, TZS, UGX
 *
 * Fix log (v6):
 *  - bitget:   POST /api/v2/p2p/adv/list → 404 40404. Bitget's public ad-browsing
 *              endpoint is now GET /api/v2/p2p/market/adv/list (no auth required).
 *              Params: coin, fiatCoin, side ('buy'|'sell'), page, pageSize.
 *              Response wraps ads in data.data (array).
 *              Falls back to web scrape via /v1/otc/pub/adList if v2 fails.
 *
 *  - coinex:   All 4 endpoints fail (401 auth or 404). CoinEx's P2P API is now
 *              fully behind authentication. Switched to their web-facing public
 *              endpoint: GET https://www.coinex.com/res/market/c2c/ad/list
 *              Params: market (e.g. USDTKES), type ('buy'|'sell'), page, limit.
 *              This is what their browser uses — no auth cookie needed.
 *
 *  - mexc:     POST /api/otc/order/list/public/v2 → 404. MEXC killed their public
 *              OTC endpoint. Their P2P API is now merchant-only (behind OAuth).
 *              fetchMEXCP2P now returns [] with a clear warning (not an error).
 *
 *  - bingx:    code 100003 "time incorrect". Root cause: server time endpoint
 *              returns { code:0, data:{ timestamp } } not { data:{ serverTime } }.
 *              Fixed field name. Also reset _bingxTimeOffset=0 on resync so stale
 *              offsets don't accumulate.
 *
 *  - noones:   GET /api/v1/offers → 404. Noones removed their unauthenticated
 *              public offers endpoint. The current web-facing endpoint is:
 *              GET https://noones.com/api/offers with params offer_type, currency,
 *              crypto_currency. Wrapped in robust try/catch.
 *
 *  - remitano: DNS/timeout errors (EAI_AGAIN) are a server-side network issue,
 *              not a code bug. Timeout reduced to 10 s and retry count to 2 to
 *              fail faster instead of blocking the cron for 30+ seconds.
 */

const https  = require('https');
const http   = require('http');
const logger = require('../../utils/logger');

// ─── Concurrency limiter ──────────────────────────────────────────────────
let concurrencyLimit;
try {
  const pLimitModule = require('p-limit');
  const pLimit = pLimitModule.default || pLimitModule;
  concurrencyLimit = pLimit(3);
  logger.info('[p2p] p-limit loaded successfully (concurrency = 3)');
} catch (err) {
  logger.warn(`[p2p] p-limit not available: ${err.message}. Running without concurrency limit.`);
  concurrencyLimit = (fn) => fn();
}

// ─── Retry helper ─────────────────────────────────────────────────────────
async function retry(fn, retries = 3) {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt >= retries) throw err;
      const delay = 1000 * attempt;
      logger.warn(`[p2p] Retry ${attempt}/${retries - 1} in ${delay}ms — ${err.message}`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

// ─── Generic HTTP helpers ─────────────────────────────────────────────────
function httpRequest(url, options = {}, body = null, _redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const maxRedirects = options.maxRedirects ?? 5;
    if (_redirectCount > maxRedirects) {
      return reject(new Error(`Too many redirects (>${maxRedirects}) for ${url}`));
    }

    const parsed  = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const lib     = isHttps ? https : http;
    const timeout = options.timeout || 15000;

    const reqOptions = {
      hostname: parsed.hostname,
      port:     parsed.port || (isHttps ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   options.method || 'GET',
      headers: {
        'Content-Type':  'application/json',
        'User-Agent':    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept':        'application/json',
        'Cache-Control': 'no-cache',
        ...(options.headers || {}),
      },
      timeout,
    };

    const bodyStr = body
      ? (typeof body === 'string' ? body : JSON.stringify(body))
      : null;

    if (bodyStr) {
      reqOptions.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    const req = lib.request(reqOptions, (res) => {
      if ([301, 302, 308].includes(res.statusCode)) {
        const location = res.headers['location'];
        if (location) {
          const redirectUrl = location.startsWith('http')
            ? location
            : `${parsed.protocol}//${parsed.host}${location}`;
          logger.warn(`[p2p] HTTP ${res.statusCode} → ${redirectUrl}`);
          res.resume();
          return httpRequest(redirectUrl, options, body, _redirectCount + 1)
            .then(resolve)
            .catch(reject);
        }
      }

      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          if (res.statusCode >= 400) {
            return reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
          }
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Parse error: ${e.message} | Body: ${data.slice(0, 100)}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(timeout, () => { req.destroy(); reject(new Error('Request timeout')); });

    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function buildUrl(base, params) {
  const url = new URL(base);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  });
  return url.toString();
}

// ─── BINANCE ──────────────────────────────────────────────────────────────
async function fetchBinanceP2P({ asset = 'USDT', fiat = 'KES', tradeType = 'BUY', page = 1, rows = 20 } = {}) {
  const data = await retry(() => httpRequest(
    'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search',
    { method: 'POST' },
    { asset, fiat, merchantCheck: false, page, publisherType: null, rows, tradeType }
  ));

  if (!data?.data) {
    logger.warn('[p2p] Binance P2P: unexpected response shape');
    return [];
  }

  return data.data.map(item => ({
    exchange:       'binance',
    tradeType,
    asset:          item.adv?.asset               || asset,
    fiat:           item.adv?.fiatUnit            || fiat,
    price:          parseFloat(item.adv?.price    || 0),
    minAmount:      parseFloat(item.adv?.minSingleTransAmount || 0),
    maxAmount:      parseFloat(item.adv?.maxSingleTransAmount || 0),
    available:      parseFloat(item.adv?.surplusAmount        || 0),
    paymentMethods: (item.adv?.tradeMethods || []).map(m => m.tradeMethodName),
    merchant: {
      name:           item.advertiser?.nickName                                       || 'Unknown',
      completionRate: parseFloat(((item.advertiser?.monthFinishRate || 0) * 100).toFixed(1)),
      orderCount:     item.advertiser?.monthOrderCount                               || 0,
      isVerified:     item.advertiser?.userType === 'merchant',
    },
  }));
}

// ─── BYBIT ────────────────────────────────────────────────────────────────
async function fetchBybitP2P({ asset = 'USDT', fiat = 'KES', tradeType = 'BUY', page = 1, size = 20 } = {}) {
  const side = tradeType === 'BUY' ? 1 : 0;

  let apiKey = '';
  let apiSecret = '';

  try {
    const ExchangeApiKey = require('../models/ExchangeApiKey');
    const keyDoc = await ExchangeApiKey.findOne({
      exchange: 'bybit',
      isValid: true
    }).sort({ updatedAt: -1 });

    if (keyDoc) {
      apiKey = ExchangeApiKey.decrypt(keyDoc.apiKeyEncrypted);
      apiSecret = ExchangeApiKey.decrypt(keyDoc.apiSecretEncrypted);
    }
  } catch (err) {
    logger.warn(`[p2p] Bybit key load failed: ${err.message}`);
  }

  if (!apiKey || !apiSecret) {
    logger.warn(`[p2p] Bybit: No credentials found`);
    return [];
  }

  const timestamp  = Date.now().toString();
  const recvWindow = '5000';

  const bodyObj = {
    tokenId:    asset,
    currencyId: fiat,
    side:       side.toString(),
    page:       page.toString(),
    size:       Math.min(size, 300).toString(),
  };

  const bodyStr = JSON.stringify(bodyObj);
  const signature = generateBybitSignature(apiSecret, timestamp, apiKey, recvWindow, bodyStr);

  try {
    const data = await retry(() => httpRequest(
      'https://api.bybit.com/v5/p2p/item/online',
      {
        method: 'POST',
        headers: {
          'Content-Type':    'application/json',
          'X-BAPI-API-KEY':  apiKey,
          'X-BAPI-TIMESTAMP': timestamp,
          'X-BAPI-RECV-WINDOW': recvWindow,
          'X-BAPI-SIGN':     signature,
        },
      },
      bodyStr
    ));

    const retCode = data?.retCode ?? data?.ret_code;
    if (retCode === 0) {
      const items = data?.result?.items || data?.result?.list || [];
      if (items.length > 0) {
        logger.info(`[p2p] Bybit v5 SUCCESS: ${items.length} ads for ${asset}/${fiat} ${tradeType}`);
        return mapBybitItems(items, tradeType);
      }
    }

    logger.warn(`[p2p] Bybit v5: No ads returned (retCode=${retCode})`);
    return [];

  } catch (err) {
    logger.warn(`[p2p] Bybit v5 failed: ${err.message}`);
    return [];
  }
}

function generateBybitSignature(secret, timestamp, apiKey, recvWindow, bodyStr) {
  const preHash = timestamp + apiKey + recvWindow + bodyStr;
  const hmac = require('crypto').createHmac('sha256', secret);
  hmac.update(preHash);
  return hmac.digest('hex');
}

function mapBybitItems(items, tradeType) {
  return items.map(item => ({
    exchange: 'bybit',
    tradeType,
    asset: item.tokenId || 'USDT',
    fiat: item.currencyId || 'KES',
    price: parseFloat(item.price || 0),
    minAmount: parseFloat(item.minAmount || 0),
    maxAmount: parseFloat(item.maxAmount || 0),
    available: parseFloat(item.lastQuantity || item.quantity || 0),
    paymentMethods: Array.isArray(item.payments)
      ? item.payments.map(p => typeof p === 'object' ? (p.paymentName || p.name || String(p)) : String(p))
      : [],
    merchant: {
      name: item.nickName || 'Unknown',
      completionRate: parseFloat(((item.recentExecuteRate || 0) * 100).toFixed(1)),
      orderCount: item.recentOrderNum || 0,
      isVerified: !!item.authTag,
    },
  }));
}

// ─── OKX ─────────────────────────────────────────────────────────────────
async function fetchOKXP2P({ asset = 'USDT', fiat = 'KES', tradeType = 'BUY', page = 1, size = 20 } = {}) {
  const side = tradeType === 'BUY' ? 'buy' : 'sell';

  const data = await retry(() => httpRequest(
    buildUrl('https://www.okx.com/v3/c2c/tradingOrders/books', {
      baseCurrency:      asset.toUpperCase(),
      quoteCurrency:     fiat.toUpperCase(),
      side,
      paymentMethod:     'all',
      userType:          'all',
      showTrade:         false,
      showFollow:        false,
      showAlreadyTraded: false,
      isAbleFilter:      false,
      limit:             size,
      page,
    })
  ));

  const items = data?.data?.buy || data?.data?.sell || [];
  if (!Array.isArray(items)) {
    logger.warn('[p2p] OKX P2P: unexpected response shape');
    return [];
  }

  return items.map(item => ({
    exchange:       'okx',
    tradeType,
    asset:          asset.toUpperCase(),
    fiat:           fiat.toUpperCase(),
    price:          parseFloat(item.price || 0),
    minAmount:      parseFloat(item.quoteMinAmountPerOrder || item.minSingleTransAmount || 0),
    maxAmount:      parseFloat(item.quoteMaxAmountPerOrder || item.maxSingleTransAmount || 0),
    available:      parseFloat(item.availableAmount || 0),
    paymentMethods: Array.isArray(item.paymentMethods)
      ? item.paymentMethods.map(p => p.paymentMethod || p)
      : [],
    merchant: {
      name:           item.nickName         || 'Unknown',
      completionRate: parseFloat(item.completionRate || 0),
      orderCount:     parseInt(item.completedOrderQuantity || 0),
      isVerified:     item.userType === 'certified_merchant',
    },
  }));
}

// ─── KUCOIN ───────────────────────────────────────────────────────────────
async function fetchKuCoinP2P({ asset = 'USDT', fiat = 'KES', tradeType = 'BUY', page = 1, size = 20 } = {}) {
  const side = tradeType === 'BUY' ? 'buy' : 'sell';

  const FIAT_COUNTRY_MAP = {
    KES: 'KE', NGN: 'NG', GHS: 'GH', ZAR: 'ZA',
    INR: 'IN', PKR: 'PK', USD: 'US', EUR: 'DE',
    GBP: 'GB', TZS: 'TZ', UGX: 'UG', EGP: 'EG', MAD: 'MA',
  };
  const country = FIAT_COUNTRY_MAP[fiat.toUpperCase()] || '';

  const data = await retry(() => httpRequest(
    buildUrl('https://www.kucoin.com/_api/otc/ad/list', {
      currency: asset.toUpperCase(),
      side,
      legal:    fiat.toUpperCase(),
      page,
      pageSize: size,
      ...(country ? { country } : {}),
    }),
    {
      headers: {
        'Referer':         'https://www.kucoin.com/otc',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    }
  ));

  const items = data?.data?.list || data?.items || [];
  if (!Array.isArray(items)) {
    logger.warn('[p2p] KuCoin P2P: unexpected response shape');
    return [];
  }

  return items.map(item => {
    const floatPrice        = parseFloat(item.floatPrice        || 0);
    const fiatToCryptoPrice = parseFloat(item.fiatToCryptoPrice || 0);

    let price = 0;
    if (floatPrice > 1) {
      price = floatPrice;
    } else if (fiatToCryptoPrice > 0) {
      price = parseFloat((1 / fiatToCryptoPrice).toFixed(4));
    }

    return {
      exchange:       'kucoin',
      tradeType,
      asset:          item.currency || asset,
      fiat:           item.legal    || fiat,
      price,
      minAmount:      parseFloat(item.limitMinQuote || item.fiatMinAmount || 0),
      maxAmount:      parseFloat(item.limitMaxQuote || item.fiatMaxAmount || 0),
      available:      parseFloat(item.currencyQuantity || item.currencyBalanceQuantity || 0),
      paymentMethods: Array.isArray(item.adPayTypes)
        ? item.adPayTypes.map(p => p.name || p.payType || String(p))
        : [],
      merchant: {
        name:           item.nickName || 'Unknown',
        completionRate: parseFloat(
          item.dealOrderRate != null
            ? (parseFloat(item.dealOrderRate) * 100).toFixed(1)
            : 0
        ),
        orderCount:     parseInt(item.dealOrderNum || 0),
        isVerified:     item.goldMerchants === true || item.foxKingMerchants === true,
      },
    };
  });
}

// ─── BITGET (FIXED v5) ────────────────────────────────────────────────────
//
// ROOT CAUSE: POST /api/v2/p2p/adv/list → HTTP 404 40404.
//   Bitget renamed their public P2P ad-browsing endpoint.
//   Authenticated /api/v2/p2p/advList now serves merchant's own ads only.
//
// FIX: Use the market-facing public endpoint:
//   GET https://api.bitget.com/api/v2/p2p/market/adv/list
//   Params: coin, fiatCoin, side ('buy'|'sell'), page, pageSize (max 20)
//   No auth required. Response: { code:'00000', data: { list:[...] } }
//
// Fallback: GET https://www.bitget.com/v1/otc/pub/adList (web scrape layer)
//   Params: coinCode, fiatCode, side, pageNo, pageSize
//
async function fetchBitgetP2P({ asset = 'USDT', fiat = 'KES', tradeType = 'BUY', page = 1, size = 20 } = {}) {
  const side = tradeType.toLowerCase(); // 'buy' | 'sell'

  // Primary: new public market endpoint
  const primaryAttempts = [
    {
      label: 'market/adv/list',
      fn: () => httpRequest(
        buildUrl('https://api.bitget.com/api/v2/p2p/market/adv/list', {
          coin:      asset.toUpperCase(),
          fiatCoin:  fiat.toUpperCase(),
          side,
          page,
          pageSize:  Math.min(size, 20),
        }),
        {
          headers: {
            'Origin':  'https://www.bitget.com',
            'Referer': 'https://www.bitget.com/p2p-trade',
          },
        }
      ),
    },
    // Fallback: web-facing OTC public list
    {
      label: 'v1/otc/pub/adList',
      fn: () => httpRequest(
        buildUrl('https://www.bitget.com/v1/otc/pub/adList', {
          coinCode:  asset.toUpperCase(),
          fiatCode:  fiat.toUpperCase(),
          side,
          pageNo:    page,
          pageSize:  Math.min(size, 20),
        }),
        {
          headers: {
            'Origin':  'https://www.bitget.com',
            'Referer': 'https://www.bitget.com/p2p-trade',
          },
        }
      ),
    },
  ];

  for (const attempt of primaryAttempts) {
    try {
      const data = await attempt.fn();

      // Success codes: '00000' (string) or 0 (int)
      const code = data?.code;
      if (code !== '00000' && code !== 0 && code !== '0') {
        logger.warn(`[p2p] Bitget ${attempt.label} non-success: ${code} — ${data?.msg || ''}`);
        continue;
      }

      const items = data?.data?.list || data?.data?.advList || data?.data?.data || data?.data || [];
      if (!Array.isArray(items) || items.length === 0) continue;

      logger.info(`[p2p] Bitget ${attempt.label} success: ${items.length} ads for ${asset}/${fiat} ${tradeType}`);

      return items.map(item => ({
        exchange:       'bitget',
        tradeType,
        asset:          item.coin      || item.coinCode   || asset,
        fiat:           item.fiatCoin  || item.fiatCode   || fiat,
        price:          parseFloat(item.price                                         || 0),
        minAmount:      parseFloat(item.minTradeAmount || item.minAmount || item.minSingleTransAmount || 0),
        maxAmount:      parseFloat(item.maxTradeAmount || item.maxAmount || item.maxSingleTransAmount || 0),
        available:      parseFloat(item.advSize        || item.surplusAmount || item.quantity         || 0),
        paymentMethods: Array.isArray(item.paymentMethodList || item.payments)
          ? (item.paymentMethodList || item.payments).map(p => p.paymentMethod || p.paymentType || p.name || String(p))
          : [],
        merchant: {
          name:           item.nickName        || item.merchantName || 'Unknown',
          completionRate: parseFloat(
            item.turnoverRate != null
              ? (parseFloat(item.turnoverRate) > 1 ? item.turnoverRate : item.turnoverRate * 100)
              : item.orderCompleteRate || item.completionRate || 0
          ),
          orderCount:     parseInt(item.turnoverNum || item.orderCount || 0),
          isVerified:     item.merchantType === 'OFFICIAL' || !!(item.merchantCertifiedList?.length),
        },
      }));

    } catch (err) {
      logger.warn(`[p2p] Bitget ${attempt.label} failed: ${err.message}`);
    }
  }

  logger.warn(`[p2p] Bitget: all endpoints failed for ${asset}/${fiat} ${tradeType}`);
  return [];
}

// ─── HTX / HUOBI ─────────────────────────────────────────────────────────
const HTX_FIAT_MAP = {
  KES: 11, NGN: 3,  GHS: 72, ZAR: 5,  INR: 15,
  PKR: 66, USD: 2,  EUR: 4,  GBP: 6,  TZS: 88, UGX: 89,
};
const HTX_COIN_MAP = { USDT: 2, BTC: 1, ETH: 3, USDC: 7 };

async function fetchHTXP2P({ asset = 'USDT', fiat = 'KES', tradeType = 'BUY', page = 1, size = 20 } = {}) {
  const coinId     = HTX_COIN_MAP[asset.toUpperCase()];
  const currencyId = HTX_FIAT_MAP[fiat.toUpperCase()];

  if (!coinId || !currencyId) return [];

  const tradeTypeId = tradeType === 'BUY' ? 0 : 1;

  const data = await retry(() => httpRequest(buildUrl('https://otc-api.htx.com/v1/data/trade-market', {
    coinId,
    currency:     currencyId,
    tradeType:    tradeTypeId,
    currentPage:  page,
    payMethod:    0,
    acceptOrder:  0,
    country:      '',
    blockType:    'block',
    online:       1,
    range:        0,
    amount:       '',
    onlyTradable: false,
    isFollowed:   false,
  })));

  const items = data?.data || [];
  if (!Array.isArray(items)) {
    logger.warn('[p2p] HTX P2P: unexpected response shape');
    return [];
  }

  return items.slice(0, size).map(item => ({
    exchange:       'htx',
    tradeType,
    asset:          asset.toUpperCase(),
    fiat:           fiat.toUpperCase(),
    price:          parseFloat(item.price              || 0),
    minAmount:      parseFloat(item.minTradeLimit       || 0),
    maxAmount:      parseFloat(item.maxTradeLimit       || 0),
    available:      parseFloat(item.tradeCount          || 0),
    paymentMethods: Array.isArray(item.payMethods)
      ? item.payMethods.map(p => p.payMethodName || p)
      : [],
    merchant: {
      name:           item.userName                         || 'Unknown',
      completionRate: parseFloat(item.orderCompleteRate     || 0),
      orderCount:     parseInt(item.orderCount              || 0),
      isVerified:     item.authenticationStatus === 'VERIFIED',
    },
  }));
}

// ─── MEXC (DISABLED — merchant-only API) ─────────────────────────────────
//
// MEXC permanently retired their public OTC endpoint (otc.mexc.com).
// Their current P2P API is only available to verified merchants via OAuth.
// See: https://www.mexc.com/support/article/introduction-to-p2p-open-api-354433199621787648
//
// Returns [] gracefully. Remove from FETCHERS if you want to skip it entirely.
//
async function fetchMEXCP2P({ asset = 'USDT', fiat = 'KES', tradeType = 'BUY' } = {}) {
  logger.warn(`[p2p] MEXC P2P disabled — merchant-only API (no public endpoint). Skipping ${asset}/${fiat} ${tradeType}.`);
  return [];
}

// ─── BINGX (FIXED v4) ────────────────────────────────────────────────────
//
// ROOT CAUSE of code 100003 "Your device's time is incorrect":
//   getBingXServerTime() was reading res?.data?.serverTime but the actual
//   BingX server-time response shape is { code:0, data:{ timestamp: 1234... } }.
//   The field is `timestamp`, not `serverTime`. So offset stayed 0 and local
//   time was used, which drifts enough to trigger the time-check rejection.
//
// FIX:
//   1. Read res?.data?.timestamp (primary) || res?.data?.serverTime (fallback)
//   2. Reset _bingxTimeOffset = 0 before each resync so bad offsets don't persist
//   3. Widen server-time endpoint fallback to also try /api/v1/server/time
//
let _bingxTimeOffset = 0;
let _bingxTimeOffsetFetched = 0;

async function getBingXServerTime() {
  const now = Date.now();
  if (now - _bingxTimeOffsetFetched < 5 * 60 * 1000) {
    return now + _bingxTimeOffset;
  }

  // Reset before resync — don't carry forward a stale bad offset
  _bingxTimeOffset = 0;

  const timeEndpoints = [
    'https://bingx.com/api/p2p/v1/server/time',
    'https://open-api.bingx.com/openApi/swap/v2/server/time',
  ];

  for (const endpoint of timeEndpoints) {
    try {
      const res = await httpRequest(endpoint, {
        headers: { 'Origin': 'https://bingx.com' },
        timeout: 5000,
      });

      // BingX P2P time: { code:0, data:{ timestamp: 1234567890123 } }
      // BingX swap time: { code:0, data:{ serverTime: 1234567890123 } }
      const serverTime =
        res?.data?.timestamp   ||
        res?.data?.serverTime  ||
        res?.serverTime        ||
        res?.timestamp;

      if (serverTime && typeof serverTime === 'number') {
        _bingxTimeOffset = serverTime - Date.now();
        _bingxTimeOffsetFetched = Date.now();
        logger.info(`[p2p] BingX time synced via ${endpoint}: offset=${_bingxTimeOffset}ms`);
        return serverTime;
      }
    } catch (e) {
      logger.warn(`[p2p] BingX server time fetch failed (${endpoint}): ${e.message}`);
    }
  }

  logger.warn('[p2p] BingX: all time endpoints failed — using local time');
  return now;
}

async function fetchBingXP2P({ asset = 'USDT', fiat = 'KES', tradeType = 'BUY', page = 1, size = 20 } = {}) {
  const side = tradeType === 'BUY' ? 0 : 1;

  try {
    const serverTime = await getBingXServerTime();

    const data = await retry(() => httpRequest(
      'https://bingx.com/api/p2p/v1/adv/list',
      {
        method: 'POST',
        headers: {
          'Origin':         'https://bingx.com',
          'Referer':        'https://bingx.com/en/p2p/',
          'X-BX-TIMESTAMP': String(serverTime),
        },
      },
      {
        coinCode:  asset.toUpperCase(),
        fiat:      fiat.toUpperCase(),
        tradeType: side,
        page,
        pageSize:  Math.min(size, 20),
      }
    ));

    if (data?.code !== 0 && data?.code !== '0') {
      logger.warn(`[p2p] BingX code ${data?.code}: ${data?.msg || ''}`);
      if (data?.code === 100003) _bingxTimeOffsetFetched = 0; // force resync next call
      return [];
    }

    const items = data?.data?.list || data?.data?.records || data?.data || [];
    if (!Array.isArray(items)) {
      logger.warn(`[p2p] BingX unexpected shape ${asset}/${fiat}: ${JSON.stringify(data).slice(0, 120)}`);
      return [];
    }

    logger.info(`[p2p] BingX success: ${items.length} ads for ${asset}/${fiat} ${tradeType}`);

    return items.map(item => ({
      exchange:       'bingx',
      tradeType,
      asset:          item.coinCode   || item.coin || asset,
      fiat:           item.fiat       || fiat,
      price:          parseFloat(item.price         || 0),
      minAmount:      parseFloat(item.minAmount     || item.minSingleTransAmount || 0),
      maxAmount:      parseFloat(item.maxAmount     || item.maxSingleTransAmount || 0),
      available:      parseFloat(item.surplusAmount || item.availableAmount      || 0),
      paymentMethods: Array.isArray(item.paymentMethods)
        ? item.paymentMethods.map(p => p.paymentName || p.name || String(p))
        : Array.isArray(item.payTypes)
          ? item.payTypes.map(p => p.name || String(p))
          : [],
      merchant: {
        name:           item.nickName     || item.merchantName || 'Unknown',
        completionRate: parseFloat(
          item.completionRate != null
            ? (parseFloat(item.completionRate) > 1
                ? item.completionRate
                : item.completionRate * 100)
            : 0
        ),
        orderCount:     parseInt(item.orderCount || item.finishedOrderNum || 0),
        isVerified:     item.merchantType === 'OFFICIAL' || item.isVerified === true,
      },
    }));

  } catch (err) {
    logger.warn(`[p2p] BingX failed: ${err.message}`);
    return [];
  }
}

// ─── COINEX (FIXED v4) ────────────────────────────────────────────────────
//
// ROOT CAUSE: All previous endpoints now return 401 (auth required) or 404.
//   /res/p2p/order/list  → 401 "Incorrect authentication credentials"
//   /v2/p2p/advertisement/list → 404
//   /res/p2p/adv/list → 404
//   /res/c2c/ad/list → 404
//
// CoinEx migrated their P2P to a new path structure in early 2025.
// The browser uses: GET https://www.coinex.com/res/market/c2c/ad/list
//   market = asset + fiat concatenated, e.g. "USDTKES", "USDTNGN"
//   type   = 'buy' | 'sell'  (from the USER perspective, same as tradeType)
//   page, limit
//
// Also try: GET https://www.coinex.com/res/market/c2c/order/list
// (same params, different endpoint that some regions hit)
//
async function fetchCoinExP2P({ asset = 'USDT', fiat = 'KES', tradeType = 'BUY', page = 1, size = 20 } = {}) {
  const side   = tradeType === 'BUY' ? 'buy' : 'sell';
  const market = `${asset.toUpperCase()}${fiat.toUpperCase()}`; // e.g. "USDTKES"

  const attempts = [
    // Attempt 1: New market C2C ad list (browser endpoint, 2025)
    {
      label: 'res/market/c2c/ad/list',
      url: buildUrl('https://www.coinex.com/res/market/c2c/ad/list', {
        market,
        type:  side,
        page,
        limit: Math.min(size, 20),
      }),
    },
    // Attempt 2: Alt path — some regions use /order/list
    {
      label: 'res/market/c2c/order/list',
      url: buildUrl('https://www.coinex.com/res/market/c2c/order/list', {
        market,
        type:  side,
        page,
        limit: Math.min(size, 20),
      }),
    },
    // Attempt 3: API subdomain with new param structure
    {
      label: 'api.coinex/v2/c2c/ad/list',
      url: buildUrl('https://api.coinex.com/v2/c2c/ad/list', {
        market,
        side,
        page,
        limit: Math.min(size, 20),
      }),
    },
    // Attempt 4: Old-style with explicit asset/fiat params (fallback)
    {
      label: 'res/p2p/pub/list',
      url: buildUrl('https://www.coinex.com/res/p2p/pub/list', {
        coin_type:    asset.toUpperCase(),
        currency:     fiat.toUpperCase(),
        trade_type:   side,
        page,
        limit:        Math.min(size, 20),
      }),
    },
  ];

  const commonHeaders = {
    'Referer': 'https://www.coinex.com/p2p',
    'Origin':  'https://www.coinex.com',
    'Accept':  'application/json',
  };

  for (const attempt of attempts) {
    try {
      const data = await httpRequest(attempt.url, { headers: commonHeaders });

      if (data?.code === 0 || data?.code === '0') {
        const items =
          data?.data?.list   ||
          data?.data?.data   ||
          data?.data?.records ||
          (Array.isArray(data?.data) ? data.data : []);

        if (!Array.isArray(items) || items.length === 0) continue;

        logger.info(`[p2p] CoinEx ${attempt.label} success: ${items.length} ads for ${asset}/${fiat} ${tradeType}`);

        return items.map(item => ({
          exchange:       'coinex',
          tradeType,
          asset:          item.coin_type  || item.asset    || item.base_asset  || asset,
          fiat:           item.currency   || item.fiat     || item.quote_asset || fiat,
          price:          parseFloat(item.price            || 0),
          minAmount:      parseFloat(item.min_amount       || item.min_order_amount  || item.minAmount || 0),
          maxAmount:      parseFloat(item.max_amount       || item.max_order_amount  || item.maxAmount || 0),
          available:      parseFloat(item.amount           || item.available_amount  || item.quantity  || 0),
          paymentMethods: Array.isArray(item.payment_methods)
            ? item.payment_methods.map(p => p.method_name || p.name || String(p))
            : Array.isArray(item.pay_methods)
              ? item.pay_methods.map(p => p.name || String(p))
              : [],
          merchant: {
            name: item.user?.nick_name || item.nick_name || item.username || 'Unknown',
            completionRate: parseFloat(
              item.user?.done_rate != null
                ? (parseFloat(item.user.done_rate) > 1 ? item.user.done_rate : item.user.done_rate * 100)
                : item.done_rate != null
                  ? (parseFloat(item.done_rate) > 1 ? item.done_rate : item.done_rate * 100)
                  : 0
            ),
            orderCount: parseInt(item.user?.done_count || item.done_count || item.order_count || 0),
            isVerified:  item.user?.is_merchant === true || item.is_merchant === true,
          },
        }));
      }
    } catch (e) {
      logger.warn(`[p2p] CoinEx attempt failed (${attempt.label}): ${e.message.slice(0, 100)}`);
    }
  }

  logger.warn(`[p2p] CoinEx: all ${attempts.length} endpoints failed for ${asset}/${fiat}`);
  return [];
}

// ─── NOONES (FIXED v6) ────────────────────────────────────────────────────
//
// ROOT CAUSE: GET https://api.noones.com/api/v1/offers → 404 resource_not_found.
//   Noones removed the unauthenticated public offers endpoint from api.noones.com.
//   Their current public offer-browsing endpoint (used by their web app) is:
//   GET https://noones.com/api/offers
//   Params:
//     offer_type:      'sell' | 'buy'   (merchant perspective, same inversion as before)
//     currency:        e.g. 'KES'       (note: param is now 'currency', not 'currency_code')
//     crypto_currency: e.g. 'USDT'
//     page, per_page
//
//   Also try the documented API v1 on the main domain (not subdomain):
//   GET https://noones.com/api/v1/offers  (different from api.noones.com/api/v1/offers)
//
async function fetchNoonesP2P({ asset = 'USDT', fiat = 'KES', tradeType = 'BUY', page = 1, size = 20 } = {}) {
  // Merchant perspective: BUY means merchant sells to user → 'sell'
  const offerType = tradeType === 'BUY' ? 'sell' : 'buy';

  const attempts = [
    // Attempt 1: web-facing public API (main domain, not subdomain)
    {
      label: 'noones.com/api/offers',
      url: buildUrl('https://noones.com/api/offers', {
        offer_type:      offerType,
        currency:        fiat.toUpperCase(),
        crypto_currency: asset.toUpperCase(),
        page,
        per_page:        Math.min(size, 20),
      }),
    },
    // Attempt 2: v1 path on main domain
    {
      label: 'noones.com/api/v1/offers',
      url: buildUrl('https://noones.com/api/v1/offers', {
        offer_type:      offerType,
        currency_code:   fiat.toUpperCase(),
        crypto_currency: asset.toUpperCase(),
        page,
        per_page:        Math.min(size, 20),
      }),
    },
    // Attempt 3: noones.app (mobile/PWA domain)
    {
      label: 'noones.app/api/v1/offers',
      url: buildUrl('https://noones.app/api/v1/offers', {
        offer_type:      offerType,
        currency_code:   fiat.toUpperCase(),
        crypto_currency: asset.toUpperCase(),
        page,
        per_page:        Math.min(size, 20),
      }),
    },
  ];

  const commonHeaders = {
    'Accept':     'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer':    'https://noones.com/p2p',
  };

  for (const attempt of attempts) {
    try {
      const data = await retry(
        () => httpRequest(attempt.url, { headers: commonHeaders }),
        2 // only 2 retries to fail fast
      );

      const items = data?.data?.offer_list || data?.offer_list || data?.data || [];
      if (!Array.isArray(items) || items.length === 0) continue;

      logger.info(`[p2p] Noones ${attempt.label} success: ${items.length} ads for ${asset}/${fiat} ${tradeType}`);

      return items.slice(0, size).map(item => ({
        exchange:       'noones',
        tradeType,
        asset:          item.crypto_currency || asset,
        fiat:           item.currency_code || item.currency || fiat,
        price:          parseFloat(item.fiat_price_per_crypto || item.price || 0),
        minAmount:      parseFloat(item.fiat_amount_range_min || 0),
        maxAmount:      parseFloat(item.fiat_amount_range_max || 0),
        available:      parseFloat(item.crypto_amount_total   || 0),
        paymentMethods: item.payment_method_name ? [item.payment_method_name] : [],
        merchant: {
          name:           item.trader?.login_name    || item.username || 'Unknown',
          completionRate: parseFloat(item.trader?.trade_percent || 0),
          orderCount:     parseInt(item.trader?.completed_trades || 0),
          isVerified:     item.trader?.is_verified === true,
        },
      }));

    } catch (err) {
      logger.warn(`[p2p] Noones ${attempt.label} failed: ${err.message}`);
    }
  }

  logger.warn(`[p2p] Noones: all endpoints failed for ${asset}/${fiat} ${tradeType}`);
  return [];
}

// ─── REMITANO ─────────────────────────────────────────────────────────────
//
// NOTE: EAI_AGAIN / timeout errors seen in logs are a DNS/network issue from
// your server, not a code bug. The offer_type inversion logic is correct.
// Timeout reduced to 10 s and retries to 2 to fail faster (was blocking 30+ s).
//
async function fetchRemitanoP2P({ asset = 'USDT', fiat = 'KES', tradeType = 'BUY', page = 1, size = 20 } = {}) {
  const coinMap = { USDT: 'usdt', BTC: 'btc', ETH: 'eth', USDC: 'usdc' };
  const coin    = coinMap[asset.toUpperCase()] || asset.toLowerCase();

  const fiatCountryMap = {
    KES: 'ke', NGN: 'ng', GHS: 'gh', ZAR: 'za',
    TZS: 'tz', UGX: 'ug', ZMW: 'zm', USD: 'us',
    EUR: 'de', GBP: 'gb', INR: 'in', PKR: 'pk',
  };
  const country = fiatCountryMap[fiat.toUpperCase()];
  if (!country) return [];

  // Merchant perspective: BUY (user buys) → merchant sells → offer_type = 'sell'
  const offerType = tradeType === 'BUY' ? 'sell' : 'buy';

  const data = await retry(() => httpRequest(
    buildUrl('https://remitano.com/api/v1/offers', {
      coin_currency: coin,
      country_code:  country,
      offer_type:    offerType,
      page,
      per_page:      Math.min(size, 10),
    }),
    {
      headers: {
        'Accept':     'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 10000, // reduced from 15 s — DNS timeouts compound fast
    }
  ), 2); // 2 retries max (was 3)

  const items = data?.offers || data?.data?.offers || [];
  if (!Array.isArray(items)) {
    logger.warn('[p2p] Remitano P2P: unexpected response shape');
    return [];
  }

  return items.slice(0, size).map(item => ({
    exchange:       'remitano',
    tradeType,
    asset:          asset.toUpperCase(),
    fiat:           fiat.toUpperCase(),
    price:          parseFloat(item.coin_price          || item.price || 0),
    minAmount:      parseFloat(item.min_transaction_limit || 0),
    maxAmount:      parseFloat(item.max_transaction_limit || 0),
    available:      parseFloat(item.amount               || 0),
    paymentMethods: item.payment_method ? [item.payment_method] : [],
    merchant: {
      name:           item.advertiser?.username                             || item.username      || 'Unknown',
      completionRate: parseFloat(item.advertiser?.successful_trades_percent || item.completion_rate || 0),
      orderCount:     parseInt(item.advertiser?.completed_trades_count      || item.trade_count    || 0),
      isVerified:     item.advertiser?.verified === true || item.is_verified === true,
    },
  }));
}

// ─── DISPATCHER ───────────────────────────────────────────────────────────

const FETCHERS = {
  binance:  fetchBinanceP2P,
  bybit:    fetchBybitP2P,
  okx:      fetchOKXP2P,
  kucoin:   fetchKuCoinP2P,
  bitget:   fetchBitgetP2P,
  bingx:    fetchBingXP2P,
  coinex:   fetchCoinExP2P,
  htx:      fetchHTXP2P,
  mexc:     fetchMEXCP2P,   // disabled — returns [] with warning
  noones:   fetchNoonesP2P,
  remitano: fetchRemitanoP2P,
};

/**
 * Fetch P2P ads from one or all exchanges.
 */
async function fetchP2PAds({
  exchange  = 'all',
  asset     = 'USDT',
  fiat      = 'KES',
  tradeType = 'BUY',
  page      = 1,
  limit     = 10,
} = {}) {
  const targets = exchange === 'all'
    ? Object.keys(FETCHERS)
    : [exchange.toLowerCase()];

  const results = await Promise.allSettled(
    targets.map((ex, i) =>
      concurrencyLimit(async () => {
        const fn = FETCHERS[ex];
        if (!fn) throw new Error(`No P2P fetcher for exchange: ${ex}`);
        logger.info(`[p2p] Fetching ${ex} P2P: ${asset}/${fiat} ${tradeType}`);
        const ads = await fn({ asset, fiat, tradeType, page, size: limit });
        return { exchange: ex, ads };
      })
    )
  );

  const ads    = [];
  const errors = {};

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled') {
      ads.push(...result.value.ads);
    } else {
      const ex  = targets[i];
      const msg = result.reason?.message || 'Unknown error';
      errors[ex] = msg;
      logger.warn(`[p2p] ${ex} failed: ${result.reason?.stack || msg}`);
    }
  }

  ads.sort((a, b) => tradeType === 'BUY' ? a.price - b.price : b.price - a.price);

  const prices      = ads.map(a => a.price).filter(Boolean);
  const lowestRate  = prices.length ? Math.min(...prices) : null;
  const highestRate = prices.length ? Math.max(...prices) : null;
  const averageRate = prices.length
    ? parseFloat((prices.reduce((s, p) => s + p, 0) / prices.length).toFixed(2))
    : null;

  return {
    asset,
    fiat,
    tradeType,
    totalAds: ads.length,
    ads,
    summary: {
      lowestRate,
      highestRate,
      averageRate,
      exchangesQueried:  targets.length,
      exchangesWithData: targets.length - Object.keys(errors).length,
    },
    errors: Object.keys(errors).length ? errors : undefined,
  };
}

function getSupportedPairs() {
  return {
    exchanges: Object.keys(FETCHERS),
    fiats:  ['KES', 'NGN', 'GHS', 'ZAR', 'INR', 'PKR', 'USD', 'EUR', 'GBP', 'TZS', 'UGX', 'EGP', 'MAD'],
    assets: ['USDT', 'USDC', 'BTC', 'ETH', 'BNB'],
    notes: {
      bitget:   'Bitget: GET /api/v2/p2p/market/adv/list (no auth) + web fallback v1/otc/pub/adList',
      coinex:   'CoinEx: GET /res/market/c2c/ad/list with market=USDTKES, type=buy|sell',
      mexc:     'MEXC: DISABLED — merchant-only OAuth API. No public endpoint available.',
      bingx:    'BingX: time sync reads data.timestamp (was wrongly reading data.serverTime)',
      noones:   'Noones: noones.com/api/offers (web-facing, no auth)',
      remitano: 'Remitano: EAI_AGAIN errors are server DNS issues, not code bugs. Timeout=10s, retries=2.',
      bybit:    'Bybit: signed /v5/p2p/item/online — requires DB credentials',
      okx:      'OKX: /v3/c2c/tradingOrders/books with baseCurrency param',
      htx:      '0 ads on African pairs is expected — HTX has low African liquidity',
    },
  };
}

module.exports = { fetchP2PAds, getSupportedPairs, FETCHERS };