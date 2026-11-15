# Deploying Margsutra on Oracle Cloud Always Free

Everything runs on **one** small VM: the two React apps (static files), the Express API
and the Socket.IO tracking server, with Caddy in front handling HTTPS.

| What | Where |
| --- | --- |
| Trekker app | `https://<your-host>/` |
| Admin console | `https://<your-host>/admin` |
| API | `https://<your-host>/api/*` |
| Socket.IO | `https://<your-host>/socket.io/*` |
| Health check | `https://<your-host>/health` |

`<your-host>` defaults to `<public-ip-with-dashes>.nip.io`. That is a public DNS service:
`13-233-12-7.nip.io` resolves straight back to `13.233.12.7`, so you get a real Let's
Encrypt certificate without buying a domain. No DNS setup, no card on file after signup.

**Cost: ₹0 / $0.** Everything below fits inside Always Free: 2 OCPU + 12 GB Ampere A1
(or 2 small AMD instances), 200 GB block storage, 10 TB egress per month.

---

## Before you start

You need three things:

1. **An Oracle Cloud account** (Part A). Card is used for identity verification only;
   Always Free resources never bill it.
2. **The SSH private key** Oracle gives you when creating the VM (Part B).
3. **`serviceAccountKey.json`** — the Firebase service account key that is already on
   your Mac at the repo root. It is git-ignored, so it must be copied up manually.

Also confirm the repo is public (it is): `https://github.com/theanirbanpanda/Margsutra`.

---

## Part A — Create the Oracle Cloud account

1. Go to **https://signup.cloud.oracle.com**.
2. Country: **India**. Email: a personal address you check.
3. **Home region: `India West (Mumbai)`** — or whichever is closest to you.
   ⚠️ **The home region can never be changed later.** It decides where your Always Free
   resources live and your latency. Pick once, carefully.
4. Verify email, then verify the card. Oracle places a temporary ~₹8/$1 hold that is
   released; Always Free resources are not charged.
5. Wait for the "account ready" email (usually minutes, occasionally a few hours).

> The console is at **https://cloud.oracle.com**. If the top-right region is not your
> home region, switch it there — resources only appear under their own region.

---

## Part B — Create the VM

Console path: **☰ → Compute → Instances → Create instance**.

Fill it in exactly like this:

| Field | Value |
| --- | --- |
| Name | `margsutra` |
| Compartment | your root compartment (default) |
| Placement | leave default (any availability domain) |
| Image | **Canonical Ubuntu 24.04** — click *Edit* → *Change image* → Ubuntu → 24.04, architecture **aarch64** |
| Shape | **Ampere** → `VM.Standard.A1.Flex` |
| OCPUs | `2` |
| Memory (GB) | `12` |
| Boot volume | leave default (50 GB is inside the 200 GB free allowance) |
| Primary VNIC | create a new VCN, or use an existing one |
| Public IPv4 address | **Yes / Assign a public IPv4 address** |
| SSH keys | **Paste public keys** if you already have one, or **Generate a key pair** |

**SSH key — pick one:**

- *I already have a key:* `cat ~/.ssh/id_ed25519.pub` on your Mac and paste it in.
- *Generate one:* choose "Generate a key pair for me", then **download the private key**
  immediately. Oracle only shows it once. The downloaded file is usually
  `~/Downloads/ssh-key-YYYY-MM-DD.key`.

Click **Create**. The instance goes `PROVISIONING → RUNNING` in about a minute.

Note the **Public IP address** on the instance page.

### If you get "Out of host capacity"

That is Oracle's ARM free tier being oversubscribed, not your mistake. Options, in order:

1. Click **Create instance** again in a different availability domain (the AD dropdown).
2. Retry every few hours — capacity frees up constantly.
3. Fall back to the AMD free shape: `VM.Standard.E2.1.Micro` (1/8 OCPU, 1 GB), image
   Ubuntu 24.04 **x86_64**. It is slower but runs this stack comfortably; use 2 GB swap
   (the installer adds none, so add it if you pick this shape).

---

## Part C — Open ports 80 and 443

Oracle has **two** firewalls. `setup.sh` handles the one inside the VM. This is the other.

Console path: **☰ → Networking → Virtual Cloud Networks** → your VCN →
**Security Lists** → **Default Security List** → **Add Ingress Rules**.

Add two rules (one per port, or one rule with both ports):

