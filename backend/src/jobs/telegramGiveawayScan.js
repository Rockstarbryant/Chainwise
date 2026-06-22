/**
 * backend/src/jobs/telegramGiveawayScan.js
 *
 * Cron: scans all CEX Telegram channels for giveaway / airdrop posts
 * every 24 hours (at 00:30 server time).
 *
 * Uses the same Redis distributed-lock pattern as giveawayScan.js so
 * multiple server instances never run the scan simultaneously.
 *
 * Does NOT touch twitter.js or the X cron — fully independent.
 */

const cron                          = require('node-cron');
const { scanTelegramGiveaways }     = require('../services/telegramGiveaway');
const logger                        = require('../../utils/logger');
const { withLock }                  = require('../../utils/redisLock');

let scanJob = null;

function startTelegramGiveawayScanCron() {
  // Run once a day at 00:30 — well away from the X scan at :30 past even hours
  scanJob = cron.schedule('30 0 * * *', async () => {
    await withLock('telegram-giveaway-scan', async () => {
      logger.info('[TelegramGiveawayScan] Scheduled daily scan starting…');
      try {
        const result = await scanTelegramGiveaways();
        logger.info(
          `[TelegramGiveawayScan] Done — ${result.added} new, ${result.skipped} dup, ` +
          `${result.cacheHits} cache-hits — ${result.duration}ms`
        );
      } catch (err) {
        logger.error('[TelegramGiveawayScan] Cron error:', err.message);
      }
    });
  });

  logger.info('[TelegramGiveawayScan] Cron registered — runs daily at 00:30');

  // ── Run an initial scan 15 seconds after startup (non-blocking) ──────────
  setTimeout(async () => {
    await withLock('telegram-giveaway-scan', async () => {
      logger.info('[TelegramGiveawayScan] Running initial startup scan…');
      try {
        const result = await scanTelegramGiveaways();
        logger.info(
          `[TelegramGiveawayScan] Startup scan done — ${result.added} giveaways stored, ` +
          `${result.cacheHits} channels from cache`
        );
      } catch (err) {
        logger.warn('[TelegramGiveawayScan] Startup scan failed:', err.message);
      }
    });
  }, 15_000);
}

function stopTelegramGiveawayScanCron() {
  if (scanJob) {
    scanJob.stop();
    scanJob = null;
    logger.info('[TelegramGiveawayScan] Cron stopped');
  }
}

module.exports = { startTelegramGiveawayScanCron, stopTelegramGiveawayScanCron };