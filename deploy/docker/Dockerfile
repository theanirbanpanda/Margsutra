# syntax=docker/dockerfile:1.7
#
# Margsutra — single image containing the two React apps (prebuilt), the
# Express API, the Socket.IO tracking server and Caddy.
#
#   docker build -f deploy/docker/Dockerfile -t <user>/margsutra:latest .
#
# Target platform: linux/arm64 (Oracle Ampere A1). Add
# --platform linux/amd64 for the AMD micro shape.

# ── 1. Runtime dependencies only ─────────────────────────────────────────────
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY tracking/server/package.json tracking/server/
COPY user-app/package.json user-app/
COPY admin-app/package.json admin-app/
RUN npm ci --omit=dev --no-audit --no-fund --loglevel=error \
 && npm cache clean --force

# ── 2. Build both front-ends ─────────────────────────────────────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY tracking/server/package.json tracking/server/
COPY user-app/package.json user-app/
COPY admin-app/package.json admin-app/
RUN npm ci --no-audit --no-fund --loglevel=error

COPY shared ./shared
COPY user-app ./user-app
COPY admin-app ./admin-app

# Same flags as deploy/oracle/setup.sh: relative URLs, admin served at /admin/.
RUN VITE_AUTH_API_URL=/api VITE_TRACKING_SERVER_URL= \
      npm run build --workspace=user-app -- --base=/ --outDir /srv/site/user --emptyOutDir
RUN VITE_AUTH_API_URL=/api VITE_TRACKING_SERVER_URL= \
      npm run build --workspace=admin-app -- --base=/admin/ --outDir /srv/site/admin --emptyOutDir

# ── 3. Caddy (static binary, no apt needed) ──────────────────────────────────
FROM caddy:2-alpine AS caddy

# ── 4. Runtime ───────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    USER_APP_DIR=/srv/site/user \
    ADMIN_APP_DIR=/srv/site/admin

WORKDIR /app

# Caddy (Go) verifies Let's Encrypt over the system trust store, which the
# slim base image does not guarantee is populated.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY --from=caddy /usr/bin/caddy /usr/bin/caddy
COPY --from=deps /app/node_modules /app/node_modules

# Only what the servers need at runtime.
COPY backend/package.json ./backend/package.json
COPY backend/src ./backend/src
COPY tracking/server/package.json ./tracking/server/package.json
COPY tracking/server/tracking-server.js ./tracking/server/tracking-server.js

COPY --from=build /srv/site /srv/site
COPY deploy/docker/start.sh /usr/local/bin/start.sh

RUN chmod +x /usr/local/bin/start.sh \
 && mkdir -p /etc/caddy /data /config

# Certificates live in /data — mount it so restarts do not re-request them.
VOLUME ["/data"]

EXPOSE 80 443

# The API answers /health even when Firestore is unreachable, so this only
# fails when the process itself is gone.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:5050/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/start.sh"]
