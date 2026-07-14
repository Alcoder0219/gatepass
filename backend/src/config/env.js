import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const required = ['MONGODB_URI', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];

const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  // eslint-disable-next-line no-console
  console.error(
    `\n[config] Missing required environment variables: ${missing.join(', ')}\n` +
      `[config] Copy backend/.env.example to backend/.env and fill them in.\n`
  );
  process.exit(1);
}

const int = (value, fallback) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: int(process.env.PORT, 5000),
  apiPrefix: process.env.API_PREFIX || '/api/v1',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

  mongoUri: process.env.MONGODB_URI,

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    refreshExpiresInRemember: process.env.JWT_REFRESH_EXPIRES_IN_REMEMBER || '30d',
  },

  upload: {
    dir: process.env.UPLOAD_DIR || 'uploads',
    maxFileSizeMb: int(process.env.MAX_FILE_SIZE_MB, 5),
  },

  mail: {
    host: process.env.SMTP_HOST || '',
    port: int(process.env.SMTP_PORT, 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'GatePass Pro <no-reply@gatepasspro.io>',
  },

  security: {
    saltRounds: int(process.env.BCRYPT_SALT_ROUNDS, 10),
    otpExpiryMinutes: int(process.env.OTP_EXPIRY_MINUTES, 10),
    rateLimitWindowMinutes: int(process.env.RATE_LIMIT_WINDOW_MINUTES, 15),
    rateLimitMax: int(process.env.RATE_LIMIT_MAX, 500),
  },

  seed: {
    defaultPassword: process.env.SEED_DEFAULT_PASSWORD || 'Passw0rd@123',
  },
};

export default env;
