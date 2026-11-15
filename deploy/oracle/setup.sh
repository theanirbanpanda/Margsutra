#!/usr/bin/env bash
#
# Margsutra — one-command installer for Oracle Cloud Always Free.
#
# Tested target: Ubuntu 22.04 / 24.04 (ARM Ampere A1 or AMD micro).
# Run as root on a fresh instance:
#
#   sudo bash setup.sh
#
# Re-running is safe: it pulls the latest code, rebuilds the apps and restarts
# the services. Secrets in /etc/margsutra are only created if missing.
#
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/theanirbanpanda/Margsutra.git}"
BRANCH="${BRANCH:-main}"
APP_DIR="/opt/margsutra/app"
SITE_DIR="/opt/margsutra/site"
CONF_DIR="/etc/margsutra"
SERVICE_USER="margsutra"
NODE_MAJOR="22"

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m[!] %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m[x] %s\033[0m\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run this with sudo: sudo bash setup.sh"
[[ -f /etc/os-release ]] || die "Unsupported system (no /etc/os-release)."
. /etc/os-release
[[ "${ID:-}" == "ubuntu" ]] || warn "This script targets Ubuntu; ${PRETTY_NAME:-unknown} may need adjustments."

# ── 1. Public address and site hostname ──────────────────────────────────────
log "Detecting public IP address"
PUBLIC_IP="$(curl -fsS --max-time 10 https://api.ipify.org || true)"
[[ -n "$PUBLIC_IP" ]] || die "Could not detect the public IP. Is outbound HTTPS allowed?"
DEFAULT_SITE="$(echo "$PUBLIC_IP" | tr '.' '-').nip.io"
SITE="${SITE:-$DEFAULT_SITE}"     # override: SITE=trek.example.com sudo -E bash setup.sh
SITE="${SITE#https://}"; SITE="${SITE%/}"

log "Site hostname: $SITE"
warn "If this is a nip.io name, it follows the instance IP. A real domain is more stable."

# ── 2. Base packages ─────────────────────────────────────────────────────────
log "Installing base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y -qq
apt-get install -y -qq git curl ca-certificates gnupg ufw >/dev/null

if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -c2- | cut -d. -f1)" -lt 20 ]]; then
  log "Installing Node.js $NODE_MAJOR"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
log "Node $(node -v), npm $(npm -v)"

if ! command -v caddy >/dev/null 2>&1; then
  log "Installing Caddy"
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https >/dev/null
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y -qq
  apt-get install -y -qq caddy >/dev/null
fi
log "Caddy $(caddy version | cut -d' ' -f1)"

# ── 3. Service user, directories, code ───────────────────────────────────────
log "Preparing service account and code"
id -u "$SERVICE_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin "$SERVICE_USER"
mkdir -p "$CONF_DIR" "$SITE_DIR" /opt/margsutra

if [[ -d "$APP_DIR/.git" ]]; then
  log "Updating existing checkout"
  git -C "$APP_DIR" fetch --depth=1 origin "$BRANCH"
  git -C "$APP_DIR" reset --hard "origin/$BRANCH"
else
  log "Cloning $REPO_URL"
  git clone --depth=1 --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
chown -R "$SERVICE_USER:$SERVICE_USER" /opt/margsutra

# ── 4. Secrets ───────────────────────────────────────────────────────────────
log "Configuring secrets in $CONF_DIR"
KEY_SRC=""
for candidate in "${KEY_PATH:-}" "/root/serviceAccountKey.json" \
                 "$(getent passwd "${SUDO_USER:-root}" | cut -d: -f6)/serviceAccountKey.json" \
                 "./serviceAccountKey.json"; do
  [[ -n "$candidate" && -f "$candidate" ]] && { KEY_SRC="$candidate"; break; }
done
if [[ -n "$KEY_SRC" ]]; then
  install -m 640 -o root -g "$SERVICE_USER" "$KEY_SRC" "$CONF_DIR/serviceAccountKey.json"
  log "Service account key installed from $KEY_SRC"
elif [[ -f "$CONF_DIR/serviceAccountKey.json" ]]; then
  log "Existing service account key kept"
else
  warn "No serviceAccountKey.json found. Copy it up with scp and re-run this script."
  warn "Firestore writes will fail until then."
fi

if [[ ! -f "$CONF_DIR/backend.env" ]]; then
  JWT="$(openssl rand -hex 32)"
  cat > "$CONF_DIR/backend.env" <<EOF
PORT=5050
NODE_ENV=production
CORS_ORIGIN=https://$SITE
JWT_SECRET=$JWT
FIREBASE_SERVICE_ACCOUNT_PATH=$CONF_DIR/serviceAccountKey.json
FIREBASE_STORAGE_BUCKET=coordage-416a1.firebasestorage.app
EOF
  log "Created backend.env with a fresh JWT secret"
else
  log "Existing backend.env kept"
  JWT="$(grep -E '^JWT_SECRET=' "$CONF_DIR/backend.env" | cut -d= -f2-)"
fi

if [[ ! -f "$CONF_DIR/tracking.env" ]]; then
  cat > "$CONF_DIR/tracking.env" <<EOF
PORT=4000
NODE_ENV=production
JWT_SECRET=$JWT
BACKEND_API_URL=http://127.0.0.1:5050/api
CORS_ORIGIN=https://$SITE
USE_REDIS=false
EOF
  log "Created tracking.env"
else
  log "Existing tracking.env kept"
