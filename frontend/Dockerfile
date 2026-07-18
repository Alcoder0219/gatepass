# syntax=docker/dockerfile:1

# ─── Stage 1: build the Vite bundle ─────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

# Vite inlines env vars at BUILD time. The value is baked into the static bundle,
# so it is supplied as a build ARG, never read at runtime.
#   /api/v1            → same-origin (nginx proxies /api to the API) — the default
#   https://api.host/api/v1 → independent backend (e.g. two Cloud Run services)
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=$VITE_API_URL

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ─── Stage 2: serve the static bundle through nginx ─────────────────────────
FROM nginx:1.27-alpine AS runner

# The bundle is fully static — the image ships the shell, JS and assets only.
COPY --from=build /app/dist /usr/share/nginx/html

# nginx:alpine's entrypoint runs envsubst over /etc/nginx/templates/*.template
# on boot, so ${PORT} is resolved from the environment. Cloud Run / Compose can
# inject their own PORT; nginx runtime vars ($uri, $host, …) are left untouched.
COPY default.conf.template /etc/nginx/templates/default.conf.template

# Defaults for the same-origin Compose model; override at runtime as needed.
#   PORT         — listen port (Cloud Run injects 8080)
#   API_UPSTREAM — where /api, /uploads, /socket.io are proxied (host:port)
ENV PORT=80
ENV API_UPSTREAM=api:5000

EXPOSE 80
# CMD inherited from the nginx base image (its entrypoint runs envsubst first).
