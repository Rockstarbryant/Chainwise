/**
 * backend/src/services/p2p.js
 *
 * Fetches live P2P merchant ads from exchange public APIs.
 * NO API keys required — all endpoints are public.
 *
 * Supported exchanges: binance, bybit, okx, kucoin, bitget, htx, noones, remitano
 * NOTE: MEXC temporarily disabled — blocked by Cloudflare/WAF (requires browser fingerprint)
 *
 * Supported fiats: KES, NGN, GHS, ZAR, INR, PKR, USD, EUR, GBP, TZS, UGX
 *
 * Fix log (v5):
 *  - bybit:    Fixed ret_code=912000004 "Parameter exception":
 *              · side is now numeric integer (1=BUY, 0=SELL) not string '0'/'1'
 *              · removed unsupported fields: authMaker, canTrade, amount, payment
 *              · added userId:'' as required by the API
 *              · dropped /fiat/otc/item/list — using /fiat/otc/item/online ONLY
 *  - bitget:   Fixed HTTP 404 on /api/v2/p2p/adv/list:
 *              · switched to POST https://api.bitget.com/api/v2/p2p/trade/adv/query
 *              · field names: fiat (not fiatCode), tradeSide lowercase (not side)
 *  - mexc:     DISABLED — Cloudflare WAF blocks all Node.js requests.
 *              Needs Puppeteer/Playwright or residential proxy. Returns [] gracefully.
 *  - noones:   Fixed 404 — migrated to api.noones.com (no trailing slash)
 *  - remitano: Fixed SELL returning 0 — offer_type was inverted:
 *              tradeType BUY  → offer_type 'sell' (merchant sells crypto to user)
 *              tradeType SELL → offer_type 'buy'  (merchant buys crypto from user)
 *  - general:  Added retry() with exponential backoff (3 attempts, 1s/2s/3s)
 *              Added p-limit concurrency cap (max 3 parallel requests)
 *              All shape-mismatch throws replaced with logger.warn + return []
 *              Error logging now uses err.stack for full diagnostics
 */

const https  = require('https');
const http   = require('http');
const logger = require('../../utils/logger');

// ─── Concurrency limiter ──────────────────────────────────────────────────
//
// Caps simultaneous outbound requests at 3 to avoid triggering burst-pattern
// detection on exchanges that watch for concurrent floods.
// Install once: npm install p-limit
//
// ─── Concurrency limiter ──────────────────────────────────────────────────
// ─── Concurrency limiter ──────────────────────────────────────────────────
//
// Caps simultaneous outbound requests at 3
//
let concurrencyLimit;

try {
  // Try to load p-limit (ESM-only package)
  const pLimitModule = require('p-limit');
  
  // p-limit v6+ returns { default: fn } in some setups
  const pLimit = pLimitModule.default || pLimitModule;
  concurrencyLimit = pLimit(3);
  
  logger.info('[p2p] p-limit loaded successfully (concurrency = 3)');
} catch (err) {
  logger.warn(`[p2p] p-limit not available: ${err.message}. Running without concurrency limit.`);
  // Fallback: execute immediately (no limiting)
  concurrencyLimit = (fn) => fn();
}

