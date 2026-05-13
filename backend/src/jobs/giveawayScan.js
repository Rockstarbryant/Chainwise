/**
 * backend/src/jobs/giveawayScan.js
 */

const cron                     = require('node-cron');
const { scanAndStoreGiveaways } = require('../services/twitter');
const logger                   = require('../../utils/logger');
const { withLock }             = require('../../utils/redisLock');

let scanJob = null;

function startGiveawayScanCron() {
  if (!process.env.TWITTER_BEARER_TOKEN) {
    logger.warn('[GiveawayScan] TWITTER_BEARER_TOKEN not set — giveaway cron disabled');
    return;
  }

  scanJob = cron.schedule('30 */2 * * *', async () => {
    await withLock('giveaway-scan', async () => {
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
  });

  logger.info('[GiveawayScan] Cron started — scanning every 2 hours at :30');

  // Initial scan
  setTimeout(async () => {
    await withLock('giveaway-scan', async () => {
      logger.info('[GiveawayScan] Running initial scan on startup…');
      try {
        const result = await scanAndStoreGiveaways();
        if (!result.rateLimited) {
          logger.info(`[GiveawayScan] Initial scan done — ${result.added} giveaways stored`);
        }
      } catch (err) {
        logger.warn('[GiveawayScan] Initial scan failed:', err.message);
      }
    });
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