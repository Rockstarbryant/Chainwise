/**
 * backend/src/services/dexAggregator.js
 *
 * Aggregates DEX data from three sources:
 *   1. DexScreener  — CA search, pool data, real-time prices (primary)
 *   2. GeckoTerminal — pool liquidity, volume, additional pool coverage
 *   3. CoinGecko    — coin metadata, DEX trust scores, exchange details
 *
 * Data flow:
 *   symbol/CA input
 *     → resolve to coin + pools (DexScreener + GeckoTerminal)
 *     → enrich with CoinGecko metadata
 *     → deduplicate pools (same DEX + chain = one entry)
 *     → rank by liquidity → volume → trust score
 *     → return structured response
 */

const axios  = require('axios');
const logger = require('../../utils/logger');

// ── API base URLs ──────────────────────────────────────────────────────────
const DEXSCREENER_BASE   = 'https://api.dexscreener.com/latest/dex';
const GECKO_TERMINAL_BASE = 'https://api.geckoterminal.com/api/v2';
const COINGECKO_BASE     = 'https://api.coingecko.com/api/v3';

// ── Shared axios instances with timeouts ──────────────────────────────────
const dexHttp = axios.create({ timeout: 8000 });
const gtHttp  = axios.create({ timeout: 8000, headers: { Accept: 'application/json;version=20230302' } });
const cgHttp  = axios.create({
  timeout: 8000,
  headers: process.env.COINGECKO_API_KEY
    ? { 'x-cg-demo-api-key': process.env.COINGECKO_API_KEY }
    : {},
});

// ── Chain ID → readable name map ──────────────────────────────────────────
const CHAIN_NAMES = {
  ethereum:  'Ethereum',  eth: 'Ethereum',
  bsc:       'BNB Chain', binance: 'BNB Chain',
  polygon:   'Polygon',   matic: 'Polygon',
  arbitrum:  'Arbitrum',
  optimism:  'Optimism',
  base:      'Base',
  avalanche: 'Avalanche', avax: 'Avalanche',
  solana:    'Solana',    sol: 'Solana',
  fantom:    'Fantom',
  cronos:    'Cronos',
  harmony:   'Harmony',
  moonbeam:  'Moonbeam',
  celo:      'Celo',
  sui:       'Sui',
  ton:       'TON',
  near:      'NEAR',
};

function normaliseChainName(id = '') {
  const key = id.toLowerCase().replace(/-/g, '');
  return CHAIN_NAMES[key] || id.charAt(0).toUpperCase() + id.slice(1);
}

// ── Contract address detector ─────────────────────────────────────────────
function isContractAddress(query) {
  const q = query.trim();
  return /^0x[a-fA-F0-9]{40}$/.test(q) ||    // EVM
         /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(q); // Solana base58
}

// ── Risk flags ────────────────────────────────────────────────────────────
function getRiskFlags(pool) {
  const flags = [];
  if (pool.liquidity < 10000)  flags.push({ level: 'high',   msg: 'Very low liquidity — extreme slippage risk' });
  else if (pool.liquidity < 50000) flags.push({ level: 'medium', msg: 'Low liquidity — expect slippage on large trades' });
  if (pool.volume24h < 1000)   flags.push({ level: 'medium', msg: 'Very low 24h volume — low trading activity' });
  if (!pool.trustScore)        flags.push({ level: 'low',    msg: 'No trust score available — verify DEX manually' });
  return flags;
}

// ─────────────────────────────────────────────────────────────────────────
// SOURCE 1 — DexScreener
// ─────────────────────────────────────────────────────────────────────────

async function fetchDexScreenerByCA(ca) {
  try {
    const { data } = await dexHttp.get(`${DEXSCREENER_BASE}/tokens/${ca}`);
    return (data?.pairs || []).slice(0, 30);
  } catch (err) {
    logger.warn('[dex] DexScreener CA search failed:', err.message);
    return [];
  }
}

async function fetchDexScreenerBySymbol(symbol) {
  try {
    const { data } = await dexHttp.get(`${DEXSCREENER_BASE}/search?q=${encodeURIComponent(symbol)}`);
    return (data?.pairs || []).slice(0, 30);
  } catch (err) {
    logger.warn('[dex] DexScreener symbol search failed:', err.message);
    return [];
  }
}

