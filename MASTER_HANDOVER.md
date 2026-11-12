# Margsutra (मार्गसूत्र) — Master Project State & Handover

> [!NOTE]
> This document archives the complete state of the **Margsutra** platform (formerly Coordage), including repository sync, GitHub Desktop setup, live servers, and system architecture.

---

## 1. Git & GitHub Repository Sync

- **Remote GitHub URL**: [https://github.com/theanirbanpanda/Margsutra.git](https://github.com/theanirbanpanda/Margsutra.git)
- **Active Branch**: `main`
- **Latest Commit**: `159ee2c` (*chore: add build script and update tracking secret default*)
- **Working Tree**: Completely clean (`nothing to commit, working tree clean`)

### Reconnecting in GitHub Desktop (macOS)
When a local folder is renamed on macOS, GitHub Desktop shows a warning: *"Can't find repository"*.
To reconnect GitHub Desktop in 10 seconds:
1. In **GitHub Desktop**, click the **"Locate..."** button next to the missing repository.
2. In the file picker, navigate to:
   `/Users/anirban/Downloads/Margsutra`
3. Click **Open / Select**.
4. GitHub Desktop immediately re-syncs, pulls the commit history, and shows the latest `main` branch.

*(Alternatively: in GitHub Desktop, press `Cmd + O` → choose `~/Downloads/Margsutra`).*

---

## 2. Directory Layout & Local Paths

```text
/Users/anirban/Downloads/
├── Margsutra/                         <-- Clean Single Git Repository (.git)
│   ├── package.json                   <-- Root workspaces & scripts
│   ├── serviceAccountKey.json         <-- Firebase credentials
│   ├── admin-app/                     <-- Vite React SAR Command Dashboard (Port 5174)
│   ├── user-app/                      <-- Vite React Trekker PWA & Gadgets (Port 5173)
│   ├── backend/                       <-- Node.js / Express / Firestore API (Port 5050)
│   ├── tracking/server/               <-- Socket.io Geolocation Tracking Server (Port 4000)
│   ├── firmware/                      <-- ESP32 + LoRa + GPS Gateway Node C++ firmware
│   ├── MASTER_HANDOVER.md             <-- In-repo architectural & operations guide
│   └── README.md                      <-- Project documentation
└── Coordage                           <-- Session alias pointing to Margsutra
```

---

## 3. Running Services & Local Endpoints

All 4 services are verified and operational:

| Service | Port & URL | Technology | Role |
| :--- | :--- | :--- | :--- |
| **Margsutra Trekker App** | `http://localhost:5173` | React / Vite | Trekker profile, micro-climate weather, BLE gadget sync, live GPS ping |
| **Margsutra Admin SAR** | `http://localhost:5174` | React / Vite / Leaflet | Incident command, live trail telemetry, turn-by-turn SAR dispatch HUD |
| **Backend REST API** | `http://localhost:5050` | Node / Express / Firestore | JWT auth, expedition rosters, duty-of-care profiles, SOS events |
| **Tracking Server** | `http://localhost:4000` | Node / Socket.IO | High-frequency live GPS coordinate broadcast & geofence engine |

---

## 4. Key Accounts & Test Credentials

- **Admin Dispatcher**: `admin@margsutra.app` / `admin123` (or `Margsutra@123`)
- **Trekker Account**: `anirban@margsutra.app` / `user123` (Enrolled in Rajmachi Fort Expedition `trip-001`)
- **Lead Field Guide**: Ajay Saini (`ajay.saini@margsutra.app`)
- **Tactical VHF Radio**: 145.500 MHz (Primary Tactical SAR) / 156.800 MHz (Field Guide Link)

---

## 5. Resume Highlights (Margsutra)

```markdown
*Margsutra | Real-Time Wilderness Safety & SAR Dispatch Platform*

- Built and deployed a real-time wilderness expedition and rescue platform connecting trek organizers, mountain guides, and SAR units to eliminate lost-hiker incidents and latency in high-altitude emergencies.
- Engineered live geospatial telemetry and IoT synchronization via WebSockets and cloud data streams, tracking trekker GPS coordinates, guide proximity/bearing, trail geofencing, and BLE wearable biometrics (HR, SpO2, altitude).
- Designed an end-to-end Search & Rescue (SAR) incident lifecycle, featuring instant SOS distress beaconing with victim triage dossiers (blood group, medical history, emergency contacts), turn-by-turn rescue routing, and verified stand-down audit logs.
```
