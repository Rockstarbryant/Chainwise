/**
 * backend/src/services/twitter.js
 */

const axios    = require('axios');
const logger   = require('../../utils/logger');
const Giveaway = require('../models/Giveaway');

// ─── CEX Account Registry ─────────────────────────────────────────────────────
const CEX_ACCOUNTS = {
  binance:   { exchange: 'binance',   displayName: 'Binance',    color: '#F0B90B', handles: ['binance', 'BinanceEnglish'],  primaryHandle: 'binance' },
  bybit:     { exchange: 'bybit',     displayName: 'Bybit',      color: '#F7A600', handles: ['Bybit_Official'],             primaryHandle: 'Bybit_Official' },
  kucoin:    { exchange: 'kucoin',    displayName: 'KuCoin',     color: '#24AE8F', handles: ['kucoincom'],                  primaryHandle: 'kucoincom' },
  bitget:    { exchange: 'bitget',    displayName: 'Bitget',     color: '#00CDD7', handles: ['bitgetglobal'],               primaryHandle: 'bitgetglobal' },
  gateio:    { exchange: 'gateio',    displayName: 'Gate.io',    color: '#2354E6', handles: ['gate_io'],                   primaryHandle: 'gate_io' },
  coinex:    { exchange: 'coinex',    displayName: 'CoinEx',     color: '#00A0E9', handles: ['CoinExcom'],                  primaryHandle: 'CoinExcom' },
  okx:       { exchange: 'okx',       displayName: 'OKX',        color: '#FFFFFF', handles: ['okx'],                       primaryHandle: 'okx' },
  htx:       { exchange: 'htx',       displayName: 'HTX',        color: '#34C1EB', handles: ['HTX_Global'],                primaryHandle: 'HTX_Global' },
  mexc:      { exchange: 'mexc',      displayName: 'MEXC',       color: '#00B897', handles: ['MEXC_Global'],               primaryHandle: 'MEXC_Global' },
  cryptocom: { exchange: 'cryptocom', displayName: 'Crypto.com', color: '#103F68', handles: ['cryptocom'],                 primaryHandle: 'cryptocom' },
};

// ─── Keyword Scoring Tables ───────────────────────────────────────────────────
const KW = {
  tier1:        ['giveaway', 'give away', 'airdrop', 'winner', 'winners', 'giveaways'],
  tier2:        ['win ', 'prize', 'promo', 'promotion', 'reward', 'rewards', 'jackpot', 'raffle'],
  tier3:        ['celebrate', 'celebrating', 'anniversary', 'listing', 'launch', 'milestone', 'lucky'],
  dollarPattern: /\$[\d,.]+/,
  coins:        ['USDT', 'USDC', 'BNB', 'BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'MATIC', 'AVAX', 'TRX', 'TON'],
  action:       ['follow', 'repost', 'retweet', 'reply', 'tag', 'like', 'share', 'comment', 'rt '],
  hashtags:     ['#giveaway', '#airdrop', '#crypto', '#win', '#prize', '#giveaways'],
};

const PRIZE_PATTERNS = [
  /\$[\d,]+(?:\.\d+)?\s*(?:USDT|USDC|BNB|BTC|ETH|SOL|worth)?/gi,
  /[\d,]+(?:\.\d+)?\s*(?:USDT|USDC|BNB|BTC|ETH|SOL)\b/g,
  /total\s+(?:prize|pool|reward)\s+of\s+\$?[\d,]+/gi,
  /prize\s+pool\s*:?\s*\$?[\d,]+/gi,
];

const TWITTER_API = 'https://api.twitter.com/2/tweets/search/recent';

// ─── Internal Helpers ─────────────────────────────────────────────────────────
function buildQuery(handles) {
  const fromParts = handles.map(h => `from:${h}`).join(' OR ');
  const kwParts   = ['giveaway', 'airdrop', 'winner', '"win "', 'prize', '#giveaway', '#airdrop'].join(' OR ');
  const query     = `(${fromParts}) (${kwParts}) -is:retweet`;
  return query.length > 512 ? null : query;
}

function scoreGiveaway(text) {
  const lower   = text.toLowerCase();
  let score     = 0;
  const matched = new Set();

  for (const kw of KW.tier1) { if (lower.includes(kw)) { score += 35; matched.add(kw); } }
  for (const kw of KW.tier2) { if (lower.includes(kw)) { score += 20; matched.add(kw); } }
  for (const kw of KW.tier3) { if (lower.includes(kw)) { score += 10; matched.add(kw); } }
  if (KW.dollarPattern.test(text))   { score += 15; matched.add('$amount'); }
  for (const coin of KW.coins)       { if (text.includes(coin)) { score += 12; matched.add(coin); break; } }
  for (const tag of KW.hashtags)     { if (lower.includes(tag)) { score += 8;  matched.add(tag); } }

  const actionHits = KW.action.filter(a => lower.includes(a));
  if (actionHits.length >= 2) { score += 15; matched.add('follow+action'); }

  const finalScore = Math.min(score, 100);
  return { score: finalScore, confidence: parseFloat((finalScore / 100).toFixed(2)), keywords: [...matched] };
}

function extractPrizePool(text) {
  for (const pattern of PRIZE_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[0]) return match[0].trim();
  }
  return null;
}

