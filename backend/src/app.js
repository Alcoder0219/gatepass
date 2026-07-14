import path from 'node:path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';

import env from './config/env.js';
import { stream } from './utils/logger.js';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware.js';
import routes from './routes/index.js';

const app = express();

app.set('trust proxy', 1);

/* ─── Security & parsing ─────────────────────────────────────────────────── */
app.use(
  helmet({
    // The API serves uploaded images that the SPA renders from another origin.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false,
  })
);

app.use(
  cors({
    origin: env.clientUrl.split(',').map((o) => o.trim()),
    credentials: true,
  })
);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());
app.use(compression());
app.use(mongoSanitize()); // strips `$`/`.` keys — blocks operator injection

app.use(
  morgan(env.isProd ? 'combined' : 'dev', {
    stream,
    skip: (req) => req.path === '/health',
  })
);

/* ─── Rate limiting ──────────────────────────────────────────────────────── */
const limiter = rateLimit({
  windowMs: env.security.rateLimitWindowMinutes * 60 * 1000,
  max: env.security.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests — please slow down.' },
});
app.use(env.apiPrefix, limiter);

/* ─── Static uploads ─────────────────────────────────────────────────────── */
app.use(`/${env.upload.dir}`, express.static(path.resolve(process.cwd(), env.upload.dir), {
  maxAge: '7d',
}));

/* ─── Health ─────────────────────────────────────────────────────────────── */
app.get('/health', (_req, res) =>
  res.json({
    success: true,
    message: 'GatePass Pro API is healthy',
    data: { uptime: process.uptime(), env: env.nodeEnv, timestamp: new Date().toISOString() },
  })
);

/* ─── API ────────────────────────────────────────────────────────────────── */
app.use(env.apiPrefix, routes);

/* ─── Errors ─────────────────────────────────────────────────────────────── */
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
