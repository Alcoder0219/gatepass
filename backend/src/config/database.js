import mongoose from 'mongoose';
import env from './env.js';
import logger from '../utils/logger.js';

mongoose.set('strictQuery', true);

export const connectDatabase = async () => {
  try {
    const conn = await mongoose.connect(env.mongoUri, {
      // Index creation is handled explicitly below so it never runs on the hot
      // path in production, and IS guaranteed to run at least once.
      autoIndex: false,
      // Connection pool: keep a few warm connections so bursts of concurrent
      // requests do not pay TLS/handshake latency to a remote (Atlas) cluster,
      // and cap the pool so we never exhaust the cluster's connection budget.
      maxPoolSize: Number.parseInt(process.env.DB_MAX_POOL_SIZE ?? '50', 10) || 50,
      minPoolSize: Number.parseInt(process.env.DB_MIN_POOL_SIZE ?? '5', 10) || 5,
      serverSelectionTimeoutMS: 10_000,
      socketTimeoutMS: 45_000,
      // A stuck request should surface as an error, not hold a pooled connection
      // open indefinitely (which starves everyone else under load).
      waitQueueTimeoutMS: 10_000,
    });
    logger.info(`MongoDB connected → ${conn.connection.host}/${conn.connection.name}`);
    ensureIndexes();
    return conn;
  } catch (error) {
    logger.error(`MongoDB connection failed: ${error.message}`);
    throw error;
  }
};

/**
 * Builds every schema-declared index if it is missing. `ensureIndexes` only
 * CREATES indexes (it never drops), so it is safe to run on an existing
 * database. Kept off the connect await so a slow first-time build on a large
 * collection cannot delay the server from accepting traffic; it logs on finish.
 */
const ensureIndexes = () => {
  Promise.all(
    Object.values(mongoose.models).map((model) =>
      model.ensureIndexes().catch((error) => {
        logger.error(`Index build failed for ${model.modelName}: ${error.message}`);
      })
    )
  )
    .then(() => logger.info('MongoDB indexes ensured'))
    .catch(() => {});
};

export const disconnectDatabase = async () => {
  await mongoose.disconnect();
  logger.info('MongoDB disconnected');
};

mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));

export default connectDatabase;
