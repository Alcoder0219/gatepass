import http from 'node:http';
import app from './app.js';
import env from './config/env.js';
import logger from './utils/logger.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { initSocket } from './services/socket.service.js';
import { startJobs, stopJobs } from './jobs/index.js';

const server = http.createServer(app);

const bootstrap = async () => {
  await connectDatabase();
  initSocket(server);
  startJobs();

  server.listen(env.port, () => {
    logger.info(`GatePass Pro API listening on http://localhost:${env.port}${env.apiPrefix}`);
    logger.info(`Environment: ${env.nodeEnv} | CORS origin: ${env.clientUrl}`);
  });
};

/* ─── Graceful shutdown ──────────────────────────────────────────────────── */
const shutdown = async (signal) => {
  logger.info(`${signal} received — shutting down gracefully`);
  stopJobs();
  server.close(async () => {
    await disconnectDatabase();
    logger.info('Shutdown complete');
    process.exit(0);
  });
  // Don't hang forever on an in-flight request.
  setTimeout(() => process.exit(1), 10_000).unref();
};

['SIGTERM', 'SIGINT'].forEach((signal) => process.on(signal, () => shutdown(signal)));

process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled rejection: ${reason?.message ?? reason}`, { stack: reason?.stack });
});

process.on('uncaughtException', (error) => {
  logger.error(`Uncaught exception: ${error.message}`, { stack: error.stack });
  process.exit(1);
});

bootstrap().catch((error) => {
  logger.error(`Failed to start the server: ${error.message}`, { stack: error.stack });
  process.exit(1);
});

export default server;
