# Margsutra — local development

Two ways to run the stack locally:

## A. Local Firestore emulator (default, recommended while the production quota is exhausted)

```bash
npm run dev:local      # emulator + backend + admin app + user app
```

That runs four processes together:

| Process | Port | Notes |
|---|---|---|
| Firestore emulator | 8080 | Needs JDK 21+ (the script finds Homebrew's `openjdk@21`) |
| Backend API | 5050 | Auto-detects the emulator, no credentials needed |
| Admin console | 5174 | `admin@margsutra.app / admin123` |
| Trekker app | 5173 | `anirban@margsutra.app / user123` (also `guide@margsutra.app / guide123`) |

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

Comment out the two lines in `user-app/.env.development` and
`admin-app/.env.development`, then run the normal commands:

```bash
npm run dev:backend   # production Firestore (service account key)
npm run dev           # admin app + user app
```

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
