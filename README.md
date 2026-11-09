# Coordage

Trip safety and duty-of-care platform for organizers running groups through areas with little or no cellular coverage — weekend treks, outdoor camps, and organized off-grid events. Live location, offline-capable SOS alerting, and an auditable safety record for every trip.

## Quick start (one shot)

1. Drop your `serviceAccountKey.json` (from Firebase console → Project settings → Service accounts → Generate new private key) into this root folder.
2. `npm install` — installs admin-app, backend, user-app, and the seed tool in one go.
3. `npm run seed` — creates your demo login and sample data.
4. `npm run dev` — starts both admin-app and user-app together, prints both localhost URLs.

Admin login: `admin@coordage.app` / `admin123`
User-app demo login (works offline, no backend needed): `anirban@coordage.app` / `user123`

## Firebase console — one action required after this update

The `trips` collection's read rule changed (public read, needed for the pre-auth
join-by-code lookup). Re-publish `firestore.rules` in the Firebase console:
Firestore Database → Rules tab → paste the contents of `firestore.rules` → Publish.
Nothing else in the console needs to change.

## Architecture note: two auth systems, by design, not by accident

This project has two separate authentication systems, and that's intentional:

- **Admin (organizer) side** authenticates via **Firebase Authentication**, and
  its Firestore `users/{uid}` document (keyed by the Firebase Auth UID) is
  where their `role: "admin"` lives.
- **Trekker (field user) side** authenticates via the **Node/Express API**, which
  persists all user accounts, credentials, and medical profiles directly into
  **Firebase Firestore** (`users` collection) and issues signed JWTs. All data
  is unified in Firebase.

## Running everything together, including the tracking service

`npm run dev` (two services: admin-app, user-app) is the fast path for UI
work. To test the full
live-location path end-to-end — trekker's position actually reaching the
admin's map — use `npm run dev:all`, which also starts the backend and the
Socket.IO tracking server (`tracking/server`). The tracking server needs its
own `tracking/server/.env` (already included) with the **same `JWT_SECRET`**
as `backend/.env` — they verify each other's tokens, so they must match.

## Before any real deployment — not done yet, listed explicitly

- **Rotate the Firebase API key and JWT_SECRET.** Both have been in this
  repo/zip for local testing; treat them as already exposed.
- **Remove or gate the demo credentials** (`admin123`, `user123`, and the
  `anirban@coordage.app` fallback account) behind an environment flag —
  they currently work in every environment, including a real deployment.
- **Remove the demo-data fallbacks** marked above, or make them fail loudly
  instead of silently substituting fake data, once real data is expected.

## Firmware (ESP32 + LoRa + GPS)

Both `firmware/remote-node` and `firmware/gateway-node` now have real LoRa
send/receive wired in (previously removed, see conversation history for why).
Wiring convention (SX1276, VSPI): SCK=18, MISO=19, MOSI=23, SS=5, RST=14, DIO0=2.
Field node also expects a GPS module (NEO-6M or similar) on GPIO 26/27.
Frequency is set to 865.0625 MHz — India's license-exempt IN865 band.
This is written to the standard library APIs (sandeepmistry/LoRa,
TinyGPS++) but has not been flash-tested on real hardware.
