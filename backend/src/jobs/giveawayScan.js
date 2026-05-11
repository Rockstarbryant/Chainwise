/**
 * backend/src/jobs/giveawayScan.js
 *
 * Schedules a background scan every 2 hours.
 * Keeps giveaway data fresh without hammering the Twitter API.
 *
 * Mounted in server.js after MongoDB is up:
 *   const { startGiveawayScanCron, stopGiveawayScanCron } = require('./jobs/giveawayScan');
 *   startGiveawayScanCron();
 *
 *   // In graceful shutdown:
 *   stopGiveawayScanCron();
 */

const cron                     = require('node-cron');
const { scanAndStoreGiveaways } = require('../services/twitter');
const logger                   = require('../../utils/logger');

let scanJob = null;

function startGiveawayScanCron() {
  if (!process.env.TWITTER_BEARER_TOKEN) {
    logger.warn('[GiveawayScan] TWITTER_BEARER_TOKEN not set — giveaway cron disabled');
    return;
  }

  // Every 2 hours at minute 30 — offset from the main hourly sync
  // "30 */2 * * *" = 00:30, 02:30, 04:30 … 22:30
  scanJob = cron.schedule('30 */2 * * *', async () => {
    logger.info('[GiveawayScan] Scheduled scan starting…');
    try {
      const result = await scanAndStoreGiveaways();
      if (result.rateLimited) {
        logger.warn('[GiveawayScan] Rate limited — skipping this cycle');
      } else {
        logger.info(`[GiveawayScan] Done — ${result.added} new, ${result.skipped} dup`);
      }
    } catch (err) {
      logger.error('[GiveawayScan] Cron error:', err.message);
    }
  });

  logger.info('[GiveawayScan] Cron started — scanning every 2 hours at :30');

  // Run an initial scan 8 seconds after startup (after BullMQ + MongoDB settle)
  setTimeout(async () => {
    logger.info('[GiveawayScan] Running initial scan on startup…');
    try {
      const result = await scanAndStoreGiveaways();
      if (!result.rateLimited) {
        logger.info(`[GiveawayScan] Initial scan done — ${result.added} giveaways stored`);
      }
    } catch (err) {
      logger.warn('[GiveawayScan] Initial scan failed (will retry on next cycle):', err.message);
    }
  }, 8_000);
}

function stopGiveawayScanCron() {
  if (scanJob) {
    scanJob.stop();
    scanJob = null;
    logger.info('[GiveawayScan] Cron stopped');
  }
}

module.exports = { startGiveawayScanCron, stopGiveawayScanCron };