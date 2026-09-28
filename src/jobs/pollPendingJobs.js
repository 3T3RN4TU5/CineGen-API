import { pollPendingGenerations } from '../services/generation.service.js';
import { logger } from '../utils/logger.js';

const INTERVAL_MS = 60 * 1000;
let timer = null;
let running = false;

/**
 * Fallback for missed webhooks: every 60s, check jobs processing for over a minute with fal,
 * and fail + refund those older than JOB_TIMEOUT_MINUTES. Runs in-process (Render free tier).
 */
export const startPoller = () => {
  if (timer) return;
  timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const { checked } = await pollPendingGenerations();
      if (checked) logger.info({ checked }, 'Poller checked pending generations');
    } catch (err) {
      logger.error({ err }, 'Poller run failed');
    } finally {
      running = false;
    }
  }, INTERVAL_MS);
  timer.unref();
  logger.info('Pending-job poller started');
};

export const stopPoller = () => {
  clearInterval(timer);
  timer = null;
};
