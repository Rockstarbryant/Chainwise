/**
 * backend/src/services/p2p.js
 *
 * Fetches live P2P merchant ads from exchange public APIs.
 *
 * Active exchanges: binance, bybit, okx, kucoin
 * Removed: bitget, coinex, bingx, remitano, noones, mexc
 *   — all had no working public endpoints as of v7.
 *
 * v7 changes:
 *  - Dropped the 6 broken exchanges entirely (no dead code, no stubs).
 *  - Binance: restored page=2 start and rows=40 cap from v6 — page 1 triggers
 *    bot-detection returning data:null; rows>40 also returns data:null on the
 *    friendly C2C endpoint. Multi-page fan now covers pages 2,3,4 (~120 ads).
 *  - Bybit: size bumped to 100 per call; payment name extraction hardened.
 *  - OKX: limit bumped to 100; payment method field resolution widened.
 *  - KuCoin: pageSize bumped to 50 (their documented max); payment name
 *    extraction now walks adPayTypes[].name → adPayTypes[].payType chain.
 *  - Concurrency limit raised to 4 (one slot per exchange).
 *  - fetchP2PAds() now accepts a `pages` option to fan across multiple pages
 *    automatically and de-duplicate results before returning.
 */

const https  = require('https');
const http   = require('http');
const logger = require('../../utils/logger');

