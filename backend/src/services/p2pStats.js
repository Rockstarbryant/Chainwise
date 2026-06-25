/**
 * backend/src/services/p2pStats.js
 *
 * Computes real P2P statistics from the P2PAd collection.
 * Used by admin panel to show dynamic p2p availability per exchange.
 */

const P2PAd = require('../models/P2PAd');
const logger = require('../../utils/logger');

async function getP2PStats(exchange) {
  try {
    const slug = exchange.toLowerCase();

    // Get recent ads (last 48 hours)
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

    const ads = await P2PAd.find({
      exchange: slug,
      fetchedAt: { $gte: twoDaysAgo }
    }).lean();

    if (ads.length === 0) {
      return {
        hasP2P: false,
        p2pCountries: [],
        totalAds: 0,
        supportedFiats: [],
        minAmountFiat: null,
        lastUpdated: null
      };
    }

    const fiats = [...new Set(ads.map(ad => ad.fiat))];
    const countries = fiats; // Assuming fiat ≈ country for now

    const minAmounts = ads
      .map(ad => ad.minAmount)
      .filter(amount => amount > 0);

    const minAmountFiat = minAmounts.length > 0 
      ? Math.min(...minAmounts) 
      : null;

    return {
      hasP2P: true,
      p2pCountries: countries,
      totalAds: ads.length,
      supportedFiats: fiats,
      minAmountFiat: minAmountFiat,
      lastUpdated: ads[0]?.fetchedAt || new Date(),
      sampleAdCount: ads.length
    };
  } catch (err) {
    logger.error(`[p2pStats] Error for ${exchange}: ${err.message}`);
    return {
      hasP2P: false,
      p2pCountries: [],
      totalAds: 0,
      supportedFiats: [],
      minAmountFiat: null,
      error: err.message
    };
  }
}

module.exports = { getP2PStats };