import { env } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';
import { createApp } from './app.js';
import { startPoller, stopPoller } from './jobs/pollPendingJobs.js';
import { logger } from './utils/logger.js';

const start = async () => {
  await connectDB();
  const app = createApp();
  const server = app.listen(env.PORT, () => logger.info(`CineGen API listening on port ${env.PORT} (${env.NODE_ENV})`));
  if (env.ENABLE_POLLER) startPoller();

  const shutdown = (signal) => {
    logger.info(`${signal} received, shutting down gracefully`);
    stopPoller();
    server.close(async () => {
      await disconnectDB();
      logger.info('Shutdown complete');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (err) => logger.error({ err }, 'Unhandled rejection'));
};

start().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
