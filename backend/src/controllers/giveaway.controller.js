/**
 * backend/src/controllers/giveaway.controller.js
 *
 * Routes:
 *   GET  /api/giveaways           → paginated list (public)
 *   GET  /api/giveaways/stats     → per-exchange counts (public)
 *   POST /api/giveaways/scan      → trigger live scan (admin only)
 */

const Giveaway                              = require('../models/Giveaway');
const { scanAndStoreGiveaways, CEX_ACCOUNTS } = require('../services/twitter');
const { success, error }                    = require('../../utils/response');
const logger                                = require('../../utils/logger');

// ─── GET /api/giveaways ───────────────────────────────────────────────────────
const getGiveaways = async (req, res) => {
  try {
    const {
      exchange      = 'all',
      minConfidence = '0.3',
      sort          = 'confidence',   // confidence | recent | prize
      limit         = '20',
      page          = '1',
    } = req.query;

    const query = {
      isActive:   true,
      confidence: { $gte: parseFloat(minConfidence) },
    };

    if (exchange && exchange !== 'all') {
      query.exchange = exchange.toLowerCase();
    }

    const sortMap = {
      confidence: { confidence: -1, tweetCreatedAt: -1 },
      recent:     { tweetCreatedAt: -1 },
      prize:      { prizeAmountUSD: -1, confidence: -1 },
    };
    const sortOrder = sortMap[sort] || sortMap.confidence;

    const limitNum = Math.min(parseInt(limit), 50);
    const pageNum  = Math.max(parseInt(page), 1);
    const skip     = (pageNum - 1) * limitNum;

    const [giveaways, total] = await Promise.all([
      Giveaway.find(query).sort(sortOrder).skip(skip).limit(limitNum).lean(),
      Giveaway.countDocuments(query),
    ]);

    const lastScanDoc = await Giveaway
      .findOne({})
      .sort({ scannedAt: -1 })
      .select('scannedAt')
      .lean();

    const exchanges = Object.values(CEX_ACCOUNTS).map(a => ({
      key:    a.exchange,
      name:   a.displayName,
      handle: a.primaryHandle,
      color:  a.color,
    }));

    return success(res, {
      giveaways,
      pagination: {
        total,
        page:  pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
      },
      lastScan:  lastScanDoc?.scannedAt || null,
      exchanges,
    });
  } catch (err) {
    logger.error('[Giveaway] getGiveaways error:', err);
    return error(res, 'Failed to fetch giveaways', 500);
  }
};

// ─── GET /api/giveaways/stats ─────────────────────────────────────────────────
const getGiveawayStats = async (req, res) => {
  try {
    const stats = await Giveaway.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id:           '$exchange',
          count:         { $sum: 1 },
          avgConfidence: { $avg: '$confidence' },
          highConfCount: { $sum: { $cond: [{ $gte: ['$confidence', 0.6] }, 1, 0] } },
          displayName:   { $first: '$exchangeDisplayName' },
          latestTweet:   { $max:  '$tweetCreatedAt' },
        },
      },
      { $sort: { count: -1 } },
    ]);

    const totalActive = stats.reduce((acc, s) => acc + s.count, 0);
    const lastScanDoc = await Giveaway
      .findOne({})
      .sort({ scannedAt: -1 })
      .select('scannedAt')
      .lean();

    return success(res, {
      stats,
      totalActive,
      lastScan: lastScanDoc?.scannedAt || null,
    });
  } catch (err) {
    logger.error('[Giveaway] getGiveawayStats error:', err);
    return error(res, 'Failed to fetch giveaway stats', 500);
  }
};

// ─── POST /api/giveaways/scan (admin only) ────────────────────────────────────
const triggerScan = async (req, res) => {
  const { exchange } = req.query;

  if (!process.env.TWITTER_BEARER_TOKEN) {
    return error(res, 'TWITTER_BEARER_TOKEN not configured on server', 503);
  }

  try {
    logger.info(`[Giveaway] Admin triggered scan — exchange: ${exchange || 'all'}`);
    const result = await scanAndStoreGiveaways({ exchangeFilter: exchange });

    if (result.rateLimited) {
      return error(res, 'Twitter API rate limit hit — try again in 15 minutes', 429);
    }

    return success(res, {
      ...result,
      message: `Scan complete. ${result.added} new giveaways stored.`,
    });
  } catch (err) {
    logger.error('[Giveaway] triggerScan error:', err);
    return error(res, err.message || 'Scan failed', 500);
  }
};

module.exports = { getGiveaways, getGiveawayStats, triggerScan };