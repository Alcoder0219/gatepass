# syntax=docker/dockerfile:1

# ─── Stage 1: production dependencies only ──────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
# Deterministic, production-only install — no dev toolchain in the final image.
RUN npm ci --omit=dev

# ─── Stage 2: runtime ───────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# The app reads PORT from the environment (process.env.PORT). This default is
# used for local runs; Docker Compose / Cloud Run inject their own value.
ENV PORT=5000

# tini = a tiny init that reaps zombies and forwards SIGTERM/SIGINT to Node,
# so the app's graceful-shutdown handlers fire on `docker stop` / Cloud Run.
RUN apk add --no-cache tini

# Never run the API as root.
RUN addgroup -g 1001 -S nodejs && adduser -S gatepass -u 1001

COPY --from=deps /app/node_modules ./node_modules
COPY --chown=gatepass:nodejs package*.json ./
COPY --chown=gatepass:nodejs src ./src

# Writable mounts for uploads and rotating logs.
RUN mkdir -p uploads src/logs && chown -R gatepass:nodejs uploads src/logs

USER gatepass

# Documents the default port; the effective port is whatever PORT is set to.
EXPOSE 5000

# Container-local self-check against the app's existing /health endpoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
