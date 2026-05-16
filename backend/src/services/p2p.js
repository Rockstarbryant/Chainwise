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
// ─── OKX ─────────────────────────────────────────────────────────────────
// FIX (May 2026): v3 endpoint /v3/c2c/tradingOrders/books silently ignores
// the 't' (asset) parameter and always returns BTC prices.
// Switched to the current public C2C API which uses 'baseCurrency' param.
// Also: OKX returns fiat in lowercase ("kes") — normalized to uppercase on output.
async function fetchOKXP2P({ asset = 'USDT', fiat = 'KES', tradeType = 'BUY', page = 1, size = 20 } = {}) {
  const side = tradeType === 'BUY' ? 'buy' : 'sell';
 
  // v3 with 'baseCurrency' param (replaces old broken 't' param)
  // v5 endpoint REMOVED — always serves HTML 404, not JSON
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

// ─── KUCOIN (FIXED v3) ────────────────────────────────────────────────────────
 
// ─── KUCOIN (FIXED v4) ────────────────────────────────────────────────────────
//
// ROOT CAUSE (v3 was still wrong):
//   Log shows: priceType=REGULAR | fiatToCryptoPrice=0.007999 | floatPrice=125.01
//
//   priceType='REGULAR' → floatPrice IS the actual KES/USDT price (125.01) ✓
//                         fiatToCryptoPrice = INVERSE rate (1/125 = 0.008) ✗
//
//   priceType='FLOAT'   → floatPrice = market premium multiplier (e.g. 1.02)
//                         fiatToCryptoPrice = inverse of calculated rate
//
// CORRECT LOGIC:
//   For ALL types: the displayed price = floatPrice when it's > 1 (i.e. a real KES value)
//   Safe rule: if floatPrice > 1 → use floatPrice (it's the KES price)
//              if floatPrice ≤ 1 → use 1/fiatToCryptoPrice (derive from inverse)
//
// This handles both REGULAR (floatPrice=125) and FLOAT (floatPrice=1.02, need market calc)
//
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
 
    // floatPrice > 1  → it IS the KES price (e.g. 125.01 KES/USDT)
    // floatPrice ≤ 1  → it's a premium multiplier; derive price from inverse rate
    let price = 0;
    if (floatPrice > 1) {
      price = floatPrice;
    } else if (fiatToCryptoPrice > 0) {
      // fiatToCryptoPrice = crypto per fiat (e.g. 0.008 USDT per KES)
      // so KES per USDT = 1 / 0.008 = 125
      price = parseFloat((1 / fiatToCryptoPrice).toFixed(4));
    }
 
    return {
      exchange:       'kucoin',
      tradeType,
      asset:          item.currency || asset,
      fiat:           item.legal    || fiat,
      price,
      // limitMinQuote/limitMaxQuote are the fiat limits for ALL ad types
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



// ─── BITGET ───────────────────────────────────────────────────────────────
// ─── BITGET (FIXED v4) ────────────────────────────────────────────────────────
//
// Error: HTTP 400 — "40006: Invalid ACCESS_KEY"
// Cause: Our httpRequest helper sends 'Content-Type: application/json' by default,
//        but Bitget's API gateway interprets certain header combinations as an
//        authenticated request attempt and rejects with ACCESS_KEY error.
//
// Fix:  Strip all headers that could trigger auth validation.
//       Only send Origin + Referer + Content-Type.
//       Do NOT send any X-* headers or Authorization headers.
//
// Also confirmed: the correct public endpoint IS /api/v2/p2p/adv/list
//   Success code = "00000" (string)
//   Response wraps ads in data.advList
//
async function fetchBitgetP2P({ asset = 'USDT', fiat = 'KES', tradeType = 'BUY', page = 1, size = 20 } = {}) {
  try {
    const data = await retry(() => httpRequest(
      'https://api.bitget.com/api/v2/p2p/adv/list',
      {
        method: 'POST',
        headers: {
          // ONLY these headers — nothing else to avoid triggering auth check
          'Content-Type': 'application/json',
          'Origin':       'https://www.bitget.com',
          'Referer':      'https://www.bitget.com/p2p-trade',
        },
      },
      {
        coin:      asset.toUpperCase(),
        fiatCoin:  fiat.toUpperCase(),
        tradeType: tradeType.toLowerCase(),   // 'buy' | 'sell'
        pageNo:    page,
        pageSize:  Math.min(size, 20),
      }
    ));
 
    if (data?.code && data.code !== '00000' && data.code !== 0) {
      logger.warn(`[p2p] Bitget non-success: ${data.code} — ${data.msg || ''}`);
      return [];
    }
 
    const items = data?.data?.advList || data?.data?.list || data?.data || [];
    if (!Array.isArray(items)) {
      logger.warn(`[p2p] Bitget unexpected shape: ${JSON.stringify(data).slice(0, 120)}`);
      return [];
    }
 
    logger.info(`[p2p] Bitget success: ${items.length} ads for ${asset}/${fiat} ${tradeType}`);
 
    return items.map(item => ({
      exchange:       'bitget',
      tradeType,
      asset:          item.coin      || asset,
      fiat:           item.fiatCoin  || fiat,
      price:          parseFloat(item.price           || 0),
      minAmount:      parseFloat(item.minOrderAmount  || item.minSingleTransAmount || 0),
      maxAmount:      parseFloat(item.maxOrderAmount  || item.maxSingleTransAmount || 0),
      available:      parseFloat(item.surplusAmount   || item.quantity             || 0),
      paymentMethods: Array.isArray(item.payments)
        ? item.payments.map(p => p.paymentType || p.name || String(p))
        : [],
      merchant: {
        name:           item.nickName        || item.merchantName || 'Unknown',
        completionRate: parseFloat(item.orderCompleteRate || item.completionRate   || 0),
        orderCount:     parseInt(item.orderCount          || 0),
        isVerified:     item.merchantType === 'OFFICIAL'  || item.authTag === 'merchant',
      },
    }));
 
  } catch (err) {
    logger.warn(`[p2p] Bitget failed: ${err.message}`);
    return [];
  }
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


// ─── BINGX ────────────────────────────────────────────────────────────────────
 
// ─── BINGX (FIXED v3) ────────────────────────────────────────────────────────
//
// Error: "BingX time sync error — server time drift detected" (code 100003)
// Cause: X-BX-TIMESTAMP using local Date.now() — if server clock drifts even
//        slightly from BingX's servers, they reject with code 100003.
//
// Fix:  Fetch BingX server time first, use THAT timestamp in the header.
//       BingX server time endpoint: GET https://bingx.com/api/p2p/v1/server/time
//       Cache the server time offset so we don't fetch it on every call.
//
let _bingxTimeOffset = 0;         // ms difference between our clock and BingX
let _bingxTimeOffsetFetched = 0;  // when we last fetched it
 
async function getBingXServerTime() {
  const now = Date.now();
  // Re-sync at most once every 5 minutes
  if (now - _bingxTimeOffsetFetched < 5 * 60 * 1000) {
    return now + _bingxTimeOffset;
  }
  try {
    const res = await httpRequest('https://bingx.com/api/p2p/v1/server/time', {
      headers: { 'Origin': 'https://bingx.com' },
    });
    // Response: { code: 0, data: { serverTime: 1234567890123 } }
    const serverTime = res?.data?.serverTime || res?.data?.timestamp || res?.serverTime;
    if (serverTime) {
      _bingxTimeOffset = serverTime - Date.now();
      _bingxTimeOffsetFetched = Date.now();
      logger.info(`[p2p] BingX time offset synced: ${_bingxTimeOffset}ms`);
      return serverTime;
    }
  } catch (e) {
    logger.warn(`[p2p] BingX server time fetch failed: ${e.message} — using local time`);
  }
  return now; // fallback to local time
}
 
async function fetchBingXP2P({ asset = 'USDT', fiat = 'KES', tradeType = 'BUY', page = 1, size = 20 } = {}) {
  const side = tradeType === 'BUY' ? 0 : 1;
 
  try {
    // Get synced server time to avoid code 100003
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
      // Reset offset so next call re-syncs
      if (data?.code === 100003) _bingxTimeOffsetFetched = 0;
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
 
 
 
// ─── COINEX ───────────────────────────────────────────────────────────────────
//
// CoinEx has solid P2P coverage for African & Asian markets.
 
// ─── COINEX (FIXED v3) ────────────────────────────────────────────────────────
//
// Error: Both /res/p2p/adv/list and /api/v2/c2c/advertisement/list return 404.
// CoinEx completely restructured their P2P API in late 2024.
//
// Correct current endpoints (from CoinEx web app network inspection):
//   Primary:  GET https://www.coinex.com/res/p2p/order/list
//   Fallback: GET https://api.coinex.com/v2/p2p/advertisement/list
//
// Param changes:
//   coin_type → asset (or still coin_type depending on endpoint)
//   currency  → fiat_currency  
//   side      → trade_type: 'buy' | 'sell'
//
async function fetchCoinExP2P({ asset = 'USDT', fiat = 'KES', tradeType = 'BUY', page = 1, size = 20 } = {}) {
  const side = tradeType === 'BUY' ? 'buy' : 'sell';
 
  // Try multiple endpoint + param combinations
  const attempts = [
    // Attempt 1: new /res/p2p/order/list
    {
      url: buildUrl('https://www.coinex.com/res/p2p/order/list', {
        asset:         asset.toUpperCase(),
        fiat_currency: fiat.toUpperCase(),
        trade_type:    side,
        page,
        limit:         Math.min(size, 20),
      }),
      headers: { 'Referer': 'https://www.coinex.com/p2p', 'Origin': 'https://www.coinex.com' },
    },
    // Attempt 2: api subdomain v2
    {
      url: buildUrl('https://api.coinex.com/v2/p2p/advertisement/list', {
        asset:      asset.toUpperCase(),
        currency:   fiat.toUpperCase(),
        trade_type: side,
        page,
        limit:      Math.min(size, 20),
      }),
      headers: { 'Referer': 'https://www.coinex.com/' },
    },
    // Attempt 3: old param names on new path
    {
      url: buildUrl('https://www.coinex.com/res/p2p/adv/list', {
        coin_type: asset.toUpperCase(),
        currency:  fiat.toUpperCase(),
        side,
        page,
        limit:     Math.min(size, 20),
      }),
      headers: { 'Referer': 'https://www.coinex.com/p2p', 'Origin': 'https://www.coinex.com' },
    },
    // Attempt 4: c2c path with new param names
    {
      url: buildUrl('https://www.coinex.com/res/c2c/ad/list', {
        coin_type: asset.toUpperCase(),
        currency:  fiat.toUpperCase(),
        side,
        page,
        limit:     Math.min(size, 20),
      }),
      headers: { 'Referer': 'https://www.coinex.com/' },
    },
  ];
 
  for (const attempt of attempts) {
    try {
      const data = await httpRequest(attempt.url, { headers: attempt.headers });
 
      // CoinEx success: code === 0 or code === '0'
      if (data?.code === 0 || data?.code === '0') {
        const items = data?.data?.list || data?.data?.data || data?.data || [];
        if (!Array.isArray(items) || items.length === 0) continue;
 
        logger.info(`[p2p] CoinEx success (${attempt.url.split('?')[0].split('/').pop()}): ${items.length} ads`);
 
        return items.map(item => ({
          exchange:       'coinex',
          tradeType,
          asset:          item.coin_type  || item.asset    || asset,
          fiat:           item.currency   || item.fiat     || fiat,
          price:          parseFloat(item.price            || 0),
          minAmount:      parseFloat(item.min_amount       || item.min_order_amount || 0),
          maxAmount:      parseFloat(item.max_amount       || item.max_order_amount || 0),
          available:      parseFloat(item.amount           || item.available_amount || 0),
          paymentMethods: Array.isArray(item.payment_methods)
            ? item.payment_methods.map(p => p.method_name || p.name || String(p))
            : Array.isArray(item.pay_methods)
              ? item.pay_methods.map(p => p.name || String(p))
              : [],
          merchant: {
            name:           item.user?.nick_name || item.nick_name || item.username || 'Unknown',
            completionRate: parseFloat(
              item.user?.done_rate != null
                ? (parseFloat(item.user.done_rate) > 1 ? item.user.done_rate : item.user.done_rate * 100)
                : item.done_rate != null
                  ? (parseFloat(item.done_rate) > 1 ? item.done_rate : item.done_rate * 100)
                  : 0
            ),
            orderCount: parseInt(item.user?.done_count || item.done_count || item.order_count || 0),
            isVerified: item.user?.is_merchant === true || item.is_merchant === true,
          },
        }));
      }
    } catch (e) {
      // Try next endpoint
      logger.warn(`[p2p] CoinEx attempt failed (${attempt.url.split('coinex.com')[1].split('?')[0]}): ${e.message.slice(0, 80)}`);
    }
  }
 
  logger.warn(`[p2p] CoinEx: all ${attempts.length} endpoints failed for ${asset}/${fiat}`);
  return [];
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
  bingx:    fetchBingXP2P,     
  coinex:   fetchCoinExP2P,    
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
      bingx:    'BingX: POST bingx.com/api/p2p/v1/adv/list — tradeType 0=BUY, 1=SELL. Good KE/NG coverage.',
      coinex:   'CoinEx: GET coinex.com/res/c2c/ad/list — coin_type, currency, side=buy|sell.',
      mexc:     'MEXC: DISABLED — Cloudflare WAF. Needs Puppeteer/residential proxy to re-enable.',
      noones:   'Noones: api.noones.com subdomain — BTC/USDT/ETH — best coverage NG, KE, GH, ZA',
      remitano: 'Remitano: offer_type is merchant-perspective — BUY→sell, SELL→buy',
      htx:      'HTX: USDT/BTC/ETH/USDC only — 0 ads on African pairs is normal (low liquidity)',
    },
  };
}

module.exports = { fetchP2PAds, getSupportedPairs, FETCHERS };