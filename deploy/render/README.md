# Deploying Margsutra on Render (free, no card)

Render's Hobby workspace is genuinely free and **does not require a credit card**.
It runs the same Docker image, so nothing about the app changes — Render injects
`PORT` and terminates TLS, and the container's proxy mode handles that.

| | |
| --- | --- |
| Cost | ₹0, no card |
| URL | `https://<service-name>.onrender.com` |
| RAM | 512 MB (the stack idles at ~65 MB) |
| Sleep | after **15 min** idle; wakes in ~60 s |
| Hours | 750/month — a 31-day month is 744, so one awake service fits exactly |

## What you give up

- **Cold starts.** A slept service takes about a minute to answer its first
  request. For an interview, open the URL ~2 minutes before the call.
- **No always-on guarantee.** Render's own docs say not to use free instances
  for production. That's fine here: this is a demo.

## One-time setup

### 1. Create the service

1. Sign up at https://render.com with GitHub (no card).
2. **New → Web Service**.
3. Connect the repository `theanirbanpanda/Margsutra`.
4. Settings:

| Field | Value |
| --- | --- |
| Language / Runtime | **Docker** |
| Branch | `main` |
| Dockerfile Path | `./deploy/docker/Dockerfile` |
| Docker Context Directory | `./` (empty = repo root) |
| Instance Type | **Free** |
| Health Check Path | `/health` |
| Region | Singapore if offered, otherwise the default |

### 2. Environment variables

Render sets `RENDER_EXTERNAL_URL` automatically, which the container uses for
CORS and the public hostname. You only add:

| Key | Value |
| --- | --- |
| `JWT_SECRET` | run `openssl rand -hex 32` and paste the output |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | the full contents of `serviceAccountKey.json`, one line |
| `FIREBASE_STORAGE_BUCKET` | `coordage-416a1.firebasestorage.app` |

Alternatively use **Secret Files**: name it `serviceAccountKey.json` and add
`FIREBASE_SERVICE_ACCOUNT_PATH=/etc/secrets/serviceAccountKey.json` instead of
pasting the JSON into an env var.

> `JWT_SECRET` must stay stable. If you change it, every login session is
> invalidated (users just sign in again).

### 3. Create Web Service

First build takes 5–10 minutes (it compiles both React apps inside the image).
When it finishes you get a URL like `https://margsutra.onrender.com`.

### 4. Allow the domain in Firebase

https://console.firebase.google.com/project/coordage-416a1/authentication/settings
→ **Authorized domains → Add domain** → `margsutra.onrender.com` (bare hostname,
no scheme).

## Verify

```
https://<service>.onrender.com/            → trekker app
https://<service>.onrender.com/admin/      → console
https://<service>.onrender.com/health      → {"status":"ok","db":"firebase-connected"}
```

Log in with `demouser@gmail.com` / `123456` and `demoadmin@gmail.com` / `123456`.
Expeditions & Rosters should list `HAR26` and `RAJM26`.

## Interview-day routine

1. Two minutes before the call, open the site and wait for it to wake.
2. Stay on the page — activity (including the Socket.IO connection) keeps it
   awake for 15 minutes at a time.
3. If it sleeps mid-demo, refresh; the first request wakes it.

Do **not** run a 24/7 pinger. One always-awake service consumes the entire 750-hour
allowance, and Render suspends every free service in the workspace if the hours
run out before month end.

## Updating

Push to `main` and Render redeploys automatically (or hit **Manual Deploy →
Deploy latest commit**). Environment variables survive redeploys.

## When Render isn't enough

| Need | Option |
| --- | --- |
| No cold starts, guaranteed | A ₹500/month VPS (Hetzner CX23) — same image, direct mode |
| Zero cost, no card, instant | Run the container locally + `cloudflared tunnel --url http://localhost:8080` |
| A stable permanent home | Oracle Always Free, if capacity allows |

The image supports both hosting styles with no code change:
`SITE=…` for direct mode (VM, Caddy does ACME), or `PORT=…` for proxy mode
(Render/Koyeb, TLS upstream).
