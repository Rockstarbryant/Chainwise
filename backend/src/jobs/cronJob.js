const cron   = require('node-cron');
const logger = require('../../utils/logger');
const ExchangeApiKey  = require('../models/ExchangeApiKey');
const { queueAllExchanges } = require('./syncQueue');
const { withLock } = require('../../utils/redisLock');

let cronInstance = null;

const startCron = () => {
  if (cronInstance) return;

  cronInstance = cron.schedule('0 * * * *', async () => {
    logger.info('[cron] Hourly exchange sync triggered');

    await withLock('exchange-sync', async () => {
      try {
        const adminIds = await ExchangeApiKey.distinct('adminUserId', {
          isValid:  true,
          autoSync: true,
        });

        if (adminIds.length === 0) {
          logger.info('[cron] No valid API keys found — skipping sync');
          return;
        }

        for (const adminUserId of adminIds) {
          const jobs = await queueAllExchanges(adminUserId);
          logger.info(`[cron] Queued ${jobs.length} sync jobs for admin ${adminUserId}`);
        }
      } catch (err) {
        logger.error(`[cron] Sync cron failed: ${err.message}`);
      }
    });
  });

  logger.info('[cron] Exchange sync cron scheduled (every hour)');
};

const stopCron = () => {
  if (cronInstance) {
    cronInstance.stop();
    cronInstance = null;
    logger.info('[cron] Cron stopped');
  }
};

module.exports = { startCron, stopCron };