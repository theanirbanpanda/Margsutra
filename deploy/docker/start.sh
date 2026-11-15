#!/usr/bin/env bash
#
# Container entrypoint: renders the Caddyfile from $SITE and runs three
# processes — Caddy, the Express API and the Socket.IO tracking server — under
# one PID 1. If any of them exits, the container stops rather than running
# half-alive.
#
set -euo pipefail

log() { printf '[margsutra] %s\n' "$*"; }
die() { printf '[margsutra] ERROR: %s\n' "$*" >&2; exit 1; }

# ── Required configuration ───────────────────────────────────────────────────
[[ -n "${SITE:-}" ]] || die "SITE is required, e.g. -e SITE=13-233-12-7.nip.io"
[[ -n "${JWT_SECRET:-}" ]] || die "JWT_SECRET is required, e.g. -e JWT_SECRET=<openssl rand -hex 32>"

SITE="${SITE#https://}"
SITE="${SITE%/}"
[[ "$SITE" == */* || "$SITE" == *" "* ]] \
  && die "SITE must be a bare hostname (no scheme, path or spaces): got '$SITE'"

KEY_PATH="${FIREBASE_SERVICE_ACCOUNT_PATH:-/etc/margsutra/serviceAccountKey.json}"
[[ -f "$KEY_PATH" ]] || log "WARNING: no service account key at $KEY_PATH — Firestore calls will fail"

export NODE_ENV=production
export CORS_ORIGIN="https://${SITE}"
export FIREBASE_SERVICE_ACCOUNT_PATH="$KEY_PATH"
export FIREBASE_STORAGE_BUCKET="${FIREBASE_STORAGE_BUCKET:-coordage-416a1.firebasestorage.app}"
export BACKEND_API_URL="http://127.0.0.1:5050/api"
# Keep certificates and Caddy's own state on the mounted volume.
export XDG_DATA_HOME=/data
export XDG_CONFIG_HOME=/config

mkdir -p /data /config /etc/caddy

# ── Caddyfile ────────────────────────────────────────────────────────────────
cat > /etc/caddy/Caddyfile <<EOF
{
	admin off
}

${SITE} {
	encode zstd gzip

	@static path /assets/* /admin/assets/*
	header @static Cache-Control "public, max-age=31536000, immutable"

	handle /api/* {
		reverse_proxy 127.0.0.1:5050
	}
	handle /socket.io/* {
		reverse_proxy 127.0.0.1:4000
	}
	# Socket tokens are minted here by the tracking server.
	handle /auth/* {
		reverse_proxy 127.0.0.1:4000
	}
	handle /health {
		reverse_proxy 127.0.0.1:5050
	}

	redir /admin /admin/ 308
	handle_path /admin/* {
		root * /srv/site/admin
		try_files {path} /index.html
		file_server
	}

	handle {
		root * /srv/site/user
		try_files {path} /index.html
		file_server
	}
}
EOF

caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null \
  || die "Caddyfile failed validation"

# ── Processes ────────────────────────────────────────────────────────────────
pids=()

cleanup() {
  trap - TERM INT
  for pid in "${pids[@]:-}"; do
    kill -TERM "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap 'log "stopping"; cleanup; exit 0' TERM INT

caddy run --config /etc/caddy/Caddyfile --adapter caddyfile &
pids+=("$!")

PORT=5050 node /app/backend/src/server.js &
pids+=("$!")

PORT=4000 node /app/tracking/server/tracking-server.js &
pids+=("$!")

log "trekker app    https://${SITE}"
log "admin console  https://${SITE}/admin"
log "health         https://${SITE}/health"
log "issuing the TLS certificate now (first start can take ~30s)"

status=0
wait -n || status=$?
log "a service exited (status ${status}) — shutting down the container"
cleanup
exit "$status"
