import path from 'node:path';
import { fileURLToPath } from 'node:url';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logsDir = path.resolve(__dirname, '../logs');

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

const consoleFormat = printf(({ level, message, timestamp: ts, stack }) => {
  return `${ts} [${level}] ${stack || message}`;
});

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: combine(errors({ stack: true }), timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), json()),
  defaultMeta: { service: 'gatepass-pro' },
  transports: [
    new winston.transports.Console({
      format: combine(
        colorize(),
        timestamp({ format: 'HH:mm:ss' }),
        errors({ stack: true }),
        consoleFormat
      ),
    }),
    new DailyRotateFile({
      dirname: logsDir,
      filename: 'application-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
    }),
    new DailyRotateFile({
      dirname: logsDir,
      filename: 'error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '30d',
    }),
  ],
  exitOnError: false,
});

export const stream = {
  write: (message) => logger.http?.(message.trim()) ?? logger.info(message.trim()),
};

export default logger;