| Field | Value |
| --- | --- |
| Stateless | No |
| Source Type | CIDR |
| Source CIDR | `0.0.0.0/0` |
| IP Protocol | TCP |
| Destination Port Range | `80` (then repeat with `443`) |

Without this, Caddy can never obtain a certificate and the site will time out.

> Serving only HTTPS would look tidier, but Let's Encrypt needs port 80 for the initial
> challenge, so both must stay open.

---

## Part D — Make the public IP permanent (2 minutes, strongly recommended)

A default *ephemeral* public IP can change when the instance is stopped and started.
Because the hostname is derived from the IP (`13-233-12-7.nip.io`), a changed IP means a
new hostname, a new certificate, and a Firebase authorized-domain update.

Console path: **☰ → Networking → Reserved public IPs → Reserve public IP** →
name it `margsutra-ip`, same compartment and region → **Reserve**.

Then on the instance: **Instance details → Attached VNICs → click the VNIC →
IPv4 Addresses → the ⋮ menu on the public IP → Edit → Reserved public IP →
pick `margsutra-ip` → Save.**

Reserved IPs are free while attached to a running instance.

> If you skip this, everything still works today — just expect to repeat Part G if the
> IP ever changes.

---

## Part E — Copy the key and run the installer

On your Mac, from the repo folder (replace the key filename and IP):

```bash
cd ~/Downloads/Margsutra
chmod 600 ~/Downloads/ssh-key-2026-11-15.key

scp -i ~/Downloads/ssh-key-2026-11-15.key serviceAccountKey.json ubuntu@<PUBLIC_IP>:~/
```

Then log in and run it:

```bash
ssh -i ~/Downloads/ssh-key-2026-11-15.key ubuntu@<PUBLIC_IP>

curl -fsSL https://raw.githubusercontent.com/theanirbanpanda/Margsutra/main/deploy/oracle/setup.sh -o setup.sh
sudo bash setup.sh
```

First run takes roughly **4–8 minutes** (ARM dependency install is the slow part). The
script is safe to re-run: it pulls the latest code, rebuilds, restarts services, and
never overwrites existing secrets in `/etc/margsutra`.

It finishes with a banner like:

```
────────────────────────────────────────────────────────────
 Margsutra is installed.

   Trekker app   https://13-233-12-7.nip.io
   Admin console https://13-233-12-7.nip.io/admin
   API health    https://13-233-12-7.nip.io/health   (local status: 200)
   ...
────────────────────────────────────────────────────────────
```

### What the script actually does

1. Detects the public IP and derives the `nip.io` hostname (override with
   `SITE=trek.example.com sudo -E bash setup.sh`).
2. Installs Node 22 and Caddy.
3. Clones the repo to `/opt/margsutra/app`, builds both apps into `/opt/margsutra/site`.
   Aborts if a bundle still points at `localhost:5050`.
4. Writes secrets **once** into `/etc/margsutra/` (`backend.env`, `tracking.env`,
   `serviceAccountKey.json`), generating a fresh `JWT_SECRET` shared by both services.
5. Installs two systemd services: `margsutra-api` (5050) and `margsutra-tracking` (4000).
6. Writes `/etc/caddy/Caddyfile`: TLS, static files, `/api` and `/socket.io` proxying.
7. Opens 80/443 in `ufw` and in the persisted `iptables` ruleset.
8. Installs a 10-minute keepalive timer (see "Idle reclaim" below).

---

## Part F — Allow the hostname in Firebase Auth

Firebase sign-in refuses unknown domains. Add the new one:

1. Open **https://console.firebase.google.com/project/coordage-416a1/authentication/settings**.
2. **Authorized domains → Add domain**.
3. Enter the bare hostname, e.g. `13-233-12-7.nip.io` — no `https://`, no trailing slash.
4. Save.

Without this, login shows `auth/unauthorized-domain` even though the page loads.

---

## Part G — Verify

Open **`https://<your-host>/`** in a browser. First load may take ~30 seconds while the
certificate is issued; after that it is instant.

Checklist:

