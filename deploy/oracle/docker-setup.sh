#!/usr/bin/env bash
#
# Margsutra — run the published Docker image on Oracle Cloud Always Free.
#
# Run as root on a fresh Ubuntu 22.04/24.04 instance:
#
#   IMAGE=anirbanxyz/margsutra:latest sudo -E bash docker-setup.sh
#
# Re-running is safe: it pulls the image, recreates the container and restarts.
# The JWT secret in /etc/margsutra/container.env is generated once and reused.
#
# This replaces deploy/oracle/setup.sh (systemd). Use one or the other: both
# want ports 80 and 443.
#
set -euo pipefail

IMAGE="${IMAGE:-anirbanxyz/margsutra:latest}"
CONTAINER="margsutra"
CONF_DIR="/etc/margsutra"
CERT_VOLUME="margsutra-certs"

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m[!] %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m[x] %s\033[0m\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run this with sudo: sudo bash docker-setup.sh"
[[ -f /etc/os-release ]] || die "Unsupported system (no /etc/os-release)."
. /etc/os-release
[[ "${ID:-}" == "ubuntu" ]] || warn "This script targets Ubuntu; ${PRETTY_NAME:-unknown} may need adjustments."

# ── 1. Hostname ──────────────────────────────────────────────────────────────
log "Detecting the public IP address"
PUBLIC_IP="$(curl -fsS --max-time 10 https://api.ipify.org || true)"
[[ -n "$PUBLIC_IP" ]] || die "Could not detect the public IP. Is outbound HTTPS allowed?"
DEFAULT_SITE="$(echo "$PUBLIC_IP" | tr '.' '-').nip.io"
SITE="${SITE:-$DEFAULT_SITE}"
SITE="${SITE#https://}"; SITE="${SITE%/}"
log "Hostname: $SITE"

# ── 2. Docker ────────────────────────────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  log "Installing Docker"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y -qq
  apt-get install -y -qq docker.io >/dev/null
fi
systemctl enable --now docker >/dev/null 2>&1 || true
log "Docker $(docker --version | cut -d' ' -f3 | tr -d ',')"

# ── 3. Free the ports if the systemd setup ran before ────────────────────────
for unit in margsutra-api margsutra-tracking caddy; do
  if systemctl list-unit-files 2>/dev/null | grep -q "^${unit}\.service"; then
    warn "Disabling the old systemd unit ${unit}.service (ports 80/443 belong to Docker now)"
    systemctl disable --now "$unit" >/dev/null 2>&1 || true
  fi
done

# ── 4. Secrets and configuration ─────────────────────────────────────────────
log "Preparing $CONF_DIR"
mkdir -p "$CONF_DIR"
chmod 700 "$CONF_DIR"

KEY_SRC=""
for candidate in "${KEY_PATH:-}" "/root/serviceAccountKey.json" \
                 "$(getent passwd "${SUDO_USER:-root}" | cut -d: -f6)/serviceAccountKey.json"; do
  [[ -n "$candidate" && -f "$candidate" ]] && { KEY_SRC="$candidate"; break; }
done
if [[ -n "$KEY_SRC" ]]; then
  install -m 600 "$KEY_SRC" "$CONF_DIR/serviceAccountKey.json"
  log "Service account key installed from $KEY_SRC"
elif [[ -f "$CONF_DIR/serviceAccountKey.json" ]]; then
  log "Existing service account key kept"
else
  warn "No serviceAccountKey.json found — copy it with scp and re-run."
  warn "The container starts but every Firestore call will fail."
fi

if [[ ! -f "$CONF_DIR/container.env" ]]; then
  cat > "$CONF_DIR/container.env" <<EOF
SITE=$SITE
JWT_SECRET=$(openssl rand -hex 32)
FIREBASE_STORAGE_BUCKET=coordage-416a1.firebasestorage.app
EOF
  log "Created container.env with a fresh JWT secret"
else
  log "Existing container.env kept (JWT secret preserved)"
  sed -i "s#^SITE=.*#SITE=$SITE#" "$CONF_DIR/container.env"
fi
chmod 600 "$CONF_DIR/container.env"

# ── 5. Image ─────────────────────────────────────────────────────────────────
log "Pulling $IMAGE"
docker pull "$IMAGE"

# ── 6. Container ─────────────────────────────────────────────────────────────
log "Starting the container"
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d \
  --name "$CONTAINER" \
  --restart unless-stopped \
  --env-file "$CONF_DIR/container.env" \
  -v "$CONF_DIR:/etc/margsutra:ro" \
  -v "$CERT_VOLUME:/data" \
  -p 80:80 -p 443:443 \
  --log-opt max-size=10m --log-opt max-file=3 \
  "$IMAGE" >/dev/null

# ── 7. Firewall ──────────────────────────────────────────────────────────────
log "Configuring the host firewall"
if command -v ufw >/dev/null 2>&1; then
  ufw allow 22/tcp  >/dev/null 2>&1 || true
  ufw allow 80/tcp  >/dev/null 2>&1 || true
  ufw allow 443/tcp >/dev/null 2>&1 || true
  ufw --force enable >/dev/null 2>&1 || true
fi
# Oracle images ship a persisted iptables ruleset; Docker also filters forwarded
# traffic in DOCKER-USER. Accept 80/443 in both places.
for port in 80 443; do
  iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null \
    || iptables -I INPUT 1 -p tcp --dport "$port" -j ACCEPT
  if iptables -nL DOCKER-USER >/dev/null 2>&1; then
    iptables -C DOCKER-USER -p tcp --dport "$port" -j ACCEPT 2>/dev/null \
      || iptables -I DOCKER-USER 1 -p tcp --dport "$port" -j ACCEPT
  fi
done
command -v netfilter-persistent >/dev/null 2>&1 && netfilter-persistent save >/dev/null 2>&1 || true
warn "Also allow TCP 80 and 443 in the Oracle VCN security list."

# ── 8. Idle-instance guard ───────────────────────────────────────────────────
log "Installing the idle-instance guard"
cat > /usr/local/bin/margsutra-keepalive <<EOF
#!/bin/sh
curl -fsSk --max-time 10 -H "Host: $SITE" https://127.0.0.1/health >/dev/null 2>&1 || true
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

# ── 9. Report ────────────────────────────────────────────────────────────────
log "Waiting for the API to answer"
API_CODE=000
for _ in $(seq 1 30); do
  API_CODE="$(docker exec "$CONTAINER" node -e \
    "fetch('http://127.0.0.1:5050/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
    >/dev/null 2>&1 && echo 200 || echo 000)"
  [[ "$API_CODE" == "200" ]] && break
  sleep 2
done

cat <<EOF

────────────────────────────────────────────────────────────
 Margsutra is running in Docker.

   Trekker app   https://$SITE
   Admin console https://$SITE/admin
   API health    https://$SITE/health      (local: $API_CODE)
   Image         $IMAGE
   IP address    $PUBLIC_IP

   Logins        demouser@gmail.com  / 123456
                 demoadmin@gmail.com / 123456

   Logs          docker logs -f $CONTAINER
   Restart       docker restart $CONTAINER
   Config        $CONF_DIR/container.env

 First TLS certificate can take ~30 seconds. Allow TCP 80/443 in the
 Oracle VCN security list if the URL does not load.
────────────────────────────────────────────────────────────
EOF

[[ "$API_CODE" == "200" ]] || warn "The API did not answer within 60s — check: docker logs $CONTAINER"
