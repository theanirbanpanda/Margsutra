const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>MARGSUTRA (मार्गसूत्र) — Comprehensive Technical Handover Specification</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');

    @page {
      size: A4;
      margin: 18mm 16mm 18mm 16mm;
      @bottom-right {
        content: counter(page);
        font-family: 'Plus Jakarta Sans', sans-serif;
        font-size: 9pt;
        color: #64748b;
      }
      @bottom-left {
        content: "MARGSUTRA (मार्गसूत्र) — Master Architecture & Engineering Handover";
        font-family: 'Plus Jakarta Sans', sans-serif;
        font-size: 8pt;
        color: #64748b;
      }
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 10pt;
      line-height: 1.55;
      color: #1e293b;
      background: #ffffff;
      -webkit-font-smoothing: antialiased;
    }

    /* Cover Page */
    .cover-page {
      page-break-after: always;
      height: 94vh;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 40px 20px 20px;
      border-left: 6px solid #2563eb;
    }

    .brand-tag {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11pt;
      font-weight: 600;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: #2563eb;
      margin-bottom: 12px;
    }

    .main-title {
      font-size: 32pt;
      font-weight: 800;
      line-height: 1.15;
      color: #0f172a;
      letter-spacing: -0.03em;
      margin-bottom: 12px;
    }

    .devanagari-subtitle {
      font-size: 20pt;
      font-weight: 600;
      color: #3b82f6;
      margin-bottom: 24px;
    }

    .cover-desc {
      font-size: 13pt;
      color: #475569;
      line-height: 1.6;
      max-width: 680px;
      margin-bottom: 30px;
    }

    .metadata-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 24px;
      margin-top: auto;
      margin-bottom: 30px;
    }

    .meta-item {
      display: flex;
      flex-direction: column;
    }

    .meta-label {
      font-size: 8.5pt;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #64748b;
      margin-bottom: 4px;
    }

    .meta-val {
      font-size: 10.5pt;
      font-weight: 600;
      color: #0f172a;
      font-family: 'JetBrains Mono', monospace;
    }

    .confidential-badge {
      display: inline-block;
      background: #fee2e2;
      border: 1px solid #fca5a5;
      color: #991b1b;
      font-size: 9pt;
      font-weight: 700;
      padding: 6px 14px;
      border-radius: 6px;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }

    /* Standard Layout */
    .page-break {
      page-break-before: always;
    }

    h1, h2, h3, h4 {
      color: #0f172a;
      font-weight: 700;
      letter-spacing: -0.02em;
    }

    h1 {
      font-size: 19pt;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 8px;
      margin-top: 32px;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    h2 {
      font-size: 14pt;
      margin-top: 24px;
      margin-bottom: 12px;
      color: #1e3a8a;
    }

    h3 {
      font-size: 11.5pt;
      margin-top: 18px;
      margin-bottom: 8px;
    }

    p {
      margin-bottom: 12px;
      color: #334155;
      text-align: justify;
    }

    ul, ol {
      margin-left: 20px;
      margin-bottom: 14px;
      color: #334155;
    }

    li {
      margin-bottom: 6px;
    }

    /* Callout Boxes */
    .callout {
      border-radius: 8px;
      padding: 14px 18px;
      margin: 16px 0;
      font-size: 9.5pt;
      break-inside: avoid;
    }

    .callout-info {
      background: #eff6ff;
      border-left: 4px solid #3b82f6;
      color: #1e40af;
    }

    .callout-warning {
      background: #fffbeb;
      border-left: 4px solid #f59e0b;
      color: #92400e;
    }

    .callout-danger {
      background: #fef2f2;
      border-left: 4px solid #ef4444;
      color: #991b1b;
    }

    .callout-success {
      background: #f0fdf4;
      border-left: 4px solid #22c55e;
      color: #166534;
    }

    .callout-title {
      font-weight: 700;
      font-size: 10pt;
      margin-bottom: 4px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    /* Tables */
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0 20px;
      font-size: 9pt;
      break-inside: avoid;
    }

    th {
      background: #f1f5f9;
      color: #334155;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-size: 8pt;
      text-align: left;
      padding: 8px 10px;
      border: 1px solid #cbd5e1;
    }

    td {
      padding: 8px 10px;
      border: 1px solid #e2e8f0;
      color: #334155;
      vertical-align: top;
    }

    tr:nth-child(even) td {
      background: #f8fafc;
    }

    /* Code Blocks */
    pre {
      background: #0f172a;
      color: #e2e8f0;
      padding: 14px 16px;
      border-radius: 8px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 8.5pt;
      line-height: 1.5;
      overflow-x: auto;
      margin: 14px 0 18px;
      break-inside: avoid;
    }

    code {
      font-family: 'JetBrains Mono', monospace;
      font-size: 8.5pt;
      background: #f1f5f9;
      color: #0f172a;
      padding: 2px 6px;
      border-radius: 4px;
    }

    pre code {
      background: transparent;
      color: inherit;
      padding: 0;
    }

    /* Badge & Tag */
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 8pt;
      font-weight: 600;
      letter-spacing: 0.04em;
    }

    .badge-blue { background: #dbeafe; color: #1e40af; }
    .badge-green { background: #dcfce7; color: #166534; }
    .badge-amber { background: #fef3c7; color: #92400e; }
    .badge-red { background: #fee2e2; color: #991b1b; }
    .badge-gray { background: #f1f5f9; color: #475569; }

    /* Architecture Grid */
    .arch-card-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 14px;
      margin: 16px 0;
      break-inside: avoid;
    }

    .arch-card {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 14px;
      background: #ffffff;
      box-shadow: 0 1px 3px rgba(0,0,0,0.03);
    }

    .arch-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      border-bottom: 1px solid #f1f5f9;
      padding-bottom: 6px;
    }

    .arch-card-title {
      font-weight: 700;
      font-size: 10.5pt;
      color: #0f172a;
    }

    .checklist {
      list-style-type: none;
      margin-left: 0;
    }

    .checklist li {
      position: relative;
      padding-left: 24px;
      margin-bottom: 8px;
    }

    .checklist li::before {
      content: "□";
      position: absolute;
      left: 0;
      color: #2563eb;
      font-weight: 700;
      font-size: 11pt;
    }

    .checklist li.done::before {
      content: "✓";
      color: #16a34a;
    }
  </style>
</head>
<body>

  <!-- COVER PAGE -->
  <div class="cover-page">
    <div>
      <div class="brand-tag">Project Codebase Handover &amp; Engineering Specification</div>
      <div class="main-title">MARGSUTRA</div>
      <div class="devanagari-subtitle">मार्गसूत्र — High-Altitude Mountain Expedition Command, Off-Grid Telemetry &amp; SAR Dispatch Platform</div>
      <div class="cover-desc">
        A mission-critical mountain duty-of-care system engineering specification. Spans real-time Socket.IO spatial radar, ESP32 + SX1276 LoRa RF hardware gateways, offline-first PWA, biometric telemetry integration, dual-confirmation SOS rescue lifecycles, and Cloud Firestore distributed data contracts.
      </div>
      <div>
        <span class="confidential-badge">Engineering Handover Document · Version 3.2.0</span>
      </div>
    </div>

    <div class="metadata-grid">
      <div class="meta-item">
        <span class="meta-label">Target Audience</span>
        <span class="meta-val">Autonomous AI Software Engineers &amp; Systems Architects</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Git Repository</span>
        <span class="meta-val">theanirbanpanda/Margsutra.git (Branch: main)</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Current Release Hash</span>
        <span class="meta-val">Commit 35248a6 (Production Ready)</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Core Runtime Stack</span>
        <span class="meta-val">Node.js v26 · React 18 · Vite · Socket.IO · ESP32 LoRa</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Active Super Admin Credential</span>
        <span class="meta-val">admin@margsutra.app / admin123</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Verified Trekker Credential</span>
        <span class="meta-val">anirban@margsutra.app / user123</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Default Managed Trek</span>
        <span class="meta-val">Rajmachi Fort Monsoon Trek (Batch 12: RAJM26)</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Hardware Frequency Plan</span>
        <span class="meta-val">IN865 (865.0625 MHz – 867.0000 MHz, 25mW ERP)</span>
      </div>
    </div>
  </div>

  <!-- TABLE OF CONTENTS & QUICK DIGEST -->
  <div class="page-break"></div>
  <h1>1. Executive Summary &amp; Core JTBD (Jobs-To-Be-Done)</h1>

  <h2>1.1 Purpose of this Specification</h2>
  <p>
    This master specification is prepared as an exhaustive, self-contained technical manual for incoming AI coding agents and human engineers who will carry forward the development, refinement, and ground-level validation of <strong>Margsutra (मार्गसूत्र)</strong>. The codebase was previously developed under the project name <em>Coordage</em>, and has undergone a fundamental architectural transformation into an uncompromising, high-reliability mountain safety platform.
  </p>

  <h2>1.2 The Mountain Problem: The 0% Signal Zone</h2>
  <p>
    When trekking or operating in the Western Ghats (Sahyadris) or the High Himalayas, cellular cellular infrastructure (4G/5G) vanishes rapidly upon ascending mountain ridges and valleys. Standard consumer applications (Google Maps, WhatsApp, AllTrails) become completely unusable. If a trekker suffers hypothermia, acute mountain sickness (AMS), slips down a ravine, or strays outside the trail corridor, traditional communications are nonexistent.
  </p>

  <div class="callout callout-danger">
    <div class="callout-title">🚨 The Mission-Critical Mandate</div>
    Margsutra is NOT a leisure travel portal or social hiking app. It is a <strong>Command &amp; Duty-of-Care Search-and-Rescue (SAR) System</strong>. Every data structure, protocol packet, and UI element directly influences trekker safety, biometric distress detection, and rapid SAR field dispatch.
  </div>

  <h2>1.3 Core JTBD (Jobs To Be Done)</h2>
  <ul>
    <li>
      <strong>For the Expedition Leader &amp; Command Admin:</strong>
      Maintain real-time situational awareness over every trekker on the mountain. Monitor live GPS trail position, biometric heart rate and SpO2 levels (streamed via fitness gadgets), barometric ascent rate, geofence breaches, and receive instantaneous emergency SOS alerts.
    </li>
    <li>
      <strong>For the Individual Trekker:</strong>
      Navigate safely with offline-cached topographic trails and compass headings. Pair fitness wearables to stream biometric duty-of-care telemetry to the expedition guide. Access standing safety directives and trigger a fail-safe, double-confirmed emergency SOS siren when in critical danger.
    </li>
    <li>
      <strong>For the Off-Grid Mountain Hardware:</strong>
      Deploy battery-powered ESP32 nodes equipped with SX1276 LoRa transceivers (IN865 band), BMP280 precision barometers, and GPS modules. When internet connectivity is absent, the hardware forms an ad-hoc radio telemetry bridge. When internet connectivity is present, the system seamlessly transitions to Open-Meteo live hazard feeds and high-speed WebSockets.
    </li>
  </ul>

  <!-- SYSTEM ARCHITECTURE -->
  <div class="page-break"></div>
  <h1>2. Complete Repository Map &amp; Architecture</h1>

  <h2>2.1 Subsystem Topology</h2>
  <p>
    The Margsutra monorepo is located on disk at <code>/Users/anirban/Downloads/Coordage</code> (symlinked as <code>/Users/anirban/Downloads/Margsutra</code>) and is partitioned into four primary software services and one embedded firmware module:
  </p>

  <div class="arch-card-grid">
    <div class="arch-card">
      <div class="arch-card-header">
        <span class="arch-card-title">🖥️ admin-app/</span>
        <span class="badge badge-blue">Port 5174 (Vite)</span>
      </div>
      <p style="font-size: 8.5pt; color: #475569; margin-bottom: 8px;">
        <strong>Admin &amp; SAR Dispatch Portal:</strong> React 18, Leaflet map overlays, live trekker vitals radar, geofence perimeter configurator, expedition roster approval engine, admin clearance pipeline, and mountain weather station console.
      </p>
      <div style="font-size: 8pt; font-family: 'JetBrains Mono', monospace; color: #2563eb;">
        Entry: admin-app/src/AdminDashboard.jsx
      </div>
    </div>

    <div class="arch-card">
      <div class="arch-card-header">
        <span class="arch-card-title">📱 user-app/</span>
        <span class="badge badge-green">Port 5173 (Vite)</span>
      </div>
      <p style="font-size: 8.5pt; color: #475569; margin-bottom: 8px;">
        <strong>Trekker PWA &amp; Field Companion:</strong> React 18 offline-first PWA, Web Bluetooth &amp; fitness gadget telemetry sync, trail navigation with compass, double-confirmation SOS flow with Web Audio siren, and active expedition join manager.
      </p>
      <div style="font-size: 8pt; font-family: 'JetBrains Mono', monospace; color: #16a34a;">
        Entry: user-app/src/App.jsx
      </div>
    </div>

    <div class="arch-card">
      <div class="arch-card-header">
        <span class="arch-card-title">⚙️ backend/</span>
        <span class="badge badge-amber">Port 5050 (Express)</span>
      </div>
      <p style="font-size: 8.5pt; color: #475569; margin-bottom: 8px;">
        <strong>REST API &amp; Identity Gateway:</strong> Node.js + Express, Firebase Admin SDK integration, bcrypt password hashing, JWT issue/verify, admin duty approval endpoints, and database seed orchestration.
      </p>
      <div style="font-size: 8pt; font-family: 'JetBrains Mono', monospace; color: #d97706;">
        Entry: backend/server.js
      </div>
    </div>

    <div class="arch-card">
      <div class="arch-card-header">
        <span class="arch-card-title">⚡ tracking/</span>
        <span class="badge badge-red">Port 4000 (Socket.IO)</span>
      </div>
      <p style="font-size: 8.5pt; color: #475569; margin-bottom: 8px;">
        <strong>Realtime Spatial Telemetry Server:</strong> Node.js HTTP + Socket.IO server. Ingests high-frequency GPS coordinates, vitals streams, geofence evaluations, and handles end-to-end SOS emergency dispatches and cancellations.
      </p>
      <div style="font-size: 8pt; font-family: 'JetBrains Mono', monospace; color: #dc2626;">
        Entry: tracking/server.js
      </div>
    </div>
  </div>

  <h2>2.2 Hardware &amp; Firmware Subsystem</h2>
  <p>
    The hardware code resides in <code>firmware/</code> and powers custom handheld and base-station beacons:
  </p>
  <ul>
    <li><code>firmware/esp32_gateway/</code>: ESP32 WiFi/LTE + SX1276 LoRa relay station. Ingests RF packets from remote trekkers and pipes them to the Socket.IO server via HTTP POST or WebSocket socket bridge.</li>
    <li><code>firmware/esp32_node/</code>: Low-power wearable/pack beacon with GPS (NEO-6M), Barometer (BMP280), Temperature/Humidity (DHT22), and emergency distress switch.</li>
  </ul>

  <!-- AUTHENTICATION & CREDENTIALS -->
  <div class="page-break"></div>
  <h1>3. Authentication, RBAC &amp; Identity Engine</h1>

  <h2>3.1 Active Credentials Matrix</h2>
  <p>
    All authentication credentials have been purged of legacy "coordage.app" domains and provisioned directly into Firebase Auth and Cloud Firestore:
  </p>

  <table>
    <thead>
      <tr>
        <th>Role &amp; Persona</th>
        <th>Email Address</th>
        <th>Password</th>
        <th>Firebase UID</th>
        <th>Firestore Path</th>
        <th>Duty Status</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Super Admin</strong> (Command SAR)</td>
        <td><code>admin@margsutra.app</code></td>
        <td><code>admin123</code></td>
        <td><code>aeBc8ZL0Swewcqtzf7WmXvypucs1</code></td>
        <td><code>users/demo-admin-001</code></td>
        <td><span class="badge badge-green">Approved / Active</span></td>
      </tr>
      <tr>
        <td><strong>Expedition Leader</strong> (Ajay Saini)</td>
        <td><code>guide.ajay@margsutra.app</code></td>
        <td><code>guide123</code></td>
        <td><code>lead-guide-ajay-001</code></td>
        <td><code>users/lead-guide-ajay-001</code></td>
        <td><span class="badge badge-green">Approved / Field</span></td>
      </tr>
      <tr>
        <td><strong>Verified Trekker</strong> (Anirban)</td>
        <td><code>anirban@margsutra.app</code></td>
        <td><code>user123</code></td>
        <td><code>Kz3X4F9M0bQ8...</code></td>
        <td><code>users/Kz3X4F9M...</code></td>
        <td><span class="badge badge-blue">Enrolled (RAJM26)</span></td>
      </tr>
      <tr>
        <td><strong>Pending Admin Applicant</strong></td>
        <td><code>applicant@margsutra.app</code></td>
        <td><code>test123</code></td>
        <td><code>pending-admin-temp</code></td>
        <td><code>users/pending-admin-temp</code></td>
        <td><span class="badge badge-amber">Pending Clearance</span></td>
      </tr>
    </tbody>
  </table>

  <div class="callout callout-warning">
    <div class="callout-title">⚠️ Strict Credentials Invariant</div>
    The old credentials <code>admin@coordage.app</code> and <code>guide@coordage.app</code> have been permanently deleted from Firebase Auth and Firestore. Any attempt to reintroduce or hardcode "coordage" emails will break authentication tests. All user and admin accounts must belong to <code>@margsutra.app</code>.
  </div>

  <h2>3.2 Two-Tier Role-Based Access Control (RBAC)</h2>
  <ol>
    <li>
      <strong>Admin Duty Clearance Pipeline:</strong>
      When a user attempts to create an administrator account, the account is created with <code>approved: false</code> and <code>status: "pending"</code>. The applicant CANNOT access the admin panel. Their clearance application appears in the Super Admin's "Admin Duty Clearances" queue (<code>PageAdminApprovals</code>). Only upon physical cryptographic approval by the Super Admin is the account marked <code>approved: true</code>.
    </li>
    <li>
      <strong>Expedition Roster Join Clearance:</strong>
      When a trekker enters a 6-character expedition join code (e.g. <code>RAJM26</code>), their record in <code>tripMembers</code> is initialized to <code>status: "pending"</code>. The expedition leader or super admin reviews their medical profile, blood group, and emergency contacts in "Expeditions &amp; Rosters" before clearing them to join the active telemetry radar.
    </li>
  </ol>

  <!-- DATA MODELS & CONTRACTS -->
  <div class="page-break"></div>
  <h1>4. Cloud Firestore &amp; RTDB Data Contracts</h1>

  <h2>4.1 Collection: <code>users/{userId}</code></h2>
  <p>Stores the global profile, medical safety data, and device bindings for all users:</p>
  <pre><code>{
  "id": "aeBc8ZL0Swewcqtzf7WmXvypucs1",
  "uid": "aeBc8ZL0Swewcqtzf7WmXvypucs1",
  "name": "Anirban Panda",
  "email": "anirban@margsutra.app",
  "role": "trekker",                   // "admin" | "leader" | "trekker"
  "status": "approved",               // "approved" | "pending" | "rejected"
  "approved": true,
  "blood": "B+ Positive",             // Critical for SAR blood transfusion
  "medical": "Mild pollen allergy; carries EpiPen",
  "phone": "+91 98765 43210",
  "ec1Name": "Pooja Panda",          // Primary Emergency Contact
  "ec1Rel": "Spouse / Next of Kin",
  "ec1Ph": "+91 98765 00001",
  "ec2Name": "Rajiv Sharma",          // Secondary Emergency Contact
  "ec2Rel": "Emergency Local Contact",
  "ec2Ph": "+91 98765 00002",
  "activeTripId": "rajmachi-monsoon-2026",
  "activeTripCode": "RAJM26",
  "pairedGadget": {
    "deviceType": "Amazfit T-Rex 2",
    "mac": "F4:89:71:02:AA:C1",
    "lastSync": "2026-11-12T13:40:00Z",
    "heartRate": 82,
    "spo2": 98,
    "barometricAlt": 829
  },
  "updatedAt": "2026-11-12T13:40:00.000Z"
}</code></pre>

  <h2>4.2 Collection: <code>trips/{tripId}</code></h2>
  <p>Defines the active mountain expedition, route parameters, VHF radio frequency, and geofence safety perimeter:</p>
  <pre><code>{
  "id": "rajmachi-monsoon-2026",
  "name": "Rajmachi Fort Monsoon Expedition — Batch 12",
  "code": "RAJM26",                   // Unique 6-character join token
  "status": "in-field",               // "upcoming" | "in-field" | "completed"
  "isManaged": true,                  // Lead active command trek flag
  "leader": "Field Guide Ajay Saini",
  "leaderPhone": "+91 98765 11111",
  "vhfChannel": "145.500 MHz (VHF Ch 1)",
  "pickupLocation": "Lonavala Railway Station (Platform 1 Exit)",
  "baseLocation": "Udhewadi Base Village Camp (829m ASL)",
  "location": "Rajmachi Fort, Maharashtra",
  "elevation": "829m ASL",
  "difficulty": "Moderate (14 km Trail Circuit)",
  "startDate": "2026-05-03",
  "endDate": "2026-05-04",
  "duration": "2 Days / 1 Night",
  "lat": 18.8286,
  "lon": 73.3986,
  "geofence": {
    "lat": 18.8286,
    "lon": 73.3986,
    "radius": 2500,                   // Radial corridor in meters (e.g. 2.5 km)
    "zoneName": "Rajmachi Safe Corridor"
  },
  "maxRoster": 25
}</code></pre>

  <h2>4.3 Collection: <code>sosEvents/{sosId}</code></h2>
  <p>Emergency distress incidents dispatched to SAR command:</p>
  <pre><code>{
  "id": "SOS-1794500000000",
  "sosId": "SOS-1794500000000",
  "userId": "Kz3X4F9M0bQ8...",
  "userName": "Anirban Panda",
  "tripId": "rajmachi-monsoon-2026",
  "tripName": "Rajmachi Fort Monsoon Expedition — Batch 12",
  "lat": 18.8295,
  "lon": 73.3992,
  "altitude": 834,
  "accuracy": 3.2,
  "battery": 85,
  "heartRate": 128,                   // Elevated distress tachycardia
  "bloodGroup": "B+ Positive",
  "medicalNotes": "Mild pollen allergy; carries EpiPen",
  "emergencyContact": "Pooja Panda (+91 98765 00001)",
  "status": "active",                 // "active" | "sar_dispatched" | "resolved" | "cancelled"
  "triggerTimestamp": "2026-11-12T13:42:00.000Z",
  "sarNotes": "Team Echo dispatched from Udhewadi base camp with stretcher and medical kit.",
  "resolvedAt": null,
  "resolvedBy": null
}</code></pre>

  <!-- REALTIME TELEMETRY & SOCKET.IO -->
  <div class="page-break"></div>
  <h1>5. Real-time Telemetry &amp; Socket.IO Engine</h1>

  <h2>5.1 Socket Event Flow Architecture</h2>
  <p>
    The tracking server running on <code>http://localhost:4000</code> acts as the bidirectional spatial router between field trekkers, hardware gateways, and command dashboards:
  </p>

  <table>
    <thead>
      <tr>
        <th>Event Name</th>
        <th>Direction</th>
        <th>Payload Schema</th>
        <th>Behavior &amp; Trigger</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><code>location_update</code></td>
        <td>Client → Server</td>
        <td><code>{ userId, name, lat, lon, altitude, accuracy, speed, heartRate, spo2, battery, tripId }</code></td>
        <td>Fires every 5s from User App GPS or ESP32 node. Stores position in memory &amp; RTDB.</td>
      </tr>
      <tr>
        <td><code>admin_location_broadcast</code></td>
        <td>Server → Admins</td>
        <td><code>Map&lt;userId, TrekkerTelemetryRecord&gt;</code></td>
        <td>Streams live position of all active trekkers to the Leaflet tactical radar.</td>
      </tr>
      <tr>
        <td><code>sos_trigger</code></td>
        <td>Client → Server</td>
        <td><code>{ sosId, userId, name, lat, lon, altitude, blood, medical, battery, heartRate, tripId }</code></td>
        <td>Initiated when trekker finishes double-confirmation SOS flow. Writes to Firestore &amp; RTDB.</td>
      </tr>
      <tr>
        <td><code>sos_admin_alert</code></td>
        <td>Server → Admins</td>
        <td><code>{ sosEvent, activeCount, soundAlarm: true }</code></td>
        <td>Fires audio siren (850Hz beeper) and flashes full-screen tactical emergency overlay on admin app.</td>
      </tr>
      <tr>
        <td><code>sos_cancel</code></td>
        <td>Client/Admin → Server</td>
        <td><code>{ sosId, reason: "false_claim", cancelledBy }</code></td>
        <td><strong>Instant cross-sync:</strong> Immediately silences alarms on both user and admin applications.</td>
      </tr>
      <tr>
        <td><code>sos_resolve</code></td>
        <td>Admin → Server</td>
        <td><code>{ sosId, resolvedBy, sarNotes }</code></td>
        <td>Admin marks SAR mission as resolved. Archives incident report in Firestore.</td>
      </tr>
    </tbody>
  </table>

  <h2>5.2 Audio Siren Synthesizer Implementation</h2>
  <p>
    Both <code>user-app</code> and <code>admin-app</code> feature built-in Web Audio API synthesizers that do not require external MP3 assets to trigger audible mountain distress beeps:
  </p>
  <pre><code>// Web Audio Emergency Siren Synthesizer
function playEmergencyBeep(freq = 880, durationMs = 400) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.5, ctx.currentTime + (durationMs / 1000) * 0.5);
    osc.frequency.exponentialRampToValueAtTime(freq, ctx.currentTime + (durationMs / 1000));
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + (durationMs / 1000));
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (durationMs / 1000));
  } catch (e) {
    console.warn("Audio Context alert failed:", e);
  }
}</code></pre>

  <!-- HARDWARE & FIRMWARE SPECIFICATIONS -->
  <div class="page-break"></div>
  <h1>6. Hardware Engineering, LoRa RF &amp; Firmware Specs</h1>

  <h2>6.1 Hardware Bill of Materials (BOM)</h2>
  <p>
    The field hardware provides true off-grid connectivity when cellular base stations are miles away:
  </p>

  <table>
    <thead>
      <tr>
        <th>Component</th>
        <th>Part Number</th>
        <th>Interface</th>
        <th>Function &amp; Operating Characteristics</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Microcontroller</strong></td>
        <td>ESP32-WROOM-32D</td>
        <td>Dual Core 240MHz</td>
        <td>Core system logic, LoRa packet framing, Bluetooth LE peripheral mode.</td>
      </tr>
      <tr>
        <td><strong>LoRa Transceiver</strong></td>
        <td>Semtech SX1276 / RFM95W</td>
        <td>SPI (10 MHz)</td>
        <td>IN865 band (865.0625 MHz), +14 dBm transmit power, -148 dBm sensitivity.</td>
      </tr>
      <tr>
        <td><strong>Precision Barometer</strong></td>
        <td>Bosch BMP280</td>
        <td>I2C (Address 0x76)</td>
        <td>Measures barometric pressure (±0.12 hPa) for accurate altitude ASL &amp; storm detection.</td>
      </tr>
      <tr>
        <td><strong>Temperature/Humidity</strong></td>
        <td>Sensirion SHT31 / DHT22</td>
        <td>I2C / 1-Wire</td>
        <td>Measures ambient mountain temperature and dew point to predict sudden freeze/fog.</td>
      </tr>
      <tr>
        <td><strong>Air Quality &amp; Smoke</strong></td>
        <td>Plantower PMS5003</td>
        <td>UART Serial (9600 bps)</td>
        <td>Laser particulate matter (PM2.5 / PM10) for forest fire and dust storm alerts.</td>
      </tr>
      <tr>
        <td><strong>Satellite Positioning</strong></td>
        <td>u-blox NEO-6M / M8N</td>
        <td>UART Serial (9600 bps)</td>
        <td>NMEA GPS/GLONASS positioning with active ceramic patch antenna.</td>
      </tr>
      <tr>
        <td><strong>Power Source</strong></td>
        <td>Panasonic NCR18650B</td>
        <td>TP4056 + ME6211 LDO</td>
        <td>3.7V 3400mAh Li-ion cell. Up to 72 hours continuous beaconing at 15s intervals.</td>
      </tr>
    </tbody>
  </table>

  <h2>6.2 ESP32 Pinout Configuration Matrix</h2>
  <table>
    <thead>
      <tr>
        <th>ESP32 GPIO</th>
        <th>Module Pin</th>
        <th>Protocol / Mode</th>
        <th>Hardware Function</th>
      </tr>
    </thead>
    <tbody>
      <tr><td><code>GPIO 5</code></td><td>SX1276 NSS</td><td>SPI Chip Select</td><td>Active LOW SPI select for LoRa RF module</td></tr>
      <tr><td><code>GPIO 18</code></td><td>SX1276 SCK</td><td>SPI Clock</td><td>Serial clock up to 10 MHz</td></tr>
      <tr><td><code>GPIO 19</code></td><td>SX1276 MISO</td><td>SPI Master In</td><td>LoRa data reception</td></tr>
      <tr><td><code>GPIO 23</code></td><td>SX1276 MOSI</td><td>SPI Master Out</td><td>LoRa register configuration &amp; TX packet push</td></tr>
      <tr><td><code>GPIO 14</code></td><td>SX1276 RST</td><td>Output Pulse</td><td>Hardware reset pin for transceiver initialization</td></tr>
      <tr><td><code>GPIO 26</code></td><td>SX1276 DIO0</td><td>Interrupt In</td><td>Fires on <code>TxDone</code> and <code>RxDone</code> packet interrupts</td></tr>
      <tr><td><code>GPIO 21</code></td><td>BMP280 SDA</td><td>I2C Data</td><td>4.7kΩ pull-up to 3.3V</td></tr>
      <tr><td><code>GPIO 22</code></td><td>BMP280 SCL</td><td>I2C Clock</td><td>4.7kΩ pull-up to 3.3V (400 kHz Fast Mode)</td></tr>
      <tr><td><code>GPIO 16</code></td><td>NEO-6M TX</td><td>UART2 RX</td><td>Receives raw NMEA sentences ($GPRMC, $GPGGA)</td></tr>
      <tr><td><code>GPIO 17</code></td><td>NEO-6M RX</td><td>UART2 TX</td><td>Sends UBX configuration commands to GPS module</td></tr>
      <tr><td><code>GPIO 34</code></td><td>Battery Sense</td><td>ADC1 Ch 6</td><td>Voltage divider (100kΩ/100kΩ) to measure 0–4.2V</td></tr>
      <tr><td><code>GPIO 15</code></td><td>Distress Button</td><td>GPIO Pull-up</td><td>Emergency momentary pushbutton (hold 3s for SOS)</td></tr>
    </tbody>
  </table>

  <h2>6.3 LoRa RF IN865 Frequency Plan (Indian Spectrum Regulations)</h2>
  <div class="callout callout-info">
    <div class="callout-title">📡 Wireless Planning &amp; Coordination (WPC) Compliance</div>
    In India, the 865.0625 MHz to 867.0000 MHz spectrum is de-licensed for Low Power Wireless Equipment (GSR 564(E)). Margsutra operates within:
    <ul style="margin-top: 6px; margin-bottom: 0;">
      <li><strong>Frequencies:</strong> Channel 1: <code>865.0625 MHz</code>, Channel 2: <code>865.4025 MHz</code>, Channel 3: <code>865.9850 MHz</code></li>
      <li><strong>Bandwidth:</strong> 125 kHz</li>
      <li><strong>Spreading Factor:</strong> SF9 (optimal balance between 4.5 km range in canyons and low airtime)</li>
      <li><strong>Coding Rate:</strong> 4/5</li>
      <li><strong>Max Effective Radiated Power (ERP):</strong> 25 mW (+14 dBm)</li>
    </ul>
  </div>

  <!-- UI/UX DESIGN & ANTI-CLUTTER PRINCIPLES -->
  <div class="page-break"></div>
  <h1>7. UI/UX Design System &amp; Anti-Clutter Principles</h1>

  <h2>7.1 Critique of Legacy Layout Clutter</h2>
  <p>
    During early development, features were added rapidly without strict visual hierarchy, resulting in pages packed with duplicate badges, yellow warning callouts, unformatted tables, and fake desktop Bluetooth scans. The user rightly noted:
  </p>
  <blockquote style="border-left: 4px solid #cbd5e1; padding-left: 14px; margin: 12px 0; color: #64748b; font-style: italic;">
    "Expeditions &amp; Trips, tell me one single website that is this messy? Even news websites do organize things in a beautiful visual way. If I show this to a customer he will walk away... There is no design language, anything and everything is showing here and there, too much information. What to show, what not to show, what to make bigger highlight, what not to emphasize... Remember how things are designed and shown in real production websites that people actually use."
  </blockquote>

  <h2>7.2 Core Design Principles for Incoming Engineers</h2>
  <ol>
    <li>
      <strong>Strict Visual Hierarchy (F-Pattern):</strong>
      The most critical datum must always be largest and most prominent (e.g. Active Expedition Banner or Red SOS Status). Secondary details (coordinates, timestamps, VHF channel) must be smaller and styled with muted slate colors (<code>#64748b</code> / <code>#94a3b8</code>).
    </li>
    <li>
      <strong>Progressive Disclosure:</strong>
      Never render full diagnostic logs, raw database keys, or long tables directly on the primary dashboard. Use clean accordion drawers ("Manage Expedition ▾", "View Telemetry Diagnostics ▾") or focused slide-over modals.
    </li>
    <li>
      <strong>Elimination of Fake Bluetooth Devices:</strong>
      Do NOT scan desktop Web Bluetooth for random mice, keyboards, or televisions. The "Field Hardware &amp; Beacons" view must represent real mountain hardware: LoRa Base Station Gateway, Packet RSSI/SNR signal meters, Satellite Lock Status, and Battery %.
    </li>
    <li>
      <strong>Consolidation of Redundant Nav Items:</strong>
      Recently implemented in commit <code>35248a6</code>: "Safety Directives &amp; Protocols" was removed from the sidebar and integrated directly into "Expeditions &amp; Rosters" as a top-level tab and per-trek SOP drawer. This reduces cognitive overload.
    </li>
    <li>
      <strong>Single Active Expedition Constraint:</strong>
      A trekker can participate in at most one active expedition at a time to maintain uninterrupted duty-of-care. Rather than cluttering the screen with massive yellow warning blocks, display the currently enrolled trek card prominently at the top with a clean "Leave Trip" button, and disable join buttons on other expeditions with an elegant, subtle tooltip.
    </li>
  </ol>

  <!-- RECENT CHANGELOG -->
  <div class="page-break"></div>
  <h1>8. Audit of Completed Work &amp; Recent Fixes</h1>

  <h2>8.1 Changelog Summary (Commits 7f48edf through 35248a6)</h2>
  <table>
    <thead>
      <tr>
        <th>Subsystem / Area</th>
        <th>Problem Identified</th>
        <th>Solution Implemented</th>
        <th>Verification</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Auth &amp; Credentials</strong></td>
        <td><code>admin@coordage.app</code> worked but user requested <code>admin@margsutra.app / admin123</code>.</td>
        <td>Created user in Firebase Auth and seeded Firestore <code>users/demo-admin-001</code>. Purged all coordage records.</td>
        <td>Tested via curl: 200 OK JWT issued; coordage returns 401 Unauthorized.</td>
      </tr>
      <tr>
        <td><strong>Admin Login UI</strong></td>
        <td>Cluttered demo auto-fill box and redundant "Request Admin Access" button.</td>
        <td>Removed auto-fill box, removed redundant link, standardized input styles and button text to "Log In".</td>
        <td>Matches User App login aesthetics with clean tactical dark theme.</td>
      </tr>
      <tr>
        <td><strong>SOS Dual-Confirmation</strong></td>
        <td>Single click could trigger false SAR alarm; no cancellation synchronization.</td>
        <td>Added 2-step confirmation modal with 5s countdown, audio siren, and instant cancellation sync across apps.</td>
        <td>Simulated SOS trigger: admin app beeps, cancelling immediately silences alarm.</td>
      </tr>
      <tr>
        <td><strong>Navigation Consolidation</strong></td>
        <td>Separate sidebar button for "Safety Directives &amp; Protocols" cluttered admin navigation.</td>
        <td>Integrated protocols directly into "Expeditions &amp; Rosters" (top-level switcher + per-trip drawer).</td>
        <td>Sidebar reduced to 7 high-impact command items; 0 build errors.</td>
      </tr>
      <tr>
        <td><strong>Biometric Wearable Radar</strong></td>
        <td>Desktop BLE scanning tried to connect to office headphones and keyboards.</td>
        <td>Replaced with trekker biometric stream radar displaying live heart rate, SpO2, and ascent speed.</td>
        <td>Displays 6 active team members with live duty-of-care health status.</td>
      </tr>
    </tbody>
  </table>

  <!-- PRIORITIZED BACKLOG FOR INCOMING AI -->
  <div class="page-break"></div>
  <h1>9. Prioritized Engineering Backlog for Incoming AI</h1>

  <p>
    The incoming AI agent should execute the following tasks in priority order to bring Margsutra to full commercial release:
  </p>

  <h2>Task 1: Redesign User App "Expeditions &amp; Trips" (High Priority)</h2>
  <ul class="checklist">
    <li>
      <strong>Refactor <code>user-app/src/App.jsx</code>:</strong>
      Clean up the messy card layout highlighted in the user's screenshots.
    </li>
    <li>
      <strong>Hero Active Trip Card:</strong> Make the enrolled trip look like a modern airline boarding pass or high-end expedition permit. Display Trail Name, Batch Code, Leader with badge, VHF channel, and clear action button ("Open Live Trail Radar →").
    </li>
    <li>
      <strong>Compact Biometric Vitals Bar:</strong> Present Heart Rate, SpO2, Barometric Altitude, and Battery as a sleek horizontal telemetry pill bar rather than an oversized block taking up half the screen.
    </li>
    <li>
      <strong>De-emphasize Other Treks:</strong> Available upcoming treks should be presented as clean, minimalist cards in a 2-column grid with a subtle "Switch Trek" action if already enrolled.
    </li>
  </ul>

  <h2>Task 2: Refine Admin App "Field Hardware &amp; Beacons" (High Priority)</h2>
  <ul class="checklist">
    <li>
      <strong>Grounded Hardware Representation:</strong> Eliminate all generic desktop Bluetooth devices from <code>PageDeviceTracking</code>.
    </li>
    <li>
      <strong>LoRa Gateway Base Station:</strong> Display the status of ESP32 Gateway Node (IP address, Uptime, LoRa Radio Frequency 865.0625 MHz, Packets Received, Packet Loss Rate).
    </li>
    <li>
      <strong>Trekker Hardware Beacons:</strong> Display each trekker's assigned beacon hardware ID, battery millivolts, RSSI (dBm), SNR (dB), and GPS lock accuracy.
    </li>
    <li>
      <strong>Live Weather Station Telemetry:</strong> Ingest real readings from the BMP280 barometer and DHT22 sensors to show live barometric trend (Rising / Steady / Rapid Drop Storm Warning).
    </li>
  </ul>

  <h2>Task 3: Full Ground-Level End-to-End Validation (Medium Priority)</h2>
  <ul class="checklist">
    <li>
      Start all 4 daemons simultaneously (ports 5173, 5174, 5050, 4000).
    </li>
    <li>
      Log in as <code>anirban@margsutra.app</code> on User App and <code>admin@margsutra.app</code> on Admin App.
    </li>
    <li>
      Verify that moving coordinates on User App updates the position marker in real-time on the Admin Leaflet map.
    </li>
    <li>
      Trigger an emergency SOS on User App: verify admin alert appears with audio beeper.
    </li>
    <li>
      Cancel SOS on User App: verify admin alert dismisses instantly without requiring page reload.
    </li>
  </ul>

  <!-- RUNBOOK & TROUBLESHOOTING -->
  <div class="page-break"></div>
  <h1>10. Runbook, Daemon Orchestration &amp; Troubleshooting</h1>

  <h2>10.1 Starting the Services (Local Development Environment)</h2>
  <pre><code># 1. Start Backend REST API (Port 5050)
cd /Users/anirban/Downloads/Coordage/backend
npm run dev

# 2. Start Socket.IO Spatial Tracking Server (Port 4000)
cd /Users/anirban/Downloads/Coordage/tracking
npm run dev

# 3. Start Admin Dashboard (Port 5174)
cd /Users/anirban/Downloads/Coordage/admin-app
npm run dev -- --port 5174

# 4. Start Trekker User PWA (Port 5173)
cd /Users/anirban/Downloads/Coordage/user-app
npm run dev -- --port 5173</code></pre>

  <h2>10.2 Port Collision Troubleshooting</h2>
  <p>
    If any service fails with <code>EADDRINUSE</code>, use the following terminal commands to identify and terminate stale Node processes:
  </p>
  <pre><code># Inspect which PID is holding port 4000, 5050, 5173, or 5174
lsof -i :4000
lsof -i :5050

# Terminate process cleanly
kill -9 &lt;PID&gt;</code></pre>

  <h2>10.3 Database Seeding &amp; Reset</h2>
  <p>
    To reset all Firebase Auth users and Firestore documents to pristine default conditions:
  </p>
  <pre><code>cd /Users/anirban/Downloads/Coordage/backend
node seed.js</code></pre>

  <div style="margin-top: 50px; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 24px; color: #64748b; font-size: 8.5pt;">
    MARGSUTRA (मार्गसूत्र) · High-Altitude Mountain Expedition &amp; SAR Dispatch Platform<br>
    Handover Document Compiled for Autonomous AI Engineering Systems · Confirmed Commit 35248a6
  </div>

</body>
</html>
`;

// 1. Write HTML file
const htmlPath = path.join("/Users/anirban/Downloads/Coordage", "Margsutra_Handover_Specification.html");
fs.writeFileSync(htmlPath, htmlContent, "utf8");
console.log("Successfully wrote HTML specification to:", htmlPath);

// 2. Compile to PDF using Microsoft Edge Headless
const pdfPath = path.join("/Users/anirban/Downloads/Coordage", "Margsutra_Comprehensive_Handover_Specification.pdf");
const edgeBinary = "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";

console.log("Compiling PDF with Microsoft Edge headless...");
try {
  const cmd = `"${edgeBinary}" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="${pdfPath}" "file://${htmlPath}"`;
  execSync(cmd, { stdio: "inherit" });
  console.log("Successfully generated PDF:", pdfPath);
  const stats = fs.statSync(pdfPath);
  console.log("PDF File Size:", (stats.size / 1024).toFixed(1), "KB");
} catch (err) {
  console.error("Failed to generate PDF:", err);
  process.exit(1);
}