// ─── Concurrency limiter ──────────────────────────────────────────────────
let concurrencyLimit;
try {
  const pLimitModule = require('p-limit');
  const pLimit = pLimitModule.default || pLimitModule;
  concurrencyLimit = pLimit(4);
  logger.info('[p2p] p-limit loaded (concurrency = 4)');
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

// ─── Payment method normalizer ────────────────────────────────────────────
// Exchange APIs return method names inconsistently — sometimes a raw key like
// "BANK_TRANSFER", sometimes a display name like "Bank Transfer", sometimes an
// object. This normalizer converts raw keys to readable labels and title-cases
// anything else so the frontend always shows something clean.

const PAYMENT_METHOD_NAMES = {
  BANK_TRANSFER:        'Bank Transfer',
  BANK_TRANSFER_:       'Bank Transfer',
  NATIONAL_BANK_TRANSFER: 'Bank Transfer',
  MPESA:                'M-Pesa',
  M_PESA:               'M-Pesa',
  MOBILE_MONEY:         'Mobile Money',
  AIRTEL_MONEY:         'Airtel Money',
  MTN_MOBILE_MONEY:     'MTN Mobile Money',
  CHIPPER_CASH:         'Chipper Cash',
  CHIPPERCASH:          'Chipper Cash',
  PAYPAL:               'PayPal',
  WISE:                 'Wise',
  TRANSFERWISE:         'Wise',
  PAYONEER:             'Payoneer',
  SKRILL:               'Skrill',
  NETELLER:             'Neteller',
  PERFECT_MONEY:        'Perfect Money',
  PERFECTMONEY:         'Perfect Money',
  WESTERN_UNION:        'Western Union',
  WESTERNUNION:         'Western Union',
  MONEYGRAM:            'MoneyGram',
  MONEY_GRAM:           'MoneyGram',
  CASH_IN_PERSON:       'Cash in Person',
  CASH:                 'Cash',
  UPI:                  'UPI',
  GPAY:                 'Google Pay',
  GOOGLE_PAY:           'Google Pay',
  PAYTM:                'Paytm',
  PHONEPE:              'PhonePe',
  IMPS:                 'IMPS',
  NEFT:                 'NEFT',
  RTGS:                 'RTGS',
  EASYPAISA:            'EasyPaisa',
  JAZZCASH:             'JazzCash',
  SADAPAY:              'SadaPay',
  NAYAPAY:              'NayaPay',
  PAXFUL_WALLET:        'Paxful Wallet',
  KUDA:                 'Kuda',
  OPAY:                 'OPay',
  PALMPAY:              'PalmPay',
  PIGGYVEST:            'PiggyVest',
  ZENITH_BANK:          'Zenith Bank',
  ACCESS_BANK:          'Access Bank',
  FIRST_BANK:           'First Bank',
  GTB:                  'GTBank',
  GTBANK:               'GTBank',
  UBA:                  'UBA',
  EQUITY_BANK:          'Equity Bank',
  KCB:                  'KCB',
  ABSA:                 'ABSA',
  STANDARD_BANK:        'Standard Bank',
  FNB:                  'FNB',
  NEDBANK:              'Nedbank',
  CRYPTO_WALLET:        'Crypto Wallet',
};

function normalizePaymentMethod(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Direct lookup (case-insensitive key)
  const key = trimmed.toUpperCase().replace(/[\s-]/g, '_');
  if (PAYMENT_METHOD_NAMES[key]) return PAYMENT_METHOD_NAMES[key];

  // Already looks like a readable name (has lowercase letters and/or spaces)
  if (/[a-z]/.test(trimmed) && trimmed.length > 2) {
    // Title-case it if it looks like an ALL_CAPS_KEY
    if (/^[A-Z0-9_\s]+$/.test(trimmed)) {
      return trimmed
        .toLowerCase()
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
    }
    return trimmed;
  }

  // ALL_CAPS_KEY style — convert to Title Case
  return trimmed
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function extractPaymentMethods(raw) {
  if (!raw) return [];
  const methods = Array.isArray(raw) ? raw : [raw];
  return methods
    .map(m => {
      if (typeof m === 'string') return normalizePaymentMethod(m);
      if (typeof m === 'object' && m !== null) {
        const name =
          m.tradeMethodName || m.paymentMethod  || m.paymentType ||
          m.payMethodName   || m.name           || m.payMethod   ||
          m.methodName      || m.type           || m.payType     ||
          String(m);
        return normalizePaymentMethod(name);
      }
      return null;
    })
    .filter(Boolean);
}

// ─── BINANCE ──────────────────────────────────────────────────────────────
// Public endpoint — no auth needed.
// rows: Binance friendly C2C endpoint caps at 40 — higher values return data:null.
// page: start at 2 (page 1 uses a different ad-serving path with stricter bot checks).
// ─── BINANCE (Updated 2026) ───────────────────────────────────────────────
// ─── BINANCE ──────────────────────────────────────────────────────────────
// ─── BINANCE ──────────────────────────────────────────────────────────────
async function fetchBinanceP2P({ asset = 'USDT', fiat = 'KES', tradeType = 'BUY', page = 1, size = 20 } = {}) {
  const payload = {
    asset: asset.toUpperCase(),
    fiat: fiat.toUpperCase(),
    tradeType: tradeType.toUpperCase(),
    page: Number(page),
    rows: Math.min(size, 20),
    merchantCheck: false,
    publisherType: null,
    payTypes: [],
    countries: [],
    proMerchantAds: false,
    shieldMerchantAds: false,
    filterType: "all",
    additionalKycVerifyFilter: 0,
  };

  try {
    const data = await retry(() => httpRequest(
      'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search',
      { 
        method: 'POST',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
          'Referer': 'https://p2p.binance.com/en/trade/all-payments',
          'Origin': 'https://p2p.binance.com',
          'Accept-Language': 'en-US,en;q=0.9',
        }
      },
      payload
    ));

    // Binance success codes
    if (data?.code === "000000" || data?.code === 0 || data?.success === true) {
      const items = data?.data || [];
      if (!Array.isArray(items) || items.length === 0) {
        logger.info(`[p2p] Binance: 0 ads for ${asset}/${fiat} ${tradeType} (page ${page})`);
        return [];
      }

      logger.info(`[p2p] Binance: ${items.length} ads for ${asset}/${fiat} ${tradeType} (page ${page})`);

      return items.map(item => ({
        exchange:       'binance',
        tradeType,
        asset:          item.adv?.asset || asset,
        fiat:           item.adv?.fiatUnit || fiat,
        price:          parseFloat(item.adv?.price || 0),
        minAmount:      parseFloat(item.adv?.minSingleTransAmount || 0),
        maxAmount:      parseFloat(item.adv?.maxSingleTransAmount || 0),
        available:      parseFloat(item.adv?.surplusAmount || 0),
        paymentMethods: extractPaymentMethods(item.adv?.tradeMethods || []),
        merchant: {
          name:           item.advertiser?.nickName || 'Unknown',
          completionRate: parseFloat(((item.advertiser?.monthFinishRate || 0) * 100).toFixed(1)),
          orderCount:     item.advertiser?.monthOrderCount || 0,
          isVerified:     item.advertiser?.userType === 'merchant',
        },
      }));
    }

    logger.warn(`[p2p] Binance P2P: code=${data?.code} msg=${data?.message || 'no message'}`);
    return [];

  } catch (err) {
    logger.warn(`[p2p] Binance failed: ${err.message}`);
    return [];
  }
}

// ─── BYBIT ────────────────────────────────────────────────────────────────
// Authenticated — requires credentials stored in DB.
// size: Bybit allows up to 300 per page via v5/p2p/item/online.
async function fetchBybitP2P({ asset = 'USDT', fiat = 'KES', tradeType = 'BUY', page = 1, size = 100 } = {}) {
  const side = tradeType === 'BUY' ? 1 : 0;

  let apiKey    = '';
  let apiSecret = '';

  try {
    const ExchangeApiKey = require('../models/ExchangeApiKey');
    const keyDoc = await ExchangeApiKey.findOne({ exchange: 'bybit', isValid: true })
      .sort({ updatedAt: -1 });
    if (keyDoc) {
      apiKey    = ExchangeApiKey.decrypt(keyDoc.apiKeyEncrypted);
      apiSecret = ExchangeApiKey.decrypt(keyDoc.apiSecretEncrypted);
    }
  } catch (err) {
    logger.warn(`[p2p] Bybit key load failed: ${err.message}`);
  }

  if (!apiKey || !apiSecret) {
    logger.warn('[p2p] Bybit: no credentials found — skipping');
    return [];
  }

  const timestamp  = Date.now().toString();
  const recvWindow = '5000';
  const bodyObj    = {
    tokenId:    asset,
    currencyId: fiat,
    side:       side.toString(),
    page:       page.toString(),
    size:       Math.min(size, 300).toString(),
  };
  const bodyStr = JSON.stringify(bodyObj);
  const preHash = timestamp + apiKey + recvWindow + bodyStr;
  const signature = require('crypto').createHmac('sha256', apiSecret).update(preHash).digest('hex');

  try {
    const data = await retry(() => httpRequest(
      'https://api.bybit.com/v5/p2p/item/online',
      {
        method: 'POST',
        headers: {
          'Content-Type':       'application/json',
          'X-BAPI-API-KEY':     apiKey,
          'X-BAPI-TIMESTAMP':   timestamp,
          'X-BAPI-RECV-WINDOW': recvWindow,
          'X-BAPI-SIGN':        signature,
        },
      },
      bodyStr
    ));

    const retCode = data?.retCode ?? data?.ret_code;
    if (retCode !== 0) {
      logger.warn(`[p2p] Bybit: retCode=${retCode} — ${data?.retMsg || ''}`);
      return [];
    }

    const items = data?.result?.items || data?.result?.list || [];
    if (items.length === 0) {
      logger.info(`[p2p] Bybit: 0 ads for ${asset}/${fiat} ${tradeType} (page ${page})`);
      return [];
    }

    logger.info(`[p2p] Bybit: ${items.length} ads for ${asset}/${fiat} ${tradeType} (page ${page})`);

    return items.map(item => ({
      exchange:       'bybit',
      tradeType,
      asset:          item.tokenId    || asset,
      fiat:           item.currencyId || fiat,
      price:          parseFloat(item.price        || 0),
      minAmount:      parseFloat(item.minAmount    || 0),
      maxAmount:      parseFloat(item.maxAmount    || 0),
      available:      parseFloat(item.lastQuantity || item.quantity || 0),
      paymentMethods: extractPaymentMethods(item.payments || []),
      merchant: {
        name:           item.nickName      || 'Unknown',
        completionRate: parseFloat(((item.recentExecuteRate || 0) * 100).toFixed(1)),
        orderCount:     item.recentOrderNum || 0,
        isVerified:     !!item.authTag,
      },
    }));
  } catch (err) {
    logger.warn(`[p2p] Bybit failed: ${err.message}`);
    return [];
  }
}

// ─── OKX ─────────────────────────────────────────────────────────────────
// Public endpoint — no auth needed.
// limit: OKX docs say max 20 but accepts up to 100 in practice.
async function fetchOKXP2P({ asset = 'USDT', fiat = 'KES', tradeType = 'BUY', page = 1, size = 100 } = {}) {
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
      limit:             Math.min(size, 100),
      page,
    })
  ));

  // OKX returns ads under data.buy or data.sell depending on the `side` param
  const items = data?.data?.[side] || [];
  if (!Array.isArray(items)) {
    logger.warn('[p2p] OKX P2P: unexpected response shape');
    return [];
  }

  logger.info(`[p2p] OKX: ${items.length} ads for ${asset}/${fiat} ${tradeType} (page ${page})`);

  return items.map(item => ({
    exchange:       'okx',
    tradeType,
    asset:          asset.toUpperCase(),
    fiat:           fiat.toUpperCase(),
    price:          parseFloat(item.price || 0),
    minAmount:      parseFloat(item.quoteMinAmountPerOrder || item.minSingleTransAmount || 0),
    maxAmount:      parseFloat(item.quoteMaxAmountPerOrder || item.maxSingleTransAmount || 0),
    available:      parseFloat(item.availableAmount || item.tradeCount || 0),
    paymentMethods: extractPaymentMethods(
      item.paymentMethods || item.payMethods || item.tradeMethods || []
    ),
    merchant: {
      name:           item.nickName          || 'Unknown',
      completionRate: parseFloat(item.completionRate || 0),
      orderCount:     parseInt(item.completedOrderQuantity || item.orderNum || 0),
      isVerified:     item.userType === 'certified_merchant',
    },
  }));
}

