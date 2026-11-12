# Margsutra 

> **Wilderness duty-of-care, real-time expedition tracking, and Search & Rescue (SAR) incident dispatch platform** for trek operators, field guides, and mountain safety commanders navigating regions with limited or zero cellular coverage.

Features real-time GPS telemetry, BLE fitness wearable sync, offline-capable SOS distress beaconing, and an auditable safety record for every trip.

---

## 🧭 Platform Highlights

- **🚨 Realtime SOS Dispatch Console:** Incident command center featuring dual-state operation (Zero-State Standby vs. Active Emergency Dispatch Mode), automated triaging, trekker health dossiers, turn-by-turn navigation HUD, and authenticated stand-down verification.
- **🛰️ Live Geolocation & Geofencing:** Low-latency position tracking via Socket.IO, displaying field guide paths, waypoints, and automated corridor boundary breach alerts.
- **⌚ Wearable Vital Sync:** Web Bluetooth (BLE) integration for heart-rate, SpO2, and biometric distress detection directly in the field.
- **📴 Offline-First PWA:** Service Worker-backed offline trail maps, cached credentials, and background sync when connectivity drops.
- **📡 Off-Grid Hardware Integration:** ESP32 firmware running LoRa (SX1276) mesh telemetry over India's license-exempt IN865 band (865.0625 MHz) paired with NEO-6M GPS modules.

---

## ⚡ Quick Start

1. **Firebase Service Account:**  
   Drop your `serviceAccountKey.json` (from **Firebase Console → Project settings → Service accounts → Generate new private key**) into the root folder.

2. **Install all dependencies:**
   ```bash
   npm install
   ```
   *(Installs dependencies across `admin-app`, `backend`, `user-app`, `tracking`, and root workspaces in one go).*

3. **Seed demo environment:**
   ```bash
   npm run seed
   ```
   *(Creates your demo expedition `trip-001` Rajmachi Trek, guide account, and trekker roster).*

4. **Launch development servers:**
   - **Fast UI Mode (Admin + Trekker PWA):**
     ```bash
     npm run dev
     ```
   - **Full-Stack Mode (Admin + Trekker + Express API + Socket.IO Tracking):**
     ```bash
     npm run dev:all
     ```

---


## 🏛️ Architecture: Dual Authentication by Design

Margsutra implements two separate, purpose-built authentication systems unified through Firebase Firestore:

1. **Admin / SAR Commander Side:**
   - Authenticates through **Firebase Authentication**.
   - Role authorization (`role: "admin"`) is anchored in the Firestore `users/{uid}` document keyed by the Firebase Auth UID.
2. **Field Trekker Side:**
   - Authenticates via the **Node.js / Express API** using signed JWT tokens.
   - User profiles, medical cards, blood groups, and emergency contacts are persisted directly in Firestore (`users` collection).
   - Enables lightweight token exchange, offline token caching, and seamless QR-code or code-based expedition check-in.

---

## 🛰️ Full-Stack Live Tracking Pipeline

- `npm run dev` runs the **Admin App** and **User App** together for fast front-end development.
- `npm run dev:all` additionally boots:
  - **Core Express Backend (`backend/`)** on port `5050`.
  - **Socket.IO Tracking Service (`tracking/server/`)** on port `4000`.

> [!IMPORTANT]
> The tracking server uses `tracking/server/.env` with the same `JWT_SECRET` as `backend/.env`. Both services cross-verify authentication tokens, so their secrets must match.

---

## 📡 Embedded Firmware (ESP32 + LoRa + GPS)

Hardware firmware for field relay nodes is located in [`firmware/`](./firmware/):
- **`firmware/gateway-node`**: Stationed at base camp or mobile vehicle; bridges incoming LoRa packets to Wi-Fi/cellular backhaul.
- **`firmware/remote-node`**: Carried by field guides; broadcasts periodic telemetry and distress beacons.

### Hardware Specifications & Pinout (SX1276 via VSPI):
- **SCK**: `GPIO 18`
- **MISO**: `GPIO 19`
- **MOSI**: `GPIO 23`
- **NSS / SS**: `GPIO 5`
- **RST**: `GPIO 14`
- **DIO0**: `GPIO 2`
- **GPS UART (NEO-6M)**: `RX=GPIO 26`, `TX=GPIO 27`
- **RF Band**: `865.0625 MHz` (India License-Exempt **IN865** band)
- **Driver Libraries**: `sandeepmistry/LoRa`, `mikalhart/TinyGPSPlus`

---

## ⚠️ Pre-Deployment Checklist

Before rolling out into a live expedition environment:

- [ ] **Rotate Secrets:** Generate fresh `JWT_SECRET` keys and rotate Firebase API credentials.
- [ ] **Strict Failure Handling:** Ensure mock data fallbacks fail loudly in production if live sensors or database feeds disconnect.
- [ ] **Hardware Flash Testing:** Field-verify ESP32 LoRa packet transmission and GPS lock under dense forest canopy.

---