function parsePrizeAmount(prizePool) {
  if (!prizePool) return 0;
  const m = prizePool.match(/[\d,]+/);
  return m ? parseFloat(m[0].replace(/,/g, '')) : 0;
}

function extractCoins(text) {
  return KW.coins.filter(c => text.includes(c));
}

function extractHashtags(text) {
  return (text.match(/#\w+/g) || []).map(t => t.toLowerCase());
}

function extractRequirements(text) {
  const lower = text.toLowerCase();
  const reqs  = [];
  if (lower.includes('follow')) {
    const m = text.match(/follow\s+@[\w]+/gi);
    reqs.push({ type: 'follow', description: m?.[0] || 'Follow the account' });
  }
  if (lower.includes('repost') || lower.includes('retweet') || / rt /i.test(text)) {
    reqs.push({ type: 'repost', description: 'Repost / Retweet this post' });
  }
  if (lower.includes('reply') || lower.includes('comment')) {
    const m = text.match(/reply\s+with\s+.{5,40}/gi);
    reqs.push({ type: 'reply', description: m?.[0] || 'Reply to this post' });
  }
  if (lower.includes('tag') && (lower.includes('friend') || lower.includes(' @ '))) {
    reqs.push({ type: 'tag', description: 'Tag friends in comments' });
  }
  if (lower.includes(' like ') || lower.includes('like this')) {
    reqs.push({ type: 'like', description: 'Like this post' });
  }
  return reqs;
}

// ─── Public API ───────────────────────────────────────────────────────────────
async function fetchGiveawayTweets(options = {}) {
  const bearerToken = process.env.TWITTER_BEARER_TOKEN;
  if (!bearerToken) throw new Error('TWITTER_BEARER_TOKEN not configured');

  const { exchangeFilter = null, maxResults = 100 } = options;
  const accounts   = exchangeFilter
    ? [CEX_ACCOUNTS[exchangeFilter.toLowerCase()]].filter(Boolean)
    : Object.values(CEX_ACCOUNTS);

  if (!accounts.length) throw new Error(`Unknown exchange: ${exchangeFilter}`);

  const allHandles = accounts.flatMap(a => a.handles);
  const queries    = [];
  const query      = buildQuery(allHandles);

  if (!query) {
    for (let i = 0; i < allHandles.length; i += 5) {
      const q = buildQuery(allHandles.slice(i, i + 5));
      if (q) queries.push(q);
    }
  } else {
    queries.push(query);
  }

  const tweets  = [];
  const userMap = {};

  for (const q of queries) {
    logger.info(`[Twitter] Query (${q.length} chars): ${q.substring(0, 120)}...`);
    try {
      const res = await axios.get(TWITTER_API, {
        headers: { Authorization: `Bearer ${bearerToken}` },
        params:  {
          query:           q,
          max_results:     Math.min(maxResults, 100),
          'tweet.fields':  'created_at,author_id,public_metrics,text,entities',
          'user.fields':   'name,username,profile_image_url,verified',
          expansions:      'author_id',
        },
      });
      (res.data?.data            || []).forEach(t => tweets.push(t));
      (res.data?.includes?.users || []).forEach(u => { userMap[u.id] = u; });
    } catch (err) {
      if (err.response?.status === 429) {
        logger.warn('[Twitter] Rate limited — will use cached data this cycle');
        throw new Error('RATE_LIMITED');
      }
      logger.error('[Twitter] API error:', err.response?.data || err.message);
      throw err;
    }
  }

  logger.info(`[Twitter] Raw tweets fetched: ${tweets.length} across ${queries.length} queries`);
  return { tweets, userMap, accounts };
}

function processTweets(tweets, userMap, accounts, minConfidence = 0.3) {
  const handleToAccount = {};
  for (const acc of accounts) {
    for (const h of acc.handles) handleToAccount[h.toLowerCase()] = acc;
  }

  const results = [];
  for (const tweet of tweets) {
    const author = userMap[tweet.author_id];
    if (!author) continue;

    const account = handleToAccount[author.username?.toLowerCase()];
    if (!account) continue;

    const { score, confidence, keywords } = scoreGiveaway(tweet.text);
    if (confidence < minConfidence) continue;

    const prizePool    = extractPrizePool(tweet.text);
    const coins        = extractCoins(tweet.text);
    const requirements = extractRequirements(tweet.text);
    const hashtags     = extractHashtags(tweet.text);

    results.push({
      tweetId:             tweet.id,
      exchange:            account.exchange,
      exchangeHandle:      account.primaryHandle,
      exchangeDisplayName: account.displayName,
      tweetUrl:            `https://x.com/${author.username}/status/${tweet.id}`,
      tweetText:           tweet.text,
      authorName:          author.name,
      authorHandle:        author.username,
      prizePool:           prizePool || null,
      prizeAmountUSD:      parsePrizeAmount(prizePool),
      coins,
      requirements,
      requirementsRaw:     requirements.map(r => r.description),
      hashtags,
      confidence,
      confidenceScore:     score,
      keywordsMatched:     keywords,
      isVerifiedGiveaway:  confidence >= 0.6,
      likeCount:           tweet.public_metrics?.like_count       || 0,
      retweetCount:        tweet.public_metrics?.retweet_count    || 0,
      replyCount:          tweet.public_metrics?.reply_count      || 0,
      impressionCount:     tweet.public_metrics?.impression_count || 0,
      tweetCreatedAt:      new Date(tweet.created_at),
      scannedAt:           new Date(),
      expiresAt:           new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      isActive:            true,
    });
  }

  logger.info(`[Twitter] Processed ${results.length} / ${tweets.length} tweets above threshold`);
  return results;
}

async function scanAndStoreGiveaways(options = {}) {
  const t0 = Date.now();

  let tweets, userMap, accounts;
  try {
    ({ tweets, userMap, accounts } = await fetchGiveawayTweets(options));
  } catch (err) {
    if (err.message === 'RATE_LIMITED') return { rateLimited: true };
    throw err;
  }

  const processed = processTweets(tweets, userMap, accounts);
  let added = 0, skipped = 0, errors = 0;

  for (const doc of processed) {
    try {
      await Giveaway.findOneAndUpdate(
        { tweetId: doc.tweetId },
        { $set: doc },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      added++;
    } catch (err) {
      if (err.code === 11000) skipped++;
      else { errors++; logger.error(`[Twitter] Store error tweet ${doc.tweetId}:`, err.message); }
    }
  }

  await Giveaway.updateMany(
    { tweetCreatedAt: { $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    { $set: { isActive: false } }
  );

  const duration = Date.now() - t0;
  logger.info(`[Twitter] Scan done: ${added} added, ${skipped} dup, ${errors} err — ${duration}ms`);
  return { total: processed.length, added, skipped, errors, duration };
}

/**
 * getGiveawaysForAgent
 * Called by the AI agent executor — reads ONLY from MongoDB cache.
 * Never makes a live Twitter API call.
 */
async function getGiveawaysForAgent(exchange = null) {
  const query = { isActive: true, confidence: { $gte: 0.3 } };
  if (exchange) query.exchange = exchange.toLowerCase();

  const docs = await Giveaway
    .find(query)
    .sort({ confidence: -1, tweetCreatedAt: -1 })
    .limit(10)
    .lean();

  if (!docs.length) {
    return {
      found:   false,
      message: 'No active giveaways in cache. A background scan runs every 2 hours.',
    };
  }

  return {
    found:     true,
    count:     docs.length,
    giveaways: docs.map(g => ({
      exchange:     g.exchangeDisplayName,
      tweetUrl:     g.tweetUrl,
      prizePool:    g.prizePool || 'Prize not specified',
      coins:        g.coins,
      requirements: g.requirementsRaw?.length ? g.requirementsRaw : ['Check the tweet for details'],
      postedAt:     g.tweetCreatedAt,
      confidence:   `${Math.round(g.confidence * 100)}%`,
      likes:        g.likeCount,
      retweets:     g.retweetCount,
    })),
  };
}

module.exports = {
  CEX_ACCOUNTS,
  fetchGiveawayTweets,
  processTweets,
  scanAndStoreGiveaways,
  getGiveawaysForAgent,
};