// ─── KUCOIN ───────────────────────────────────────────────────────────────
// Public endpoint — no auth needed.
// pageSize: KuCoin documented max is 50; the API quietly caps larger values.
async function fetchKuCoinP2P({ asset = 'USDT', fiat = 'KES', tradeType = 'BUY', page = 1, size = 50 } = {}) {
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
      pageSize: Math.min(size, 50),
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

  logger.info(`[p2p] KuCoin: ${items.length} ads for ${asset}/${fiat} ${tradeType} (page ${page})`);

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
      paymentMethods: extractPaymentMethods(item.adPayTypes || []),
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


// ─── DISPATCHER ───────────────────────────────────────────────────────────

const FETCHERS = {
  binance: fetchBinanceP2P,
  bybit:   fetchBybitP2P,
  okx:     fetchOKXP2P,
  kucoin:  fetchKuCoinP2P,
};

// How many pages to fetch per exchange per call when exchange='all'.
// Binance: starts at page 2 (page 1 has bot-check issues), rows capped at 40.
// KuCoin: capped at 50/page.
const PAGE_CONFIG = {
  binance: { startPage: 1, pages: 4, size: 30 },   // ~100-120 ads, safer
  bybit:   { startPage: 1, pages: 3, size: 100 },
  okx:     { startPage: 1, pages: 3, size: 100 },
  kucoin:  { startPage: 1, pages: 4, size: 50  },
};

async function fetchAllPages(fetchFn, baseOpts) {
  const { startPage = 1, pages, size } = PAGE_CONFIG[baseOpts.exchange] || { startPage: 1, pages: 2, size: 50 };
  const results = await Promise.allSettled(
    Array.from({ length: pages }, (_, i) =>
      fetchFn({ ...baseOpts, page: startPage + i, size })
    )
  );

  const ads = [];
  const seen = new Set();

  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    for (const ad of r.value) {
      // De-duplicate by merchant+price combo
      const key = `${ad.exchange}:${ad.merchant.name}:${ad.price}`;
      if (!seen.has(key)) {
        seen.add(key);
        ads.push(ad);
      }
    }
  }

  return ads;
}

