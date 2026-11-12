# Margsutra — local development

Two ways to run the stack locally:

## A. Local Firestore emulator (default, recommended while the production quota is exhausted)

```bash
npm run dev           # or: npm run dev:all — both start the emulator stack
```

That runs five processes together:

| Process | Port | Notes |
|---|---|---|
| Firestore emulator | 8080 | Needs JDK 21+ (the script finds Homebrew's `openjdk@21`) |
| Backend API | 5050 | Auto-detects the emulator, no credentials needed |
| Admin console | 5174 | `admin@margsutra.app / admin123` |
| Trekker app | 5173 | `anirban@margsutra.app / user123` (also `guide@margsutra.app / guide123`) |
| Tracking server | 4000 | Live locations + SOS relay |

Only one stack can run at a time — the second one fails with
`EADDRINUSE` on port 5050. Stop the first stack (Ctrl+C) before starting another.

How the emulator is selected:

* `user-app/.env.development` and `admin-app/.env.development` set
  `VITE_USE_FIRESTORE_EMULATOR=true` and `VITE_FIREBASE_PROJECT_ID=demo-margsutra`,
  so both frontends talk to `127.0.0.1:8080`.
* `backend/scripts/dev-local.js` waits for port 8080 and then starts the API with
  `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`, which makes the Admin SDK use the
  emulator instead of the service-account key.

Seeded demo data (created only if missing, so it is safe to re-run):

* users `admin@margsutra.app`, `guide@margsutra.app`, `anirban@margsutra.app`
* expeditions `RAJM26` (Rajmachi, 5 demo members + 1 open slot) and `HAR26`
  (Harishchandragad, 20 slots) — the second one exists so the "enrolled → other
  expeditions locked" rule is visible.

The emulator data lives in memory: restarting it resets everything to the demo
state above.

## B. Production Firebase

```bash
npm run dev:prod
```

This runs the backend against the real Firebase project (service account key) and
starts both apps with the emulator switches overridden
(`VITE_USE_FIRESTORE_EMULATOR=false VITE_FIREBASE_PROJECT_ID=coordage-416a1`).

Production currently needs the Firestore read quota to be available; when it is
exhausted the API answers `503 { quotaExceeded: true }` and `/api/trips` keeps
serving the last known trip list.

The backend uses `serviceAccountKey.json` unless `FIRESTORE_EMULATOR_HOST` is set.

## Quota notes

The project's Firestore read quota is shared, so the consoles poll instead of
streaming everywhere:

* admin console — SOS feed: 10s while the socket is offline, 15s while an SOS is
  active, 60s otherwise; users list: 60s; pending approvals: 30s
* trekker app — active expedition: 20s (plus on tab focus)
* backend — `/api/sos/events` is cached for 5s and never reads the whole
  `sos_events` collection

If the quota is hit anyway, the API answers `503` with `quotaExceeded: true` and
`/api/trips` keeps serving the last known trip list.

## Authentication

* The API signs a JWT on login (`/api/auth/login`); every protected route needs
  `Authorization: Bearer <token>`.
* Demo accounts sign in with their published password only — a wrong password is
  rejected (`401`) instead of silently re-keying the account.
* The tracking server issues its own short-lived token from `/auth/token` and
  only after verifying the API token; the role is resolved server-side. The old
  `?isAdmin=true` shortcut and unauthenticated token minting are gone.
* A socket without a valid token can only raise an SOS beacon: it cannot post
  locations and never joins the admin room.

