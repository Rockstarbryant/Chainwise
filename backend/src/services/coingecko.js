const axios = require('axios');
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: 300 }); // 5 min cache
const BASE = 'https://api.coingecko.com/api/v3';

const headers = process.env.COINGECKO_API_KEY
  ? { 'x-cg-demo-api-key': process.env.COINGECKO_API_KEY }
  : {};

// CoinGecko exchange IDs for our supported exchanges
const EXCHANGE_CG_IDS = {
  binance: 'binance',
  bybit:   'bybit_spot',
  coinex:  'coinex',
  bitget:  'bitget',
  kucoin:  'kucoin',
  gateio:  'gate',
  okx:     'okx',
};

// Get all coins/tickers listed on a specific exchange from CoinGecko
async function getExchangeTickers(exchangeKey, page = 1) {
  const cgId = EXCHANGE_CG_IDS[exchangeKey.toLowerCase()];
  if (!cgId) return { error: `No CoinGecko ID mapped for: ${exchangeKey}` };

  try {
    const data = await cgGet(
      `/exchanges/${cgId}/tickers?include_exchange_logo=false&page=${page}&depth=false&order=trust_score_desc`
    );

    const seen  = new Set();
    const coins = [];

    for (const ticker of (data.tickers || [])) {
      const symbol = ticker.base?.toUpperCase();
      if (!symbol || seen.has(symbol)) continue;
      seen.add(symbol);
      coins.push({
        symbol,
        name:        ticker.coin_id || symbol,
        coinGeckoId: ticker.coin_id || null,
        target:      ticker.target  || 'USDT',
        volume:      ticker.converted_volume?.usd || 0,
      });
    }

    coins.sort((a, b) => b.volume - a.volume);
    return { coins, total: coins.length };

  } catch (err) {
    const status  = err?.response?.status;
    const message = err?.response?.data?.error || err.message;

    if (status === 401) {
      return { error: 'CoinGecko API key required. Add COINGECKO_API_KEY to backend .env (free at coingecko.com/api)' };
    }
    if (status === 429) {
      return { error: 'CoinGecko rate limit hit. Wait 60 seconds and retry, or upgrade your API plan.' };
    }
    if (status === 404) {
      return { error: `Exchange '${exchangeKey}' not found on CoinGecko` };
    }
    return { error: `CoinGecko error: ${message}` };
  }
}

async function cgGet(endpoint) {
  const cacheKey = endpoint;
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  const { data } = await axios.get(`${BASE}${endpoint}`, { headers });
  cache.set(cacheKey, data);
  return data;
}

// Resolve symbol ("USDC") → CoinGecko ID ("usd-coin")
async function resolveSymbol(symbol) {
  const data = await cgGet(`/search?query=${encodeURIComponent(symbol)}`);
  const coins = data.coins || [];
  const exact = coins.find(c => c.symbol.toUpperCase() === symbol.toUpperCase());
  return exact?.id || coins[0]?.id || null;
}

// Which blockchains does this coin exist on?
async function getCoinPlatforms(coinId) {
  const data = await cgGet(
    `/coins/${coinId}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false`
  );
  return {
    id: coinId,
    name: data.name,
    symbol: data.symbol?.toUpperCase(),
    platforms: data.platforms || {},
  };
}

// Which exchanges (CEX + DEX) list this coin?
async function getCoinTickers(coinId) {
  const data = await cgGet(`/coins/${coinId}/tickers?include_exchange_logo=false&depth=false`);
  return data.tickers || [];
}

// Current USD price
async function getPrice(coinId) {
  const data = await cgGet(`/simple/price?ids=${coinId}&vs_currencies=usd`);
  return data[coinId]?.usd ?? null;
}

module.exports = { resolveSymbol, getCoinPlatforms, getCoinTickers, getExchangeTickers, getPrice };