/**
 * backend/src/services/telegramGiveaway.js
 *
 * Fetches giveaway/airdrop posts from official CEX Telegram channels using
 * the MTProto-free Telegram Bot API (t.me channel message polling via
 * the getUpdates / forwardMessage workaround is NOT used here).
 *
 * Instead we use the public channel RSS-style endpoint available through
 * the unofficial Telegram channel export:
 *   https://t.me/s/<channel_username>
 * This endpoint returns an HTML page that we scrape — no API key required,
 * no user account, completely free.
 *
 * Scanning strategy
 * ─────────────────
 * 1. For each known exchange channel we fetch https://t.me/s/<handle>
 * 2. We parse the raw HTML to extract message text + metadata
 * 3. We run the same keyword scoring logic as twitter.js
 * 4. Qualifying posts are upserted into the Giveaway collection with
 *    source = 'telegram'
 *
 * Caching
 * ───────
 * Results are Redis-cached for 23 hours so the 24-hour cron never
 * hammers Telegram. On cache-hit the DB upsert is skipped (data already
 * stored from the previous fetch).
 *
 * NOTE: We intentionally DO NOT touch the twitter.js file or its exports.
 */

const axios    = require('axios');
const cheerio  = require('cheerio');          // html parser
const logger   = require('../../utils/logger');
const Giveaway = require('../models/Giveaway');
const { cacheGet, cacheSet } = require('../config/redis');

// ─── CEX Telegram Channel Registry ───────────────────────────────────────────
// Verified official channels as of 2025. Only public (t.me/s/) channels work.
const TELEGRAM_CEX_CHANNELS = {
  binance: {
    exchange:      'binance',
    displayName:   'Binance',
    color:         '#F0B90B',
    handle:        'binance_announcements',   // t.me/binance_announcements
    altHandles:    ['BinanceExchange'],
  },
  bybit: {
    exchange:      'bybit',
    displayName:   'Bybit',
    color:         '#F7A600',
    handle:        'Bybit_Announcements',
    altHandles:    [],
  },
  kucoin: {
    exchange:      'kucoin',
    displayName:   'KuCoin',
    color:         '#24AE8F',
    handle:        'KuCoin_News',
    altHandles:    [],
  },
  bitget: {
    exchange:      'bitget',
    displayName:   'Bitget',
    color:         '#00CDD7',
    handle:        'Bitget_announcements',
    altHandles:    [],
  },
  gateio: {
    exchange:      'gateio',
    displayName:   'Gate.io',
    color:         '#2354E6',
    handle:        'GateioMiniAppAnn',
    altHandles:    [],
  },
  coinex: {
    exchange:      'coinex',
    displayName:   'CoinEx',
    color:         '#00A0E9',
    handle:        'CoinEx_Announcement',
    altHandles:    [],
  },
  okx: {
    exchange:      'okx',
    displayName:   'OKX',
    color:         '#FFFFFF',
    handle:        'OKXAnnouncements',
    altHandles:    [],
  },
  htx: {
    exchange:      'htx',
    displayName:   'HTX',
    color:         '#34C1EB',
    handle:        'HTXGlobalAnnouncementChannel',
    altHandles:    [],
  },
  mexc: {
    exchange:      'mexc',
    displayName:   'MEXC',
    color:         '#00B897',
    handle:        'MEXC_OfficialAnnouncements',
    altHandles:    [],
  },
  cryptocom: {
    exchange:      'cryptocom',
    displayName:   'Crypto.com',
    color:         '#103F68',
    handle:        'CryptoComOfficial',
    altHandles:    [],
  },
};

