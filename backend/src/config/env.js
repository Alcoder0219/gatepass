import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const required = ['MONGODB_URI', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];

export const missingEnv = required.filter((key) => !process.env[key]);
if (missingEnv.length) {
  /*
   * Cloud Run compatible: log loudly but DO NOT `process.exit()` here.
   * This module is imported before the HTTP server binds its port, so exiting
   * now makes the container die before it can listen — Cloud Run then reports
   * "failed to start and listen on the port" with no actionable signal, and the
   * platform keeps retrying a container that can never succeed.
   *
   * Instead we surface the misconfiguration in the logs and let server.js bring
   * the HTTP server up anyway, so /health responds and the logs are readable.
   * The missing values are set via Secret Manager / Cloud Run env vars.
   */
  // eslint-disable-next-line no-console
  console.error(
    `\n[BOOT] Missing required environment variables: ${missingEnv.join(', ')}\n` +
      `[BOOT] The API will start, but requests needing these will fail until they are set ` +
      `(Cloud Run: --set-secrets / --set-env-vars; local: backend/.env).\n`
  );
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

  /**
   * Gmail API transport (service account + domain-wide delegation).
   *
   * Entirely separate from `mail` above: the existing SMTP/nodemailer transport
   * is untouched and keeps serving every current workflow. Nothing switches to
   * Gmail until a caller explicitly uses `gmail.service.js`.
   *
   * In Cloud Run these arrive as environment variables / Secret Manager refs.
   * The private key is never read from a file and never logged.
   */
  gmail: {
    enabled: process.env.GMAIL_ENABLED === 'true',
    serviceAccountEmail: process.env.GMAIL_SERVICE_ACCOUNT_EMAIL || '',
    /**
     * Secret managers and shell env vars almost always carry the PEM with
     * literal backslash-n rather than real newlines; the Google JWT client
     * rejects that with an opaque "error:1E08010C:DECODER routines" failure.
     * Normalising here means every caller gets a usable key.
     */
    serviceAccountPrivateKey: (process.env.GMAIL_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(
      /\\n/g,
      '\n'
    ),
    /**
     * Local development alternative to the two variables above: a path to the
     * downloaded service-account JSON, relative to `backend/`.
     *
     * The env vars take precedence, so Cloud Run — where no file exists — is
     * always deterministic and a stray local file can never override it.
     * The file is read lazily, only when the first email is sent.
     */
    serviceAccountKeyPath: process.env.GMAIL_SERVICE_ACCOUNT_KEY_PATH || '',

    /** The Workspace user the service account impersonates. */
    impersonateUser: process.env.GMAIL_IMPERSONATE_USER || '',
    projectId: process.env.GMAIL_PROJECT_ID || '',
    /** Minimum scope for sending. Do not widen without a reason. */
    scopes: ['https://www.googleapis.com/auth/gmail.send'],
    /** Falls back to MAIL_FROM so a single variable can drive both transports. */
    from: process.env.GMAIL_FROM || process.env.MAIL_FROM || '',
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