function normaliseDexScreenerPair(pair) {
  return {
    source:       'dexscreener',
    dexId:        pair.dexId?.toLowerCase() || 'unknown',
    dexName:      pair.dexId || 'Unknown DEX',
    chain:        pair.chainId || 'unknown',
    chainName:    normaliseChainName(pair.chainId),
    pairAddress:  pair.pairAddress,
    baseToken: {
      address: pair.baseToken?.address,
      name:    pair.baseToken?.name,
      symbol:  pair.baseToken?.symbol,
    },
    quoteToken: {
      address: pair.quoteToken?.address,
      name:    pair.quoteToken?.name,
      symbol:  pair.quoteToken?.symbol,
    },
    pair:        `${pair.baseToken?.symbol}/${pair.quoteToken?.symbol}`,
    priceUSD:    parseFloat(pair.priceUsd || 0),
    priceNative: parseFloat(pair.priceNative || 0),
    liquidity:   pair.liquidity?.usd || 0,
    volume24h:   pair.volume?.h24 || 0,
    volume6h:    pair.volume?.h6 || 0,
    volume1h:    pair.volume?.h1 || 0,
    priceChange: {
      h1:  pair.priceChange?.h1  || 0,
      h6:  pair.priceChange?.h6  || 0,
      h24: pair.priceChange?.h24 || 0,
    },
    txns24h: {
      buys:  pair.txns?.h24?.buys  || 0,
      sells: pair.txns?.h24?.sells || 0,
    },
    fdv:         pair.fdv || 0,
    marketCap:   pair.marketCap || 0,
    url:         pair.url || `https://dexscreener.com/${pair.chainId}/${pair.pairAddress}`,
    createdAt:   pair.pairCreatedAt || null,
    trustScore:  null, // enriched later from CoinGecko
  };
}

// ─────────────────────────────────────────────────────────────────────────
// SOURCE 2 — GeckoTerminal
// ─────────────────────────────────────────────────────────────────────────

async function fetchGeckoTerminalByCA(chain, ca) {
  try {
    const { data } = await gtHttp.get(
      `${GECKO_TERMINAL_BASE}/networks/${chain}/tokens/${ca}/pools?page=1&include=dex`
    );
    return data?.data || [];
  } catch (err) {
    logger.warn('[dex] GeckoTerminal CA search failed:', err.message);
    return [];
  }
}

async function fetchGeckoTerminalSearch(query) {
  try {
    const { data } = await gtHttp.get(
      `${GECKO_TERMINAL_BASE}/search/pools?query=${encodeURIComponent(query)}&page=1`
    );
    return data?.data || [];
  } catch (err) {
    logger.warn('[dex] GeckoTerminal search failed:', err.message);
    return [];
  }
}