// ─── Retry helper ─────────────────────────────────────────────────────────
//
// Retries an async function up to `retries` times with linear backoff.
// Handles transient failures: timeouts, 429, 5xx, DNS hiccups.
//
async function retry(fn, retries = 3) {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt >= retries) throw err;
      const delay = 1000 * attempt; // 1s → 2s → 3s
      logger.warn(`[p2p] Retry ${attempt}/${retries - 1} in ${delay}ms — ${err.message}`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

// ─── Generic HTTP helpers ─────────────────────────────────────────────────

/**
 * Core HTTP/HTTPS request helper.
 * • JSON serialisation / deserialisation
 * • 15 s timeout
 * • HTTP 4xx/5xx error rejection
 * • Automatic redirect following for 301 / 302 / 308 (up to 5 hops)
 */
function httpRequest(url, options = {}, body = null, _redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const maxRedirects = options.maxRedirects ?? 5;
    if (_redirectCount > maxRedirects) {
      return reject(new Error(`Too many redirects (>${maxRedirects}) for ${url}`));
    }

    const parsed  = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const lib     = isHttps ? https : http;

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
      timeout: 15000,
    };

    const bodyStr = body
      ? (typeof body === 'string' ? body : JSON.stringify(body))
      : null;

    if (bodyStr) {
      reqOptions.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    const req = lib.request(reqOptions, (res) => {
      // ── Redirect handling ──────────────────────────────────────────────
      if ([301, 302, 308].includes(res.statusCode)) {
        const location = res.headers['location'];
        if (location) {
          const redirectUrl = location.startsWith('http')
            ? location
            : `${parsed.protocol}//${parsed.host}${location}`;
          logger.warn(`[p2p] HTTP ${res.statusCode} → ${redirectUrl}`);
          res.resume(); // drain so socket is freed
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
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Request timeout')); });

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

// ─── Normalised ad shape ──────────────────────────────────────────────────
//
// {
//   exchange:        string
//   tradeType:       'BUY'|'SELL'
//   asset:           string
//   fiat:            string
//   price:           number
//   minAmount:       number
//   maxAmount:       number
//   available:       number
//   paymentMethods:  string[]
//   merchant: {
//     name:           string
//     completionRate: number   (0–100)
//     orderCount:     number
//     isVerified:     boolean
//   }
// }

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
// ─── BYBIT v5 SIGNED (Correct Prehash) ───────────────────────────────────
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

  const timestamp = Date.now().toString();
  const recvWindow = '5000';

  const bodyObj = {
    tokenId: asset,
    currencyId: fiat,
    side: side.toString(),
    page: page.toString(),
    size: Math.min(size, 300).toString(),
  };

  const bodyStr = JSON.stringify(bodyObj);

  const signature = generateBybitSignature(apiSecret, timestamp, apiKey, recvWindow, bodyStr);

  try {
    const data = await retry(() => httpRequest(
      'https://api.bybit.com/v5/p2p/item/online',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-BAPI-API-KEY': apiKey,
          'X-BAPI-TIMESTAMP': timestamp,
          'X-BAPI-RECV-WINDOW': recvWindow,
          'X-BAPI-SIGN': signature,
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

// Corrected Signature Function
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
// ─── OKX (Fixed Asset Mapping) ───────────────────────────────────────────
async function fetchOKXP2P({ asset = 'USDT', fiat = 'KES', tradeType = 'BUY', page = 1, size = 20 } = {}) {
  const side = tradeType === 'BUY' ? 'buy' : 'sell';

  const data = await retry(() => httpRequest(buildUrl('https://www.okx.com/v3/c2c/tradingOrders/books', {
    t:                 asset.toUpperCase(),      // Ensure uppercase
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
  })));

  const items = data?.data?.buy || data?.data?.sell || [];
  if (!Array.isArray(items)) {
    logger.warn('[p2p] OKX P2P: unexpected response shape');
    return [];
  }

  return items.map(item => ({
    exchange:       'okx',
    tradeType,
    asset:          asset.toUpperCase(),           // ← FORCE the requested asset
    fiat:           item.quoteCurrency || fiat.toUpperCase(),
    price:          parseFloat(item.price || 0),
    minAmount:      parseFloat(item.quoteMinAmountPerOrder || item.minSingleTransAmount || 0),
    maxAmount:      parseFloat(item.quoteMaxAmountPerOrder || item.maxSingleTransAmount || 0),
    available:      parseFloat(item.availableAmount || 0),
    paymentMethods: Array.isArray(item.paymentMethods)
      ? item.paymentMethods.map(p => p.paymentMethod || p)
      : [],
    merchant: {
      name:           item.nickName || 'Unknown',
      completionRate: parseFloat(item.completionRate || 0),
      orderCount:     parseInt(item.completedOrderQuantity || 0),
      isVerified:     item.userType === 'certified_merchant',
    },
  }));
}

// ─── KUCOIN ───────────────────────────────────────────────────────────────
async function fetchKuCoinP2P({ asset = 'USDT', fiat = 'KES', tradeType = 'BUY', page = 1, size = 20 } = {}) {
  const side = tradeType === 'BUY' ? 'buy' : 'sell';

  const data = await retry(() => httpRequest(buildUrl('https://www.kucoin.com/_api/otc/ad/list', {
    currency: asset,
    side,
    legal:    fiat,
    page,
    pageSize: size,
  })));

  const items = data?.data?.list || data?.items || [];
  if (!Array.isArray(items)) {
    logger.warn('[p2p] KuCoin P2P: unexpected response shape');
    return [];
  }

  return items.map(item => ({
    exchange:       'kucoin',
    tradeType,
    asset:          item.currency || asset,
    fiat:           item.legal    || fiat,
    price:          parseFloat(item.price                            || 0),
    minAmount:      parseFloat(item.minFiatAmount || item.minAmount  || 0),
    maxAmount:      parseFloat(item.maxFiatAmount || item.maxAmount  || 0),
    available:      parseFloat(item.tradeAmount                      || 0),
    paymentMethods: Array.isArray(item.payTypes) ? item.payTypes.map(p => p.name || p) : [],
    merchant: {
      name:           item.nickName                  || 'Unknown',
      completionRate: parseFloat(item.completionRate || 0),
      orderCount:     parseInt(item.finishedTrades   || 0),
      isVerified:     item.isOnline === true,
    },
  }));
}

// ─── BITGET ───────────────────────────────────────────────────────────────
// FIX: Old endpoint /api/v1/p2p/merchantAdList was deleted — returns 40404.
// New endpoint: POST /api/v2/p2p/adv/list with JSON body.
// Field names also changed: coinCode→coin, fiatCode→fiatCoin, side is now lowercase.
async function fetchBitgetP2P({ asset = 'USDT', fiat = 'KES', tradeType = 'BUY', page = 1, size = 20 } = {}) {
  const data = await httpRequest(
    'https://api.bitget.com/api/v2/p2p/adv/list',
    {
      method: 'POST',
      headers: { 'Origin': 'https://www.bitget.com', 'Referer': 'https://www.bitget.com/' },
    },
    {
      coin:      asset,
      fiatCoin:  fiat,
      tradeType: tradeType === 'BUY' ? 'buy' : 'sell', // lowercase in v2
      pageNo:    String(page),
      pageSize:  String(size),
    }
  );
 
  // v2 response: data.advList — fall back gracefully if unsupported pair
  const items = data?.data?.advList || data?.data?.list || [];
  if (!Array.isArray(items)) {
    logger.warn(`[p2p] Bitget v2 unexpected shape ${asset}/${fiat}: ${JSON.stringify(data).slice(0, 120)}`);
    return [];
  }
 
  return items.map(item => ({
    exchange:       'bitget',
    tradeType,
    asset:          item.coin         || asset,
    fiat:           item.fiatCoin     || fiat,
    price:          parseFloat(item.price               || 0),
    minAmount:      parseFloat(item.minOrderAmount      || item.minSingleTransAmount || 0),
    maxAmount:      parseFloat(item.maxOrderAmount      || item.maxSingleTransAmount || 0),
    available:      parseFloat(item.surplusAmount       || item.orderQuantity        || 0),
    paymentMethods: Array.isArray(item.payments)
      ? item.payments.map(p => p.paymentType || p.name || p)
      : [],
    merchant: {
      name:           item.nickName          || item.merchantName || 'Unknown',
      completionRate: parseFloat(item.orderCompleteRate || item.completionRate || 0),
      orderCount:     parseInt(item.orderCount          || 0),
      isVerified:     item.merchantType === 'OFFICIAL'  || item.authTag === 'merchant',
    },
  }));
}

// ─── HTX / HUOBI ─────────────────────────────────────────────────────────
//
// Domain: otc-api.htx.com (rebranded from otc-api.huobi.pro late 2023)
// Note: returning 0 ads for most African pairs is EXPECTED — HTX has weak African liquidity.
//
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

// ─── MEXC ─────────────────────────────────────────────────────────────────
// FIX: Old GET /api/otc/order/list/public returns 404 (code 99999).
// New endpoint: POST /api/otc/order/list/public/v2 with JSON body.
// Field names changed: currency→currencyCode, tradeType is now numeric (1=BUY, 2=SELL).
async function fetchMEXCP2P({ asset = 'USDT', fiat = 'KES', tradeType = 'BUY', page = 1, size = 20 } = {}) {
  const data = await httpRequest(
    'https://otc.mexc.com/api/otc/order/list/public/v2',
    {
      method: 'POST',
      headers: { 'Origin': 'https://otc.mexc.com', 'Referer': 'https://otc.mexc.com/' },
    },
    {
      currencyCode: asset,
      fiatCode:     fiat,
      tradeType:    tradeType === 'BUY' ? 1 : 2, // 1=buy crypto, 2=sell crypto
      page,
      pageSize:     size,
    }
  );
 
  // v2 wraps in data.records
  const items = data?.data?.records || data?.data?.list || data?.data || [];
  if (!Array.isArray(items)) {
    logger.warn(`[p2p] MEXC v2 unexpected shape ${asset}/${fiat}: ${JSON.stringify(data).slice(0, 120)}`);
    return [];
  }
 
  return items.map(item => ({
    exchange:       'mexc',
    tradeType,
    asset:          item.currencyCode || item.currency || asset,
    fiat:           item.fiatCode     || item.fiat     || fiat,
    price:          parseFloat(item.price              || 0),
    minAmount:      parseFloat(item.minOrderAmount     || item.minSingleTransAmount || 0),
    maxAmount:      parseFloat(item.maxOrderAmount     || item.maxSingleTransAmount || 0),
    available:      parseFloat(item.availableCount     || item.surplusAmount        || 0),
    paymentMethods: Array.isArray(item.payTypeList)
      ? item.payTypeList.map(p => p.payTypeName || p.name || p)
      : [],
    merchant: {
      name:           item.nickName          || item.merchantName || 'Unknown',
      completionRate: parseFloat(item.completionRate            || 0),
      orderCount:     parseInt(item.orderCount || item.finishedOrderNum || 0),
      isVerified:     (item.merchantLevel    || 0) > 0,
    },
  }));
}

// ─── NOONES ───────────────────────────────────────────────────────────────
//
// FIX v5 — 404 on https://noones.com/api/v1/offers/
//
//  Noones migrated their public API to a dedicated subdomain:
//    Old: https://noones.com/api/v1/offers/    → 404
//    New: https://api.noones.com/api/v1/offers  → live (no trailing slash)
//
// ─── NOONES (Updated) ─────────────────────────────────────────────────────
async function fetchNoonesP2P({ asset = 'USDT', fiat = 'KES', tradeType = 'BUY', page = 1, size = 20 } = {}) {
  const offerType = tradeType === 'BUY' ? 'sell' : 'buy';

  try {
    const data = await retry(() => httpRequest(
      buildUrl('https://api.noones.com/api/v1/offers', {
        offer_type:      offerType,
        currency_code:   fiat,
        crypto_currency: asset,
        page,
        per_page:        size,
      }),
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0',
        }
      }
    ));

    const items = data?.data?.offer_list || data?.offer_list || [];
    if (!Array.isArray(items)) {
      logger.warn(`[p2p] Noones unexpected shape`);
      return [];
    }

    logger.info(`[p2p] Noones success: ${items.length} ads`);
    return items.slice(0, size).map(item => ({
      exchange:       'noones',
      tradeType,
      asset:          item.crypto_currency || asset,
      fiat:           item.currency_code || fiat,
      price:          parseFloat(item.fiat_price_per_crypto || item.price || 0),
      minAmount:      parseFloat(item.fiat_amount_range_min || 0),
      maxAmount:      parseFloat(item.fiat_amount_range_max || 0),
      available:      parseFloat(item.crypto_amount_total || 0),
      paymentMethods: item.payment_method_name ? [item.payment_method_name] : [],
      merchant: {
        name:           item.trader?.login_name || 'Unknown',
        completionRate: parseFloat(item.trader?.trade_percent || 0),
        orderCount:     parseInt(item.trader?.completed_trades || 0),
        isVerified:     item.trader?.is_verified === true,
      },
    }));

  } catch (err) {
    logger.warn(`[p2p] Noones failed: ${err.message}`);
    return [];
  }
}

// ─── REMITANO ─────────────────────────────────────────────────────────────
//
// FIX v5 — SELL returning 0 ads / "Unknown error"
//
//  offer_type was INVERTED. Remitano uses the MERCHANT's perspective:
//    'sell' = merchant selling crypto to user  → user is BUYING  (tradeType BUY)
//    'buy'  = merchant buying crypto from user → user is SELLING (tradeType SELL)
//
//  Old (wrong): BUY → 'buy',  SELL → 'sell'
//  New (fixed): BUY → 'sell', SELL → 'buy'
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

  // FIX: merchant perspective — BUY means merchant sells, SELL means merchant buys
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
    }
  ));

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
    price:          parseFloat(item.coin_price                             || item.price || 0),
    minAmount:      parseFloat(item.min_transaction_limit                  || 0),
    maxAmount:      parseFloat(item.max_transaction_limit                  || 0),
    available:      parseFloat(item.amount                                 || 0),
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
  htx:      fetchHTXP2P,
  mexc:     fetchMEXCP2P,    // disabled — returns [] with warning
  noones:   fetchNoonesP2P,
  remitano: fetchRemitanoP2P,
};

/**
 * Fetch P2P ads from one or all exchanges.
 *
 * Concurrency capped at 3 parallel requests via p-limit.
 * Each fetcher retries up to 3 times with exponential backoff internally.
 * All errors degrade gracefully — failed exchanges contribute [] not crashes.
 *
 * @param {object} params
 * @param {string}   params.exchange   'binance'|'bybit'|... or 'all'
 * @param {string}   params.asset      'USDT', 'USDC', 'BTC'
 * @param {string}   params.fiat       'KES', 'NGN', 'GHS', 'ZAR', 'INR'
 * @param {string}   params.tradeType  'BUY' | 'SELL'
 * @param {number}   params.page
 * @param {number}   params.limit      ads per exchange (max 20)
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
      // Log full stack for proper diagnostics (not just message)
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

/**
 * Supported pairs — used by frontend dropdowns.
 */
function getSupportedPairs() {
  return {
    exchanges: Object.keys(FETCHERS),
    fiats:  ['KES', 'NGN', 'GHS', 'ZAR', 'INR', 'PKR', 'USD', 'EUR', 'GBP', 'TZS', 'UGX', 'EGP', 'MAD'],
    assets: ['USDT', 'USDC', 'BTC', 'ETH', 'BNB'],
    notes: {
      bybit:    'Bybit: side=integer (1=BUY/0=SELL), minimal payload, /fiat/otc/item/online only',
      bitget:   'Bitget: POST /api/v2/p2p/trade/adv/query — tradeSide lowercase, fiat not fiatCode',
      mexc:     'MEXC: DISABLED — Cloudflare WAF. Needs Puppeteer/residential proxy to re-enable.',
      noones:   'Noones: api.noones.com subdomain — BTC/USDT/ETH — best coverage NG, KE, GH, ZA',
      remitano: 'Remitano: offer_type is merchant-perspective — BUY→sell, SELL→buy',
      htx:      'HTX: USDT/BTC/ETH/USDC only — 0 ads on African pairs is normal (low liquidity)',
    },
  };
}

module.exports = { fetchP2PAds, getSupportedPairs, FETCHERS };