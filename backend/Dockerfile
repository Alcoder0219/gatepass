# syntax=docker/dockerfile:1
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Never run the API as root.
RUN addgroup -g 1001 -S nodejs && adduser -S gatepass -u 1001

COPY --from=deps /app/node_modules ./node_modules
COPY --chown=gatepass:nodejs package*.json ./
COPY --chown=gatepass:nodejs src ./src

# Writable mounts for uploads and rotating logs.
RUN mkdir -p uploads src/logs && chown -R gatepass:nodejs uploads src/logs

USER gatepass
EXPOSE 5000

CMD ["node", "src/server.js"]
