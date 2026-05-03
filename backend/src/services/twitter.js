const axios = require('axios');
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: 600 }); // 10 min cache

// Exchange handle map
const HANDLES = {
  binance:  'binance',
  bybit:    'Bybit_Official',
  coinex:   'coinexcom',
  bitget:   'BitgetGlobal',
  gateio:   'gate_io',
  kucoin:   'kucoincom',
  okx:      'okx',
};

const GIVEAWAY_KEYWORDS = 'giveaway OR airdrop OR rewards OR competition OR promo';

async function scanGiveaways(exchange) {
  const handle = HANDLES[exchange.toLowerCase()];
  if (!handle) return { error: `Unknown exchange: ${exchange}` };

  const cacheKey = `giveaway:${exchange}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  const token = process.env.TWITTER_BEARER_TOKEN;
  if (!token) {
    return {
      error: null,
      exchange,
      handle: `@${handle}`,
      tweets: [],
      note: 'Set TWITTER_BEARER_TOKEN in .env to enable live giveaway scanning.',
      setup: 'https://developer.twitter.com/en/portal/dashboard',
    };
  }

  try {
    const query = `from:${handle} (${GIVEAWAY_KEYWORDS}) -is:retweet`;
    const { data } = await axios.get(
      'https://api.twitter.com/2/tweets/search/recent',
      {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          query,
          max_results: 10,
          'tweet.fields': 'created_at,text,public_metrics',
          expansions: 'author_id',
        },
      }
    );

    const result = {
      exchange,
      handle: `@${handle}`,
      tweets: (data.data || []).map(t => ({
        id: t.id,
        text: t.text,
        url: `https://twitter.com/${handle}/status/${t.id}`,
        createdAt: t.created_at,
        likes: t.public_metrics?.like_count || 0,
        retweets: t.public_metrics?.retweet_count || 0,
      })),
      scannedAt: new Date().toISOString(),
    };

    cache.set(cacheKey, result);
    return result;
  } catch (err) {
    return { error: err.response?.data?.detail || err.message, exchange, handle: `@${handle}` };
  }
}

module.exports = { scanGiveaways };