/**
 * Fetch P2P ads from one or all exchanges.
 *
 * Options:
 *   exchange  — 'all' | 'binance' | 'bybit' | 'okx' | 'kucoin'
 *   asset     — 'USDT' | 'USDC' | 'BTC' | 'ETH'
 *   fiat      — 'KES' | 'NGN' | ...
 *   tradeType — 'BUY' | 'SELL'
 *   limit     — per-page cap (used when fetching a single page only)
 *   multiPage — if true (default for 'all'), fan across multiple pages
 */
async function fetchP2PAds({
  exchange  = 'all',
  asset     = 'USDT',
  fiat      = 'KES',
  tradeType = 'BUY',
  page      = 1,
  limit     = 20,
  multiPage,
} = {}) {
  const targets = exchange === 'all'
    ? Object.keys(FETCHERS)
    : [exchange.toLowerCase()];

  // Default: multi-page when fetching all exchanges for richer results.
  const useMultiPage = multiPage !== undefined ? multiPage : exchange === 'all';

  const results = await Promise.allSettled(
    targets.map(ex =>
      concurrencyLimit(async () => {
        const fn = FETCHERS[ex];
        if (!fn) throw new Error(`No P2P fetcher for exchange: ${ex}`);
        logger.info(`[p2p] Fetching ${ex} P2P: ${asset}/${fiat} ${tradeType}`);

        const ads = useMultiPage
          ? await fetchAllPages(fn, { asset, fiat, tradeType, exchange: ex })
          : await fn({ asset, fiat, tradeType, page, size: limit });

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
    assets: ['USDT', 'USDC', 'BTC', 'ETH'],
    notes: {
      binance: 'Public API — up to 300 ads (3 pages × 100)',
      bybit:   'Signed API — requires DB credentials — up to 300 ads (3 pages × 100)',
      okx:     'Public API — up to 300 ads (3 pages × 100)',
      kucoin:  'Public API — up to 200 ads (4 pages × 50)',
    },
  };
}

module.exports = { fetchP2PAds, getSupportedPairs, FETCHERS };