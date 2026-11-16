#!/usr/bin/env bash
#
# Container entrypoint: renders the Caddyfile and runs three processes —
# Caddy, the Express API and the Socket.IO tracking server — under one PID 1.
# If any of them exits, the container stops rather than running half-alive.
#
# Two modes:
#
#   direct (default)   Caddy owns ports 80/443 and obtains a Let's Encrypt
#                      certificate for $SITE. Used on a VM (Oracle, Hetzner…).
#
#   proxy              The platform injects $PORT and terminates TLS itself
#                      (Render, Koyeb, Fly…). Caddy listens on that port over
#                      plain HTTP and does no ACME.
#
set -euo pipefail

log() { printf '[margsutra] %s\n' "$*"; }
die() { printf '[margsutra] ERROR: %s\n' "$*" >&2; exit 1; }

# ── Mode detection ───────────────────────────────────────────────────────────
# A platform that assigns a port always sets $PORT. On a VM we set it further
# down for the child processes, so this check must happen first.
if [[ -n "${PORT:-}" ]]; then
  PROXY_MODE=1
else
  PROXY_MODE=0
fi

PUBLIC_HOST="${SITE:-}"
if [[ -z "$PUBLIC_HOST" && -n "${RENDER_EXTERNAL_URL:-}" ]]; then
  PUBLIC_HOST="$RENDER_EXTERNAL_URL"
fi
PUBLIC_HOST="${PUBLIC_HOST#https://}"
PUBLIC_HOST="${PUBLIC_HOST%/}"

[[ -n "${JWT_SECRET:-}" ]] || die "JWT_SECRET is required, e.g. -e JWT_SECRET=<openssl rand -hex 32>"
if [[ "$PROXY_MODE" == "0" ]]; then
  [[ -n "$PUBLIC_HOST" ]] || die "SITE is required, e.g. -e SITE=13-233-12-7.nip.io"
fi
[[ "$PUBLIC_HOST" == */* || "$PUBLIC_HOST" == *" "* ]] \
  && die "Hostname must be bare (no scheme, path or spaces): got '$PUBLIC_HOST'"

KEY_PATH="${FIREBASE_SERVICE_ACCOUNT_PATH:-/etc/margsutra/serviceAccountKey.json}"
if [[ -f "$KEY_PATH" ]]; then
  :
elif [[ -n "${FIREBASE_SERVICE_ACCOUNT_JSON:-}" ]]; then
  log "Using the service account from FIREBASE_SERVICE_ACCOUNT_JSON"
else
  log "WARNING: no credential at $KEY_PATH and no FIREBASE_SERVICE_ACCOUNT_JSON — Firestore calls will fail"
fi

export NODE_ENV=production
if [[ -n "$PUBLIC_HOST" ]]; then
  export CORS_ORIGIN="${CORS_ORIGIN:-https://${PUBLIC_HOST}}"
fi
export FIREBASE_SERVICE_ACCOUNT_PATH="$KEY_PATH"
export FIREBASE_STORAGE_BUCKET="${FIREBASE_STORAGE_BUCKET:-coordage-416a1.firebasestorage.app}"
export BACKEND_API_URL="http://127.0.0.1:5050/api"
export XDG_DATA_HOME=/data
export XDG_CONFIG_HOME=/config

mkdir -p /data /config /etc/caddy

# ── Caddyfile ────────────────────────────────────────────────────────────────
write_site_body() {
  cat <<'BODY'
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
BODY
}

if [[ "$PROXY_MODE" == "1" ]]; then
  {
    printf '{\n\tadmin off\n\tauto_https off\n}\n\n'
    printf ':%s {\n' "$PORT"
    write_site_body
    printf '}\n'
  } > /etc/caddy/Caddyfile
  log "proxy mode: serving plain HTTP on :$PORT (TLS handled upstream)"
else
  {
    printf '{\n\tadmin off\n}\n\n'
    printf '%s {\n' "$PUBLIC_HOST"
    write_site_body
    printf '}\n'
  } > /etc/caddy/Caddyfile
  log "direct mode: HTTPS for $PUBLIC_HOST on :80/:443"
fi

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

if [[ "$PROXY_MODE" == "1" ]]; then
  log "listening on port ${PORT} for the platform proxy"
else
  log "trekker app    https://${PUBLIC_HOST}"
  log "admin console  https://${PUBLIC_HOST}/admin"
  log "health         https://${PUBLIC_HOST}/health"
  log "issuing the TLS certificate now (first start can take ~30s)"
fi

status=0
wait -n || status=$?
log "a service exited (status ${status}) — shutting down the container"
cleanup
exit "$status"
