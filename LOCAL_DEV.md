# Margsutra — local development

Two ways to run the stack locally. **Never mix them**: if the API talks to
production Firestore while the frontends talk to the emulator (or vice versa),
the two halves disagree and the app looks broken.

| Command | API + apps talk to |
|---|---|
| `npm run dev` (or `npm run dev:all`) | the local Firestore emulator |
| `npm run dev:local` | the local Firestore emulator (same as `dev`, plus an explicit emulator flag) |

> The production Firebase project shares one daily read quota for the whole
> project. If it is exhausted the API answers `503 { quotaExceeded: true }` and
> logins fail — that is when the emulator stack is the way to keep working.

## A. Local Firestore emulator (default)

```bash
npm run dev           # emulator + backend + admin app + user app + tracking
```

That runs five processes together:

| Process | Port | Notes |
|---|---|---|
| Firestore emulator | 8080 | Needs JDK 21+ (the script finds Homebrew's `openjdk@21`) |
| Backend API | 5050 | Auto-detects the emulator, no credentials needed |
| Admin console | 5174 | `demoadmin@gmail.com / 123456` |
| Trekker app | 5173 | `demouser@gmail.com / 123456` |
| Tracking server | 4000 | Live locations + SOS relay |

Only one stack can run at a time — the second one fails with
`EADDRINUSE` on port 5050. Stop the first stack (Ctrl+C) before starting another.

How the emulator is selected:

* `npm run dev:local` passes `VITE_USE_FIRESTORE_EMULATOR=true` and
  `VITE_FIREBASE_PROJECT_ID=demo-margsutra` to both frontends, so they talk to
  `127.0.0.1:8080`. Those values are set on the command line only — never in an
  `.env.development` file, because that would also redirect `npm run dev:all`
  (cloud mode) at an emulator that is not running.
* `backend/scripts/dev-local.js` waits for port 8080 and then starts the API with
  `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`, which makes the Admin SDK use the
  emulator instead of the service-account key.

Seeded demo data (created only if missing, so it is safe to re-run):

* users `demoadmin@gmail.com` (admin) and `demouser@gmail.com` (trekker), both with the
  password `123456` — these are the only two accounts that exist
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

Sign-in works with the same demo credentials in both environments:
`demoadmin@gmail.com / 123456` (admin console) and
`demouser@gmail.com / 123456` (trekker app). No other account exists.

## Resetting the demo

```bash
npm run reset:demo          # wipes the demo data and recreates the two accounts
```

The script clears the users, expeditions, rosters and SOS history, then
recreates exactly two accounts (`demoadmin@gmail.com` and `demouser@gmail.com`,
both `123456`) and the two demo expeditions RAJM26 + HAR26. The demo trekker
starts enrolled on Rajmachi, so the "enrolled → other expeditions locked" rule
is visible immediately.

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