fi
chmod 600 "$CONF_DIR"/*.env
chown root:root "$CONF_DIR"/*.env

# Keep CORS in sync with the current hostname (IP/hostname can change).
sed -i "s#^CORS_ORIGIN=.*#CORS_ORIGIN=https://$SITE#" "$CONF_DIR/backend.env" "$CONF_DIR/tracking.env"

# ── 5. Build the two React apps ──────────────────────────────────────────────
log "Installing dependencies (first run takes a few minutes on ARM)"
cd "$APP_DIR"
npm ci --no-audit --no-fund --loglevel=error

log "Building the trekker app and admin console"
VITE_AUTH_API_URL=/api VITE_TRACKING_SERVER_URL= \
  npm run build --workspace=user-app -- --base=/ --outDir "$SITE_DIR/user" --emptyOutDir
VITE_AUTH_API_URL=/api VITE_TRACKING_SERVER_URL= \
  npm run build --workspace=admin-app -- --base=/admin/ --outDir "$SITE_DIR/admin" --emptyOutDir
chmod -R a+rX "$SITE_DIR"

if grep -rqs "localhost:5050" "$SITE_DIR/user/assets" "$SITE_DIR/admin/assets"; then
  die "A production bundle still points at localhost:5050 — aborting instead of shipping it."
fi

# ── 6. systemd units ─────────────────────────────────────────────────────────
log "Installing systemd services"
write_unit() { cat > "/etc/systemd/system/$1.service"; }

write_unit margsutra-api <<EOF
[Unit]
Description=Margsutra API (Express)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$APP_DIR/backend
EnvironmentFile=$CONF_DIR/backend.env
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

write_unit margsutra-tracking <<EOF
[Unit]
Description=Margsutra tracking server (Socket.IO)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$APP_DIR/tracking/server
EnvironmentFile=$CONF_DIR/tracking.env
ExecStart=/usr/bin/node tracking-server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now margsutra-api margsutra-tracking >/dev/null
systemctl restart margsutra-api margsutra-tracking

# ── 7. Caddy: TLS, static apps, proxying ─────────────────────────────────────
log "Configuring Caddy for https://$SITE"
cat > /etc/caddy/Caddyfile <<EOF
{
	admin off
}

$SITE {
	encode zstd gzip

	@static path /assets/* /admin/assets/*
	header @static Cache-Control "public, max-age=31536000, immutable"

	handle /api/* {
		reverse_proxy 127.0.0.1:5050
	}
	handle /socket.io/* {
		reverse_proxy 127.0.0.1:4000
	}
	handle /health {
		reverse_proxy 127.0.0.1:5050
	}

	redir /admin /admin/ 308
	handle_path /admin/* {
		root * $SITE_DIR/admin
		try_files {path} /index.html
		file_server
	}

	handle {
		root * $SITE_DIR/user
		try_files {path} /index.html
		file_server
	}
}
EOF

caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1 || warn "Caddy reported a problem validating the config"
systemctl enable caddy >/dev/null 2>&1 || true
systemctl restart caddy

# ── 8. Firewall ──────────────────────────────────────────────────────────────
log "Configuring the host firewall"
ufw allow 22/tcp   >/dev/null
ufw allow 80/tcp   >/dev/null
ufw allow 443/tcp  >/dev/null
ufw --force enable >/dev/null

# Oracle's Ubuntu images also ship a persisted iptables ruleset that can reject
# 80/443 even when ufw says they are open. Insert accepts at the top and save.
if command -v iptables >/dev/null 2>&1; then
  for port in 80 443; do
    iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null \
      || iptables -I INPUT 1 -p tcp --dport "$port" -j ACCEPT
  done
  command -v netfilter-persistent >/dev/null 2>&1 && netfilter-persistent save >/dev/null 2>&1 || true
fi
warn "Also allow TCP 80 and 443 in the Oracle VCN security list (the cloud firewall is separate)."

# ── 9. Idle-instance guard ───────────────────────────────────────────────────
# Oracle may reclaim Always Free instances whose p95 CPU, network and memory
# all stay below 20% over a week. A short, low-priority burst keeps the VM out
# of that definition without competing with the app.
log "Installing the idle-instance guard"
cat > /usr/local/bin/margsutra-keepalive <<EOF
#!/bin/sh
curl -fsS --max-time 10 "https://$SITE/health" >/dev/null 2>&1 || true
nice -n 19 timeout 40 yes >/dev/null 2>&1 || true
EOF
chmod 755 /usr/local/bin/margsutra-keepalive

cat > /etc/systemd/system/margsutra-keepalive.service <<'EOF'
[Unit]
Description=Margsutra keepalive (health check + tiny CPU burst)

[Service]
Type=oneshot
ExecStart=/usr/local/bin/margsutra-keepalive
Nice=19
EOF

cat > /etc/systemd/system/margsutra-keepalive.timer <<'EOF'
[Unit]
Description=Run the Margsutra keepalive every 10 minutes

[Timer]
OnBootSec=5min
OnUnitActiveSec=10min

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now margsutra-keepalive.timer >/dev/null

# ── 10. Report ───────────────────────────────────────────────────────────────
sleep 3
API_CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:5050/health || echo 000)"

cat <<EOF

────────────────────────────────────────────────────────────
 Margsutra is installed.

   Trekker app   https://$SITE
   Admin console https://$SITE/admin
   API health    https://$SITE/health   (local status: $API_CODE)
   IP address    $PUBLIC_IP

   Logins        demouser@gmail.com  / 123456
                 demoadmin@gmail.com / 123456

   Services      systemctl status margsutra-api margsutra-tracking caddy
   Logs          journalctl -u margsutra-api -f

 First TLS certificate can take ~30 seconds. If the browser complains,
 wait a moment and reload.

 Remember to allow TCP 80/443 in the Oracle VCN security list.
────────────────────────────────────────────────────────────
EOF
