import logger from '../utils/logger.js';
import { runExpiryJob } from '../services/gatepass.service.js';
import { retryFailedEmails } from '../services/emailDispatch.service.js';

/**
 * Lightweight in-process scheduler. The expiry/reminder sweep is idempotent, so
 * running it every 5 minutes is safe; in a multi-instance deployment move this
 * to a single worker (or a proper queue) by setting JOBS_ENABLED=false here.
 */
const INTERVAL_MS = 5 * 60 * 1000;

let timer = null;

export const startJobs = () => {
  if (process.env.JOBS_ENABLED === 'false') {
    logger.info('Background jobs disabled by JOBS_ENABLED=false');
    return;
  }

  timer = setInterval(async () => {
    try {
      await runExpiryJob();
    } catch (error) {
      logger.error(`Expiry job failed: ${error.message}`);
    }

    /*
     * Email retry sweep — separate try/catch on purpose so a mail problem can
     * never stop the gate pass expiry sweep above, which is the job this
     * scheduler already existed to run.
     *
     * `retryFailedEmails` only picks up notifications still marked FAILED and
     * flips them to SENT on success, so a message that already went out can
     * never be sent twice.
     */
    try {
      await retryFailedEmails();
    } catch (error) {
      logger.error(`Email retry job failed: ${error.message}`);
    }
  }, INTERVAL_MS);

  timer.unref();
  logger.info(`Background jobs started (every ${INTERVAL_MS / 60000} min)`);
};

export const stopJobs = () => {
  if (timer) clearInterval(timer);
  timer = null;
};

export default { startJobs, stopJobs };