// ─── Keyword Scoring (mirrors twitter.js KW tables) ──────────────────────────
const KW = {
  tier1:        ['giveaway', 'give away', 'airdrop', 'winner', 'winners', 'giveaways', 'vouchers', 'token voucher', 'share'],
  tier2:        ['win ', 'prize', 'promo', 'promotion', 'campaign', 'event', 'bonus', 'reward', 'rewards', 'jackpot', 'raffle', 'quest', 'contest', 'competition', 'challenge', 'free', 'claim', 'claimable'],
  tier3:        ['celebrate', 'celebrating', 'anniversary', 'listing', 'launch', 'milestone', 'lucky', 'trading', 'traders', 'trader', 'trading competition', 'trading contest', 'trading challenge'],
  dollarPattern: /\$[\d,.]+/,
  coins:        ['USDT', 'USDC', 'BNB', 'BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'MATIC', 'AVAX', 'TRX', 'TON'],
  action:       ['follow', 'repost', 'retweet', 'reply', 'tag', 'like', 'share', 'comment', 'subscribe', 'join'],
  hashtags:     ['#giveaway', '#airdrop', '#crypto', '#win', '#prize', '#giveaways'],
};

const PRIZE_PATTERNS = [
  /\$[\d,]+(?:\.\d+)?\s*(?:USDT|USDC|BNB|BTC|ETH|SOL|worth)?/gi,
  /[\d,]+(?:\.\d+)?\s*(?:USDT|USDC|BNB|BTC|ETH|SOL)\b/g,
  /total\s+(?:prize|pool|reward)\s+of\s+\$?[\d,]+/gi,
  /prize\s+pool\s*:?\s*\$?[\d,]+/gi,
];

// ─── Scoring helpers (same logic as twitter.js) ───────────────────────────────
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
  if (actionHits.length >= 2) { score += 25; matched.add('join+action'); }

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
  if (lower.includes('follow') || lower.includes('subscribe')) {
    reqs.push({ type: 'follow', description: 'Follow / Subscribe to the channel' });
  }
  if (lower.includes('repost') || lower.includes('forward') || lower.includes('share')) {
    reqs.push({ type: 'repost', description: 'Repost / Forward this message' });
  }
  if (lower.includes('reply') || lower.includes('comment')) {
    const m = text.match(/reply\s+with\s+.{5,40}/gi);
    reqs.push({ type: 'reply', description: m?.[0] || 'Reply / Comment on this post' });
  }
  if (lower.includes('tag') && (lower.includes('friend') || lower.includes('@'))) {
    reqs.push({ type: 'tag', description: 'Tag friends' });
  }
  if (lower.includes(' like ') || lower.includes('like this') || lower.includes('react')) {
    reqs.push({ type: 'like', description: 'Like / React to this post' });
  }
  if (lower.includes('join') && (lower.includes('group') || lower.includes('channel'))) {
    reqs.push({ type: 'other', description: 'Join the Telegram group/channel' });
  }
  return reqs;
}

// ─── HTML Scraper for t.me/s/<channel> ───────────────────────────────────────
/**
 * Fetches the latest ~20 messages from a public Telegram channel
 * using the web preview endpoint (https://t.me/s/<handle>).
 *
 * Returns an array of { messageId, text, date, postUrl }
 */
async function fetchChannelMessages(handle) {
  const url = `https://t.me/s/${handle}`;

  try {
    const res = await axios.get(url, {
      timeout: 15_000,
      headers: {
        // Mimic a browser so Telegram serves the full rendered page
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept':
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      },
    });

    const $ = cheerio.load(res.data);
    const messages = [];

    // Telegram web preview wraps each post in .tgme_widget_message_wrap
    $('.tgme_widget_message_wrap').each((_, el) => {
      const msgEl  = $(el).find('.tgme_widget_message');
      const rawId  = msgEl.attr('data-post') || '';           // "channel/12345"
      const msgId  = rawId.split('/').pop() || '';

      // Text lives in .tgme_widget_message_text (may have inner <br>, <a> etc.)
      const textEl = $(el).find('.tgme_widget_message_text');
      const htmlContent = textEl.html() || '';  // Keep raw HTML for links

      // Extract clickable links
      const links = [];
      textEl.find('a').each((_, a) => {
        const href = $(a).attr('href');
        const textLink = $(a).text().trim();
        if (href) links.push({ text: textLink || href, url: href });
      });


      const text   = textEl.text().replace(/\s+/g, ' ').trim();

      // Date — <time> element with datetime attribute
      const timeEl  = $(el).find('time');
      const dateStr = timeEl.attr('datetime') || '';
      const date    = dateStr ? new Date(dateStr) : new Date();

      const postUrl = `https://t.me/${handle}/${msgId}`;

      if (text && msgId) {
        messages.push({
        messageId: `${handle}_${msgId}`,
        text,
        htmlContent,           // NEW
        links,                 // NEW - array of {text, url}
        date,
        postUrl: `https://t.me/${handle}/${msgId}`,
        handle
      });
      }
    });

    return messages;
  } catch (err) {
    logger.warn(`[TelegramGiveaway] Failed to fetch channel @${handle}: ${err.message}`);
    return [];
  }
}

// ─── Main scan function ───────────────────────────────────────────────────────
/**
 * Scans all (or one) CEX Telegram channels, scores messages, upserts to DB.
 * Results are Redis-cached per channel for 23 h to avoid hammering Telegram.
 */