- [ ] Trekker app loads over HTTPS with a valid padlock.
- [ ] `https://<your-host>/health` returns `{"status":"ok","db":"firebase-connected"}`.
- [ ] `https://<your-host>/auth/token` returns `401 AUTH_MISSING` in the browser (`POST` only — opening it in a tab shows a method error, that's fine).
- [ ] `https://<your-host>/admin` loads the console (`/admin` redirects to `/admin/`).
- [ ] Log in as `demouser@gmail.com` / `123456` — the trekker app accepts it.
- [ ] Log in as `demoadmin@gmail.com` / `123456` — the console accepts it.
- [ ] Admin → **Expeditions & Rosters** lists `HAR26` and `RAJM26` with a badge count of 2.
- [ ] Admin dashboard shows "Connected" for live tracking (Socket.IO through the proxy).
- [ ] Trigger a test SOS from the trekker app → the admin console shows the alarm.

If login fails with `auth/unauthorized-domain`, Part F is missing. If data pages are
empty, see the Firestore line in Troubleshooting.

---

## Day-to-day operation

```bash
# redeploy after a git push (safe, keeps secrets)
cd /opt/margsutra/app && sudo git pull --ff-only && sudo bash deploy/oracle/setup.sh

# or simply re-run the installer; it fetches main itself
sudo bash ~/setup.sh

# status / logs
systemctl status margsutra-api margsutra-tracking caddy
journalctl -u margsutra-api -f
journalctl -u margsutra-tracking -f
journalctl -u caddy -f
```

Secrets live in `/etc/margsutra/` and survive redeploys:

```
/etc/margsutra/backend.env              (600 root:root)
/etc/margsutra/tracking.env             (600 root:root)
/etc/margsutra/serviceAccountKey.json   (640 root:margsutra)
```

To change a secret: edit the file, then
`sudo systemctl restart margsutra-api margsutra-tracking`.

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Browser times out on both 80 and 443 | VCN security list closed | Part C |
| `ERR_CONNECTION_REFUSED` on 443, 80 works | Caddy failed to start | `journalctl -u caddy -n 50` |
| Certificate never issues | Port 80 blocked, or DNS not resolving | `curl -I http://<host>` from outside; check VCN rule |
| `502 Bad Gateway` | API crashed | `journalctl -u margsutra-api -n 80` |
| API up but Firestore calls fail | Key missing/misplaced | `sudo ls -l /etc/margsutra/serviceAccountKey.json`, then re-run installer with the key in `~/` |
| Admin shows **"Not authorised for the live tracking feed"** | `/auth/token` not proxied (or tracking service down) | `curl -X POST http://127.0.0.1:4000/auth/token` → expect 401; `journalctl -u margsutra-tracking -n 50` |
| `auth/unauthorized-domain` | Part F not done | Add hostname in Firebase Auth |
| Admin loads but has no data | API unreachable from the browser | DevTools → Network → look for failing `/api/*` |
| SOS reaches console but no map pin | No GPS fix in the browser | Expected on desktop; grant location permission |
| Instance stops after a week of idling | Oracle Always Free idle reclaim | Keepalive timer is installed; see below |

**Idle reclaim:** Oracle may reclaim Always Free instances whose 95th-percentile CPU,
network and memory all stay under 20% for 7 days. `margsutra-keepalive.timer` hits
`/health` and burns ~40 seconds of low-priority CPU every 10 minutes, which keeps the
instance out of that definition. Do not disable it.

---

## After the deploy is confirmed working

These are hygiene, not blockers:

1. **Rotate `JWT_SECRET`** — the old value was once committed publicly. Replace the line
   in both `/etc/margsutra/backend.env` and `/etc/margsutra/tracking.env` with the same
   new value (`openssl rand -hex 32`), then restart both services. Existing sessions are
   invalidated; users log in again.
2. **Rotate the service-account key** in Google Cloud (IAM → Service Accounts → keys →
   new key, delete old), then copy the new file up and re-run the installer.
3. **Enable Secret Scanning** on the GitHub repo (Settings → Code security) — free for
   public repos and it would have caught the original leak on day one.

---

## Notes and limits of this setup

- **Single VM, no redundancy.** If the instance reboots, everything comes back on its own
  (all services are `enabled`), with ~10–20 seconds of downtime.
- **No Docker.** Services run directly under systemd; simpler to debug on a small VM.
- **Firestore rules:** the deployed ruleset has no `sos_events` block, so the Firestore
  *offline* SOS channel (channel 4) is denied by design in the current deployment. The
  live demo path — Socket.IO + REST API — is what the console uses and works normally.
- **HTTPS depends on the hostname.** Changing the IP without a reserved address means
  re-adding the new `nip.io` name in Firebase (Part F).
- **Scaling:** this is sized for demos and a handful of concurrent users. It is not a
  production multi-tenant deployment.
