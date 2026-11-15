# Margsutra

> **A safety-first expedition management platform for guided treks.** Margsutra supports the expedition lifecycle from planning and booking through live field coordination—bringing hardware-informed weather intelligence, real-time tracking, and resilient emergency communication into one system.

Designed for the realities of remote terrain, Margsutra pairs trekker and operator workflows with safety capabilities that go beyond standard tour-management software. Hardware-based weather forecasting helps teams assess changing conditions, while offline SOS sharing over ESP32 and LoRa is designed to carry distress messages beyond cellular coverage when compatible field hardware is available.

## 🧭 Platform Highlights

- **🌦️ Hardware-informed weather forecasting:** Field hardware contributes local conditions to weather intelligence, helping expedition teams make more context-aware decisions than forecasts based only on general regional data.
- **📡 Offline emergency SOS sharing:** ESP32 and LoRa-based communication supports distress-message relay when cellular connectivity is unavailable, with GPS context to help responders locate the person in need.
- **🛰️ Live expedition intelligence:** Socket.IO location telemetry, guide and trekker positions, route waypoints, and geofence alerts give teams a shared view of activity in the field.
- **🚨 Safety operations and response:** SOS dispatch, incident triage, trekker medical and emergency-contact information, and response coordination support teams from alert through resolution.
- **⌚ Connected field devices:** Web Bluetooth (BLE) wearable integrations can surface heart-rate and SpO₂ readings as additional context for field teams.
- **📴 Resilient trekker experience:** Offline-capable app workflows and SOS outbox behavior are designed to help preserve and share emergency information through intermittent connectivity.
- **🗺️ End-to-end expedition management:** Trip planning, discovery and booking connect to organizer tools for coordinating the people and operations behind each expedition.

## ⚡ Quick Start

### Prerequisites

- Node.js and npm
- A Firebase project
- Credentials for the backend (see step 2)

### Install and configure

1. Install dependencies for all workspaces:

   ```bash
   npm install
   ```

2. Configure Firebase credentials and environment variables.

   - **Local development:** place `serviceAccountKey.json` in the repository root (or point `FIREBASE_SERVICE_ACCOUNT_PATH` at it). This file is git-ignored — never commit it.
   - **Hosted environments:** set `FIREBASE_SERVICE_ACCOUNT_JSON` to the key JSON, or leave it unset and use Application Default Credentials on GCP runtimes.

   Configure the Firebase client values in the app environment files and matching `JWT_SECRET` values for the backend and tracking server.

3. Start the full development stack:

   ```bash
   npm run dev:all
   ```

   `npm run dev:all` aliases `npm run dev`. Both start the admin app, trekker app, backend API, and tracking server:

   | Service | Local address |
   | --- | --- |
   | Admin app | `http://localhost:5174` |
   | Trekker app | `http://localhost:5173` |
   | Backend API | `http://localhost:5050` |
   | Tracking server | `http://localhost:4000` |

> **Local emulator option:** `npm run dev:local` starts the Firestore emulator and the apps/services configured for local development. The emulator startup script requires a compatible Java installation.

### Demo data (optional)

To reset and create the demo environment, run:

```bash
npm run seed
```

This forwards to the backend demo-data reset script. Use it only when you intend to reset demo data.

## 🏛️ Architecture: Two Purpose-Built Experiences

Margsutra connects operator and trekker workflows through Firebase Firestore:

1. **Admin and expedition operations:** Firebase Authentication with role authorization stored in Firestore; tools for trip operations, live coordination, and safety response.
2. **Trekker experience:** Node.js/Express API authentication with signed JWTs; trek and booking workflows, user profiles, and emergency information.

## 🛰️ Live Tracking Pipeline

- The backend API (`backend/`) runs on port `5050`.
- The Socket.IO tracking service (`tracking/server/`) runs on port `4000`.
- The tracking server and backend must use matching `JWT_SECRET` values to verify tokens consistently. Keep secrets out of source control.

## 🚀 Deployment

The repository has four deployable parts: two static React apps (admin, trekker), one Express API, and one Socket.IO tracking server. Firestore and Storage stay on Firebase.

### Recommended: Firebase Hosting + Cloud Run

All services stay in the same Google Cloud project as Firestore, so no credentials have to be copied anywhere:

| Part | Target | Notes |
| --- | --- | --- |
| Admin app | Firebase Hosting site | `npm run build --workspace=admin-app` |
| Trekker app | Firebase Hosting site | `npm run build --workspace=user-app` |
| Backend API | Cloud Run service | Port comes from `PORT` |
| Tracking server | Cloud Run service | WebSockets supported |

- **No keys.** Cloud Run provides Application Default Credentials from its attached service account. Grant that account *Cloud Datastore User* and *Storage Object Admin*, and the backend needs no `serviceAccountKey.json` at all.
- **Socket.IO settings:** deploy the tracking service with `--timeout=3600 --min-instances=1 --session-affinity` so idle timeouts and cold starts don't drop live connections.
- **Build-time variables:** the frontends bake in `VITE_AUTH_API_URL` and `VITE_TRACKING_SERVER_URL`, so set them to the deployed service URLs before building.

### Alternative: static host + Node PaaS

Netlify (or Vercel) can host the two React builds, but not the API or the Socket.IO server — those need a long-running Node process. Render, Railway, or Fly can run them. On those platforms:

- Set `FIREBASE_SERVICE_ACCOUNT_JSON` as a secret environment variable instead of shipping a key file.
- Set `CORS_ORIGIN` on both services to the deployed frontend domains.
- Use the same `JWT_SECRET` on the API and tracking server.
- Pick a plan without idle sleep; free tiers that suspend instances break live tracking and Socket.IO sessions.

### Security rules for secrets

- Service-account keys never belong in git. Committing one to a public repository causes Google Cloud to disable it automatically, which surfaces as `UNAUTHENTICATED: invalid JWT signature` at runtime.
- `.env` files for the API and tracking server are git-ignored; keep `.env.example` up to date instead.
- Rotate any key that has been shared or committed, then start using keyless credentials.

## 📡 Embedded Firmware: ESP32, LoRa, and GPS

Firmware for field relay nodes is in [`firmware/`](./firmware/):

- **`firmware/gateway-node`** — base-camp or mobile gateway that bridges LoRa packets to Wi-Fi/cellular backhaul.
- **`firmware/remote-node`** — guide-carried node for periodic telemetry and distress beacons.

### SX1276 VSPI pinout

| Signal | ESP32 pin |
| --- | --- |
| SCK | `GPIO 18` |
| MISO | `GPIO 19` |
| MOSI | `GPIO 23` |
| NSS / SS | `GPIO 5` |
| RST | `GPIO 14` |
| DIO0 | `GPIO 2` |
| NEO-6M GPS UART | `RX=GPIO 26`, `TX=GPIO 27` |

- **RF band:** `865.0625 MHz` (IN865)
- **Libraries:** `sandeepmistry/LoRa`, `mikalhart/TinyGPSPlus`

## ⚠️ Before Field Deployment

- Rotate development JWT secrets and protect Firebase credentials; never commit private keys.
- Validate behavior when network, location, weather inputs, or tracking services are unavailable.
- Test LoRa range, GPS acquisition, and SOS relay with the actual hardware and terrain.
- Treat hardware-assisted forecasts and distress relays as decision-support capabilities; verify operational limits and maintain established emergency procedures.