function normaliseGeckoTerminalPool(pool, included = []) {
  const attr   = pool.attributes || {};
  const dexRel = pool.relationships?.dex?.data;
  const dexObj = included.find(i => i.type === 'dex' && i.id === dexRel?.id);
  const dexName = dexObj?.attributes?.name || dexRel?.id || 'Unknown DEX';

  const [base, quote] = (attr.name || '/').split('/');

  return {
    source:       'geckoterminal',
    dexId:        dexRel?.id?.toLowerCase() || 'unknown',
    dexName,
    chain:        attr.network_id || pool.relationships?.network?.data?.id || 'unknown',
    chainName:    normaliseChainName(attr.network_id || ''),
    pairAddress:  attr.address,
    baseToken: {
      address: attr.base_token_price_native_currency ? attr.address : null,
      name:    base?.trim(),
      symbol:  base?.trim(),
    },
    quoteToken: {
      address: null,
      name:    quote?.trim(),
      symbol:  quote?.trim(),
    },
    pair:        attr.name || '',
    priceUSD:    parseFloat(attr.base_token_price_usd || 0),
    priceNative: parseFloat(attr.base_token_price_native_currency || 0),
    liquidity:   parseFloat(attr.reserve_in_usd || 0),
    volume24h:   parseFloat(attr.volume_usd?.h24 || 0),
    volume6h:    parseFloat(attr.volume_usd?.h6  || 0),
    volume1h:    parseFloat(attr.volume_usd?.h1  || 0),
    priceChange: {
      h1:  parseFloat(attr.price_change_percentage?.h1  || 0),
      h6:  parseFloat(attr.price_change_percentage?.h6  || 0),
      h24: parseFloat(attr.price_change_percentage?.h24 || 0),
    },
    txns24h:     { buys: 0, sells: 0 },
    fdv:         parseFloat(attr.fdv_usd || 0),
    marketCap:   parseFloat(attr.market_cap_usd || 0),
    url:         `https://www.geckoterminal.com/${attr.network_id}/pools/${attr.address}`,
    createdAt:   attr.pool_created_at || null,
    trustScore:  null,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// SOURCE 3 — CoinGecko (metadata + DEX trust scores)
// ─────────────────────────────────────────────────────────────────────────

async function fetchCoinGeckoCoinData(query) {
  try {
    // Search for coin
    const searchRes = await cgHttp.get(
      `${COINGECKO_BASE}/search?query=${encodeURIComponent(query)}`
    );
    const coins = searchRes.data?.coins || [];
    if (!coins.length) return null;

    // Get top match details
    const coinId = coins[0].id;
    const detailRes = await cgHttp.get(
      `${COINGECKO_BASE}/coins/${coinId}?localization=false&tickers=false&community_data=false&developer_data=false`
    );
    return detailRes.data;
  } catch (err) {
    logger.warn('[dex] CoinGecko coin search failed:', err.message);
    return null;
  }
}

async function fetchCoinGeckoByContract(platform, address) {
  try {
    const { data } = await cgHttp.get(
      `${COINGECKO_BASE}/coins/${platform}/contract/${address}`
    );
    return data;
  } catch (err) {
    logger.warn('[dex] CoinGecko contract lookup failed:', err.message);
    return null;
  }
}

async function fetchDEXMetadata(dexIds) {
  const unique = [...new Set(dexIds)].slice(0, 10);
  const results = {};

  await Promise.allSettled(
    unique.map(async (id) => {
      try {
        const { data } = await cgHttp.get(`${COINGECKO_BASE}/exchanges/${id}`);
        results[id] = {
          id,
          name:            data.name,
          yearEstablished: data.year_established,
          country:         data.country,
          description:     data.description,
          website:         data.url,
          image:           data.image,
          trustScore:      data.trust_score,
          trustScoreRank:  data.trust_score_rank,
          tradeVolume24h:  data.trade_volume_24h_btc,
        };
      } catch (_) {
        results[id] = null;
      }
    })
  );

  return results;
}

// ─────────────────────────────────────────────────────────────────────────
// DEDUPLICATION
// Key: dexId + chain + baseToken.symbol — same pool from two sources = one
// ─────────────────────────────────────────────────────────────────────────

function deduplicatePools(pools) {
  const seen = new Map();

  for (const pool of pools) {
    const key = `${pool.dexId}:${pool.chain}:${pool.pair}`;
    if (!seen.has(key)) {
      seen.set(key, pool);
    } else {
      // Merge: prefer DexScreener txn data, GeckoTerminal liquidity
      const existing = seen.get(key);
      seen.set(key, {
        ...existing,
        ...pool,
        liquidity:  Math.max(existing.liquidity || 0, pool.liquidity || 0),
        volume24h:  Math.max(existing.volume24h || 0, pool.volume24h || 0),
        txns24h:    existing.txns24h?.buys ? existing.txns24h : pool.txns24h,
        source:     'merged',
      });
    }
  }

  return [...seen.values()];
}

// ─────────────────────────────────────────────────────────────────────────
// RANKING
// Score = liquidity (50%) + volume24h (30%) + trustScore (20%)
// ─────────────────────────────────────────────────────────────────────────

function rankPools(pools, dexMeta) {
  return pools
    .map(pool => {
      const meta       = dexMeta[pool.dexId] || null;
      const trust      = meta?.trustScore || 0;
      const liqScore   = Math.min(pool.liquidity / 1_000_000, 1) * 50;
      const volScore   = Math.min(pool.volume24h / 500_000, 1) * 30;
      const trustScore = (trust / 10) * 20;
      const score      = liqScore + volScore + trustScore;

      return {
        ...pool,
        trustScore: trust,
        dexDetails: meta,
        riskFlags:  getRiskFlags(pool),
        score,
      };
    })
    .sort((a, b) => b.score - a.score);
}

// ─────────────────────────────────────────────────────────────────────────
// MAIN AGGREGATOR FUNCTION
// ─────────────────────────────────────────────────────────────────────────

async function aggregateDEXData(query) {
  const isCA    = isContractAddress(query.trim());
  const cleanQ  = query.trim();

  logger.info(`[dex] Aggregating for: "${cleanQ}" (isCA=${isCA})`);

  // ── Step 1: Fetch pools from DexScreener + GeckoTerminal in parallel ──
  let dsRaw = [], gtRaw = [], coinData = null;

  if (isCA) {
    [dsRaw, coinData] = await Promise.all([
      fetchDexScreenerByCA(cleanQ),
      fetchCoinGeckoByContract('ethereum', cleanQ).catch(() => null),
    ]);
    // Also try GeckoTerminal if we know the chain from DexScreener results
    if (dsRaw.length > 0) {
      const chain = dsRaw[0].chainId;
      gtRaw = await fetchGeckoTerminalByCA(chain, cleanQ).catch(() => []);
    }
  } else {
    [dsRaw, gtRaw, coinData] = await Promise.all([
      fetchDexScreenerBySymbol(cleanQ),
      fetchGeckoTerminalSearch(cleanQ),
      fetchCoinGeckoCoinData(cleanQ),
    ]);
  }

  // ── Step 2: Normalise all pools to common schema ──────────────────────
  const dsPools = dsRaw.map(normaliseDexScreenerPair);
  const gtPools = gtRaw.map(p => normaliseGeckoTerminalPool(p, gtRaw.included || []));

  // ── Step 3: Deduplicate ───────────────────────────────────────────────
  const allPools   = deduplicatePools([...dsPools, ...gtPools]);

  // ── Step 4: Fetch DEX metadata from CoinGecko ────────────────────────
  const dexIds     = [...new Set(allPools.map(p => p.dexId))];
  const dexMeta    = await fetchDEXMetadata(dexIds);

  // ── Step 5: Rank pools ────────────────────────────────────────────────
  const rankedPools = rankPools(allPools, dexMeta);

  // ── Step 6: Build coin summary ────────────────────────────────────────
  const topPool = rankedPools[0];
  const coin = coinData ? {
    id:          coinData.id,
    name:        coinData.name,
    symbol:      coinData.symbol?.toUpperCase(),
    image:       coinData.image?.large || coinData.image?.small,
    description: coinData.description?.en?.slice(0, 400) || null,
    priceUSD:    coinData.market_data?.current_price?.usd || topPool?.priceUSD || 0,
    priceChange24h: coinData.market_data?.price_change_percentage_24h || topPool?.priceChange?.h24 || 0,
    marketCap:   coinData.market_data?.market_cap?.usd || 0,
    fdv:         coinData.market_data?.fully_diluted_valuation?.usd || 0,
    volume24h:   coinData.market_data?.total_volume?.usd || 0,
    chains:      Object.keys(coinData.platforms || {}).filter(Boolean),
    contractAddresses: coinData.platforms || {},
    links: {
      website:   coinData.links?.homepage?.[0] || null,
      twitter:   coinData.links?.twitter_screen_name
        ? `https://x.com/${coinData.links.twitter_screen_name}` : null,
      telegram:  coinData.links?.telegram_channel_identifier
        ? `https://t.me/${coinData.links.telegram_channel_identifier}` : null,
      coingecko: `https://www.coingecko.com/en/coins/${coinData.id}`,
    },
    notOnCEX: (coinData.tickers || []).length === 0,
  } : topPool ? {
    name:       topPool.baseToken.name || cleanQ,
    symbol:     topPool.baseToken.symbol?.toUpperCase() || cleanQ.toUpperCase(),
    priceUSD:   topPool.priceUSD,
    priceChange24h: topPool.priceChange?.h24 || 0,
    marketCap:  topPool.marketCap || 0,
    fdv:        topPool.fdv || 0,
    chains:     [...new Set(rankedPools.map(p => p.chain))],
    notOnCEX:   true,
  } : null;

  // ── Step 7: Global warnings ───────────────────────────────────────────
  const warnings = [];
  if (coin?.notOnCEX) warnings.push('⚠️ This token is not listed on any major CEX — trade only on DEX');
  if (rankedPools.length === 0) warnings.push('⚠️ No DEX pools found — token may be very new or unlisted');
  if (rankedPools.length > 0 && rankedPools[0].liquidity < 10000) {
    warnings.push('⚠️ All available pools have very low liquidity — high slippage risk');
  }

  return {
    query:        cleanQ,
    isCA,
    coin,
    pools:        rankedPools.slice(0, 20),
    totalPools:   rankedPools.length,
    chains:       [...new Set(rankedPools.map(p => p.chain))],
    dexes:        [...new Set(rankedPools.map(p => p.dexName))],
    warnings,
    sources:      { dexscreener: dsPools.length, geckoterminal: gtPools.length },
    fetchedAt:    new Date().toISOString(),
  };
}

module.exports = { aggregateDEXData, isContractAddress };