async function scanTelegramGiveaways(options = {}) {
  const { exchangeFilter = null, minConfidence = 0.3, bypassCache = false } = options;
  const t0 = Date.now();

  const channels = exchangeFilter
    ? [TELEGRAM_CEX_CHANNELS[exchangeFilter.toLowerCase()]].filter(Boolean)
    : Object.values(TELEGRAM_CEX_CHANNELS);

  if (!channels.length) {
    throw new Error(`Unknown exchange for Telegram filter: ${exchangeFilter}`);
  }

  let added = 0, skipped = 0, errors = 0, cacheHits = 0;

  for (const channel of channels) {
    const cacheKey = `tg_scan:${channel.handle}`;

    // ── Cache check ──────────────────────────────────────────────────────────
    if (!bypassCache) {
      const cached = await cacheGet(cacheKey);
      if (cached) {
        logger.info(`[TelegramGiveaway] Cache hit for @${channel.handle} — skipping fetch`);
        cacheHits++;
        continue;
      }
    }

    logger.info(`[TelegramGiveaway] Scanning @${channel.handle} (${channel.displayName})`);
    const messages = await fetchChannelMessages(channel.handle);
    logger.info(`[TelegramGiveaway] @${channel.handle} → ${messages.length} messages fetched`);

    const qualified = [];

    for (const msg of messages) {
      const { score, confidence, keywords } = scoreGiveaway(msg.text);
      if (confidence < minConfidence) continue;

      const prizePool    = extractPrizePool(msg.text);
      const coins        = extractCoins(msg.text);
      const requirements = extractRequirements(msg.text);
      const hashtags     = extractHashtags(msg.text);

      const doc = {
        tweetId:             msg.messageId,          // re-use tweetId field as unique ID
        source:              'telegram',
        exchange:            channel.exchange,
        exchangeHandle:      channel.handle,
        exchangeDisplayName: channel.displayName,
        tweetUrl:            msg.postUrl,
        tweetText:           msg.text,
        telegramHtml:        msg.htmlContent,   // NEW field
        embeddedLinks:       msg.links || [],  // NEW
        authorName:          channel.displayName,
        authorHandle:        channel.handle,
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
        likeCount:           0,
        retweetCount:        0,
        replyCount:          0,
        impressionCount:     0,
        tweetCreatedAt:      msg.date,
        scannedAt:           new Date(),
        expiresAt:           new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        isActive:            true,
      };

      qualified.push(doc);
    }

    // ── Upsert to MongoDB ────────────────────────────────────────────────────
    for (const doc of qualified) {
      try {
        await Giveaway.findOneAndUpdate(
          { tweetId: doc.tweetId },
          { $set: doc },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        added++;
      } catch (err) {
        if (err.code === 11000) skipped++;
        else {
          errors++;
          logger.error(`[TelegramGiveaway] Store error ${doc.tweetId}:`, err.message);
        }
      }
    }

    // ── Cache the fact that we scanned this channel (23 h TTL) ───────────────
    await cacheSet(cacheKey, { scannedAt: new Date().toISOString(), count: qualified.length }, 23 * 60 * 60);
    logger.info(`[TelegramGiveaway] @${channel.handle} → ${qualified.length} qualifying posts stored`);
  }

  // Mark old posts inactive (older than 7 days, telegram source only)
  await Giveaway.updateMany(
    {
      source: 'telegram',
      tweetCreatedAt: { $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
    { $set: { isActive: false } }
  );

  const duration = Date.now() - t0;
  logger.info(
    `[TelegramGiveaway] Scan done: ${added} added, ${skipped} dup, ${errors} err, ${cacheHits} cache-hits — ${duration}ms`
  );

  return { total: added + skipped, added, skipped, errors, cacheHits, duration, source: 'telegram' };
}

/**
 * getGiveawaysForAgent (telegram)
 * Read-only from MongoDB cache — mirrors twitter.js equivalent.
 */
async function getTelegramGiveawaysForAgent(exchange = null) {
  const query = { isActive: true, source: 'telegram', confidence: { $gte: 0.3 } };
  if (exchange) query.exchange = exchange.toLowerCase();

  const docs = await Giveaway
    .find(query)
    .sort({ confidence: -1, tweetCreatedAt: -1 })
    .limit(10)
    .lean();

  if (!docs.length) {
    return {
      found:   false,
      message: 'No active Telegram giveaways in cache. Scans run every 24 hours.',
    };
  }

  return {
    found:     true,
    count:     docs.length,
    giveaways: docs.map(g => ({
      exchange:     g.exchangeDisplayName,
      postUrl:      g.tweetUrl,
      prizePool:    g.prizePool || 'Prize not specified',
      coins:        g.coins,
      requirements: g.requirementsRaw?.length ? g.requirementsRaw : ['Check the post for details'],
      postedAt:     g.tweetCreatedAt,
      confidence:   `${Math.round(g.confidence * 100)}%`,
      source:       'telegram',
      exampleSteps: generateExampleSteps(g),
    })),
  };
}

module.exports = {
  TELEGRAM_CEX_CHANNELS,
  scanTelegramGiveaways,
  getTelegramGiveawaysForAgent,
};