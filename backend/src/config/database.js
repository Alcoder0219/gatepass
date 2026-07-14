import mongoose from 'mongoose';
import env from './env.js';
import logger from '../utils/logger.js';

mongoose.set('strictQuery', true);

export const connectDatabase = async () => {
  try {
    const conn = await mongoose.connect(env.mongoUri, {
      autoIndex: !env.isProd,
      serverSelectionTimeoutMS: 10_000,
    });
    logger.info(`MongoDB connected → ${conn.connection.host}/${conn.connection.name}`);
    return conn;
  } catch (error) {
    logger.error(`MongoDB connection failed: ${error.message}`);
    throw error;
  }
};

export const disconnectDatabase = async () => {
  await mongoose.disconnect();
  logger.info('MongoDB disconnected');
};

mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));

export default connectDatabase;
