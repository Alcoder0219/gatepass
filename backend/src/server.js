import http from 'node:http';
import app from './app.js';
import env from './config/env.js';
import logger from './utils/logger.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { initSocket } from './services/socket.service.js';
import { startJobs, stopJobs } from './jobs/index.js';

const server = http.createServer(app);

// Cloud Run connects to the container on 0.0.0.0:$PORT — bind explicitly.
const HOST = '0.0.0.0';

/**
 * Connect to MongoDB in the BACKGROUND with retry/backoff. Deliberately NOT
 * awaited before `server.listen`: on Cloud Run the container must open the port
 * quickly or the start probe times out. If Mongo is briefly unreachable (Atlas
 * IP allow-list, cold DNS, transient network) the HTTP server stays up, the
 * error is logged in full, and we retry — instead of the whole container dying.
 * Mongoose buffers queries until the connection is ready, so early requests wait
 * rather than fail.
 */
const connectWithRetry = async (attempt = 1) => {
  try {
    logger.info(`[BOOT] Connecting MongoDB (attempt ${attempt})...`);
    await connectDatabase();
    logger.info('[BOOT] MongoDB connected.');
  } catch (error) {
    const delayMs = Math.min(30_000, 2_000 * attempt);
    logger.error(`[BOOT] MongoDB connection failed: ${error.message}`, { stack: error.stack });
    logger.warn(`[BOOT] Retrying MongoDB in ${delayMs / 1000}s — HTTP server stays up.`);
    setTimeout(() => connectWithRetry(attempt + 1), delayMs).unref();
  }
};

const bootstrap = async () => {
  logger.info('[BOOT] Loading environment...');
  logger.info(`[BOOT] Environment loaded. NODE_ENV=${env.nodeEnv} PORT=${env.port}`);

  logger.info('[BOOT] Initializing Socket...');
  initSocket(server);

  logger.info('[BOOT] Starting Jobs...');
  startJobs();

  logger.info('[BOOT] Starting HTTP Server...');
  server.listen(env.port, HOST, () => {
    logger.info(`[BOOT] Listening on ${HOST}:${env.port}${env.apiPrefix}`);
    logger.info(`Environment: ${env.nodeEnv} | CORS origin: ${env.clientUrl}`);
  });

  // DB comes up independently of the port — never blocks startup.
  connectWithRetry();
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
