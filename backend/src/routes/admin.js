const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/admin.controller');
const { requireAdmin } = require('../middlewares/auth');
const { getExchangeInfo } = require('../services/coingecko');
const ExchangeFee = require('../models/ExchangeFee');
const { getP2PStats } = require('../services/p2pStats');
const { success, error: sendError } = require('../../utils/response');


// All admin routes require authenticated admin user
router.use(requireAdmin);

router.get('/fees',                           controller.getAllFees);


// GET /api/admin/fees/:exchange/info — fetch exchange info + CoinGecko enrichment
router.get('/fees/:exchange/info', async (req, res, next) => {
  try {
    const slug = req.params.exchange.toLowerCase();
    const doc = await ExchangeFee.findOne({ exchange: slug }).lean();
    if (!doc) return sendError(res, `Exchange '${slug}' not found`, 404);

    // Optionally fetch fresh CG data here (or just use DB)
    let cgData = null;
    let cgError = null;
    try {
      const fresh = await getExchangeInfo(slug);
      if (!fresh.error) cgData = fresh;
    } catch (e) {
      cgError = e.message;
    }

     // Get dynamic P2P stats from actual ads
    const p2pStats = await getP2PStats(slug);

    return success(res, {
      exchange:        doc.exchange,
      displayName:     doc.displayName,
      website:         doc.website,
      twitterHandle:   doc.twitterHandle,
      description:     doc.description,
      country:         doc.country,
      yearEstablished: doc.yearEstablished,
      image:           doc.image,
      trustScore:      doc.trustScore,
      trustScoreRank:  doc.trustScoreRank,
      centralized:     doc.centralized,
      cgTotalCoins:    doc.cgTotalCoins,
      cgTotalPairs:    doc.cgTotalPairs,
      cgVolume24hBTC:  doc.cgVolume24hBTC,
      cgLastEnriched:  doc.cgLastEnriched,
      p2p:             doc.p2p || p2pStats.hasP2P,
      p2pCountries:    doc.p2pCountries?.length ? doc.p2pCountries : p2pStats.p2pCountries,
      p2pStats,  // dynamic real-time stats from ads
      coinsInDB:       doc.coins?.length ?? 0,
      lastUpdated:     doc.lastUpdated,
      dataSource:      doc.dataSource,
    });
  } catch (err) { next(err); }
});
// POST /api/admin/fees/:exchange/enrich — fetch from CoinGecko and save to DB
router.post('/fees/:exchange/enrich', async (req, res, next) => {
  try {
    const slug = req.params.exchange.toLowerCase();

    const doc = await ExchangeFee.findOne({ exchange: slug });
    if (!doc) return sendError(res, `Exchange '${slug}' not found`, 404);

    const cgData = await getExchangeInfo(slug);
    if (cgData.error) return sendError(res, `CoinGecko: ${cgData.error}`, 400);

    // Save CoinGecko fields to DB
    doc.website           = cgData.website       || doc.website;
    doc.twitterHandle     = cgData.twitterHandle  || doc.twitterHandle;
    doc.description       = cgData.description    || doc.description;
    doc.country           = cgData.country        || doc.country;
    doc.yearEstablished   = cgData.yearEstablished || doc.yearEstablished;
    doc.image             = cgData.image          || doc.image;
    doc.trustScore        = cgData.trustScore;
    doc.trustScoreRank    = cgData.trustScoreRank;
    doc.centralized       = cgData.centralized;
    doc.cgTotalCoins      = cgData.totalCoins;
    doc.cgTotalPairs      = cgData.totalPairs;
    doc.cgVolume24hBTC    = cgData.volume24hBTC;
    doc.cgLastEnriched    = new Date();
    doc.lastUpdated       = new Date();

    await doc.save();

    return success(res, {
      exchange: slug,
      enriched: {
        website:        doc.website,
        twitterHandle:  doc.twitterHandle,
        country:        doc.country,
        trustScore:     doc.trustScore,
        trustScoreRank: doc.trustScoreRank,
        image:          doc.image,
        cgLastEnriched: doc.cgLastEnriched,
      },
    });
  } catch (err) { next(err); }
});

// POST /api/admin/fees/enrich-all
router.post('/fees/enrich-all', async (req, res, next) => {
  try {
    const exchanges = await ExchangeFee.find({}, 'exchange').lean();
    const results   = [];

    for (const ex of exchanges) {
      try {
        const cgData = await getExchangeInfo(ex.exchange);
        if (cgData.error) {
          results.push({ exchange: ex.exchange, status: 'skipped', reason: cgData.error });
          continue;
        }

        await ExchangeFee.findOneAndUpdate(
          { exchange: ex.exchange },
          {
            website:         cgData.website       || undefined,
            twitterHandle:   cgData.twitterHandle  || undefined,
            description:     cgData.description    || undefined,
            country:         cgData.country        || undefined,
            yearEstablished: cgData.yearEstablished || undefined,
            image:           cgData.image          || undefined,
            trustScore:      cgData.trustScore,
            trustScoreRank:  cgData.trustScoreRank,
            centralized:     cgData.centralized,
            cgTotalCoins:    cgData.totalCoins,
            cgTotalPairs:    cgData.totalPairs,
            cgVolume24hBTC:  cgData.volume24hBTC,
            cgLastEnriched:  new Date(),
            lastUpdated:     new Date(),
          }
        );

        results.push({ exchange: ex.exchange, status: 'enriched' });

        // Rate limit — CoinGecko free tier is 30 req/min
        await new Promise(r => setTimeout(r, 2200));
      } catch (err) {
        results.push({ exchange: ex.exchange, status: 'error', reason: err.message });
      }
    }

    return success(res, { results, total: exchanges.length });
  } catch (err) { next(err); }
});
router.patch('/fees/:exchange',               controller.updateExchange);
router.post('/fees/:exchange/:coin/networks', controller.addNetwork);
router.patch('/fees/:exchange/:coin/:chain',  controller.updateNetwork);
router.delete('/fees/:exchange/:coin/:chain', controller.removeNetwork);

module.exports = router;