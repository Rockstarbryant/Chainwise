const axios = require('axios');
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: 300 }); // 5 min cache
const BASE = 'https://api.coingecko.com/api/v3';

const headers = process.env.COINGECKO_API_KEY
  ? { 'x-cg-demo-api-key': process.env.COINGECKO_API_KEY }
  : {};

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

module.exports = { resolveSymbol, getCoinPlatforms, getCoinTickers, getPrice };