import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useAdminTracking } from "./hooks/useAdminTracking";
import {
  adminLogin,
  registerAdminAccount,
  fetchPendingAdmins,
  approveAdmin,
  rejectAdmin,
  fetchPendingTripRequests,
  approveTrekker,
  removeTrekker,
  fetchTripRoster,
  createSafetyProtocol,
  deleteSafetyProtocol,
  subscribeToSafetyProtocols,
  updateSafetyProtocol,
  createTrip as createTripRemote,
  deleteTrip as deleteTripRemote,
  setActiveManagedTrip as setActiveManagedTripRemote,
  updateTrip as updateTripRemote,
  updateTripGeofence as updateTripGeofenceRemote,
  subscribeToTrips,
  subscribeToUsers,
  subscribeToSOSEvents,
  resolveSOSEvent,
  acknowledgeSOSEvent,
  broadcastSOSAlert,
  triggerDemoSOSEvent,
  DEMO_ADMIN_EMAIL,
  DEMO_PASSWORD,
  updateUserFeatureAccess,
  setAdminToken,
  authHeaders,
} from "./services/firebase";
import {
  calculateDistanceMeters,
  formatDistance,
  RAJMACHI_ADMIN,
  RAJMACHI_MEMBERS,
} from "./services/expeditionTeam";

/* ════════════════════════════════════════════════
   PAGE ERROR BOUNDARY
   A crashing console page must not leave the duty
   officer without the controls they need.
════════════════════════════════════════════════ */
class PageErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[Admin] Page crashed:", error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ padding: 24, display: "flex", justifyContent: "center" }}>
        <div style={{
          maxWidth: 460, width: "100%", background: "rgba(239,68,68,0.08)",
          border: "1px solid rgba(239,68,68,0.3)", borderRadius: 16, padding: 24, textAlign: "center",
        }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>⚠️</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 6 }}>
            This console view hit an error
          </div>
          <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.6, marginBottom: 16 }}>
            The incident feed and every other console page are still available. Reload this view to
            continue — active SOS beacons are unaffected.
          </div>
          <div style={{ fontSize: 11, color: C.muted2, marginBottom: 16, wordBreak: "break-word" }}>
            {String(this.state.error?.message || this.state.error)}
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={() => this.setState({ error: null })}
              style={{ padding: "9px 18px", borderRadius: 9, background: "rgba(59,130,246,0.16)",
                border: "1px solid rgba(59,130,246,0.35)", color: C.accent, fontSize: 12.5, fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit" }}>
              Try again
            </button>
            <button onClick={() => window.location.reload()}
              style={{ padding: "9px 18px", borderRadius: 9, background: "rgba(255,255,255,0.06)",
                border: `1px solid ${C.border}`, color: C.text, fontSize: 12.5, fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit" }}>
              Reload console
            </button>
          </div>
        </div>
      </div>
    );
  }
}

/* ════════════════════════════════════════════════
   DESIGN TOKENS
════════════════════════════════════════════════ */
const C = {
  bg: "#080f1a", sidebar: "#0b1422", panel: "rgba(11,20,34,0.95)",
  card: "rgba(255,255,255,0.04)", border: "rgba(80,140,220,0.14)",
  border2: "rgba(80,140,220,0.28)", accent: "#3b82f6", accent2: "#1d4ed8",
  green: "#22c55e", amber: "#f59e0b", red: "#ef4444", purple: "#a78bfa",
  teal: "#14b8a6", text: "#e2e8f0", muted: "rgba(180,210,245,0.5)", muted2: "rgba(180,210,245,0.28)",
};

const AUTH_API_URL = import.meta.env.VITE_AUTH_API_URL || "http://localhost:5050/api";

/* ════════════════════════════════════════════════════════════════════════
   EXPEDITION SEED DATA & REAL-TIME DEFAULTS
════════════════════════════════════════════════════════════════════════ */
const USERS = RAJMACHI_MEMBERS;

const TRIPS = [
  {
    id: "trip-001",
    name: "Rajmachi Fort Monsoon Trek — Batch 12",
    date: "May 3, 2026 · 06:30 AM – May 4, 2026 · 05:00 PM",
    startDate: "May 3, 2026",
    startTime: "06:30 AM",
    endDate: "May 4, 2026",
    endTime: "05:00 PM",
    duration: "2 Days / 1 Night",
    pickupLocation: "Lonavala Railway Station (Platform 1 Exit, Ticket Counter)",
    baseLocation: "Udhewadi Base Village Camp (829m ASL)",
    location: "Rajmachi Fort, Maharashtra",
    elevation: "829m ASL",
    difficulty: "Moderate (14 km Trail Circuit)",
    leader: "Field Guide Ajay Saini",
    vhfChannel: "145.500 MHz (VHF Ch 1)",
    rosterCount: 5,
    maxRoster: 25,
    isManaged: true,
    status: "in-field",
    code: "RAJM26",
    lat: 18.8286,
    lon: 73.3986,
    geofence: {
      lat: 18.8286,
      lon: 73.3986,
      radius: 2500,
      zoneName: "Rajmachi Safe Trek Corridor",
    },
  },
  {
    id: "trip-002",
    name: "Harishchandragad Peak & Konkan Kada Trek",
    date: "May 10, 2026 · 05:30 AM – May 11, 2026 · 06:00 PM",
    startDate: "May 10, 2026",
    startTime: "05:30 AM",
    endDate: "May 11, 2026",
    endTime: "06:00 PM",
    duration: "2 Days / 1 Night",
    pickupLocation: "Kasara Railway Station (Main Concourse Exit)",
    baseLocation: "Khireshwar Base Village Camp (1,424m ASL)",
    location: "Harishchandragad, Ahmednagar, Maharashtra",
    elevation: "1,424m ASL",
    difficulty: "Challenging (Rock Patches & Cliff Edge)",
    leader: "Field Guide Ajay Saini",
    vhfChannel: "146.520 MHz (VHF Ch 2)",
    rosterCount: 0,
    maxRoster: 20,
    isManaged: false,
    status: "upcoming",
    code: "HAR26",
    lat: 19.3853,
    lon: 73.7786,
    geofence: {
      lat: 19.3853,
      lon: 73.7786,
      radius: 3000,
      zoneName: "Harishchandragad Plateau Safety Perimeter",
    },
  },
];

const genTripCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
};

const DEVICES = [
  { id: "DEV001", name: "iPhone 15 Pro", user: "Anirban Panda", type: "phone", battery: 88, signal: "strong", gps: true, sos: true, lat: 18.8286, lon: 73.3986 },
  { id: "DEV002", name: "Garmin Instinct 2 Solar", user: "Anirban Panda", type: "watch", battery: 92, signal: "strong", gps: true, sos: true, lat: 18.8286, lon: 73.3986 },
  { id: "DEV003", name: "Apple Watch Ultra 2", user: "Rohan Sharma", type: "watch", battery: 78, signal: "strong", gps: true, sos: true, lat: 18.8271, lon: 73.3971 },
  { id: "DEV004", name: "Polar H10 Chest Sensor", user: "Pooja Iyer", type: "sensor", battery: 82, signal: "strong", gps: true, sos: true, lat: 18.8256, lon: 73.3958 },
  { id: "DEV005", name: "Coros Vertix 2", user: "Tanmay Deshmukh", type: "watch", battery: 71, signal: "strong", gps: true, sos: true, lat: 18.8242, lon: 73.3945 },
  { id: "DEV006", name: "Suunto 9 Peak", user: "Kavita Verma", type: "watch", battery: 64, signal: "strong", gps: true, sos: true, lat: 18.8229, lon: 73.3932 },
];

const BT_DEVICES = [
  { id: "BT001", name: "Garmin Instinct 2 Solar", mac: "A4:C1:38:1F:22:B5", rssi: -42, type: "watch", paired: true, user: "Anirban Panda" },
  { id: "BT002", name: "Apple Watch Ultra 2", mac: "98:B6:E9:12:43:A0", rssi: -55, type: "watch", paired: true, user: "Rohan Sharma" },
  { id: "BT003", name: "Polar H10 Chest Strap", mac: "00:22:D0:AA:3C:88", rssi: -48, type: "sensor", paired: true, user: "Pooja Iyer" },
  { id: "BT004", name: "Coros Vertix 2", mac: "7C:64:56:D8:3A:F1", rssi: -62, type: "watch", paired: true, user: "Tanmay Deshmukh" },
  { id: "BT005", name: "Suunto 9 Peak", mac: "B8:27:EB:4F:91:22", rssi: -69, type: "watch", paired: true, user: "Kavita Verma" },
  { id: "BT006", name: "Garmin InReach Mini 2", mac: "C0:38:96:E1:55:04", rssi: -36, type: "satellite", paired: true, user: "Ajay Saini" },
];

const SOS_EVENTS = [
  {
    id: "SOS-HIST-001",
    user: "Anirban Panda",
    userId: "9OovuZiHQnQKrLTuPF1J",
    city: "Rajmachi Fort Trail (Stream Crossing)",
    tripName: "Rajmachi Fort Monsoon Trek",
    tripCode: "RAJM26",
    lat: 18.8286,
    lon: 73.3986,
    time: "Yesterday 14:32",
    status: "resolved",
    resolution: "user_cancelled",
    resolutionNotes: "Trekker cancelled SOS beacon (Self-Resolved)",
    resolvedBy: "Trekker (Self-Resolved)",
    resolvedAt: "Yesterday 14:38",
    type: "Manual SOS Beacon",
    team: "Team Alpha (Lonavala Mountain SAR)",
    priority: "critical",
    blood: "B+",
    medical: "None reported",
    phone: "+91 86375 40813",
    ec: "Deepak Panda (Brother) · +91 91531 91902",
    vitals: { hr: 78, spo2: 98, alt: 829, battery: 88 },
  },
];

const SOS_TEAMS = [
  {
    id: "T001",
    name: "Team Alpha (Lonavala Mountain SAR)",
    lead: "Inspector R. Gaikwad (Shivdurga Rescue)",
    members: 6,
    status: "standby",
    lat: 18.7612,
    lon: 73.3714,
    heading: 32,
    speed: "0 km/h",
    eta: "14 min",
    vehicle: "4x4 Tactical QRV & Alpine Stretcher Unit",
    vhf: "145.500 MHz",
    base: "Khandala Mountain Safety Post",
    assignedTo: null,
  },
  {
    id: "T002",
    name: "Team Bravo (Karjat Foothill Unit)",
    lead: "Field Medic S. Kadam",
    members: 4,
    status: "standby",
    lat: 18.8201,
    lon: 73.3450,
    heading: 75,
    speed: "0 km/h",
    eta: "25 min",
    vehicle: "Trailhead Rapid First Responder",
    vhf: "145.500 MHz",
    base: "Kondhane Caves Staging Base",
    assignedTo: null,
  },
];

const PROTOCOLS = [
  { id: "P001", title: "Arrival & check-in protocol", body: "Upon arriving at the trek base, register at the check-in kiosk. Confirm your emergency contacts and ensure your device GPS is active.", status: "published", updated: "Apr 10, 2026", author: "Admin" },
  { id: "P002", title: "Daily check-in rules", body: "Send a live-status ping every 4 hours during active trekking. If no ping is received within 6 hours, the system triggers an automatic welfare check.", status: "published", updated: "Apr 8, 2026", author: "Admin" },
  { id: "P003", title: "Offline & no-signal zones", body: "Carry a LoRa-enabled satellite communicator when entering zones marked orange on your map. Pre-download offline maps before departure.", status: "draft", updated: "Apr 11, 2026", author: "Admin" },
  { id: "P004", title: "SOS trigger procedure", body: "Press and hold the SOS button for 3 seconds to prevent accidental triggers. The system broadcasts your GPS coordinates and medical profile to the nearest rescue team.", status: "published", updated: "Mar 28, 2026", author: "Admin" },
  { id: "P005", title: "Medical emergency guidelines", body: "Your blood group and medical conditions are auto-shared with any dispatched rescue team. Use the medical alert shortcut on your dashboard before triggering SOS.", status: "draft", updated: "Apr 9, 2026", author: "Admin" },
];

const FEATURES = ["Weather", "Weather Maps", "Join Trip", "Safety Protocol", "Device Connect", "Emergency SOS", "Live Navigation", "Bluetooth Devices"];

const Pill = ({ color, children }) => {
  const map = { green: { bg: "rgba(34,197,94,0.12)", text: "#86efac" }, red: { bg: "rgba(239,68,68,0.12)", text: "#fca5a5" }, amber: { bg: "rgba(245,158,11,0.12)", text: "#fcd34d" }, blue: { bg: "rgba(59,130,246,0.14)", text: "#93c5fd" }, purple: { bg: "rgba(167,139,250,0.12)", text: "#c4b5fd" }, teal: { bg: "rgba(20,184,166,0.12)", text: "#5eead4" }, gray: { bg: "rgba(255,255,255,0.07)", text: "rgba(180,210,245,0.6)" } };
  const s = map[color] || map.gray;
  return <span style={{ fontSize: 11, padding: "2px 9px", borderRadius: 20, fontWeight: 500, background: s.bg, color: s.text }}>{children}</span>;
};
const Card = ({ children, style, className }) => <div className={className} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px", ...style }}>{children}</div>;
const StatCard = ({ label, value, sub, color = C.accent, icon }) => (
  <Card style={{ marginBottom: 0 }}>
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
      <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</div>
      {icon && <span style={{ fontSize: 18 }}>{icon}</span>}
    </div>
    <div style={{ fontSize: 26, fontWeight: 700, color, marginBottom: 2 }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: C.muted2 }}>{sub}</div>}
  </Card>
);
const TH = ({ children, style }) => <th style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em", padding: "10px 12px", textAlign: "left", fontWeight: 500, borderBottom: `1px solid ${C.border}`, ...style }}>{children}</th>;
const TD = ({ children, style }) => <td style={{ fontSize: 13, padding: "11px 12px", color: C.text, borderBottom: `1px solid ${C.border}`, verticalAlign: "middle", ...style }}>{children}</td>;
const Avatar = ({ initials, bg, text, size = 32 }) => <div style={{ width: size, height: size, borderRadius: "50%", background: bg || "rgba(59,130,246,0.18)", color: text || C.accent, fontSize: size * 0.35, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{initials}</div>;
const Toggle = ({ on, onChange }) => <div onClick={onChange} style={{ width: 36, height: 20, borderRadius: 10, background: on ? C.accent : "rgba(255,255,255,0.12)", position: "relative", cursor: "pointer", transition: "background 0.25s", flexShrink: 0 }}><div style={{ position: "absolute", top: 3, left: on ? 19 : 3, width: 14, height: 14, borderRadius: "50%", background: "#fff", transition: "left 0.25s" }} /></div>;
const Input = ({ value, onChange, placeholder, type = "text", style: sx }) => <input type={type} value={value} onChange={onChange} placeholder={placeholder} style={{ height: 36, width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 13, padding: "0 12px", fontFamily: "inherit", boxSizing: "border-box", outline: "none", ...sx }} />;
const Btn = ({ children, onClick, variant = "default", style: sx }) => {
  const v = { primary: { background: C.accent, color: "#fff", border: "none" }, danger: { background: C.red, color: "#fff", border: "none" }, success: { background: "rgba(34,197,94,0.15)", color: C.green, border: `1px solid rgba(34,197,94,0.3)` }, default: { background: "rgba(255,255,255,0.05)", color: C.text, border: `1px solid ${C.border}` }, ghost: { background: "transparent", color: C.muted, border: "none" } };
  return <button onClick={onClick} style={{ padding: "7px 16px", borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6, ...v[variant], ...sx }}>{children}</button>;
};
const PageHeader = ({ title, sub, right }) => (
  <div className="page-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
    <div><h1 style={{ fontSize: 20, fontWeight: 600, color: C.text, margin: 0 }}>{title}</h1>{sub && <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{sub}</div>}</div>
    {right}
  </div>
);

const LEAFLET_CSS_ID = "leaflet-css-v194";
const LEAFLET_JS_ID = "leaflet-js-v194";

const ensureLeaflet = (onReady) => {
  if (window.L) { onReady(); return; }
  if (!document.getElementById(LEAFLET_CSS_ID)) {
    const css = document.createElement("link");
    css.id = LEAFLET_CSS_ID; css.rel = "stylesheet"; css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(css);
  }
  if (!document.getElementById(LEAFLET_JS_ID)) {
    const js = document.createElement("script");
    js.id = LEAFLET_JS_ID; js.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    document.head.appendChild(js);
  }
  const poll = setInterval(() => { if (window.L) { clearInterval(poll); onReady(); } }, 80);
};

const injectLeafletStyles = (() => {
  let done = false;
  return () => {
    if (done) return; done = true;
    const s = document.createElement("style");
    s.textContent = `
      @keyframes llm-pulse { 0% { transform:translate(-50%,-50%) scale(.4); opacity:.8; } 100% { transform:translate(-50%,-50%) scale(2.6); opacity:0; } }
      .leaflet-container { background:#08101e !important; }
      .leaflet-tile-pane { filter: saturate(.85) brightness(.92); }
      .leaflet-popup-content-wrapper { background:#0b1422; color:#e2e8f0; border:1px solid rgba(80,140,220,0.25); border-radius:10px; box-shadow:0 4px 20px rgba(0,0,0,.6); }
      .leaflet-popup-content { margin:10px 14px; font-family:sans-serif; font-size:12px; line-height:1.5; }
      .leaflet-popup-tip { background:#0b1422; }
      .leaflet-control-zoom { border:1px solid rgba(80,140,220,0.25) !important; border-radius:8px !important; overflow:hidden; }
      .leaflet-control-zoom a { background:rgba(11,20,34,0.95) !important; color:#e2e8f0 !important; border-bottom:1px solid rgba(80,140,220,0.2) !important; font-size:16px !important; }
      .leaflet-control-zoom a:hover { background:rgba(59,130,246,0.18) !important; }
      .leaflet-control-attribution { background:rgba(8,15,26,0.7) !important; color:#64748b !important; font-size:9px !important; }
    `;
    document.head.appendChild(s);
  };
})();

const makeDotIcon = (L, color, size = 12, pulse = false, ringColor = null) => L.divIcon({
  className: "",
  html: `<div style="position:relative;width:${size + 16}px;height:${size + 16}px;">
    ${pulse ? `<div style="position:absolute;top:50%;left:50%;width:${size + 10}px;height:${size + 10}px;border-radius:50%;border:2.5px solid ${ringColor || color};animation:llm-pulse 1.6s ease-out infinite;"></div>` : ""}
    <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 0 0 4px ${color}44,0 2px 8px rgba(0,0,0,.5);z-index:1;"></div>
  </div>`,
  iconSize: [size + 16, size + 16],
  iconAnchor: [(size + 16) / 2, (size + 16) / 2],
  popupAnchor: [0, -(size / 2 + 10)],
});

const makeTeamIcon = (L, name, deployed) => {
  const label = name.replace("Team ", "");
  const bg = deployed ? "#f59e0b" : "rgba(100,100,100,0.7)";
  return L.divIcon({
    className: "",
    html: `<div style="background:${bg};border-radius:7px;padding:3px 9px;font-size:10px;font-weight:800;color:#000;white-space:nowrap;box-shadow:0 2px 10px ${bg}88;border:1.5px solid rgba(255,255,255,0.3);">${label}</div>`,
    iconSize: null, iconAnchor: [22, 13], popupAnchor: [0, -16],
  });
};

const buildFallbackRoute = (selectedSOS) => {
  if (!selectedSOS) return [];

  const targetName = selectedSOS.user || "Distressed Trekker";
  const destination = selectedSOS.city || "Rajmachi Fort Trail";

  return [
    { icon: "🚨", instr: "Deploy from Khandala Mountain Safety Post via Tungarli trail corridor", dist: "Staging Base: 0.0 km", road: "Khandala – Tungarli Access Route" },
    { icon: "🚙", instr: "4x4 Tactical transit along upper Rajmachi forest track toward Udhewadi base", dist: "5.4 km · Rough Ghat trail", road: "Rajmachi Forest Trail" },
    { icon: "🎒", instr: "Transfer to alpine foot rescue unit with basket stretcher & oxygen kit", dist: "1.8 km to coordinates", road: "Manoranjan Ridge Track" },
    { icon: "↗", instr: `Establish visual line-of-sight and VHF 145.500 MHz voice link with ${targetName}`, dist: "450 m · Final approach", road: "Stream Crossing Corridor" },
    { icon: "✅", instr: `Reach ${targetName} at ${destination}, verify triage biometrics, initiate field evacuation`, dist: "On-scene · Leader Ajay Saini in direct contact", road: "Active extraction zone" },
  ];
};

const LiveMap = ({ points = [], teams = [], height = 380, showPulse = true, routeFrom = null, routeTo = null, routePath = null, zoom: _zoom, onZoom }) => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const routeRef = useRef(null);
  const [ready, setReady] = useState(!!window.L);

  useEffect(() => { injectLeafletStyles(); ensureLeaflet(() => setReady(true)); }, []);

  useEffect(() => {
    if (!ready || !containerRef.current || mapRef.current) return;
    const L = window.L;
    const map = L.map(containerRef.current, { center: [20.5937, 78.9629], zoom: 5, zoomControl: true, attributionControl: true, preferCanvas: true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© <a href='https://www.openstreetmap.org/copyright' style='color:#64748b'>OpenStreetMap</a>", maxZoom: 19 }).addTo(map);
    mapRef.current = map;
    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, [ready]);

  const pointsKey = JSON.stringify(points.map(p => ({ id: p.id, lat: p.lat, lon: p.lon, status: p.status })));
  const teamsKey = JSON.stringify(teams.map(t => ({ id: t.id, lat: t.lat, lon: t.lon, status: t.status })));

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const L = window.L; const map = mapRef.current;
    markersRef.current.forEach((m) => map.removeLayer(m)); markersRef.current = [];

    // 1. Admin Leader Marker (Ajay Saini)
    const leaderIcon = L.divIcon({
      className: "",
      html: `
        <div style="position:relative;width:38px;height:38px;display:flex;align-items:center;justify-content:center;">
          <div style="position:absolute;inset:0;border-radius:50%;background:#f59e0b;opacity:0.25;animation:utw-ring 1.8s ease-out infinite;"></div>
          <div style="width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg, #f59e0b, #d97706);border:2px solid #ffffff;box-shadow:0 0 12px rgba(245,158,11,0.7);display:flex;align-items:center;justify-content:center;font-size:15px;color:#fff;cursor:pointer;">
            👑
          </div>
        </div>
      `,
      iconSize: [38, 38],
      iconAnchor: [19, 19],
      popupAnchor: [0, -18],
    });
    const adminMk = L.marker([RAJMACHI_ADMIN.lat, RAJMACHI_ADMIN.lon], { icon: leaderIcon }).addTo(map);
    adminMk.bindPopup(`
      <b>👑 You (Ajay Saini) · Expedition Leader</b><br/>
      <span style="color:#fbbf24;font-weight:600">Field Guide & Lead Navigator</span><br/>
      📍 Manoranjan Ridge (842m ASL)<br/>
      🔋 Battery: <strong>95%</strong> · ❤️ HR: <strong>76 bpm</strong><br/>
      VHF Channel: <strong>145.500 MHz</strong>
    `);
    markersRef.current.push(adminMk);

    // 2. Trail Corridor polyline
    const trailPoly = L.polyline([
      [18.8229, 73.3932],
      [18.8242, 73.3945],
      [18.8256, 73.3958],
      [18.8271, 73.3971],
      [18.8286, 73.3986],
      [RAJMACHI_ADMIN.lat, RAJMACHI_ADMIN.lon],
    ], {
      color: "#f59e0b",
      weight: 3.5,
      opacity: 0.65,
      dashArray: "8 6",
    }).addTo(map).bindPopup("<b>Rajmachi Fort Expedition Corridor</b>");
    markersRef.current.push(trailPoly);

    const allMapPoints = [[RAJMACHI_ADMIN.lat, RAJMACHI_ADMIN.lon]];

    points.forEach((p) => {
      const isSOS = p.status === "sos";
      const isActive = p.status === "active";
      const color = isSOS ? "#ef4444" : isActive ? "#3b82f6" : "#6b7280";
      const pulse = showPulse && (isSOS || isActive);
      const size = isSOS ? 14 : 10;
      const icon = makeDotIcon(L, color, size, pulse, isSOS ? "#ef4444" : "#3b82f6");

      const distFromAdmin = calculateDistanceMeters(RAJMACHI_ADMIN.lat, RAJMACHI_ADMIN.lon, p.lat, p.lon);
      const distStr = formatDistance(distFromAdmin);

      const popup = `<b>${p.name}</b> (${p.badge || "Trekker"})<br>` +
        `<span style="color:#60a5fa;font-weight:700">📏 ${distStr} away from you</span><br>` +
        `<span style="color:#94a3b8">${p.trailStatus || p.city}</span><span style="margin:0 6px;color:#334155">·</span><span style="color:${color};font-weight:600;text-transform:capitalize">${p.status}</span>` +
        `<br>Alt: <strong>${p.altitude || 820}m</strong> · 🔋 <strong>${p.battery || 85}%</strong> · ❤️ <strong>${p.heartRate || 82} bpm</strong>` +
        `${p.blood ? `<br>🩸 ${p.blood}` : ""}${p.medical && p.medical !== "None" ? `<br>⚕ ${p.medical}` : ""}` +
        `<br>📞 ${p.phone || "—"}`;

      const mk = L.marker([p.lat, p.lon], { icon }).addTo(map).bindPopup(popup);
      markersRef.current.push(mk);
      allMapPoints.push([p.lat, p.lon]);
    });

    if (allMapPoints.length > 1) {
      map.fitBounds(allMapPoints, { padding: [40, 40], maxZoom: 16 });
    }

    teams.forEach((t) => {
      const icon = makeTeamIcon(L, t.name, t.status === "deployed");
      const popup = `<b>${t.name}</b><br><span style="color:#94a3b8">${t.vehicle}</span> · ${t.lead}<br>Speed: <b>${t.speed}</b> · ETA: <b style="color:#22c55e">${t.eta}</b>`;
      const mk = L.marker([t.lat, t.lon], { icon }).addTo(map).bindPopup(popup);
      markersRef.current.push(mk);
    });
  }, [ready, pointsKey, teamsKey, showPulse]);

  const routeKey = JSON.stringify({ rf: routeFrom ? { lat: routeFrom.lat, lon: routeFrom.lon } : null, rt: routeTo ? { lat: routeTo.lat, lon: routeTo.lon } : null, rp: Array.isArray(routePath) ? routePath.slice(0, 8) : null });

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const L = window.L; const map = mapRef.current;
    if (routeRef.current) { map.removeLayer(routeRef.current); routeRef.current = null; }

    if ((routeFrom && routeTo) || Array.isArray(routePath)) {
      const from = routeFrom && [routeFrom.lat, routeFrom.lon];
      const to = routeTo && [routeTo.lat, routeTo.lon];
      const path = Array.isArray(routePath) && routePath.length > 1 ? routePath.map(([lon, lat]) => [lat, lon]) : [from, to].filter(Boolean);
      const shadow = L.polyline(path, { color: "#f59e0b", weight: 6, opacity: 0.18 }).addTo(map);
      const line = L.polyline(path, { color: "#f59e0b", weight: 3, opacity: 0.9, dashArray: "14 10", dashOffset: "0", className: "llm-route-line" }).addTo(map);
      const pulse = to ? L.circleMarker(to, { radius: 14, color: "#ef4444", weight: 2, opacity: 0.5, fill: false, className: "llm-sos-ring" }).addTo(map) : null;
      const group = pulse ? L.layerGroup([shadow, line, pulse]).addTo(map) : L.layerGroup([shadow, line]).addTo(map);
      routeRef.current = group;
      map.fitBounds(path, { padding: [50, 50], maxZoom: 14 });
    }
  }, [ready, routeKey]);

  return (
    <div style={{ background: "#080f1a", borderRadius: 12, overflow: "hidden", border: `1px solid ${C.border}`, position: "relative" }}>
      <div style={{ position: "absolute", top: 10, left: 10, zIndex: 900, background: "rgba(8,15,26,0.92)", border: "1px solid rgba(80,140,220,0.22)", borderRadius: 9, padding: "9px 13px", pointerEvents: "none" }}>
        {[[C.accent, "Active user", "dot"], [C.red, "SOS alert", "dot"], [C.amber, "SOS team", "rect"], [C.amber, "Route", "dash"]].map(([col, label, type]) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5, fontSize: 10, color: C.muted }}>
            {type === "dot" && <div style={{ width: 9, height: 9, borderRadius: "50%", background: col, border: "1.5px solid #fff", flexShrink: 0 }} />}
            {type === "rect" && <div style={{ width: 13, height: 9, borderRadius: 3, background: col, flexShrink: 0 }} />}
            {type === "dash" && <div style={{ width: 14, borderTop: `2.5px dashed ${col}`, flexShrink: 0 }} />}
            {label}
          </div>
        ))}
      </div>
      {onZoom && (
        <div style={{ position: "absolute", top: 10, right: 10, zIndex: 900, display: "flex", flexDirection: "column", gap: 4 }}>
          <button onClick={() => { mapRef.current?.zoomIn(); onZoom(1); }} style={{ width: 30, height: 30, background: "rgba(11,20,34,0.92)", border: `1px solid ${C.border}`, borderRadius: 7, color: C.text, fontSize: 17, cursor: "pointer", lineHeight: 1 }}>+</button>
          <button onClick={() => { mapRef.current?.zoomOut(); onZoom(-1); }} style={{ width: 30, height: 30, background: "rgba(11,20,34,0.92)", border: `1px solid ${C.border}`, borderRadius: 7, color: C.text, fontSize: 17, cursor: "pointer", lineHeight: 1 }}>−</button>
        </div>
      )}
      {!ready ? <div style={{ height, background: "#08101e", display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: 13, gap: 8 }}><span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⏳</span> Loading map engine…</div> : <div ref={containerRef} style={{ height }} />}
    </div>
  );
};

// Firestore timestamps arrive as { _seconds, _nanoseconds } over REST, as a
// Timestamp instance from the Admin SDK, or as an ISO string from the client
// SDK. Normalise them so the console never shows "Invalid Date".
const toDateValue = (value) => {
  if (!value) return null;
  if (typeof value === "object") {
    if (typeof value.toDate === "function") {
      const d = value.toDate();
      return Number.isNaN(d?.getTime?.()) ? null : d;
    }
    const seconds = value._seconds ?? value.seconds;
    if (typeof seconds === "number") return new Date(seconds * 1000);
    return null;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const formatClock = (value, fallback) => {
  const d = toDateValue(value);
  return d ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : fallback;
};

// Press and hold for three seconds — the same guard the trekker app uses, so
// a command alert can never be sent by a stray click.
const HoldToSendButton = ({ onSend, disabled, label = "PRESS & HOLD 3s TO SEND SOS" }) => {
  const [pct, setPct] = useState(0);
  const timerRef = useRef(null);
  const firedRef = useRef(false);

  const stop = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setPct(0);
    firedRef.current = false;
  };

  const start = (e) => {
    e?.preventDefault?.();
    if (disabled || timerRef.current) return;
    firedRef.current = false;
    const startedAt = Date.now();
    timerRef.current = setInterval(() => {
      const progress = Math.min(100, ((Date.now() - startedAt) / 3000) * 100);
      setPct(progress);
      if (progress >= 100 && !firedRef.current) {
        firedRef.current = true;
        stop();
        onSend?.();
      }
    }, 60);
  };

  useEffect(() => () => stop(), []);

  return (
    <button
      type="button"
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) start(e); }}
      onKeyUp={(e) => { if (e.key === " " || e.key === "Enter") stop(); }}
      disabled={disabled}
      aria-label="Press and hold for three seconds to send the alert to everyone"
      style={{
        position: "relative", overflow: "hidden", width: "100%", padding: "14px 18px",
        borderRadius: 12, border: "none",
        background: "linear-gradient(135deg, #dc2626 0%, #991b1b 100%)",
        color: "#ffffff", fontSize: 14, fontWeight: 900, letterSpacing: "0.03em",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        boxShadow: "0 0 22px rgba(220,38,38,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        userSelect: "none", touchAction: "none", fontFamily: "inherit",
      }}
    >
      <span
        style={{
          position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`,
          background: "rgba(255,255,255,0.22)", transition: "width 0.06s linear",
        }}
      />
      <span style={{ position: "relative" }}>📣 {label}</span>
    </button>
  );
};

const PageSOSNavigation = ({
  users = USERS,
  sosEvents = [],
  onResolveSOS,
  onAcknowledge,
  acknowledgedMap = {},
  sosFeedLoaded = false,
  onBroadcast,
  teamSize = 0,
  teamName = "",
  teamCode = "",
}) => {
  /* ── Incoming beacons (a trekker asked for help) ─────────────────────── */
  const activeIncidents = useMemo(() => {
    const list = [];
    const seenUserIds = new Set();

    sosEvents.forEach((ev) => {
      if (!ev || ev.status !== "active") return;
      if (ev.kind === "broadcast") return; // command alerts are not beacons
      const u = users.find((item) => item.id === ev.userId || item.name === ev.userName || item.name === ev.name);
      const userId = ev.userId || u?.id || ev.id;
      if (seenUserIds.has(userId)) return; // the same beacon can arrive twice
      seenUserIds.add(userId);

      const id = ev.id || `sos-${userId}`;
      list.push({
        id,
        eventId: ev.id,
        userId,
        user: ev.userName || ev.name || u?.name || "Trekker",
        tripName: ev.tripName || "Expedition",
        time: formatClock(ev.timestamp, ev.time || "Just now"),
        acknowledged: Boolean(ev.acknowledged) || Boolean(acknowledgedMap[id]),
        acknowledgedBy: ev.acknowledgedBy || acknowledgedMap[id]?.by || "",
        reason: ev.reason || ev.message || "",
        severity: ev.priority === "critical" ? "critical" : "high",
      });
    });

    // Acknowledged beacons are dismissed from the console — the trekker keeps
    // control of their own beacon.
    return list.filter((i) => !i.acknowledged);
  }, [sosEvents, users, acknowledgedMap]);

  /* ── History: past beacons, greyed out once acknowledged ───────────────── */
  const resolvedIncidents = useMemo(() => {
    const list = [];
    sosEvents.forEach((ev) => {
      if (!ev) return;
      if (ev.kind === "broadcast") return; // the console's own alerts live in "Sent alerts"
      const id = ev.id || `sos-${ev.userId}`;
      const acked = ev.status === "resolved" || ev.resolution || ev.acknowledged || acknowledgedMap[id];
      if (!acked) return;
      list.push({
        id,
        user: ev.userName || ev.name || "Trekker",
        tripName: ev.tripName || "Expedition",
        at: formatClock(ev.resolvedAt, formatClock(ev.timestamp, formatClock(ev.updatedAt, "Earlier"))),
        note: ev.acknowledged || acknowledgedMap[id]
          ? "Acknowledged by command"
          : ev.resolution === "user_cancelled"
            ? "Cancelled by trekker"
            : "Stood down by command",
        reason: ev.reason || ev.message || "",
      });
    });
    return list.slice(0, 10);
  }, [sosEvents, acknowledgedMap]);

  const [actingId, setActingId] = useState(null);
  const [toast, setToast] = useState(null);
  const [standDownTarget, setStandDownTarget] = useState(null);
  const [resolutionNote, setResolutionNote] = useState("Trekker is safe and escorted back to base camp");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingBroadcasts, setLoadingBroadcasts] = useState(false);

  // Broadcast composer (command team → every member of the group)
  const [severity, setSeverity] = useState("advisory");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [broadcasts, setBroadcasts] = useState([]);

  const loadBroadcasts = useCallback(async () => {
    setLoadingBroadcasts(true);
    try {
      const res = await fetch(`${AUTH_API_URL}/sos/alerts`);
      if (!res.ok) return;
      const data = await res.json();
      setBroadcasts(Array.isArray(data?.alerts) ? data.alerts : []);
    } catch {
      /* transient — the next poll retries */
    } finally {
      setLoadingBroadcasts(false);
    }
  }, []);

  useEffect(() => {
    loadBroadcasts();
    const timer = setInterval(loadBroadcasts, 30000);
    return () => clearInterval(timer);
  }, [loadBroadcasts]);

  const showToast = (type, text) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4000);
  };

  const handleAcknowledge = async (incident) => {
    if (!incident) return;
    setActingId(incident.id);
    const res = await onAcknowledge?.(incident.eventId || incident.id, incident.userId);
    setActingId(null);
    if (res && res.success === false) {
      showToast("error", `Could not acknowledge ${incident.user}: ${res?.errors?.[0] || "try again"}`);
      return;
    }
    showToast("success", `Acknowledged ${incident.user}'s beacon — the alarm is silenced.`);
  };

  const handleStandDown = async (incident) => {
    if (!incident) return;
    setActingId(incident.id);
    setIsSubmitting(true);
    try {
      const result = onResolveSOS
        ? await onResolveSOS(incident.eventId || incident.id, incident.userId, resolutionNote)
        : { success: false };
      setIsSubmitting(false);
      setActingId(null);
      if (result?.success === false) {
        showToast("error", `Stand-down failed: ${result?.errors?.[0] || "no channel accepted the request"}`);
        return;
      }
      setResolvingModal(false);
      showToast("success", `Stood down — ${incident.user} is safe.`);
    } catch (err) {
      setIsSubmitting(false);
      setActingId(null);
      showToast("error", `Stand-down failed: ${err?.message || "unknown error"}`);
    }
  };

  // The command team can take an alert back down (the same "exit" control a
  // trekker has on their own beacon).
  const handleDismissBroadcast = async (alert) => {
    if (!alert) return;
    setBroadcasts((prev) => prev.filter((b) => b.id !== alert.id));
    try {
      await onResolveSOS?.(alert.id, "", "Alert dismissed by command");
    } catch (e) {
      console.warn("Could not dismiss the alert:", e?.message || e);
    }
  };

  const handleSendBroadcast = async () => {
    const trimmed = message.trim();
    if (!trimmed) {
      showToast("error", "Write a short alert message before sending.");
      return;
    }
    setSending(true);
    try {
      const res = await onBroadcast?.({ message: trimmed, severity });
      setSending(false);
      if (res && res.success === false) {
        showToast("error", res.error || "The alert could not be sent.");
        return;
      }
      setMessage("");
      setSeverity("advisory");
      showToast("success", "Alert sent to every team member.");
      loadBroadcasts();
    } catch (err) {
      setSending(false);
      showToast("error", `Could not send the alert: ${err?.message || "unknown error"}`);
    }
  };

  const members = Math.max(teamSize, users.length, 1);

  return (
    <div>
      <PageHeader
        title="SOS Command"
        sub="Emergency beacons from the field, and alerts from the command team."
        right={
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {activeIncidents.length > 0 ? (
              <Pill color="red">🚨 {activeIncidents.length} live</Pill>
            ) : (
              <Pill color="green">● All clear</Pill>
            )}
            <Btn variant="default" onClick={loadBroadcasts} disabled={loadingBroadcasts}>
              {loadingBroadcasts ? "↻ Refreshing…" : "↻ Refresh"}
            </Btn>
          </div>
        }
      />

      {/* Scope — SOS stays inside the expedition group */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 14px",
          marginBottom: 16,
          borderRadius: 12,
          background: "linear-gradient(90deg, rgba(59,130,246,0.10), rgba(59,130,246,0.03))",
          border: "1px solid rgba(59,130,246,0.28)",
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            width: 30, height: 30, borderRadius: 9, flexShrink: 0,
            background: "rgba(59,130,246,0.18)", border: "1px solid rgba(59,130,246,0.35)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15,
          }}
        >
          🛡️
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text }}>
            SOS stays inside {teamName || "your expedition"}{teamCode ? ` · ${teamCode}` : ""}
          </div>
          <div style={{ fontSize: 11.5, color: C.muted, marginTop: 1 }}>
            Beacons and command alerts are only visible to this group ({members} member{members === 1 ? "" : "s"}).
          </div>
        </div>
      </div>

      {toast && (
        <div
          style={{
            marginBottom: 14, padding: "10px 14px", borderRadius: 10, fontSize: 12.5,
            background: toast.type === "success" ? "rgba(34,197,94,0.12)" : toast.type === "error" ? "rgba(239,68,68,0.12)" : "rgba(59,130,246,0.12)",
            border: `1px solid ${toast.type === "success" ? "rgba(34,197,94,0.3)" : toast.type === "error" ? "rgba(239,68,68,0.3)" : "rgba(59,130,246,0.3)"}`,
            color: toast.type === "success" ? "#86efac" : toast.type === "error" ? "#fca5a5" : "#93c5fd",
          }}
        >
          {toast.text}
        </div>
      )}

      <div className="resp-2col" style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16 }}>
        {/* Incoming beacons */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
            <span>🚨</span>
            <span>Incoming emergency beacons</span>
            {activeIncidents.length > 0 && <Pill color="red">{activeIncidents.length}</Pill>}
          </div>

          {activeIncidents.length === 0 ? (
            <Card style={{ textAlign: "center", padding: "26px 18px" }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>🛡️</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4 }}>No beacons waiting</div>
              <div style={{ fontSize: 11.5, color: C.muted }}>
                When a team member triggers an SOS it lands here instantly. Their live location and vitals are already on the Live Navigation page.
              </div>
            </Card>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {activeIncidents.map((incident) => (
                <Card
                  key={incident.id}
                  style={{
                    padding: "12px 14px",
                    border: incident.acknowledged ? "1px solid rgba(245,158,11,0.35)" : "1px solid rgba(239,68,68,0.35)",
                    background: incident.acknowledged
                      ? "linear-gradient(140deg, rgba(245,158,11,0.07), rgba(11,20,34,0.6))"
                      : "linear-gradient(140deg, rgba(239,68,68,0.09), rgba(11,20,34,0.6))",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <div
                      style={{
                        width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                        background: incident.acknowledged ? C.amber : C.red,
                        animation: incident.acknowledged ? "none" : "ping 1s infinite",
                      }}
                    />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                        {incident.user}
                        <span style={{ fontSize: 11, color: C.muted2, fontWeight: 500, marginLeft: 8 }}>{incident.tripName}</span>
                      </div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>
                        {incident.time}
                      </div>
                      {incident.reason && (
                        <div style={{ fontSize: 11.5, color: "#fca5a5", marginTop: 4, lineHeight: 1.45 }}>
                          “{incident.reason}”
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={actingId === incident.id}
                      onClick={() => handleAcknowledge(incident)}
                      style={{
                        padding: "6px 12px", borderRadius: 7, border: "1px solid rgba(245,158,11,0.4)",
                        background: "rgba(245,158,11,0.15)", color: "#fcd34d", fontSize: 11.5, fontWeight: 700,
                        cursor: actingId === incident.id ? "not-allowed" : "pointer", fontFamily: "inherit",
                      }}
                    >
                      {actingId === incident.id ? "…" : "✅ Acknowledge"}
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Recent history */}
          {resolvedIncidents.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                Recent incidents
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {resolvedIncidents.map((incident) => (
                  <div
                    key={incident.id}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                      borderRadius: 9, background: "rgba(255,255,255,0.015)", border: `1px solid ${C.border}`,
                      fontSize: 11.5, color: C.muted2, opacity: 0.7,
                    }}
                  >
                    <span style={{ color: C.muted2 }}>✓</span>
                    <span style={{ color: C.muted, fontWeight: 600 }}>{incident.user}</span>
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {incident.tripName}
                      {incident.reason ? ` · “${incident.reason}”` : ""}
                    </span>
                    <span>{incident.note}</span>
                    <span style={{ color: C.muted2 }}>{incident.at}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Command → team alerts */}
        <div>
          <Card style={{ padding: "14px 16px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 3, display: "flex", alignItems: "center", gap: 8 }}>
              <span>📣</span>
              <span>Alert all team members</span>
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 12, lineHeight: 1.5 }}>
              Sends one alert to every member of this group at once.
            </div>

            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              {[
                ["advisory", "Advisory", C.accent],
                ["urgent", "Urgent", C.amber],
                ["critical", "Critical", C.red],
              ].map(([value, label, color]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSeverity(value)}
                  style={{
                    flex: 1, padding: "6px 4px", borderRadius: 7, fontSize: 11, fontWeight: 700,
                    background: severity === value ? `${color}22` : "rgba(255,255,255,0.03)",
                    border: `1px solid ${severity === value ? color : C.border}`,
                    color: severity === value ? color : C.muted,
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder="e.g. Severe weather ahead on the ridge — hold position and stay sheltered."
              style={{
                width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`,
                borderRadius: 8, padding: "9px 11px", color: C.text, fontSize: 12, fontFamily: "inherit",
                resize: "vertical", outline: "none", marginBottom: 10,
              }}
            />

            <HoldToSendButton onSend={handleSendBroadcast} disabled={sending || !message.trim()} />
            <div style={{ fontSize: 10.5, color: C.muted2, marginTop: 7, textAlign: "center" }}>
              {sending ? "Sending…" : "Hold for 3 seconds — this reaches every member of the group."}
            </div>
          </Card>

          {broadcasts.length > 0 && (
            <Card style={{ padding: "14px 16px", marginTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                Sent alerts
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {broadcasts.slice(0, 6).map((b) => (
                  <div key={b.id} style={{ padding: "8px 10px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: `1px solid ${C.border}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <Pill color={b.severity === "critical" ? "red" : b.severity === "urgent" ? "amber" : "blue"}>{b.severity}</Pill>
                      <span style={{ fontSize: 10.5, color: C.muted2, marginLeft: "auto" }}>{formatClock(b.timestamp, "Just now")}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: C.text, lineHeight: 1.5, marginBottom: 7 }}>{b.message}</div>
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        onClick={() => handleDismissBroadcast(b)}
                        style={{
                          padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.border}`,
                          background: "transparent", color: C.muted, fontSize: 10.5, fontWeight: 700,
                          cursor: "pointer", fontFamily: "inherit",
                        }}
                      >
                        ✕ Dismiss
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Stand-down confirmation */}
      {standDownTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(6px)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#0d1b2e", border: `1px solid ${C.border2}`, borderRadius: 16, width: "100%", maxWidth: 440, padding: 22 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 6 }}>Stand down this emergency</div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginBottom: 14 }}>
              The beacon is marked resolved, the trekker is reset to safe, and the alert leaves the team's active list.
            </div>
            <textarea
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
              rows={2}
              style={{
                width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`,
                borderRadius: 8, padding: "9px 11px", color: C.text, fontSize: 12, fontFamily: "inherit",
                resize: "vertical", outline: "none", marginBottom: 14,
              }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn variant="default" onClick={() => setStandDownTarget(null)}>Cancel</Btn>
              <Btn variant="success" onClick={() => {
                const target = standDownTarget;
                setStandDownTarget(null);
                if (target) handleStandDown(target);
              }} disabled={isSubmitting}>
                {isSubmitting ? "Confirming…" : "✓ Stand down"}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ════════════════════════════════════════════════
   PAGE: ADMIN AUTH (LOGIN & CLEARANCE REQUEST)
════════════════════════════════════════════════ */
const PageAdminAuth = ({ onLogin }) => {
  const [tab, setTab] = useState("login"); // "login" | "register"
  const [themeConfig, setThemeConfig] = useState(null);

  useEffect(() => {
    let active = true;
    fetch(`${AUTH_API_URL}/config/theme`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (active && data) setThemeConfig(data);
      })
      .catch(() => { });
    return () => {
      active = false;
    };
  }, []);

  const mountainBackdropUrl =
    themeConfig?.backdropUrl ||
    "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=2400&q=85";

  // Login form state — prefilled with the demo account.
  const [loginEmail, setLoginEmail] = useState(DEMO_ADMIN_EMAIL);
  const [loginPass, setLoginPass] = useState(DEMO_PASSWORD);
  const [showLoginPass, setShowLoginPass] = useState(false);
  const [loginErr, setLoginErr] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // Registration / Admin Access Request form state
  const [regForm, setRegForm] = useState({
    name: "",
    email: "",
    pass: "",
    confirmPass: "",
    organization: "Sahyadri Mountain SAR & Trek Operations",
    roleTitle: "Lead Expedition Guide",
    phone: "",
  });
  const [showRegPass, setShowRegPass] = useState(false);
  const [regErr, setRegErr] = useState("");
  const [regLoading, setRegLoading] = useState(false);
  const [regSuccess, setRegSuccess] = useState(false);

  const updReg = (k, v) => setRegForm((f) => ({ ...f, [k]: v }));

  // Handle Login
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoginErr("");

    const trimmedEmail = loginEmail.trim().toLowerCase();
    if (!trimmedEmail || !loginPass) {
      setLoginErr("Please enter both administrator email and password.");
      return;
    }

    setLoginLoading(true);
    try {
      const res = await adminLogin(trimmedEmail, loginPass);
      if (res.success) {
        setLoginLoading(false);
        onLogin({
          ...(res.userData || { email: trimmedEmail, name: "Admin", role: "admin" }),
          token: res.token || null,
        });
        return;
      }
      setLoginLoading(false);
      setLoginErr(res.error || "Invalid administrator credentials. Please check your credentials.");
    } catch (err) {
      setLoginLoading(false);
      setLoginErr(err.message || "Unable to connect to authorization service.");
    }
  };

  // Handle Register Admin Access Request
  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setRegErr("");

    if (!regForm.name.trim()) {
      setRegErr("Please enter your full name.");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(regForm.email.trim())) {
      setRegErr("Please enter a valid official email address.");
      return;
    }
    if (regForm.pass.length < 6) {
      setRegErr("Security password must be at least 6 characters.");
      return;
    }
    if (regForm.pass !== regForm.confirmPass) {
      setRegErr("Passwords do not match.");
      return;
    }
    if (!regForm.phone.trim()) {
      setRegErr("Please provide a contact phone number for dispatch verification.");
      return;
    }

    setRegLoading(true);
    try {
      const res = await registerAdminAccount({
        name: regForm.name.trim(),
        email: regForm.email.trim().toLowerCase(),
        password: regForm.pass,
        phone: regForm.phone.trim(),
        organization: regForm.organization.trim(),
        roleTitle: regForm.roleTitle.trim(),
      });

      if (res.success) {
        setRegSuccess(true);
        return;
      }
      setRegErr(res.error || "Unable to submit administrator application. Please try again.");
    } catch {
      setRegErr("Unable to process request right now. Please check your network connection.");
    } finally {
      setRegLoading(false);
    }
  };

  const isPendingApprovalError = loginErr && (
    loginErr.toLowerCase().includes("pending approval") ||
    loginErr.toLowerCase().includes("pending verification") ||
    loginErr.toLowerCase().includes("authorization")
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        padding: "36px 16px 54px",
        background: "#050b14",
        boxSizing: "border-box",
      }}
    >
      {/* ── Photographic Mountain Backdrop ── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `url("${mountainBackdropUrl}")`,
          backgroundPosition: "center 38%",
          backgroundSize: "cover",
          backgroundRepeat: "no-repeat",
          filter: "brightness(0.55) contrast(1.1) saturate(1.15)",
          transform: "scale(1.02)",
          transition: "background-image 0.8s ease-in-out",
          pointerEvents: "none",
        }}
      />

      {/* ── Atmospheric Radial Fog & Dark Vignette ── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 50% 40%, rgba(5, 11, 24, 0.45) 0%, rgba(4, 9, 18, 0.78) 55%, rgba(2, 6, 12, 0.94) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* ── Fine Horizon Sky Wash ── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(3, 7, 16, 0.65) 0%, transparent 25%, transparent 68%, rgba(2, 6, 12, 0.94) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* ── Glassmorphism Card Container ── */}
      <div
        style={{
          width: "100%",
          maxWidth: tab === "register" ? 560 : 430,
          background: "rgba(10, 18, 32, 0.78)",
          backdropFilter: "blur(28px) saturate(190%)",
          WebkitBackdropFilter: "blur(28px) saturate(190%)",
          borderRadius: 24,
          border: "1px solid rgba(255, 255, 255, 0.11)",
          boxShadow:
            "0 30px 80px -15px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.04)",
          padding: "36px 32px",
          position: "relative",
          zIndex: 2,
          transition: "max-width 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
          boxSizing: "border-box",
        }}
      >
        {/* Brand Header */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: 18,
              background: "linear-gradient(135deg, rgba(59, 130, 246, 0.35), rgba(16, 185, 129, 0.2))",
              border: "1px solid rgba(255, 255, 255, 0.22)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 12px",
              boxShadow: "0 10px 25px rgba(0, 0, 0, 0.45), 0 0 20px rgba(59, 130, 246, 0.3)",
            }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
              <path d="m8 3 4 8 5-5 5 15H2L8 3z" />
              <path d="M4.14 15h15.72" />
            </svg>
          </div>

          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              borderRadius: 20,
              background: "rgba(59, 130, 246, 0.14)",
              border: "1px solid rgba(59, 130, 246, 0.32)",
              color: "#60a5fa",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              marginBottom: 8,
              textTransform: "uppercase",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#3b82f6",
                display: "inline-block",
                boxShadow: "0 0 8px #3b82f6",
              }}
            />
            Expedition Command & Admin Portal
          </div>

          <div style={{ fontSize: 26, fontWeight: 800, color: "#f8fafc", letterSpacing: "-0.03em" }}>
            Margsutra <span style={{ color: "#60a5fa" }}>Admin</span>
          </div>
          <div style={{ fontSize: 13, color: "rgba(180, 210, 245, 0.65)", marginTop: 4 }}>
            Trip Safety & Emergency Response Platform · Operations Console
          </div>
        </div>

        {/* ── Segmented Tab Switcher ── */}
        <div
          style={{
            display: "flex",
            background: "rgba(0, 0, 0, 0.32)",
            borderRadius: 14,
            padding: 4,
            border: "1px solid rgba(255, 255, 255, 0.08)",
            marginBottom: 24,
          }}
        >
          <button
            type="button"
            onClick={() => {
              setTab("login");
              setLoginErr("");
              setRegErr("");
            }}
            style={{
              flex: 1,
              padding: "9px 0",
              borderRadius: 10,
              border: tab === "login" ? "1px solid rgba(59, 130, 246, 0.45)" : "1px solid transparent",
              background:
                tab === "login"
                  ? "linear-gradient(135deg, rgba(59, 130, 246, 0.35), rgba(37, 99, 235, 0.45))"
                  : "transparent",
              color: tab === "login" ? "#ffffff" : "rgba(180, 210, 245, 0.65)",
              fontSize: 13,
              fontWeight: tab === "login" ? 600 : 500,
              cursor: "pointer",
              transition: "all 0.2s ease",
              boxShadow: tab === "login" ? "0 4px 12px rgba(0, 0, 0, 0.25)" : "none",
            }}
          >
            Log In
          </button>
          <button
            type="button"
            onClick={() => {
              setTab("register");
              setLoginErr("");
              setRegErr("");
              setRegSuccess(false);
            }}
            style={{
              flex: 1,
              padding: "9px 0",
              borderRadius: 10,
              border: tab === "register" ? "1px solid rgba(59, 130, 246, 0.45)" : "1px solid transparent",
              background:
                tab === "register"
                  ? "linear-gradient(135deg, rgba(59, 130, 246, 0.35), rgba(37, 99, 235, 0.45))"
                  : "transparent",
              color: tab === "register" ? "#ffffff" : "rgba(180, 210, 245, 0.65)",
              fontSize: 13,
              fontWeight: tab === "register" ? 600 : 500,
              cursor: "pointer",
              transition: "all 0.2s ease",
              boxShadow: tab === "register" ? "0 4px 12px rgba(0, 0, 0, 0.25)" : "none",
            }}
          >
            Request Admin Access
          </button>
        </div>

        {/* ── TAB 1: LOG IN ── */}
        {tab === "login" && (
          <form onSubmit={handleLoginSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "rgba(180, 210, 245, 0.72)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  marginBottom: 6,
                }}
              >
                Administrator Email
              </label>
              <input
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder={DEMO_ADMIN_EMAIL}
                autoComplete="email"
                style={{
                  width: "100%",
                  height: 44,
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.11)",
                  borderRadius: 12,
                  padding: "0 14px",
                  color: "#f8fafc",
                  fontSize: 14,
                  boxSizing: "border-box",
                  outline: "none",
                  transition: "border-color 0.2s ease, box-shadow 0.2s ease",
                }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "rgba(180, 210, 245, 0.72)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowLoginPass((v) => !v)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#60a5fa",
                    fontSize: 11,
                    fontWeight: 500,
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  {showLoginPass ? "Hide" : "Show"}
                </button>
              </div>
              <input
                type={showLoginPass ? "text" : "password"}
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                style={{
                  width: "100%",
                  height: 44,
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.11)",
                  borderRadius: 12,
                  padding: "0 14px",
                  color: "#f8fafc",
                  fontSize: 14,
                  boxSizing: "border-box",
                  outline: "none",
                  transition: "border-color 0.2s ease, box-shadow 0.2s ease",
                }}
              />
            </div>

            {/* Pending Approval / Error Alert */}
            {loginErr && (
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: 12,
                  background: isPendingApprovalError
                    ? "rgba(245, 158, 11, 0.14)"
                    : "rgba(239, 68, 68, 0.14)",
                  border: isPendingApprovalError
                    ? "1px solid rgba(245, 158, 11, 0.35)"
                    : "1px solid rgba(239, 68, 68, 0.3)",
                  marginBottom: 18,
                  fontSize: 12,
                  lineHeight: 1.5,
                  color: isPendingApprovalError ? "#fef3c7" : "#fca5a5",
                }}
              >
                {isPendingApprovalError ? (
                  <div>
                    <div style={{ fontWeight: 700, color: "#fbbf24", marginBottom: 3, display: "flex", alignItems: "center", gap: 6 }}>
                      <span>⏳</span>
                      <span>Clearance Verification Pending</span>
                    </div>
                    <div>{loginErr}</div>
                  </div>
                ) : (
                  <div>{loginErr}</div>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={loginLoading}
              style={{
                width: "100%",
                height: 46,
                background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                borderRadius: 12,
                color: "#ffffff",
                fontSize: 14.5,
                fontWeight: 600,
                cursor: loginLoading ? "not-allowed" : "pointer",
                boxShadow: "0 4px 20px rgba(37, 99, 235, 0.4)",
                opacity: loginLoading ? 0.75 : 1,
                transition: "transform 0.15s ease, box-shadow 0.15s ease",
              }}
            >
              {loginLoading ? "Authenticating…" : "Log In"}
            </button>

            <div style={{
              marginTop: 14, padding: "10px 14px", borderRadius: 10, textAlign: "center",
              background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.25)",
            }}>
              <div style={{ fontSize: 10, color: "rgba(180, 210, 245, 0.65)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Demo access
              </div>
              <div style={{ fontSize: 12.5, color: "rgba(226, 232, 240, 0.92)", marginTop: 4, fontWeight: 600 }}>
                {DEMO_ADMIN_EMAIL} · {DEMO_PASSWORD}
              </div>
            </div>
          </form>
        )}

        {/* ── TAB 2: REQUEST ADMIN ACCESS ── */}
        {tab === "register" && (
          <div>
            {regSuccess ? (
              <div style={{ textAlign: "center", padding: "16px 8px" }}>
                <div
                  style={{
                    width: 54,
                    height: 54,
                    borderRadius: "50%",
                    background: "rgba(16, 185, 129, 0.2)",
                    border: "1px solid rgba(16, 185, 129, 0.4)",
                    color: "#34d399",
                    fontSize: 26,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 16px",
                  }}
                >
                  ✓
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#f8fafc", marginBottom: 8 }}>
                  Clearance Request Submitted
                </div>
                <div style={{ fontSize: 13, color: "rgba(180, 210, 245, 0.8)", lineHeight: 1.55, marginBottom: 20 }}>
                  Your administrator application has been registered in the expedition registry.
                  <br />
                  <strong style={{ color: "#fbbf24" }}>An existing active administrator must authorize your account</strong> before you can log in to the command console.
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setTab("login");
                    setRegSuccess(false);
                  }}
                  style={{
                    width: "100%",
                    height: 44,
                    borderRadius: 12,
                    border: "none",
                    background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                    color: "#ffffff",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Return to Log In →
                </button>
              </div>
            ) : (
              <form onSubmit={handleRegisterSubmit}>
                {/* Admin Approval Notice Badge */}
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    background: "rgba(245, 158, 11, 0.12)",
                    border: "1px solid rgba(245, 158, 11, 0.3)",
                    marginBottom: 16,
                    fontSize: 11,
                    lineHeight: 1.5,
                    color: "#fef3c7",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                  }}
                >
                  <span style={{ fontSize: 16, flexShrink: 0 }}>🛡️</span>
                  <div>
                    <strong style={{ color: "#fbbf24" }}>Administrator Verification Policy:</strong> All admin profiles must be reviewed and approved by an existing system administrator before console access is granted.
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "rgba(180, 210, 245, 0.72)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                      Full Name *
                    </label>
                    <input
                      type="text"
                      value={regForm.name}
                      onChange={(e) => updReg("name", e.target.value)}
                      placeholder="e.g. Vikram Patil"
                      style={{
                        width: "100%",
                        height: 40,
                        background: "rgba(255, 255, 255, 0.05)",
                        border: "1px solid rgba(255, 255, 255, 0.11)",
                        borderRadius: 10,
                        padding: "0 12px",
                        color: "#f8fafc",
                        fontSize: 13,
                        boxSizing: "border-box",
                        outline: "none",
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "rgba(180, 210, 245, 0.72)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                      Contact Phone *
                    </label>
                    <input
                      type="tel"
                      value={regForm.phone}
                      onChange={(e) => updReg("phone", e.target.value)}
                      placeholder="+91 98765 43210"
                      style={{
                        width: "100%",
                        height: 40,
                        background: "rgba(255, 255, 255, 0.05)",
                        border: "1px solid rgba(255, 255, 255, 0.11)",
                        borderRadius: 10,
                        padding: "0 12px",
                        color: "#f8fafc",
                        fontSize: 13,
                        boxSizing: "border-box",
                        outline: "none",
                      }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "rgba(180, 210, 245, 0.72)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                    Official Email Address *
                  </label>
                  <input
                    type="email"
                    value={regForm.email}
                    onChange={(e) => updReg("email", e.target.value)}
                    placeholder="vikram@margsutra.app"
                    style={{
                      width: "100%",
                      height: 40,
                      background: "rgba(255, 255, 255, 0.05)",
                      border: "1px solid rgba(255, 255, 255, 0.11)",
                      borderRadius: 10,
                      padding: "0 12px",
                      color: "#f8fafc",
                      fontSize: 13,
                      boxSizing: "border-box",
                      outline: "none",
                    }}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "rgba(180, 210, 245, 0.72)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                      Organization / Unit
                    </label>
                    <input
                      type="text"
                      value={regForm.organization}
                      onChange={(e) => updReg("organization", e.target.value)}
                      placeholder="Sahyadri SAR Unit"
                      style={{
                        width: "100%",
                        height: 40,
                        background: "rgba(255, 255, 255, 0.05)",
                        border: "1px solid rgba(255, 255, 255, 0.11)",
                        borderRadius: 10,
                        padding: "0 12px",
                        color: "#f8fafc",
                        fontSize: 13,
                        boxSizing: "border-box",
                        outline: "none",
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "rgba(180, 210, 245, 0.72)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                      Dispatch Role / Title
                    </label>
                    <input
                      type="text"
                      value={regForm.roleTitle}
                      onChange={(e) => updReg("roleTitle", e.target.value)}
                      placeholder="Lead Expedition Guide"
                      style={{
                        width: "100%",
                        height: 40,
                        background: "rgba(255, 255, 255, 0.05)",
                        border: "1px solid rgba(255, 255, 255, 0.11)",
                        borderRadius: 10,
                        padding: "0 12px",
                        color: "#f8fafc",
                        fontSize: 13,
                        boxSizing: "border-box",
                        outline: "none",
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(180, 210, 245, 0.72)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        Password *
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowRegPass((v) => !v)}
                        style={{ background: "none", border: "none", color: "#60a5fa", fontSize: 11, cursor: "pointer", padding: 0 }}
                      >
                        {showRegPass ? "Hide" : "Show"}
                      </button>
                    </div>
                    <input
                      type={showRegPass ? "text" : "password"}
                      value={regForm.pass}
                      onChange={(e) => updReg("pass", e.target.value)}
                      placeholder="••••••••"
                      style={{
                        width: "100%",
                        height: 40,
                        background: "rgba(255, 255, 255, 0.05)",
                        border: "1px solid rgba(255, 255, 255, 0.11)",
                        borderRadius: 10,
                        padding: "0 12px",
                        color: "#f8fafc",
                        fontSize: 13,
                        boxSizing: "border-box",
                        outline: "none",
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "rgba(180, 210, 245, 0.72)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                      Confirm Password *
                    </label>
                    <input
                      type={showRegPass ? "text" : "password"}
                      value={regForm.confirmPass}
                      onChange={(e) => updReg("confirmPass", e.target.value)}
                      placeholder="••••••••"
                      style={{
                        width: "100%",
                        height: 40,
                        background: "rgba(255, 255, 255, 0.05)",
                        border: "1px solid rgba(255, 255, 255, 0.11)",
                        borderRadius: 10,
                        padding: "0 12px",
                        color: "#f8fafc",
                        fontSize: 13,
                        boxSizing: "border-box",
                        outline: "none",
                      }}
                    />
                  </div>
                </div>

                {regErr && (
                  <div
                    style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      background: "rgba(239, 68, 68, 0.14)",
                      border: "1px solid rgba(239, 68, 68, 0.3)",
                      marginBottom: 16,
                      fontSize: 12,
                      color: "#fca5a5",
                    }}
                  >
                    {regErr}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={regLoading}
                  style={{
                    width: "100%",
                    height: 46,
                    borderRadius: 12,
                    border: "none",
                    background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                    color: "#ffffff",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: regLoading ? "not-allowed" : "pointer",
                    boxShadow: "0 8px 24px rgba(37, 99, 235, 0.45)",
                    transition: "all 0.2s ease",
                    opacity: regLoading ? 0.7 : 1,
                  }}
                >
                  {regLoading ? "Submitting Application..." : "Submit Admin Access Request"}
                </button>

                <div style={{ textAlign: "center", marginTop: 14, fontSize: 12, color: "rgba(180, 210, 245, 0.7)" }}>
                  Already have an authorized admin account?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setTab("login");
                      setRegErr("");
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#60a5fa",
                      fontWeight: 600,
                      cursor: "pointer",
                      padding: 0,
                      textDecoration: "underline",
                    }}
                  >
                    Log In →
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>

      {/* Footer Navigation info */}
      <div
        style={{
          marginTop: 22,
          position: "relative",
          zIndex: 2,
          textAlign: "center",
          fontSize: 12,
          color: "rgba(180, 210, 245, 0.5)",
        }}
      >
        <span>Margsutra Mountain Safety Platform · Incident Command</span>
        <span style={{ margin: "0 8px" }}>·</span>
        <a
          href="http://localhost:5173"
          target="_blank"
          rel="noreferrer"
          style={{ color: "#60a5fa", textDecoration: "none" }}
        >
          Open Trekker Portal ↗
        </a>
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════
   PAGE: ADMIN APPROVALS & CLEARANCE
════════════════════════════════════════════════ */
const PageAdminApprovals = ({
  pendingAdmins = [],
  onApprove,
  onReject,
  approvedAdmins = [],
  refreshing,
  onRefresh,
  pendingTrekkers = [],
  onApproveTrekker,
  onDenyTrekker,
  onReviewTrekkers,
}) => {
  const [actingId, setActingId] = useState(null);
  const [actingTrekker, setActingTrekker] = useState(null);
  const [toast, setToast] = useState(null);

  // Trekker join requests are approved from here too — every approval the
  // command team can make lives on this one page.
  const handleTrekkerDecision = async (applicant, approve) => {
    const applicantId = applicant.userId || applicant.id;
    const key = `${applicant.tripId}-${applicantId}`;
    setActingTrekker(key);
    const res = approve ? await onApproveTrekker?.(applicant.tripId, applicantId) : await onDenyTrekker?.(applicant.tripId, applicantId);
    setActingTrekker(null);
    const name = applicant.name || "Trekker";
    if (res?.success) {
      setToast({ type: approve ? "success" : "info", text: approve ? `✓ ${name} enrolled on ${applicant.tripName || "the expedition"}.` : `${name}'s join request was declined.` });
    } else {
      setToast({ type: "error", text: `Failed to ${approve ? "approve" : "decline"}: ${res?.error || "Unknown error"}` });
    }
    setTimeout(() => setToast(null), 4000);
  };

  const handleApprove = async (admin) => {
    setActingId(admin.id);
    const res = await onApprove(admin.id);
    setActingId(null);
    if (res?.success) {
      setToast({ type: "success", text: `✓ Administrator access authorized for ${admin.name || admin.email}!` });
      setTimeout(() => setToast(null), 4000);
    } else {
      setToast({ type: "error", text: `Failed to approve: ${res?.error || "Unknown error"}` });
      setTimeout(() => setToast(null), 4000);
    }
  };

  const handleReject = async (admin) => {
    if (!window.confirm(`Decline administrator access request for ${admin.name || admin.email}?`)) return;
    setActingId(admin.id);
    const res = await onReject(admin.id);
    setActingId(null);
    if (res?.success) {
      setToast({ type: "info", text: `Clearance request declined for ${admin.name || admin.email}.` });
      setTimeout(() => setToast(null), 4000);
    } else {
      setToast({ type: "error", text: `Failed to decline: ${res?.error || "Unknown error"}` });
      setTimeout(() => setToast(null), 4000);
    }
  };

  return (
    <div>
      <PageHeader
        title="Administrator Clearance & Duty Authorization"
        sub="Review and authorize administrative clearance requests. Approved personnel obtain expedition command & dispatch privileges."
        right={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {pendingAdmins.length > 0 ? (
              <Pill color="amber">⏳ {pendingAdmins.length} Pending Review</Pill>
            ) : (
              <Pill color="green">✓ All Approved</Pill>
            )}
            <Btn variant="default" onClick={onRefresh} disabled={refreshing}>
              {refreshing ? "↻ Refreshing..." : "↻ Refresh Queue"}
            </Btn>
          </div>
        }
      />

      {toast && (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 16px",
            borderRadius: 10,
            background: toast.type === "success" ? "rgba(34,197,94,0.15)" : toast.type === "error" ? "rgba(239,68,68,0.15)" : "rgba(59,130,246,0.15)",
            border: `1px solid ${toast.type === "success" ? "rgba(34,197,94,0.35)" : toast.type === "error" ? "rgba(239,68,68,0.35)" : "rgba(59,130,246,0.35)"}`,
            color: toast.type === "success" ? "#86efac" : toast.type === "error" ? "#fca5a5" : "#93c5fd",
            fontSize: 13,
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>{toast.text}</span>
        </div>
      )}

      {/* Trekker join requests — approved right here */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fbbf24", display: "flex", alignItems: "center", gap: 8 }}>
            <span>🧭</span>
            <span>Pending trekker join requests</span>
            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)", color: "#fcd34d", fontWeight: 700 }}>
              {pendingTrekkers.length}
            </span>
          </div>
          {onReviewTrekkers && (
            <button
              type="button"
              onClick={onReviewTrekkers}
              style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 7, padding: "5px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
            >
              View rosters →
            </button>
          )}
        </div>

        {pendingTrekkers.length === 0 ? (
          <div style={{ padding: "14px 16px", borderRadius: 10, background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.25)", fontSize: 12.5, color: "#86efac" }}>
            ✓ No trekker join requests are waiting for approval.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 10 }}>
            {pendingTrekkers.map((applicant) => {
              const applicantId = applicant.userId || applicant.id;
              const key = `${applicant.tripId}-${applicantId}`;
              const isActing = actingTrekker === key;
              return (
                <Card key={key} style={{ padding: "13px 14px", border: "1px solid rgba(245,158,11,0.3)", background: "linear-gradient(140deg, rgba(245,158,11,0.07), rgba(11,20,34,0.6))" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{applicant.name || "Trekker"}</div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{applicant.tripName || "Expedition"}</div>
                    </div>
                    <Pill color="amber">pending</Pill>
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.65, marginBottom: 10 }}>
                    <div>📞 {applicant.phone || "No phone"} · 🩸 {applicant.blood || "B+"}</div>
                    <div>🩺 {applicant.medical || "No medical notes"}</div>
                    <div>🆘 {applicant.ec1Name || "Emergency contact"} ({applicant.ec1Rel || "Kin"}) · {applicant.ec1Ph || "—"}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      disabled={isActing}
                      onClick={() => handleTrekkerDecision(applicant, true)}
                      style={{ flex: 1, padding: "7px 10px", borderRadius: 7, border: "1px solid rgba(34,197,94,0.35)", background: "rgba(34,197,94,0.14)", color: "#86efac", fontSize: 11.5, fontWeight: 700, cursor: isActing ? "not-allowed" : "pointer", fontFamily: "inherit" }}
                    >
                      {isActing ? "…" : "Approve"}
                    </button>
                    <button
                      type="button"
                      disabled={isActing}
                      onClick={() => handleTrekkerDecision(applicant, false)}
                      style={{ flex: 1, padding: "7px 10px", borderRadius: 7, border: `1px solid ${C.border}`, background: "transparent", color: "#fca5a5", fontSize: 11.5, fontWeight: 700, cursor: isActing ? "not-allowed" : "pointer", fontFamily: "inherit" }}
                    >
                      Deny
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Pending Authorization Queue */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, display: "flex", alignItems: "center", gap: 8 }}>
            <span>⏳</span>
            <span>Pending Authorization Requests</span>
            <span
              style={{
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 12,
                background: pendingAdmins.length > 0 ? "rgba(245,158,11,0.2)" : "rgba(255,255,255,0.08)",
                color: pendingAdmins.length > 0 ? "#fbbf24" : C.muted,
                fontWeight: 600,
              }}
            >
              {pendingAdmins.length}
            </span>
          </div>
        </div>

        {pendingAdmins.length === 0 ? (
          <Card style={{ padding: "32px 20px", textAlign: "center", background: "rgba(255,255,255,0.02)" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🛡️</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4 }}>
              No Pending Administrator Requests
            </div>
            <div style={{ fontSize: 12, color: C.muted, maxWidth: 440, margin: "0 auto" }}>
              All administrative clearance applications have been processed. When a team member requests administrator access from the portal, their verification card will appear here for command approval.
            </div>
          </Card>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {pendingAdmins.map((applicant) => {
              const initials = (applicant.name || applicant.displayName || "Admin")
                .split(/\s+/)
                .slice(0, 2)
                .map((p) => p[0])
                .join("")
                .toUpperCase();
              const isActing = actingId === applicant.id;

              return (
                <Card
                  key={applicant.id}
                  style={{
                    background: "rgba(15, 23, 42, 0.7)",
                    border: "1px solid rgba(245, 158, 11, 0.35)",
                    boxShadow: "0 4px 20px rgba(0, 0, 0, 0.35)",
                    padding: "20px 22px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                      <div
                        style={{
                          width: 46,
                          height: 46,
                          borderRadius: "50%",
                          background: "rgba(245, 158, 11, 0.18)",
                          border: "1px solid rgba(245, 158, 11, 0.4)",
                          color: "#f59e0b",
                          fontSize: 16,
                          fontWeight: 700,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          boxShadow: "0 0 14px rgba(245, 158, 11, 0.2)",
                        }}
                      >
                        {initials}
                      </div>

                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 16, fontWeight: 700, color: "#f8fafc" }}>
                            {applicant.name || "Unnamed Applicant"}
                          </span>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              letterSpacing: "0.06em",
                              textTransform: "uppercase",
                              padding: "2px 8px",
                              borderRadius: 12,
                              background: "rgba(245, 158, 11, 0.18)",
                              border: "1px solid rgba(245, 158, 11, 0.35)",
                              color: "#fcd34d",
                            }}
                          >
                            ⏳ Pending Authorization
                          </span>
                        </div>

                        <div style={{ fontSize: 12, color: C.muted, marginTop: 4, display: "flex", gap: 16, flexWrap: "wrap" }}>
                          <span>✉️ <strong style={{ color: C.text }}>{applicant.email}</strong></span>
                          {applicant.phone && <span>📞 {applicant.phone}</span>}
                          {applicant.organization && <span>🏢 {applicant.organization}</span>}
                          {applicant.roleTitle && <span>🎖️ {applicant.roleTitle}</span>}
                        </div>

                        <div style={{ fontSize: 11, color: C.muted2, marginTop: 8 }}>
                          Application registered: {applicant.requestedAt ? new Date(applicant.requestedAt).toLocaleString() : "Recently"}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <button
                        type="button"
                        onClick={() => handleReject(applicant)}
                        disabled={isActing}
                        style={{
                          padding: "8px 14px",
                          borderRadius: 8,
                          background: "rgba(239, 68, 68, 0.12)",
                          border: "1px solid rgba(239, 68, 68, 0.3)",
                          color: "#fca5a5",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: isActing ? "not-allowed" : "pointer",
                          transition: "all 0.2s",
                        }}
                      >
                        ✕ Decline
                      </button>

                      <button
                        type="button"
                        onClick={() => handleApprove(applicant)}
                        disabled={isActing}
                        style={{
                          padding: "8px 18px",
                          borderRadius: 8,
                          background: "linear-gradient(135deg, #10b981, #059669)",
                          border: "1px solid rgba(16, 185, 129, 0.4)",
                          color: "#ffffff",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: isActing ? "not-allowed" : "pointer",
                          boxShadow: "0 4px 14px rgba(16, 185, 129, 0.3)",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          opacity: isActing ? 0.6 : 1,
                        }}
                      >
                        {isActing ? "Authorizing..." : "✓ Authorize Admin Clearance"}
                      </button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Authorized Staff Section */}
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <span>🛡️</span>
          <span>Authorized Command Staff ({approvedAdmins.length})</span>
        </div>

        <Card className="admin-table-wrap">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <TH>Administrator</TH>
                <TH>Duty Role & Unit</TH>
                <TH>Contact</TH>
                <TH>Clearance Status</TH>
              </tr>
            </thead>
            <tbody>
              {approvedAdmins.map((admin) => (
                <tr key={admin.id || admin.email}>
                  <TD>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: "50%",
                          background: "rgba(59, 130, 246, 0.18)",
                          border: "1px solid rgba(59, 130, 246, 0.35)",
                          color: "#60a5fa",
                          fontSize: 12,
                          fontWeight: 700,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {(admin.name || "SA").slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
                          {admin.name || "Administrator"}
                        </div>
                        <div style={{ fontSize: 11, color: C.muted }}>{admin.email}</div>
                      </div>
                    </div>
                  </TD>
                  <TD>
                    <div style={{ fontSize: 12, color: C.text }}>{admin.roleTitle || "System Administrator"}</div>
                    <div style={{ fontSize: 11, color: C.muted2 }}>{admin.organization || "Expedition Command Operations"}</div>
                  </TD>
                  <TD>
                    <span style={{ fontSize: 12, color: C.muted }}>{admin.phone || "Command Dispatch"}</span>
                  </TD>
                  <TD>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "3px 8px",
                        borderRadius: 12,
                        background: "rgba(34, 197, 94, 0.15)",
                        border: "1px solid rgba(34, 197, 94, 0.35)",
                        color: "#86efac",
                        letterSpacing: "0.04em",
                      }}
                    >
                      ● ACTIVE CLEARANCE
                    </span>
                  </TD>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════
   PAGE: SAFETY PROTOCOL (Consolidated into Expeditions & Rosters)
════════════════════════════════════════════════ */
const PageSafetyProtocol = ({ isEmbedded = false }) => {
  const [protocols, setProtocols] = useState(PROTOCOLS);
  const [editing, setEditing] = useState(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const unsubscribe = subscribeToSafetyProtocols((items) => {
      if (!isMounted) return;
      if (items && items.length > 0) {
        setProtocols(items);
      }
    });
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const startEdit = (p) => {
    setEditing(p.id);
    setTitle(p.title);
    setBody(p.body || "");
    setShowNew(false);
  };

  const saveP = async () => {
    if (!title.trim()) return;
    const payload = { title: title.trim(), body: body.trim(), status: "published", author: "Command Admin" };
    if (editing) await updateSafetyProtocol(editing, payload);
    else await createSafetyProtocol(payload);
    setEditing(null);
    setShowNew(false);
    setTitle("");
    setBody("");
  };

  return (
    <div>
      {!isEmbedded ? (
        <PageHeader
          title="Safety Directives & Protocols"
          sub="Write, publish and enforce mountain safety directives across active rosters"
          right={
            <Btn variant="primary" onClick={() => { setShowNew(true); setEditing(null); setTitle(""); setBody(""); }}>
              + New Protocol
            </Btn>
          }
        />
      ) : (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
            padding: "14px 18px",
            background: "linear-gradient(90deg, rgba(34, 197, 94, 0.08), rgba(16, 185, 129, 0.04))",
            border: "1px solid rgba(34, 197, 94, 0.25)",
            borderRadius: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, display: "flex", alignItems: "center", gap: 8 }}>
              <span>🛡️</span>
              <span>Expedition Standing Safety Directives & SOPs</span>
            </div>
            <div style={{ fontSize: 11.5, color: C.muted, marginTop: 3 }}>
              Write and publish standing safety guidelines, check-in intervals, and SOS rescue SOPs synchronized across all active trek rosters.
            </div>
          </div>
          <Btn variant="primary" onClick={() => { setShowNew(true); setEditing(null); setTitle(""); setBody(""); }}>
            + New Protocol
          </Btn>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div>
          {protocols.map((p) => (
            <Card key={p.id} style={{ marginBottom: 10, borderColor: p.status === "published" ? "rgba(34,197,94,0.25)" : C.border }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{p.title}</div>
                    <Pill color={p.status === "published" ? "green" : "amber"}>{p.status}</Pill>
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, marginBottom: 6 }}>{p.body}</div>
                  <div style={{ fontSize: 10.5, color: C.muted2 }}>Updated {p.updated || "Recently"} · Author: {p.author || "Admin"}</div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <Btn onClick={() => startEdit(p)}>Edit</Btn>
                  {p.status === "draft" && (
                    <Btn variant="success" onClick={() => updateSafetyProtocol(p.id, { status: "published", title: p.title, body: p.body, author: p.author || "Admin" })}>
                      Publish
                    </Btn>
                  )}
                  <Btn variant="ghost" onClick={() => deleteSafetyProtocol(p.id)} style={{ color: C.red }}>
                    ✕
                  </Btn>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {(editing || showNew) ? (
          <div>
            <Card>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>
                {editing ? "Edit Safety Directive" : "Create New Mountain Safety Directive"}
              </div>
              <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Protocol Title
              </label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Flash Flood & Ridge Evacuation SOP"
                style={{ marginBottom: 12 }}
              />
              <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Protocol Body & Instructions
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={9}
                placeholder={"Step 1: Sound 3 audible whistle blasts.\nStep 2: Group assembled at Base Camp coordinates.\nStep 3: Await SAR clearance via 145.500 MHz."}
                style={{
                  width: "100%",
                  background: "rgba(255,255,255,0.04)",
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  color: C.text,
                  fontSize: 12.5,
                  padding: 12,
                  fontFamily: "inherit",
                  resize: "vertical",
                  boxSizing: "border-box",
                  outline: "none",
                  lineHeight: 1.6,
                  marginBottom: 14,
                }}
              />
              <div style={{ display: "flex", gap: 10 }}>
                <Btn variant="primary" onClick={saveP}>
                  Save &amp; Publish Directive
                </Btn>
                <Btn onClick={() => { setEditing(null); setShowNew(false); }}>
                  Cancel
                </Btn>
              </div>
            </Card>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              border: `1px dashed ${C.border}`,
              borderRadius: 14,
              color: C.muted2,
              fontSize: 13,
              cursor: "pointer",
              minHeight: 220,
              gap: 8,
              padding: 20,
              textAlign: "center",
              transition: "border-color 0.2s",
            }}
            onClick={() => { setShowNew(true); setTitle(""); setBody(""); }}
          >
            <span style={{ fontSize: 24 }}>🛡️</span>
            <span style={{ fontWeight: 600, color: C.muted }}>+ Add New Safety Directive</span>
            <span style={{ fontSize: 11, color: C.muted2 }}>Click to compose instructions, trail boundaries, or medical response SOPs</span>
          </div>
        )}
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════
   PAGE: TRIP ROSTERS & EXPEDITION APPROVALS
════════════════════════════════════════════════ */
const RAJMACHI_DEMO_MEMBERS = [
  { id: "rajm-demo-1", name: "Rhea Kulkarni", email: "rhea.k@example.com", phone: "+91 98200 11221", blood: "O+", medical: "Mild asthma — carries inhaler", ec1Name: "Meera Kulkarni", ec1Rel: "Mother", ec1Ph: "+91 98200 11222", status: "approved", isDemo: true },
  { id: "rajm-demo-2", name: "Aditya Rane", email: "aditya.rane@example.com", phone: "+91 99670 44112", blood: "B+", medical: "None", ec1Name: "Sunil Rane", ec1Rel: "Father", ec1Ph: "+91 99670 44113", status: "approved", isDemo: true },
  { id: "rajm-demo-3", name: "Sanya Deshpande", email: "sanya.d@example.com", phone: "+91 90040 78231", blood: "A-", medical: "Knee brace — old sprain", ec1Name: "Vikram Deshpande", ec1Rel: "Brother", ec1Ph: "+91 90040 78232", status: "approved", isDemo: true },
  { id: "rajm-demo-4", name: "Kabir Sheikh", email: "kabir.s@example.com", phone: "+91 98670 55109", blood: "AB+", medical: "None", ec1Name: "Farah Sheikh", ec1Rel: "Sister", ec1Ph: "+91 98670 55110", status: "approved", isDemo: true },
  { id: "rajm-demo-5", name: "Ira Menon", email: "ira.menon@example.com", phone: "+91 98330 21004", blood: "O-", medical: "Carries EpiPen", ec1Name: "Deepa Menon", ec1Rel: "Mother", ec1Ph: "+91 98330 21005", status: "approved", isDemo: true },
];

const FieldLabel = ({ children }) => (
  <div style={{ fontSize: 10.5, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>
    {children}
  </div>
);

const Field = ({ label, hint, children, span }) => (
  <label style={{ display: "block", gridColumn: span ? `span ${span}` : undefined, minWidth: 0 }}>
    <FieldLabel>{label}</FieldLabel>
    {children}
    {hint && <div style={{ fontSize: 10.5, color: C.muted2, marginTop: 4, lineHeight: 1.4 }}>{hint}</div>}
  </label>
);

const TextArea = ({ value, onChange, placeholder, rows = 3, style }) => (
  <textarea
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    rows={rows}
    style={{
      width: "100%",
      background: "rgba(255,255,255,0.04)",
      border: `1px solid ${C.border}`,
      borderRadius: 8,
      color: C.text,
      fontSize: 12.5,
      lineHeight: 1.55,
      padding: "9px 12px",
      fontFamily: "inherit",
      resize: "vertical",
      outline: "none",
      boxSizing: "border-box",
      ...style,
    }}
  />
);

const Select = ({ value, onChange, children, style }) => (
  <select
    value={value}
    onChange={onChange}
    style={{
      height: 36,
      width: "100%",
      background: "#0d1727",
      border: `1px solid ${C.border}`,
      borderRadius: 8,
      color: C.text,
      fontSize: 12.5,
      padding: "0 10px",
      fontFamily: "inherit",
      outline: "none",
      ...style,
    }}
  >
    {children}
  </select>
);

const Tabs = ({ tabs, value, onChange }) => (
  <div style={{ display: "flex", gap: 6, padding: 4, background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 10, flexWrap: "wrap" }}>
    {tabs.map((t) => (
      <button
        key={t.id}
        type="button"
        onClick={() => onChange(t.id)}
        style={{
          padding: "6px 12px",
          borderRadius: 7,
          border: "none",
          background: value === t.id ? "rgba(59,130,246,0.18)" : "transparent",
          color: value === t.id ? "#93c5fd" : C.muted,
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "inherit",
          whiteSpace: "nowrap",
        }}
      >
        {t.label}
      </button>
    ))}
  </div>
);

const CapacityBar = ({ filled, max, compact = false }) => {
  const pct = max > 0 ? Math.min(100, Math.round((filled / max) * 100)) : 0;
  const full = filled >= max;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 5 }}>
        <span style={{ color: C.muted }}>Roster</span>
        <span style={{ color: full ? "#fca5a5" : C.text, fontWeight: 600 }}>
          {filled} / {max} {full ? "· full" : `· ${max - filled} open`}
        </span>
      </div>
      <div style={{ height: compact ? 5 : 6, borderRadius: 4, background: "rgba(255,255,255,0.07)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 4, background: full ? "linear-gradient(90deg,#ef4444,#f59e0b)" : "linear-gradient(90deg,#22c55e,#14b8a6)" }} />
      </div>
    </div>
  );
};

const DrawerShell = ({ title, subtitle, onClose, children }) => (
  <div
    onClick={onClose}
    style={{ position: "fixed", inset: 0, zIndex: 950, background: "rgba(3,7,18,0.72)", backdropFilter: "blur(4px)", display: "flex", justifyContent: "flex-end" }}
  >
    <div
      onClick={(e) => e.stopPropagation()}
      className="ms-drawer-panel"
      style={{ width: "min(640px, 100%)", height: "100%", background: "#0b1422", borderLeft: `1px solid ${C.border2}`, display: "flex", flexDirection: "column", boxShadow: "-24px 0 60px rgba(0,0,0,0.55)" }}
    >
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text, lineHeight: 1.3 }}>{title}</div>
          {subtitle && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 3 }}>{subtitle}</div>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${C.border}`, color: C.muted, width: 30, height: 30, borderRadius: 8, cursor: "pointer", fontSize: 14, flexShrink: 0, fontFamily: "inherit" }}
        >
          ✕
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 28px" }}>{children}</div>
    </div>
  </div>
);

const ModalShell = ({ title, subtitle, onClose, children, maxWidth = 660 }) => (
  <div style={{ position: "fixed", inset: 0, zIndex: 960, background: "rgba(3,7,18,0.82)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, overflowY: "auto" }}>
    <div style={{ width: "100%", maxWidth, background: "#0b1422", border: `1px solid ${C.border2}`, borderRadius: 16, boxShadow: "0 24px 60px rgba(0,0,0,0.6)", maxHeight: "calc(100vh - 32px)", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "15px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{title}</div>
          {subtitle && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{subtitle}</div>}
        </div>
        <button type="button" onClick={onClose} aria-label="Close" style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${C.border}`, color: C.muted, width: 28, height: 28, borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}>✕</button>
      </div>
      <div style={{ padding: "16px 20px 22px", overflowY: "auto" }}>{children}</div>
    </div>
  </div>
);

const PageTripRosters = ({
  defaultTab = "expeditions",
  pendingTrekkers = [],
  onApprove,
  onRemove,
  refreshing,
  onRefresh,
  admins = [],
  currentAdmin = null,
}) => {
  const [activeMainTab, setActiveMainTab] = useState(defaultTab || "expeditions");
  const [protocols, setProtocols] = useState(PROTOCOLS);
  const [trips, setTrips] = useState([]);
  const [actionLoading, setActionLoading] = useState({});
  const [rosters, setRosters] = useState({});
  const [loadingRoster, setLoadingRoster] = useState({});
  const [toastMessage, setToastMessage] = useState(null);
  const [toastKind, setToastKind] = useState("success");
  const [formError, setFormError] = useState("");

  // Manage drawer
  const [drawerTripId, setDrawerTripId] = useState(null);
  const [drawerTab, setDrawerTab] = useState("roster");
  const [detailsForm, setDetailsForm] = useState(null);
  const [savingDetails, setSavingDetails] = useState(false);
  const [geofenceRadius, setGeofenceRadius] = useState(2500);
  const [geofenceZone, setGeofenceZone] = useState("");
  const [savingGeofence, setSavingGeofence] = useState(false);
  const [geofenceToast, setGeofenceToast] = useState("");

  // Create / delete
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingExpedition, setCreatingExpedition] = useState(false);
  const [deleteModalTrip, setDeleteModalTrip] = useState(null);
  const [deletingTrip, setDeletingTrip] = useState(false);

  // Rajmachi demo roster is local-only: it is rebuilt on every admin sign-in,
  // so removals/edits survive this session but reset after sign-out.
  const [demoMembers, setDemoMembers] = useState(() => RAJMACHI_DEMO_MEMBERS.map((m) => ({ ...m })));
  const [removedDemo, setRemovedDemo] = useState({});
  const [demoEditId, setDemoEditId] = useState(null);

  const emptyForm = () => ({
    name: "",
    startDate: "",
    startTime: "06:30 AM",
    endDate: "",
    endTime: "05:00 PM",
    duration: "2 Days / 1 Night",
    location: "",
    elevation: "",
    difficulty: "Moderate",
    pickupLocation: "Lonavala Railway Station (Platform 1 exit)",
    baseLocation: "",
    maxRoster: 12,
    instructions: "",
    gearList: "",
    notes: "",
    adminInCharge: currentAdmin?.id || admins[0]?.id || "",
    extraAdmins: [],
  });
  const [newExpForm, setNewExpForm] = useState(emptyForm);

  useEffect(() => {
    if (defaultTab) setActiveMainTab(defaultTab);
  }, [defaultTab]);

  useEffect(() => {
    let isMounted = true;
    const unsub = subscribeToSafetyProtocols((items) => {
      if (isMounted && items && items.length > 0) setProtocols(items);
    });
    return () => {
      isMounted = false;
      if (unsub) unsub();
    };
  }, []);

  useEffect(() => {
    const unsub = subscribeToTrips((liveTrips) => {
      // `null` means the read failed — keep whatever the API returned.
      if (Array.isArray(liveTrips)) setTrips(liveTrips);
    });
    return () => unsub && unsub();
  }, []);

  const flash = (msg, kind = "success") => {
    setToastKind(kind);
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 5000);
  };

  const adminOptions = useMemo(() => {
    const list = [...admins];
    if (currentAdmin?.id && !list.some((a) => a.id === currentAdmin.id)) list.unshift(currentAdmin);
    return list;
  }, [admins, currentAdmin]);

  const loadRosterForTrip = async (tripId) => {
    setLoadingRoster((p) => ({ ...p, [tripId]: true }));
    try {
      const list = await fetchTripRoster(tripId);
      setRosters((p) => ({ ...p, [tripId]: list }));
    } catch (e) {
      console.warn("Failed to load roster for trip:", tripId, e);
    } finally {
      setLoadingRoster((p) => ({ ...p, [tripId]: false }));
    }
  };

  const selectedTrip = trips.find((t) => (t.id || t.tripId) === drawerTripId) || null;

  const openManage = (trip, tab = "roster") => {
    const tripId = trip.id || trip.tripId;
    setDrawerTripId(tripId);
    setDrawerTab(tab);
    setGeofenceToast("");
    setGeofenceRadius(trip.geofence?.radius || 2500);
    setGeofenceZone(trip.geofence?.zoneName || `${trip.name} Safe Corridor`);
    setDetailsForm({
      name: trip.name || "",
      startDate: trip.startDate || "",
      startTime: trip.startTime || "06:30 AM",
      endDate: trip.endDate || "",
      endTime: trip.endTime || "05:00 PM",
      duration: trip.duration || "2 Days / 1 Night",
      location: trip.location || "",
      elevation: trip.elevation || "",
      difficulty: trip.difficulty || "",
      pickupLocation: trip.pickupLocation || "",
      baseLocation: trip.baseLocation || "",
      maxRoster: trip.maxRoster || 12,
      instructions: trip.instructions || "",
      gearList: Array.isArray(trip.gearList) ? trip.gearList.join("\n") : (trip.gearList || ""),
      notes: trip.notes || "",
      adminInCharge: trip.adminInCharge || trip.adminInChargeName || "",
      extraAdmins: (trip.admins || []).map((a) => a.id || a).filter((id) => id !== trip.adminInCharge),
    });
    if (!rosters[tripId] && !loadingRoster[tripId]) loadRosterForTrip(tripId);
  };

  const closeDrawer = () => setDrawerTripId(null);

  const handleApprove = async (tripId, userId) => {
    const key = `${tripId}-${userId}`;
    setActionLoading((p) => ({ ...p, [key]: true }));
    try {
      const res = await onApprove(tripId, userId);
      const updated = await fetchTripRoster(tripId);
      setRosters((p) => ({ ...p, [tripId]: updated }));
      if (res?.success === false) {
        flash(res?.error || "Could not approve that request.", "error");
      } else {
        flash("Trekker approved and added to the expedition roster.");
      }
    } catch (e) {
      flash(e?.message || "Could not approve that request.", "error");
    } finally {
      setActionLoading((p) => ({ ...p, [key]: false }));
    }
  };

  const handleRemove = async (tripId, userId) => {
    const key = `${tripId}-${userId}`;
    setActionLoading((p) => ({ ...p, [key]: true }));
    try {
      const res = await onRemove(tripId, userId);
      const updated = await fetchTripRoster(tripId);
      setRosters((p) => ({ ...p, [tripId]: updated }));
      if (res?.success === false) {
        flash(res?.error || "Could not update that request.", "error");
      } else {
        flash("Trekker removed from the expedition.");
      }
    } catch (e) {
      flash(e?.message || "Could not update that request.", "error");
    } finally {
      setActionLoading((p) => ({ ...p, [key]: false }));
    }
  };

  const handleSetInFieldCommand = async (trip) => {
    const tripId = trip.id || trip.tripId;
    setActionLoading((p) => ({ ...p, [`manage-${tripId}`]: true }));
    try {
      const res = await setActiveManagedTripRemote(tripId);
      if (res?.success) {
        setTrips((prev) =>
          prev.map((t) => {
            const tid = t.id || t.tripId;
            if (tid === tripId) return { ...t, isManaged: true, status: "in-field" };
            return { ...t, isManaged: false, status: t.status === "in-field" ? "upcoming" : (t.status || "upcoming") };
          })
        );
        flash(`In-field command is now on "${trip.name}".`);
      } else {
        flash(res?.error || "Could not switch in-field command.", "error");
      }
    } catch (err) {
      console.error("Failed to switch active managed expedition:", err);
      flash("Could not switch in-field command.", "error");
    } finally {
      setActionLoading((p) => ({ ...p, [`manage-${tripId}`]: false }));
    }
  };

  const handleConfirmDeleteTrip = async () => {
    if (!deleteModalTrip || deletingTrip) return;
    const tripId = deleteModalTrip.id || deleteModalTrip.tripId;
    setDeletingTrip(true);
    try {
      const res = await deleteTripRemote(tripId);
      if (res?.success) {
        setTrips((prev) => prev.filter((t) => (t.id || t.tripId) !== tripId));
        setRosters((prev) => {
          const next = { ...prev };
          delete next[tripId];
          return next;
        });
        if (drawerTripId === tripId) setDrawerTripId(null);
        flash(`Expedition "${deleteModalTrip.name}" deleted.`);
      } else {
        flash(res?.error || "Could not delete that expedition.", "error");
      }
    } catch (err) {
      console.error("Failed to delete trip:", err);
      flash("Could not delete that expedition.", "error");
    } finally {
      setDeletingTrip(false);
      setDeleteModalTrip(null);
    }
  };

  const handleCreateExpedition = async (e) => {
    if (e) e.preventDefault();
    setFormError("");
    if (!newExpForm.name.trim() || creatingExpedition) return;
    if (!newExpForm.adminInCharge) {
      setFormError("Choose an admin in charge — an expedition can never have zero admins.");
      return;
    }
    setCreatingExpedition(true);
    try {
      const formattedDate = `${newExpForm.startDate} · ${newExpForm.startTime} – ${newExpForm.endDate} · ${newExpForm.endTime}`;
      const gear = newExpForm.gearList.split(/\r?\n|,/).map((g) => g.trim()).filter(Boolean);
      const res = await createTripRemote({
        name: newExpForm.name.trim(),
        date: formattedDate,
        startDate: newExpForm.startDate,
        startTime: newExpForm.startTime,
        endDate: newExpForm.endDate,
        endTime: newExpForm.endTime,
        duration: newExpForm.duration || "2 Days / 1 Night",
        pickupLocation: newExpForm.pickupLocation || "",
        baseLocation: newExpForm.baseLocation || "",
        location: newExpForm.location.trim(),
        elevation: newExpForm.elevation.trim(),
        difficulty: newExpForm.difficulty,
        maxRoster: Number(newExpForm.maxRoster) || 12,
        instructions: newExpForm.instructions,
        gearList: gear,
        notes: newExpForm.notes,
        admins: [newExpForm.adminInCharge, ...newExpForm.extraAdmins].filter(Boolean),
        adminInCharge: newExpForm.adminInCharge,
        createdBy: currentAdmin?.id || newExpForm.adminInCharge,
        isManaged: false,
        status: "upcoming",
        lat: 18.8286,
        lon: 73.3986,
        geofence: { lat: 18.8286, lon: 73.3986, radius: 2500, zoneName: `${newExpForm.name.trim()} Safe Corridor` },
      });

      if (res?.success) {
        if (res.trip) setTrips((p) => [res.trip, ...p.filter((t) => (t.id || t.tripId) !== res.trip.id)]);
        setShowCreateModal(false);
        setNewExpForm(emptyForm());
        flash(`Expedition "${res.trip?.name || newExpForm.name}" created.`);
      } else {
        setFormError(res?.error || "Could not create the expedition. Please try again.");
      }
    } catch (err) {
      setFormError(err?.message || "Could not create the expedition.");
    } finally {
      setCreatingExpedition(false);
    }
  };

  const handleSaveDetails = async () => {
    if (!selectedTrip || !detailsForm || savingDetails) return;
    setFormError("");
    if (!detailsForm.name.trim()) {
      setFormError("Expedition name cannot be empty.");
      return;
    }
    if (!detailsForm.adminInCharge) {
      setFormError("An expedition must always have an admin in charge.");
      return;
    }
    setSavingDetails(true);
    const tripId = selectedTrip.id || selectedTrip.tripId;
    try {
      const res = await updateTripRemote(tripId, {
        name: detailsForm.name.trim(),
        startDate: detailsForm.startDate,
        startTime: detailsForm.startTime,
        endDate: detailsForm.endDate,
        endTime: detailsForm.endTime,
        date: `${detailsForm.startDate} · ${detailsForm.startTime} – ${detailsForm.endDate} · ${detailsForm.endTime}`,
        duration: detailsForm.duration,
        location: detailsForm.location,
        elevation: detailsForm.elevation,
        difficulty: detailsForm.difficulty,
        pickupLocation: detailsForm.pickupLocation,
        baseLocation: detailsForm.baseLocation,
        maxRoster: Number(detailsForm.maxRoster) || 1,
        instructions: detailsForm.instructions,
        gearList: detailsForm.gearList.split(/\r?\n|,/).map((g) => g.trim()).filter(Boolean),
        notes: detailsForm.notes,
        admins: [detailsForm.adminInCharge, ...detailsForm.extraAdmins].filter(Boolean),
        adminInCharge: detailsForm.adminInCharge,
      });
      if (res?.success && res.trip) {
        setTrips((prev) => prev.map((t) => ((t.id || t.tripId) === tripId ? { ...t, ...res.trip } : t)));
        flash("Expedition details saved.");
      } else {
        setFormError(res?.error || "Could not save the expedition details.");
      }
    } catch (err) {
      setFormError(err?.message || "Could not save the expedition details.");
    } finally {
      setSavingDetails(false);
    }
  };

  const handleSaveGeofence = async () => {
    if (!selectedTrip || savingGeofence) return;
    const tripId = selectedTrip.id || selectedTrip.tripId;
    setSavingGeofence(true);
    setGeofenceToast("");
    try {
      const saveResult = await updateTripGeofenceRemote(tripId, {
        radius: Number(geofenceRadius),
        zoneName: geofenceZone,
        lat: selectedTrip.lat || 18.8286,
        lon: selectedTrip.lon || 73.3986,
      });
      if (saveResult && saveResult.success === false) {
        setGeofenceToast(`✕ Perimeter not saved — ${saveResult.error || "backend rejected the update"}`);
        return;
      }
      setTrips((prev) =>
        prev.map((t) =>
          (t.id || t.tripId) === tripId
            ? { ...t, geofence: { ...(t.geofence || {}), radius: Number(geofenceRadius), zoneName: geofenceZone } }
            : t
        )
      );
      setGeofenceToast("✓ Safety perimeter updated and broadcast to active trekkers.");
    } catch (err) {
      console.error("Failed to update geofence:", err);
      setGeofenceToast("✕ Could not update the safety perimeter.");
    } finally {
      setSavingGeofence(false);
      setTimeout(() => setGeofenceToast(""), 6000);
    }
  };

  const toggleExtraAdmin = (id) => {
    setDetailsForm((f) => {
      if (!f) return f;
      const has = f.extraAdmins.includes(id);
      return { ...f, extraAdmins: has ? f.extraAdmins.filter((x) => x !== id) : [...f.extraAdmins, id] };
    });
  };

  const demoForTrip = (trip) => {
    if (!trip?.demoRoster) return [];
    const removed = removedDemo[trip.id || trip.tripId] || [];
    return demoMembers.filter((m) => !removed.includes(m.id));
  };

  const removeDemoMember = (tripId, memberId) => {
    setRemovedDemo((p) => ({ ...p, [tripId]: [...(p[tripId] || []), memberId] }));
  };

  const restoreDemoRoster = (tripId) => {
    setRemovedDemo((p) => ({ ...p, [tripId]: [] }));
    setDemoMembers(RAJMACHI_DEMO_MEMBERS.map((m) => ({ ...m })));
  };


  const inFieldTrip = trips.find((t) => t.isManaged || t.status === "in-field");

  const tabStyle = (active, color) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 14px",
    borderRadius: 8,
    fontSize: 12.5,
    fontWeight: 600,
    fontFamily: "inherit",
    cursor: "pointer",
    background: active ? (color === "green" ? "rgba(34,197,94,0.16)" : "rgba(59,130,246,0.16)") : "transparent",
    border: `1px solid ${active ? (color === "green" ? "#22c55e" : C.border2) : "transparent"}`,
    color: active ? (color === "green" ? "#86efac" : "#93c5fd") : C.muted,
    whiteSpace: "nowrap",
  });

  return (
    <div>
      <PageHeader
        title="Expeditions & Rosters"
        sub="Create expeditions, approve trekker requests, and keep every roster accounted for."
        right={
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Btn variant="default" onClick={onRefresh} disabled={refreshing}>
              {refreshing ? "↻ Refreshing…" : "↻ Refresh"}
            </Btn>
            <Btn variant="primary" onClick={() => { setFormError(""); setNewExpForm({ ...emptyForm(), adminInCharge: currentAdmin?.id || admins[0]?.id || "" }); setShowCreateModal(true); }}>
              + New expedition
            </Btn>
          </div>
        }
      />

      {toastMessage && (
        <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 10, background: toastKind === "error" ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)", border: `1px solid ${toastKind === "error" ? "rgba(239,68,68,0.35)" : "rgba(34,197,94,0.35)"}`, color: toastKind === "error" ? "#fca5a5" : "#86efac", fontSize: 12.5, fontWeight: 600 }}>
          {toastMessage}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: 18, borderBottom: `1px solid ${C.border}`, paddingBottom: 12, flexWrap: "wrap" }}>
        <button type="button" onClick={() => setActiveMainTab("expeditions")} style={tabStyle(activeMainTab === "expeditions")}>
          🧭 Expeditions
          <span style={{ fontSize: 10.5, padding: "1px 7px", borderRadius: 10, background: "rgba(255,255,255,0.08)" }}>{trips.length}</span>
        </button>
        <button type="button" onClick={() => setActiveMainTab("protocols")} style={tabStyle(activeMainTab === "protocols", "green")}>
          🛡️ Safety directives
          <span style={{ fontSize: 10.5, padding: "1px 7px", borderRadius: 10, background: "rgba(34,197,94,0.15)", color: "#86efac" }}>
            {protocols.filter((p) => p.status === "published").length}
          </span>
        </button>
      </div>

      {activeMainTab === "protocols" ? (
        <PageSafetyProtocol isEmbedded={true} />
      ) : (
        <>

          {trips.length === 0 ? (
            <Card style={{ textAlign: "center", padding: "40px 20px" }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🧭</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4 }}>No expeditions yet</div>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>Create your first expedition and it will appear in the trekker app instantly.</div>
              <Btn variant="primary" onClick={() => { setFormError(""); setShowCreateModal(true); }}>+ New expedition</Btn>
            </Card>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(315px, 1fr))", gap: 14 }}>
              {trips.map((trip) => {
                const tripId = trip.id || trip.tripId;
                const demoList = demoForTrip(trip);
                const liveMembers = rosters[tripId] || [];
                const approvedLive = liveMembers.filter((m) => (m.status || "approved") === "approved").length;
                const displayFilled = trip.demoRoster ? Math.max(demoList.length, 0) + approvedLive : (Number(trip.rosterCount) || approvedLive);
                const max = Number(trip.maxRoster) || 25;
                const isInCharge = trip.adminInCharge === currentAdmin?.id;
                const inChargeName = trip.adminInChargeName || (adminOptions.find((a) => a.id === trip.adminInCharge) || {}).name || trip.leader || "—";
                const isManaged = !!trip.isManaged || trip.status === "in-field";
                return (
                  <Card key={tripId} style={{ display: "flex", flexDirection: "column", gap: 11, padding: "15px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: isManaged ? "#22c55e" : "#3b82f6", flexShrink: 0 }} />
                        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", color: isManaged ? "#86efac" : C.muted, textTransform: "uppercase" }}>
                          {isManaged ? "In field" : (trip.status || "upcoming")}
                        </span>
                        <span style={{ fontSize: 10, color: C.muted2, fontFamily: "monospace", letterSpacing: "0.08em" }}>· {trip.code}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        {trip.demoRoster && <Pill color="purple">demo</Pill>}
                        <button
                          type="button"
                          onClick={() => setDeleteModalTrip(trip)}
                          aria-label={`Delete ${trip.name}`}
                          style={{ background: "transparent", border: "none", color: C.muted2, cursor: "pointer", fontSize: 13, padding: 2, fontFamily: "inherit" }}
                        >
                          🗑
                        </button>
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: C.text, lineHeight: 1.35 }}>{trip.name}</div>
                      <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4 }}>
                        📅 {trip.startDate}{trip.endDate ? ` – ${trip.endDate}` : ""}
                        {trip.location ? ` · 📍 ${trip.location}` : ""}
                      </div>
                      {trip.difficulty && <div style={{ fontSize: 11, color: C.muted2, marginTop: 2 }}>⛰ {trip.difficulty}</div>}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "rgba(255,255,255,0.03)", borderRadius: 8 }}>
                      <Avatar initials={(inChargeName || "AD").split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase()} size={26} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 11.5, color: C.text, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {inChargeName} {isInCharge && <span style={{ color: "#86efac", fontWeight: 700 }}>· you</span>}
                        </div>
                        <div style={{ fontSize: 10, color: C.muted2 }}>
                          Admin in charge · {(() => { const n = (trip.admins || []).length || 1; return `${n} admin${n === 1 ? "" : "s"}`; })()}
                        </div>
                      </div>
                    </div>

                    <CapacityBar filled={displayFilled} max={max} compact />

                    <div style={{ display: "flex", gap: 7, marginTop: 2 }}>
                      <button
                        type="button"
                        onClick={() => openManage(trip, "roster")}
                        style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#2563eb,#1d4ed8)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                      >
                        Manage roster
                      </button>
                      {!isManaged && (
                        <button
                          type="button"
                          disabled={!!actionLoading[`manage-${tripId}`]}
                          onClick={() => handleSetInFieldCommand(trip)}
                          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(34,197,94,0.3)", background: "transparent", color: "#86efac", fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
                        >
                          {actionLoading[`manage-${tripId}`] ? "…" : "Set in-field"}
                        </button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {selectedTrip && detailsForm && (
        <DrawerShell
          title={selectedTrip.name}
          subtitle={`${selectedTrip.code} · ${selectedTrip.startDate || "date TBD"}${selectedTrip.location ? ` · ${selectedTrip.location}` : ""}`}
          onClose={closeDrawer}
        >
          <div style={{ marginBottom: 14 }}>
            <Tabs
              value={drawerTab}
              onChange={setDrawerTab}
              tabs={[
                { id: "roster", label: "Roster" },
                { id: "details", label: "Details & slots" },
                { id: "safety", label: "Safety" },
              ]}
            />
          </div>

          {drawerTab === "roster" && (() => {
            const tripId = selectedTrip.id || selectedTrip.tripId;
            const demoList = demoForTrip(selectedTrip);
            const liveMembers = rosters[tripId] || [];
            const approved = liveMembers.filter((m) => (m.status || "approved") === "approved");
            const memberCount = demoList.length + approved.length;
            const max = Number(selectedTrip.maxRoster) || 25;
            return (
              <div>
                <div style={{ marginBottom: 14 }}>
                  <CapacityBar filled={memberCount} max={max} />
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted }}>
                    Enrolled trekkers · {memberCount}
                  </div>
                  <button type="button" onClick={() => loadRosterForTrip(tripId)} style={{ background: "transparent", border: "none", color: "#60a5fa", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
                    ↻ Refresh
                  </button>
                </div>

                {loadingRoster[tripId] ? (
                  <div style={{ padding: 18, textAlign: "center", color: C.muted, fontSize: 12 }}>Loading roster…</div>
                ) : memberCount === 0 ? (
                  <div style={{ padding: "18px 14px", textAlign: "center", color: C.muted2, fontSize: 12, background: "rgba(255,255,255,0.02)", borderRadius: 9 }}>
                    No trekkers enrolled yet. Approved requests from the user app appear here.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {demoList.map((member) => {
                      const editing = demoEditId === member.id;
                      return (
                        <div key={member.id} style={{ padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 10 }}>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                            <Avatar initials={(member.name || "TR").split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase()} size={30} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              {editing ? (
                                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                  <Input value={member.name} onChange={(e) => setDemoMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, name: e.target.value } : m)))} placeholder="Name" />
                                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                                    <Input value={member.phone} onChange={(e) => setDemoMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, phone: e.target.value } : m)))} placeholder="Phone" />
                                    <Input value={member.blood} onChange={(e) => setDemoMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, blood: e.target.value } : m)))} placeholder="Blood group" />
                                  </div>
                                  <Input value={member.medical} onChange={(e) => setDemoMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, medical: e.target.value } : m)))} placeholder="Medical notes" />
                                  <button type="button" onClick={() => setDemoEditId(null)} style={{ alignSelf: "flex-start", padding: "5px 12px", borderRadius: 7, border: "1px solid rgba(34,197,94,0.3)", background: "rgba(34,197,94,0.14)", color: "#86efac", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                                    Save member
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                    <span style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>{member.name}</span>
                                    <Pill color="purple">demo</Pill>
                                  </div>
                                  <div style={{ fontSize: 11, color: C.muted2, marginTop: 2 }}>📞 {member.phone} · 🩸 {member.blood} · 🩺 {member.medical}</div>
                                  <div style={{ fontSize: 10.5, color: C.muted2, marginTop: 1 }}>🆘 {member.ec1Name} ({member.ec1Rel}) · {member.ec1Ph}</div>
                                </>
                              )}
                            </div>
                            {!editing && (
                              <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                                <button type="button" onClick={() => setDemoEditId(member.id)} style={{ background: "transparent", border: "none", color: "#60a5fa", fontSize: 10.5, cursor: "pointer", fontFamily: "inherit" }}>edit</button>
                                <button type="button" onClick={() => removeDemoMember(tripId, member.id)} style={{ background: "transparent", border: "none", color: "#fca5a5", fontSize: 10.5, cursor: "pointer", fontFamily: "inherit" }}>remove</button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {approved.map((member) => {
                      const memberId = member.id || member.userId;
                      const key = `${tripId}-${memberId}`;
                      const isActing = !!actionLoading[key];
                      return (
                        <div key={memberId} style={{ padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 10 }}>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                            <Avatar initials={(member.name || "TR").split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase()} size={30} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>{member.name || "Trekker"}</div>
                              <div style={{ fontSize: 11, color: C.muted2, marginTop: 2 }}>{member.email || "no email"} · 📞 {member.phone || "—"}</div>
                              <div style={{ fontSize: 10.5, color: C.muted2, marginTop: 1 }}>🩸 {member.blood || "B+"} · 🩺 {member.medical || "None"}</div>
                              <div style={{ fontSize: 10.5, color: C.muted2, marginTop: 1 }}>🆘 {member.ec1Name || "Kin"} ({member.ec1Rel || "contact"}) · {member.ec1Ph || "—"}</div>
                            </div>
                            <button
                              type="button"
                              disabled={isActing}
                              onClick={() => handleRemove(tripId, memberId)}
                              style={{ background: "transparent", border: "none", color: "#fca5a5", fontSize: 10.5, cursor: isActing ? "not-allowed" : "pointer", fontFamily: "inherit", flexShrink: 0 }}
                            >
                              {isActing ? "…" : "remove"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {selectedTrip.demoRoster && (
                  <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 9, background: "rgba(167,139,250,0.07)", border: "1px solid rgba(167,139,250,0.22)", fontSize: 10.5, color: "rgba(196,181,253,0.85)", lineHeight: 1.5 }}>
                    Rajmachi demo roster is local to this console. Changes reset the next time an admin signs out.
                    {(removedDemo[tripId] || []).length > 0 && (
                      <button type="button" onClick={() => restoreDemoRoster(tripId)} style={{ display: "block", marginTop: 6, background: "transparent", border: "none", color: "#c4b5fd", fontSize: 10.5, fontWeight: 700, textDecoration: "underline", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
                        Restore demo roster
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {drawerTab === "details" && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10, marginBottom: 4 }}>
                <Field label="Expedition name" span={2}>
                  <Input value={detailsForm.name} onChange={(e) => setDetailsForm((f) => ({ ...f, name: e.target.value }))} />
                </Field>
                <Field label="Start date"><Input type="date" value={detailsForm.startDate} onChange={(e) => setDetailsForm((f) => ({ ...f, startDate: e.target.value }))} style={{ colorScheme: "dark" }} /></Field>
                <Field label="Start time"><Input value={detailsForm.startTime} onChange={(e) => setDetailsForm((f) => ({ ...f, startTime: e.target.value }))} /></Field>
                <Field label="End date"><Input type="date" value={detailsForm.endDate} onChange={(e) => setDetailsForm((f) => ({ ...f, endDate: e.target.value }))} style={{ colorScheme: "dark" }} /></Field>
                <Field label="End time"><Input value={detailsForm.endTime} onChange={(e) => setDetailsForm((f) => ({ ...f, endTime: e.target.value }))} /></Field>
                <Field label="Slots"><Input type="number" value={detailsForm.maxRoster} onChange={(e) => setDetailsForm((f) => ({ ...f, maxRoster: e.target.value }))} /></Field>
                <Field label="Difficulty"><Input value={detailsForm.difficulty} onChange={(e) => setDetailsForm((f) => ({ ...f, difficulty: e.target.value }))} /></Field>
                <Field label="Location"><Input value={detailsForm.location} onChange={(e) => setDetailsForm((f) => ({ ...f, location: e.target.value }))} /></Field>
                <Field label="Elevation"><Input value={detailsForm.elevation} onChange={(e) => setDetailsForm((f) => ({ ...f, elevation: e.target.value }))} /></Field>
                <Field label="Pickup point" span={2}><Input value={detailsForm.pickupLocation} onChange={(e) => setDetailsForm((f) => ({ ...f, pickupLocation: e.target.value }))} /></Field>
                <Field label="Base / camp" span={2}><Input value={detailsForm.baseLocation} onChange={(e) => setDetailsForm((f) => ({ ...f, baseLocation: e.target.value }))} /></Field>
                <Field label="Admin in charge" span={2} hint="One admin per expedition. Changing this may be blocked if that admin is already in charge elsewhere.">
                  <Select value={detailsForm.adminInCharge} onChange={(e) => setDetailsForm((f) => ({ ...f, adminInCharge: e.target.value, extraAdmins: f.extraAdmins.filter((id) => id !== e.target.value) }))}>
                    <option value="">Select an admin…</option>
                    {adminOptions.map((a) => <option key={a.id} value={a.id}>{a.name || a.email}</option>)}
                  </Select>
                </Field>
              </div>

              <div style={{ marginBottom: 12 }}>
                <FieldLabel>Additional admins</FieldLabel>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {adminOptions.filter((a) => a.id !== detailsForm.adminInCharge).map((a) => {
                    const on = detailsForm.extraAdmins.includes(a.id);
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => toggleExtraAdmin(a.id)}
                        style={{ padding: "5px 10px", borderRadius: 7, fontSize: 11, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${on ? "rgba(34,197,94,0.4)" : C.border}`, background: on ? "rgba(34,197,94,0.12)" : "transparent", color: on ? "#86efac" : C.muted }}
                      >
                        {on ? "✓ " : "+ "}{a.name || a.email}
                      </button>
                    );
                  })}
                  {adminOptions.filter((a) => a.id !== detailsForm.adminInCharge).length === 0 && (
                    <span style={{ fontSize: 11, color: C.muted2 }}>No other admin accounts available.</span>
                  )}
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <Field label="Instructions for trekkers">
                  <TextArea rows={4} value={detailsForm.instructions} onChange={(e) => setDetailsForm((f) => ({ ...f, instructions: e.target.value }))} placeholder="Reporting time, ID checks, route rules…" />
                </Field>
              </div>
              <div style={{ marginBottom: 12 }}>
                <Field label="Things to carry" hint="One item per line.">
                  <TextArea rows={4} value={detailsForm.gearList} onChange={(e) => setDetailsForm((f) => ({ ...f, gearList: e.target.value }))} placeholder={"Trekking shoes\n2L water\nHeadlamp"} />
                </Field>
              </div>
              <div style={{ marginBottom: 14 }}>
                <Field label="Notes">
                  <TextArea rows={3} value={detailsForm.notes} onChange={(e) => setDetailsForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Anything else the trekker should know." />
                </Field>
              </div>

              {formError && <div style={{ marginBottom: 10, fontSize: 11.5, color: "#fca5a5" }}>{formError}</div>}
              <button
                type="button"
                onClick={handleSaveDetails}
                disabled={savingDetails}
                style={{ width: "100%", padding: "10px 14px", borderRadius: 9, border: "none", background: "linear-gradient(135deg,#2563eb,#1d4ed8)", color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: savingDetails ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: savingDetails ? 0.7 : 1 }}
              >
                {savingDetails ? "Saving…" : "Save expedition details"}
              </button>
            </div>
          )}

          {drawerTab === "safety" && (
            <div>
              <div style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 10 }}>🔒 Safety perimeter</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                  <Field label="Radius (metres)">
                    <Input type="number" value={geofenceRadius} onChange={(e) => setGeofenceRadius(e.target.value)} />
                  </Field>
                  <Field label="Zone name">
                    <Input value={geofenceZone} onChange={(e) => setGeofenceZone(e.target.value)} />
                  </Field>
                </div>
                <div style={{ fontSize: 10.5, color: C.muted2, margin: "6px 0 10px" }}>
                  Centre: {selectedTrip.lat || 18.8286}°N, {selectedTrip.lon || 73.3986}°E · {(Number(geofenceRadius) / 1000).toFixed(1)} km radius
                </div>
                <button
                  type="button"
                  onClick={handleSaveGeofence}
                  disabled={savingGeofence}
                  style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "rgba(34,197,94,0.18)", color: "#86efac", fontSize: 11.5, fontWeight: 700, cursor: savingGeofence ? "not-allowed" : "pointer", fontFamily: "inherit" }}
                >
                  {savingGeofence ? "Saving…" : "Save perimeter"}
                </button>
                {geofenceToast && <div style={{ marginTop: 8, fontSize: 11, color: geofenceToast.startsWith("✓") ? "#86efac" : "#fca5a5" }}>{geofenceToast}</div>}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted }}>Safety directives</div>
                <button type="button" onClick={() => setActiveMainTab("protocols")} style={{ background: "transparent", border: "none", color: "#60a5fa", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
                  Manage all →
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {protocols.map((p) => (
                  <div key={p.id} style={{ padding: "10px 12px", background: "rgba(255,255,255,0.02)", border: `1px solid ${p.status === "published" ? "rgba(34,197,94,0.22)" : C.border}`, borderRadius: 9 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{p.title}</span>
                      <Pill color={p.status === "published" ? "green" : "amber"}>{p.status}</Pill>
                    </div>
                    <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{p.body}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DrawerShell>
      )}

      {showCreateModal && (
        <ModalShell
          title="New expedition"
          subtitle="Created trips appear instantly in the trekker app."
          onClose={() => setShowCreateModal(false)}
        >
          <form onSubmit={handleCreateExpedition}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 10 }}>
              <Field label="Name" span={2}>
                <Input value={newExpForm.name} onChange={(e) => setNewExpForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Rajmachi Fort Night Trek" />
              </Field>
              <Field label="Start date"><Input type="date" value={newExpForm.startDate} onChange={(e) => setNewExpForm((f) => ({ ...f, startDate: e.target.value }))} style={{ colorScheme: "dark" }} /></Field>
              <Field label="Start time"><Input value={newExpForm.startTime} onChange={(e) => setNewExpForm((f) => ({ ...f, startTime: e.target.value }))} /></Field>
              <Field label="End date"><Input type="date" value={newExpForm.endDate} onChange={(e) => setNewExpForm((f) => ({ ...f, endDate: e.target.value }))} style={{ colorScheme: "dark" }} /></Field>
              <Field label="End time"><Input value={newExpForm.endTime} onChange={(e) => setNewExpForm((f) => ({ ...f, endTime: e.target.value }))} /></Field>
              <Field label="Slots"><Input type="number" min="1" value={newExpForm.maxRoster} onChange={(e) => setNewExpForm((f) => ({ ...f, maxRoster: e.target.value }))} /></Field>
              <Field label="Difficulty"><Input value={newExpForm.difficulty} onChange={(e) => setNewExpForm((f) => ({ ...f, difficulty: e.target.value }))} /></Field>
              <Field label="Location"><Input value={newExpForm.location} onChange={(e) => setNewExpForm((f) => ({ ...f, location: e.target.value }))} placeholder="Rajmachi Fort, Lonavala" /></Field>
              <Field label="Elevation"><Input value={newExpForm.elevation} onChange={(e) => setNewExpForm((f) => ({ ...f, elevation: e.target.value }))} placeholder="826m ASL" /></Field>
              <Field label="Admin in charge" span={2} hint="You can only be in charge of one expedition at a time.">
                <Select value={newExpForm.adminInCharge} onChange={(e) => setNewExpForm((f) => ({ ...f, adminInCharge: e.target.value, extraAdmins: f.extraAdmins.filter((id) => id !== e.target.value) }))}>
                  <option value="">Select an admin…</option>
                  {adminOptions.map((a) => <option key={a.id} value={a.id}>{a.name || a.email}</option>)}
                </Select>
              </Field>
              <Field label="Pickup point" span={2}><Input value={newExpForm.pickupLocation} onChange={(e) => setNewExpForm((f) => ({ ...f, pickupLocation: e.target.value }))} /></Field>
              <Field label="Base / camp" span={2}><Input value={newExpForm.baseLocation} onChange={(e) => setNewExpForm((f) => ({ ...f, baseLocation: e.target.value }))} /></Field>
            </div>

            <div style={{ marginBottom: 10 }}>
              <FieldLabel>Additional admins</FieldLabel>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {adminOptions.filter((a) => a.id !== newExpForm.adminInCharge).map((a) => {
                  const on = newExpForm.extraAdmins.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setNewExpForm((f) => ({ ...f, extraAdmins: on ? f.extraAdmins.filter((x) => x !== a.id) : [...f.extraAdmins, a.id] }))}
                      style={{ padding: "5px 10px", borderRadius: 7, fontSize: 11, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${on ? "rgba(34,197,94,0.4)" : C.border}`, background: on ? "rgba(34,197,94,0.12)" : "transparent", color: on ? "#86efac" : C.muted }}
                    >
                      {on ? "✓ " : "+ "}{a.name || a.email}
                    </button>
                  );
                })}
                {adminOptions.filter((a) => a.id !== newExpForm.adminInCharge).length === 0 && (
                  <span style={{ fontSize: 11, color: C.muted2 }}>No other admin accounts available.</span>
                )}
              </div>
            </div>

            <div style={{ marginBottom: 10 }}>
              <Field label="Instructions for trekkers">
                <TextArea rows={3} value={newExpForm.instructions} onChange={(e) => setNewExpForm((f) => ({ ...f, instructions: e.target.value }))} placeholder="Reporting time, ID checks, route rules…" />
              </Field>
            </div>
            <div style={{ marginBottom: 10 }}>
              <Field label="Things to carry" hint="One item per line.">
                <TextArea rows={3} value={newExpForm.gearList} onChange={(e) => setNewExpForm((f) => ({ ...f, gearList: e.target.value }))} placeholder={"Trekking shoes\n2L water\nHeadlamp"} />
              </Field>
            </div>
            <div style={{ marginBottom: 14 }}>
              <Field label="Notes">
                <TextArea rows={2} value={newExpForm.notes} onChange={(e) => setNewExpForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Anything else the trekker should know." />
              </Field>
            </div>

            {formError && <div style={{ marginBottom: 10, fontSize: 11.5, color: "#fca5a5" }}>{formError}</div>}
            <button
              type="submit"
              disabled={creatingExpedition || !newExpForm.name.trim()}
              style={{ width: "100%", padding: "10px 14px", borderRadius: 9, border: "none", background: "linear-gradient(135deg,#2563eb,#1d4ed8)", color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: creatingExpedition ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: creatingExpedition || !newExpForm.name.trim() ? 0.6 : 1 }}
            >
              {creatingExpedition ? "Creating…" : "Create expedition"}
            </button>
          </form>
        </ModalShell>
      )}

      {deleteModalTrip && (
        <ModalShell title="Delete expedition" subtitle="This also clears the roster and releases enrolled trekkers." onClose={() => setDeleteModalTrip(null)} maxWidth={440}>
          <p style={{ fontSize: 12.5, color: C.text, lineHeight: 1.6, marginTop: 0 }}>
            Permanently delete <strong>{deleteModalTrip.name}</strong> ({deleteModalTrip.code})? Enrolled trekkers will be removed and freed to join another expedition.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn variant="default" onClick={() => setDeleteModalTrip(null)}>Cancel</Btn>
            <button
              type="button"
              onClick={handleConfirmDeleteTrip}
              disabled={deletingTrip}
              style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: "rgba(239,68,68,0.16)", color: "#fca5a5", fontSize: 12, fontWeight: 700, cursor: deletingTrip ? "not-allowed" : "pointer", fontFamily: "inherit" }}
            >
              {deletingTrip ? "Deleting…" : "Delete expedition"}
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  );
};

/* ════════════════════════════════════════════════
   PAGE: DASHBOARD
════════════════════════════════════════════════ */
const PageDashboard = ({ navigate, users = USERS, pendingAdmins = [], pendingTrekkers = [] }) => {
  const active = users.filter(u => u.status === "active").length;
  const sos = users.filter(u => u.status === "sos").length;
  const [trips, setTrips] = useState(TRIPS);
  const [tripsAreLive, setTripsAreLive] = useState(false);
  const [showNewTrip, setShowNewTrip] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDate, setNewDate] = useState("");
  const [creatingTrip, setCreatingTrip] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToTrips((liveTrips) => {
      if (liveTrips === null) { setTripsAreLive(false); return; } // read failed, keep demo data
      setTripsAreLive(true);
      setTrips(liveTrips.length > 0 ? liveTrips : TRIPS);
    });
    return () => unsubscribe && unsubscribe();
  }, []);

  const createTrip = async () => {
    if (!newName.trim() || creatingTrip) return;
    setCreatingTrip(true);
    const result = await createTripRemote(newName.trim(), newDate.trim() || "Date TBD");
    if (!result.success) {
      // Firestore write failed — fall back to local-only so the demo still works
      setTrips(t => [{
        id: `TRIP${Date.now()}`, name: newName.trim(),
        date: newDate.trim() || "Date TBD", roster: 1, status: "active", code: genTripCode()
      }, ...t]);
    }
    setCreatingTrip(false);
    setNewName(""); setNewDate(""); setShowNewTrip(false);
  };
  return (
    <div>
      <PageHeader title="Operations Dashboard" sub="Live visibility for every trip, even where signal can't reach"
        right={<div style={{ display: "flex", gap: 8 }}>{sos > 0 && <Pill color="red">🚨 {sos} SOS Active</Pill>}<Pill color="green">● Live</Pill></div>} />

      {pendingAdmins && pendingAdmins.length > 0 && (
        <div
          onClick={() => navigate("admin-approvals")}
          style={{
            marginBottom: 16,
            padding: "12px 18px",
            borderRadius: 14,
            background: "linear-gradient(90deg, rgba(245, 158, 11, 0.16), rgba(59, 130, 246, 0.12))",
            border: "1px solid rgba(245, 158, 11, 0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
            boxShadow: "0 4px 16px rgba(245, 158, 11, 0.12)",
            transition: "all 0.2s ease",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 20 }}>🛡️</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fbbf24" }}>
                {pendingAdmins.length} Administrator Access Request{pendingAdmins.length > 1 ? "s" : ""} Pending Authorization
              </div>
              <div style={{ fontSize: 11, color: "rgba(180, 210, 245, 0.7)" }}>
                New expedition personnel have applied for administrative console clearance.
              </div>
            </div>
          </div>
          <div
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              background: "rgba(245, 158, 11, 0.22)",
              border: "1px solid rgba(245, 158, 11, 0.4)",
              color: "#fef3c7",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Review & Authorize ›
          </div>
        </div>
      )}

      {pendingTrekkers && pendingTrekkers.length > 0 && (
        <div
          onClick={() => navigate("admin-approvals")}
          style={{
            marginBottom: 16,
            padding: "12px 18px",
            borderRadius: 14,
            background: "linear-gradient(90deg, rgba(16, 185, 129, 0.16), rgba(59, 130, 246, 0.12))",
            border: "1px solid rgba(16, 185, 129, 0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
            boxShadow: "0 4px 16px rgba(16, 185, 129, 0.12)",
            transition: "all 0.2s ease",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 20 }}>🧭</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#6ee7b7" }}>
                {pendingTrekkers.length} Trekker Application{pendingTrekkers.length > 1 ? "s" : ""} Awaiting Expedition Approval
              </div>
              <div style={{ fontSize: 11, color: "rgba(180, 210, 245, 0.7)" }}>
                Trekkers have applied to join active expeditions. Review safety info and authorize their enrollment.
              </div>
            </div>
          </div>
          <div
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              background: "rgba(16, 185, 129, 0.22)",
              border: "1px solid rgba(16, 185, 129, 0.4)",
              color: "#ecfdf5",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Review &amp; Approve ›
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
        <StatCard label="Registered Trekkers" value={users.length} sub="Duty-of-care profiles" color={C.accent} icon="👥" />
        <StatCard label="In-Field Active" value={active} sub="Live telemetry streaming" color={C.green} icon="📍" />
        <StatCard label="Active SOS Alerts" value={sos} sub={sos > 0 ? "Requires SAR dispatch" : "All sectors clear"} color={sos > 0 ? C.red : C.teal} icon="🚨" />
        <StatCard label="Active Expeditions" value={trips.length} sub="Managed batches" color={C.purple} icon="🧭" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14, marginBottom: 14 }}>
        <div>
          <LiveMap points={users} teams={[]} height={380} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginTop: 12 }}>
            <StatCard label="GPS System Accuracy" value="±6m" sub="Field GNSS / NEO-6M" color={C.green} icon="🛰️" />
            <StatCard label="Trail Corridor" value="829m ASL" sub="Rajmachi Fort Sector" color={C.teal} icon="🏔️" />
            <StatCard label="LoRa Gateway Mesh" value="865 MHz" sub="IN865 License-Exempt" color={C.purple} icon="📡" />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sos > 0 && (
            <Card style={{ borderColor: "rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.08)", boxShadow: "0 4px 18px rgba(239,68,68,0.2)" }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.red, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                <span>🚨</span>
                <span>ACTIVE DISTRESS BEACON</span>
              </div>
              {users.filter(u => u.status === "sos").map(u => (
                <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                  <Avatar initials={u.avatar} bg={u.color[0]} text={u.color[1]} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</div>
                    <div style={{ fontSize: 10.5, color: C.muted }}>📍 {u.city} · Blood: <strong style={{ color: C.red }}>{u.blood || "B+"}</strong></div>
                  </div>
                  <Btn variant="danger" style={{ fontSize: 11, padding: "5px 10px" }} onClick={() => navigate("sos-navigation")}>
                    Dispatch →
                  </Btn>
                </div>
              ))}
            </Card>
          )}

          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, display: "flex", alignItems: "center", gap: 6 }}>
                <span>Expedition Batches</span>
                <span style={{ fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 4, background: tripsAreLive ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.08)", color: tripsAreLive ? "#4ade80" : C.muted2 }}>
                  {tripsAreLive ? "LIVE SYNC" : "STORED"}
                </span>
              </div>
              <button onClick={() => navigate("trip-rosters")} style={{ fontSize: 11, color: C.accent, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
                Manage All →
              </button>
            </div>

            {trips.slice(0, 3).map(t => (
              <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.border}`, fontSize: 12 }}>
                <div style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                  <div style={{ color: C.text, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</div>
                  <div style={{ fontSize: 10.5, color: C.muted, marginTop: 2 }}>
                    Code: <span style={{ fontWeight: 700, color: C.accent }}>{t.code}</span> · {t.rosterCount || 5} Trekkers
                  </div>
                </div>
                <Pill color={t.status === "in-field" || t.isManaged ? "green" : t.status === "completed" ? "amber" : "gray"}>
                  {t.isManaged || t.status === "in-field" ? "In-Field" : (t.status || "Upcoming")}
                </Pill>
              </div>
            ))}
          </Card>

          <Card style={{ background: "rgba(59,130,246,0.04)", borderColor: "rgba(59,130,246,0.2)" }}>
            <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 8 }}>
              Field Command &amp; Radio Clearance
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11.5, color: C.muted }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Lead Field Guide:</span>
                <span style={{ color: C.text, fontWeight: 600 }}>Ajay Saini (WFR Certified)</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Walkie-Talkie VHF:</span>
                <span style={{ color: "#fbbf24", fontWeight: 700 }}>145.500 MHz (Ch 1)</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Local SAR Base:</span>
                <span style={{ color: C.text }}>Shivdurga Rescue (Lonavala)</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Sector Geofence:</span>
                <span style={{ color: "#34d399", fontWeight: 600 }}>2.5 km Locked Corridor</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════
   PAGE: ALL USERS
════════════════════════════════════════════════ */
const PageAllUsers = ({ users = [], navigate }) => {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedUser, setSelectedUser] = useState(null);

  const allUsers = users && users.length > 0 ? users : USERS;
  const filtered = allUsers.filter(u =>
    (filter === "all" || u.status === filter) &&
    ((u.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (u.email || "").toLowerCase().includes(search.toLowerCase()) ||
      (u.city || "").toLowerCase().includes(search.toLowerCase()))
  );
  const statusColor = { active: "green", inactive: "gray", sos: "red", pending_approval: "amber" };

  return (
    <div>
      <PageHeader
        title="All Registered Users"
        sub={`${allUsers.length} total adventurers registered across expeditions`}
        right={
          <div style={{ display: "flex", gap: 8 }}>
            {["all", "active", "inactive", "sos"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: "5px 12px",
                  borderRadius: 7,
                  border: `1px solid ${filter === f ? C.accent : C.border}`,
                  background: filter === f ? "rgba(59,130,246,0.12)" : "transparent",
                  color: filter === f ? C.accent : C.muted,
                  fontSize: 11,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textTransform: "capitalize",
                }}
              >
                {f}
              </button>
            ))}
          </div>
        }
      />

      <div style={{ marginBottom: 14 }}>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by trekker name, email, or city…"
        />
      </div>

      <Card style={{ padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <TH>User</TH>
              <TH>Location</TH>
              <TH>Role</TH>
              <TH>Status</TH>
              <TH>Last Seen</TH>
              <TH>Blood</TH>
              <TH>Medical Alert</TH>
              <TH>Actions</TH>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u, i) => (
              <tr key={u.id || u.email || i} style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.012)" }}>
                <TD>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Avatar initials={u.avatar || (u.name || "TR").slice(0, 2).toUpperCase()} bg={u.color?.[0]} text={u.color?.[1]} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{u.name}</div>
                      <div style={{ fontSize: 11, color: C.muted }}>{u.email}</div>
                    </div>
                  </div>
                </TD>
                <TD>{u.city || "Rajmachi Trail"}</TD>
                <TD><Pill color="blue">{u.badge || u.role || "Trekker"}</Pill></TD>
                <TD><Pill color={statusColor[u.status] || "green"}>{u.status || "active"}</Pill></TD>
                <TD style={{ color: C.muted, fontSize: 12 }}>{u.lastSeen || "—"}</TD>
                <TD><Pill color="red">🩸 {u.blood || "B+"}</Pill></TD>
                <TD style={{ fontSize: 11.5, color: u.medical && u.medical !== "None" && u.medical !== "None reported" ? "#fcd34d" : C.muted2 }}>
                  {u.medical || "None reported"}
                </TD>
                <TD>
                  <div style={{ display: "flex", gap: 6 }}>
                    {u.status === "sos" && (
                      <Btn variant="danger" style={{ fontSize: 10, padding: "4px 8px" }} onClick={() => navigate("sos-navigation")}>
                        🗺 Nav
                      </Btn>
                    )}
                    <Btn
                      style={{ fontSize: 10, padding: "4px 8px" }}
                      onClick={() => setSelectedUser(u)}
                    >
                      Profile
                    </Btn>
                  </div>
                </TD>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* MODAL: USER PROFILE INSPECTOR */}
      {selectedUser && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 999,
            background: "rgba(3, 7, 18, 0.82)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 520,
              background: "#0b1422",
              border: `1px solid ${C.border2}`,
              borderRadius: 16,
              boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "16px 20px",
                borderBottom: `1px solid ${C.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "rgba(255,255,255,0.02)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Avatar initials={selectedUser.avatar || "TR"} bg={selectedUser.color?.[0]} text={selectedUser.color?.[1]} size={36} />
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{selectedUser.name}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>{selectedUser.badge || selectedUser.role || "Trekker"} · {selectedUser.city || "Expedition Member"}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                style={{ background: "transparent", border: "none", color: C.muted, fontSize: 18, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: "18px 20px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ fontSize: 10, color: C.muted2, textTransform: "uppercase" }}>Phone Number</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginTop: 2 }}>{selectedUser.phone || "—"}</div>
                </div>
                <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ fontSize: 10, color: C.muted2, textTransform: "uppercase" }}>Blood Group</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#fca5a5", marginTop: 2 }}>🩸 {selectedUser.blood || "B+"}</div>
                </div>
              </div>

              <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: C.muted2, textTransform: "uppercase" }}>Emergency Contact (Next of Kin)</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginTop: 2 }}>
                  {selectedUser.ec1Name ? `${selectedUser.ec1Name} (${selectedUser.ec1Rel || "Family"})` : selectedUser.ec || "Direct Contact"}
                </div>
                <div style={{ fontSize: 12, color: "#60a5fa", marginTop: 2 }}>
                  📞 {selectedUser.ec1Ph || "+91 91531 91902"}
                </div>
              </div>

              <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: C.muted2, textTransform: "uppercase" }}>Medical & Health Background</div>
                <div style={{ fontSize: 12.5, color: C.text, marginTop: 2 }}>
                  {selectedUser.medical || "No pre-existing conditions or allergies reported."}
                </div>
              </div>

              <div style={{ background: "rgba(59,130,246,0.05)", border: `1px solid rgba(59,130,246,0.25)`, borderRadius: 8, padding: "10px 12px", marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: "#60a5fa", textTransform: "uppercase", fontWeight: 600 }}>Trail Formation & Relative Distance</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginTop: 2 }}>
                  📍 {selectedUser.lat ? `${selectedUser.lat}°N, ${selectedUser.lon}°E (${selectedUser.altitude || 820}m ASL)` : "Rajmachi Trail"}
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                  Distance from Field Guide Ajay Saini: <strong>{formatDistance(calculateDistanceMeters(RAJMACHI_ADMIN.lat, RAJMACHI_ADMIN.lon, selectedUser.lat, selectedUser.lon))}</strong>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <Btn onClick={() => setSelectedUser(null)}>Close</Btn>
                <Btn
                  variant="primary"
                  onClick={() => {
                    setSelectedUser(null);
                    navigate("live-tracking");
                  }}
                >
                  Locate on Live Radar →
                </Btn>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ════════════════════════════════════════════════
   PAGE: FIELD HARDWARE & LORA MESH CONSOLE
   (Direct ESP32 Hardware Console, Autonomous Ridge Station & Off-Grid GPS Beacons)
════════════════════════════════════════════════ */
const PageDeviceTracking = ({ users = USERS, connectionState = "disconnected" }) => {
  const [sel, setSel] = useState("REMOTE_01");
  const [spreadingFactor, setSpreadingFactor] = useState(7);
  const [serialConnected, setSerialConnected] = useState(false);
  const [serialConnecting, setSerialConnecting] = useState(false);
  const [serialPortName, setSerialPortName] = useState("ESP32-SX1276 Gateway (Virtual COM3 @ 115200)");
  const [activeTab, setActiveTab] = useState("fleet"); // "fleet" | "terminal" | "rf-mesh"
  const [filterNode, setFilterNode] = useState("ALL");
  const [autoScroll, setAutoScroll] = useState(true);
  const [toast, setToast] = useState("");
  const [radioTxActive, setRadioTxActive] = useState(false);
  const [weatherData, setWeatherData] = useState({
    temp: 24.2,
    humidity: 82.0,
    pressure: 928.4,
    altitude: 842.0,
    trend: 0,
    rainMM: 2.4,
    soundDB: 42.0,
    pm25: 28,
    pm10: 45,
    lastRx: "Just now",
  });

  const terminalRef = useRef(null);

  // Initial realistic packet history matching firmware/gateway-node and firmware/remote-node
  const [packets, setPackets] = useState([
    {
      id: "pkt-01",
      time: "18:04:10.120",
      dir: "RX",
      node: "GATEWAY_BASE",
      freq: "865.0625 MHz",
      rssi: -45,
      snr: 12.0,
      raw: '{"gateway":"GATEWAY_BASE","freq_mhz":865.0625,"sf":7,"bw_khz":125,"cr":"4/5","solar_v":12.4,"batt_v":7.88,"siren":"ARMED"}',
    },
    {
      id: "pkt-02",
      time: "18:04:12.410",
      dir: "RX",
      node: "REMOTE_01",
      freq: "865.0625 MHz",
      rssi: -68,
      snr: 9.4,
      raw: '{"node_id":"REMOTE_01","temp":24.2,"humidity":82.0,"pressure":928.4,"altitude":842.0,"pressure_trend":0,"rain_mm":2.4,"sound_db":42.0,"pm2_5":28,"pm10":45,"lat":18.8286,"lon":73.3986,"gps_fix":true,"sos":false}',
    },
    {
      id: "pkt-03",
      time: "18:04:13.980",
      dir: "RX",
      node: "BEACON_01",
      freq: "865.0625 MHz",
      rssi: -71,
      snr: 8.8,
      raw: '{"node_id":"BEACON_01","role":"LEAD_GUIDE","lat":18.82860,"lon":73.39860,"alt":842,"speed_kmh":3.4,"batt_v":4.02,"sats":9,"hdop":1.1,"sos":false}',
    },
    {
      id: "pkt-04",
      time: "18:04:14.890",
      dir: "RX",
      node: "BEACON_02",
      freq: "865.0625 MHz",
      rssi: -74,
      snr: 8.2,
      raw: '{"node_id":"BEACON_02","role":"TREKKER","carrier":"Anirban Panda","lat":18.82812,"lon":73.39824,"alt":829,"batt_v":3.98,"sats":8,"hdop":1.3,"sos":false}',
    },
    {
      id: "pkt-05",
      time: "18:04:16.240",
      dir: "RX",
      node: "BEACON_03",
      freq: "865.0625 MHz",
      rssi: -84,
      snr: 6.1,
      raw: '{"node_id":"BEACON_03","role":"REAR_SWEEP","carrier":"Kavita Verma","lat":18.82750,"lon":73.39780,"alt":818,"batt_v":3.86,"sats":8,"hdop":1.4,"sos":false}',
    },
  ]);

  // Rolling packet simulation (every 3 seconds a live packet is received)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const timeStr = now.toTimeString().split(" ")[0] + "." + String(now.getMilliseconds()).padStart(3, "0");
      const nodes = ["REMOTE_01", "BEACON_01", "BEACON_02", "BEACON_03"];
      const randomNode = nodes[Math.floor(Math.random() * nodes.length)];

      let payload = "";
      let rssi = -70;
      let snr = 8.5;

      if (randomNode === "REMOTE_01") {
        const driftT = +(24.2 + (Math.random() - 0.5) * 0.3).toFixed(1);
        const driftH = +(82.0 + (Math.random() - 0.5) * 0.8).toFixed(1);
        const driftP = +(928.4 + (Math.random() - 0.5) * 0.2).toFixed(1);
        payload = JSON.stringify({
          node_id: "REMOTE_01",
          temp: driftT,
          humidity: driftH,
          pressure: driftP,
          altitude: 842.0,
          pressure_trend: 0,
          rain_mm: 2.4,
          sound_db: 42.0,
          pm2_5: 28,
          pm10: 45,
          lat: 18.8286,
          lon: 73.3986,
          gps_fix: true,
          sos: false,
        });
        rssi = -68;
        snr = 9.4;
        setWeatherData((prev) => ({
          ...prev,
          temp: driftT,
          humidity: driftH,
          pressure: driftP,
          lastRx: now.toLocaleTimeString("en-IN"),
        }));
      } else if (randomNode === "BEACON_01") {
        payload = JSON.stringify({
          node_id: "BEACON_01",
          role: "LEAD_GUIDE",
          lat: +(18.82860 + (Math.random() - 0.5) * 0.00008).toFixed(5),
          lon: +(73.39860 + (Math.random() - 0.5) * 0.00008).toFixed(5),
          alt: 842,
          speed_kmh: 3.4,
          batt_v: 4.02,
          sats: 9,
          hdop: 1.1,
          sos: false,
        });
        rssi = -71;
        snr = 8.8;
      } else if (randomNode === "BEACON_02") {
        payload = JSON.stringify({
          node_id: "BEACON_02",
          role: "TREKKER",
          carrier: "Anirban Panda",
          lat: +(18.82812 + (Math.random() - 0.5) * 0.00006).toFixed(5),
          lon: +(73.39824 + (Math.random() - 0.5) * 0.00006).toFixed(5),
          alt: 829,
          batt_v: 3.98,
          sats: 8,
          hdop: 1.3,
          sos: false,
        });
        rssi = -74;
        snr = 8.2;
      } else {
        payload = JSON.stringify({
          node_id: "BEACON_03",
          role: "REAR_SWEEP",
          carrier: "Kavita Verma",
          lat: +(18.82750 + (Math.random() - 0.5) * 0.00008).toFixed(5),
          lon: +(73.39780 + (Math.random() - 0.5) * 0.00008).toFixed(5),
          alt: 818,
          batt_v: 3.86,
          sats: 8,
          hdop: 1.4,
          sos: false,
        });
        rssi = -84;
        snr = 6.1;
      }

      const newPkt = {
        id: "pkt-" + Date.now(),
        time: timeStr,
        dir: "RX",
        node: randomNode,
        freq: "865.0625 MHz",
        rssi,
        snr,
        raw: payload,
      };

      setPackets((prev) => [...prev.slice(-40), newPkt]);
    }, 3200);

    return () => clearInterval(interval);
  }, []);

  // Autoscroll terminal
  useEffect(() => {
    if (autoScroll && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [packets, autoScroll]);

  // Toast auto-clear
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  // Web Serial API handler
  const handleConnectSerial = async () => {
    if (!("serial" in navigator)) {
      setToast("Web Serial API is not supported in this browser. Virtual ESP32 LoRa Bridge is active.");
      setSerialConnected(true);
      return;
    }
    try {
      setSerialConnecting(true);
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });
      setSerialConnected(true);
      setSerialConnecting(false);
      setSerialPortName("Physical ESP32-SX1276 Gateway (USB COM @ 115200)");
      setToast("✓ Physical ESP32 Gateway successfully connected via USB Serial at 115200 baud!");
    } catch (err) {
      setSerialConnecting(false);
      if (err.name !== "NotFoundError") {
        setToast("Serial notice: " + (err.message || "Port disconnected. Virtual Radio Link maintained."));
      }
    }
  };

  // Play I2S Siren test sound via Web Audio API
  const playSirenTest = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(800, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1400, ctx.currentTime + 0.35);
        osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.7);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);
        osc.start();
        osc.stop(ctx.currentTime + 0.8);
      }
    } catch { }
    setToast("🔊 I2S Mountain Siren test pulse triggered (3W MAX98357A chime)");
  };

  // Sound locating chirp for lost trekker in fog
  const playBuzzerLocate = (nodeName) => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(2400, ctx.currentTime);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      }
    } catch { }
    setToast(`🔊 High-frequency audio locator chirp dispatched to ${nodeName} (Audio guidance in mist)`);
  };

  // Broadcast Downlink Command
  const handleDownlink = (cmdName, code, target = "BROADCAST") => {
    setRadioTxActive(true);
    const now = new Date();
    const timeStr = now.toTimeString().split(" ")[0] + "." + String(now.getMilliseconds()).padStart(3, "0");

    const txPkt = {
      id: "pkt-tx-" + Date.now(),
      time: timeStr,
      dir: "TX",
      node: "GATEWAY_BASE",
      freq: "865.0625 MHz",
      rssi: 0,
      snr: 0,
      raw: `[LoRa TX] >>> CMD: 0x${code} (${cmdName}) -> TARGET: ${target} | SF: ${spreadingFactor} | TX_PWR: +20dBm`,
    };

    setPackets((prev) => [...prev, txPkt]);
    setToast(`[LoRa TX] Transmitted ${cmdName} (0x${code}) to ${target}`);

    setTimeout(() => {
      setRadioTxActive(false);
      const ackTime = new Date().toTimeString().split(" ")[0] + "." + String(new Date().getMilliseconds()).padStart(3, "0");
      const ackPkt = {
        id: "pkt-ack-" + Date.now(),
        time: ackTime,
        dir: "RX",
        node: target === "BROADCAST" ? "REMOTE_01" : target,
        freq: "865.0625 MHz",
        rssi: -68,
        snr: 9.4,
        raw: `[LoRa RX] <<< ACK RECEIVED: 0x${code} (${cmdName}) acknowledged by ${target === "BROADCAST" ? "REMOTE_01, BEACON_01, BEACON_02, BEACON_03 (4/4 nodes)" : target} (RTT: 38ms)`,
      };
      setPackets((prev) => [...prev, ackPkt]);
    }, 450);
  };

  // Hardware Fleet Directory matching real JTBD
  const HARDWARE_FLEET = [
    {
      id: "GATEWAY_BASE",
      name: "Base Camp Master Gateway Hub",
      category: "gateway",
      badge: "Master RF-to-Dashboard Sink",
      location: "Udhewadi Base Village Camp (829m ASL)",
      mcu: "ESP32-WROOM-32D (Dual-Core 240MHz)",
      lora: "Semtech SX1276 (VSPI: SCK=18, MISO=19, MOSI=23, SS=5, RST=14, DIO0=2)",
      display: "LiquidCrystal_I2C 20x4 (Address 0x27)",
      audio: "MAX98357A I2S Class-D 3W Amp (BCLK:27, LRCK:25, DATA:22)",
      power: "12V Solar Panel (12.4V) + 2S 7.4V Li-Ion BMS (7.88V · 94%)",
      currentDraw: "140 mA (Receiving)",
      freq: "865.0625 MHz (India IN865 Ch 1)",
      status: "Master Sink Active",
      rssi: -45,
      snr: 12.0,
      battery: 94,
      lastRx: "Active Stream",
    },
    {
      id: "REMOTE_01",
      name: "Autonomous Mountain Weather Station",
      category: "weather",
      badge: "Ridge Meteorological Telemetry Node",
      location: "Manoranjan Bastion Ridge (842m ASL · Line of Sight)",
      mcu: "ESP32 + Semtech SX1276",
      sensors: "BMP280 (Barometer) + DHT22 (Temp/Hum) + PMS5003 (Laser PM2.5) + Optical Rain + INMP441 (I2S Mic)",
      power: "3.7V 18650 Li-Ion (3.92V · 91%) + 5V 2W Solar",
      readings: {
        pressure: `${weatherData.pressure} hPa`,
        trend: "STABLE (0.0 hPa/min)",
        temp: `${weatherData.temp} °C`,
        humidity: `${weatherData.humidity} %`,
        airQuality: `PM2.5: ${weatherData.pm25} µg/m³ (Alpine Clean)`,
        rain: `${weatherData.rainMM} mm/hr (Light Mist)`,
        noise: `${weatherData.soundDB} dB (Ambient Wind)`,
      },
      status: "Broadcasting Every 30s",
      rssi: -68,
      snr: 9.4,
      battery: 91,
      lastRx: weatherData.lastRx,
    },
    {
      id: "BEACON_01",
      name: "Lead Guide Navigation Beacon",
      category: "beacon",
      badge: "Forward Scout & Guide Navigation",
      carrier: "Ajay Saini (Expedition Leader & Field Guide)",
      hardware: "ESP32 + Semtech SX1276 + NEO-6M GPS (UART1 RX:27, TX:26)",
      location: "Manoranjan Fort Ridge (18.82860° N, 73.39860° E · 842m ASL)",
      gpsFix: "3D DGPS Fix (9 Satellites · HDOP 1.1)",
      pace: "3.4 km/h (Active Trek)",
      power: "3.7V 18650 Li-Ion (4.02V · 92%)",
      status: "Leading at Ridge Crest",
      rssi: -71,
      snr: 8.8,
      battery: 92,
      lastRx: "4s ago",
    },
    {
      id: "BEACON_02",
      name: "Trekker Safety Beacon + Hardware SOS",
      category: "beacon",
      badge: "Personal Telemetry & Hardware SOS",
      carrier: "Anirban Panda (Trekker)",
      hardware: "ESP32 + Semtech SX1276 + NEO-6M GPS + Tactile SOS Button (GPIO 0)",
      location: "Rajmachi Main Trail (18.82812° N, 73.39824° E · 829m ASL)",
      gpsFix: "3D Fix (8 Satellites · HDOP 1.3)",
      sosSwitch: "ARMED & Monitored (Active LOW on GPIO 0)",
      power: "3.7V 18650 Li-Ion (3.98V · 85%)",
      status: "Active on Trail",
      rssi: -74,
      snr: 8.2,
      battery: 85,
      lastRx: "2s ago",
    },
    {
      id: "BEACON_03",
      name: "Tail Sweep & Group Perimeter Beacon",
      category: "beacon",
      badge: "Rear Sweep & Group Integrity",
      carrier: "Kavita Verma (Rear Sweep)",
      hardware: "ESP32 + Semtech SX1276 + NEO-6M GPS",
      location: "Trail Corridor (18.82750° N, 73.39780° E · 818m ASL)",
      gpsFix: "3D Fix (8 Satellites · HDOP 1.4)",
      groupDistance: "112 meters behind lead (Within safe 250m corridor)",
      power: "3.7V 18650 Li-Ion (3.86V · 78%)",
      status: "Monitoring Tail",
      rssi: -84,
      snr: 6.1,
      battery: 78,
      lastRx: "7s ago",
    },
    {
      id: "RELAY_01",
      name: "Kataldhar Gorge Autonomous Solar Relay",
      category: "relay",
      badge: "Canyon RF Mesh Repeater",
      location: "Kataldhar Ridge Gap (Bridging Gorge RF Shadow)",
      hardware: "ESP32 + Semtech SX1276 (Low-power 1-hop repeater)",
      power: "6V 3W Solar + LiFePO4 Cell (4.10V · 96%)",
      status: "Forwarding 1-Hop Mesh Packets",
      rssi: -78,
      snr: 7.4,
      battery: 96,
      lastRx: "14s ago",
    },
  ];

  const filteredPackets = useMemo(() => {
    if (filterNode === "ALL") return packets;
    return packets.filter((p) => p.node === filterNode || p.raw.includes(filterNode));
  }, [packets, filterNode]);

  const selectedNodeData = HARDWARE_FLEET.find((d) => d.id === sel) || HARDWARE_FLEET[0];

  return (
    <div>
      {/* Informative Note: Clearly delineating Hardware vs Smartwatches */}
      <div
        style={{
          background: "linear-gradient(135deg, rgba(30, 58, 138, 0.35), rgba(11, 20, 34, 0.95))",
          border: "1px solid rgba(59, 130, 246, 0.3)",
          borderRadius: 12,
          padding: "10px 16px",
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>💡</span>
          <div style={{ fontSize: 12, color: C.text }}>
            <strong>Expedition Hardware vs. Trekkers' Wearables:</strong> This console is strictly for <strong>LoRa + ESP32 Field Hardware</strong> (Base Station Gateway, Autonomous Ridge Weather Station &amp; Off-Grid GPS Beacons).
            Trekkers' personal smartwatches (Garmin, Apple Watch, Polar H10) stream via Web Bluetooth BLE to their phone and are monitored on the <strong>Wearables &amp; Vitals Radar</strong> page.
          </div>
        </div>
        <Pill color="blue">India IN865 Band (865.0625 MHz)</Pill>
      </div>

      {toast && (
        <div
          style={{
            background: "rgba(34, 197, 94, 0.15)",
            border: "1px solid rgba(34, 197, 94, 0.35)",
            borderRadius: 10,
            padding: "9px 14px",
            fontSize: 12.5,
            color: "#86efac",
            fontWeight: 600,
            marginBottom: 14,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>✓</span>
          <span>{toast}</span>
        </div>
      )}

      {/* Page Header */}
      <PageHeader
        title="LoRa RF Mesh & Field Hardware Console"
        sub="ESP32 Gateway Base Station · Autonomous Ridge Meteorological Station · Off-Grid GPS Beacons"
        right={
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Pill color={serialConnected ? "green" : "amber"}>
              {serialConnected ? "● USB Gateway Connected" : "◐ Simulated feed — no gateway"}
            </Pill>
            <Pill color="amber">◐ 6 demo nodes</Pill>
            <Btn variant="primary" onClick={handleConnectSerial} disabled={serialConnecting}>
              🔌 {serialConnected ? "Switch USB Port" : "Connect Physical ESP32"}
            </Btn>
          </div>
        }
      />

      <div style={{ background: "rgba(245,158,11,0.09)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "#fcd34d", marginBottom: 14 }}>
        ◐ <strong>Simulated hardware feed.</strong> No ESP32 gateway is attached. Packet counters, RSSI/SNR values,
        node telemetry and downlink ACKs on this page are generated locally for demonstration. Real gateway data is
        written to RTDB <code>weather_nodes</code> and is not yet ingested by the console.
      </div>

      {/* RF Radio Transceiver Parameters HUD */}
      <Card style={{ marginBottom: 16, background: "linear-gradient(135deg, rgba(16, 30, 54, 0.8), rgba(9, 14, 24, 0.95))" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20 }}>📡</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                RF Transceiver Configuration · Semtech SX1276 (VSPI SCK:18 MISO:19 MOSI:23 SS:5 RST:14 DIO0:2)
              </div>
              <div style={{ fontSize: 11, color: C.muted }}>
                Port: <span style={{ color: "#93c5fd", fontFamily: "monospace" }}>{serialPortName}</span> · Baud Rate: <span style={{ fontFamily: "monospace" }}>115,200</span>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, color: C.muted }}>Spreading Factor:</span>
            <div style={{ display: "flex", gap: 4 }}>
              {[7, 8, 9, 10, 11, 12].map((sf) => (
                <button
                  key={sf}
                  onClick={() => {
                    setSpreadingFactor(sf);
                    setToast(`Spreading Factor configured to SF${sf} (${sf === 7 ? "Fastest Telemetry ~5.4 kbps" : sf === 12 ? "Deep Gorge Penetration ~290 bps" : "Balanced"})`);
                  }}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 6,
                    border: `1px solid ${spreadingFactor === sf ? C.accent : C.border}`,
                    background: spreadingFactor === sf ? "rgba(59,130,246,0.2)" : "transparent",
                    color: spreadingFactor === sf ? "#fff" : C.muted,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: "monospace",
                  }}
                >
                  SF{sf}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
          {[
            ["RF Frequency", "865.0625 MHz", "India IN865 Ch 1", C.teal],
            ["Bandwidth", "125 kHz", "Standard LoRa", C.accent],
            ["Coding Rate", "4/5", "Hamming FEC", C.purple],
            ["TX Power", "+14 dBm", "Configured (25 mW ERP)", C.amber],
            ["Noise Floor", "—", "No gateway telemetry", C.muted],
            ["Packet Loss", "—", "No gateway telemetry", C.muted],
          ].map(([label, val, sub, col]) => (
            <div key={label} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px" }}>
              <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: col, marginTop: 2, fontFamily: "monospace" }}>{val}</div>
              <div style={{ fontSize: 9.5, color: C.muted2, marginTop: 1 }}>{sub}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Downlink Radio Commands Directives */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>⚡</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>In-Field Radio Downlinks &amp; Directives (Broadcast over 865.0625 MHz)</span>
          </div>
          {radioTxActive && <Pill color="amber">● Radio Transmitting Downlink Packet...</Pill>}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn onClick={() => handleDownlink("PING_MESH", "01", "BROADCAST")}>
            📡 Broadcast Mesh PING (0x01)
          </Btn>
          <Btn onClick={() => handleDownlink("REQ_WEATHER_TELEMETRY", "02", "REMOTE_01")}>
            📊 Query Ridge Weather (REMOTE_01)
          </Btn>
          <Btn onClick={() => handleDownlink("SET_RATE_10S", "03", "BROADCAST")}>
            ⏱️ High-Precision 10s GPS (Climb Mode)
          </Btn>
          <Btn onClick={() => handleDownlink("SET_RATE_30S", "04", "BROADCAST")}>
            🔋 Battery Saver 30s GPS
          </Btn>
          <Btn onClick={() => { playSirenTest(); handleDownlink("TEST_I2S_SIREN", "05", "GATEWAY_BASE"); }}>
            🔊 Test Gateway I2S Siren (MAX98357A)
          </Btn>
          <Btn variant="danger" onClick={() => handleDownlink("BROADCAST_SOS_CLEAR", "06", "BROADCAST")}>
            🛡️ Radio SOS Stand-Down
          </Btn>
        </div>
      </Card>

      {/* Navigation View Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {[
          ["fleet", "🛡️ Deployed Field Hardware Fleet (6 Nodes)"],
          ["terminal", "💻 Live LoRa Raw Packet Stream Console"],
          ["rf-mesh", "🗺️ Trail Topology & Line-of-Sight Mesh"],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            style={{
              padding: "7px 16px",
              borderRadius: 8,
              border: `1px solid ${activeTab === id ? C.accent : C.border}`,
              background: activeTab === id ? "rgba(59,130,246,0.15)" : "transparent",
              color: activeTab === id ? C.accent : C.muted,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ══ TAB: FLEET DIRECTORY ══ */}
      {activeTab === "fleet" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 16 }}>
          {/* Hardware Nodes Cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {HARDWARE_FLEET.map((node) => {
              const isSelected = sel === node.id;
              const isGateway = node.category === "gateway";
              const isWeather = node.category === "weather";
              const isSOS = node.id === "BEACON_02";

              return (
                <Card
                  key={node.id}
                  style={{
                    cursor: "pointer",
                    borderColor: isSelected ? C.accent : C.border,
                    background: isSelected ? "rgba(59,130,246,0.06)" : C.card,
                    borderLeft: `4px solid ${isGateway ? C.accent : isWeather ? C.teal : isSOS ? C.amber : C.green}`,
                    marginBottom: 0,
                    transition: "all 0.15s ease",
                  }}
                  onClick={() => setSel(node.id)}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div
                        style={{
                          width: 42,
                          height: 42,
                          borderRadius: 10,
                          background: "rgba(255,255,255,0.04)",
                          border: `1px solid ${C.border}`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 20,
                        }}
                      >
                        {isGateway ? "📻" : isWeather ? "⛰️" : node.category === "relay" ? "🔁" : "🛰️"}
                      </div>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{node.name}</span>
                          <span style={{ fontSize: 10, fontFamily: "monospace", padding: "1px 6px", borderRadius: 4, background: "rgba(255,255,255,0.06)", color: "#93c5fd" }}>
                            {node.id}
                          </span>
                        </div>
                        <div style={{ fontSize: 11.5, color: C.muted }}>
                          {node.badge} · <span style={{ color: "#cbd5e1" }}>{node.location}</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 11, fontFamily: "monospace", color: node.rssi > -75 ? "#34d399" : node.rssi > -85 ? "#fbbf24" : "#f87171" }}>
                          RSSI: {node.rssi} dBm (SNR {node.snr > 0 ? "+" : ""}{node.snr}dB)
                        </div>
                        <div style={{ fontSize: 10, color: C.muted2 }}>
                          🔋 {node.battery}% · {node.lastRx}
                        </div>
                      </div>
                      <Pill color={node.status.includes("Active") || node.status.includes("Broadcasting") || node.status.includes("Leading") ? "green" : "teal"}>
                        ● {node.status}
                      </Pill>
                    </div>
                  </div>

                  {/* Expanded Node Hardware Specs */}
                  {isSelected && (
                    <div
                      style={{
                        marginTop: 14,
                        paddingTop: 12,
                        borderTop: `1px solid ${C.border}`,
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 10,
                        fontSize: 11.5,
                      }}
                    >
                      {isGateway && (
                        <>
                          <div><span style={{ color: C.muted }}>MCU:</span> <span style={{ color: C.text }}>{node.mcu}</span></div>
                          <div><span style={{ color: C.muted }}>LoRa Radio:</span> <span style={{ color: C.text }}>{node.lora}</span></div>
                          <div><span style={{ color: C.muted }}>Display:</span> <span style={{ color: C.text }}>{node.display}</span></div>
                          <div><span style={{ color: C.muted }}>I2S Siren:</span> <span style={{ color: C.text }}>{node.audio}</span></div>
                          <div><span style={{ color: C.muted }}>Solar &amp; BMS:</span> <span style={{ color: "#34d399" }}>{node.power}</span></div>
                          <div><span style={{ color: C.muted }}>Current:</span> <span style={{ color: C.text }}>{node.currentDraw}</span></div>
                        </>
                      )}

                      {isWeather && (
                        <>
                          <div><span style={{ color: C.muted }}>Sensors:</span> <span style={{ color: C.text }}>{node.sensors}</span></div>
                          <div><span style={{ color: C.muted }}>Atmospheric Pressure:</span> <span style={{ color: "#38bdf8", fontWeight: 700 }}>{node.readings.pressure} ({node.readings.trend})</span></div>
                          <div><span style={{ color: C.muted }}>Temperature:</span> <span style={{ color: C.text }}>{node.readings.temp}</span></div>
                          <div><span style={{ color: C.muted }}>Relative Humidity:</span> <span style={{ color: C.text }}>{node.readings.humidity}</span></div>
                          <div><span style={{ color: C.muted }}>Air Quality:</span> <span style={{ color: "#34d399" }}>{node.readings.airQuality}</span></div>
                          <div><span style={{ color: C.muted }}>Precipitation:</span> <span style={{ color: C.text }}>{node.readings.rain}</span></div>
                        </>
                      )}

                      {!isGateway && !isWeather && (
                        <>
                          <div><span style={{ color: C.muted }}>Assigned Carrier:</span> <span style={{ color: "#93c5fd", fontWeight: 700 }}>{node.carrier}</span></div>
                          <div><span style={{ color: C.muted }}>Hardware Modules:</span> <span style={{ color: C.text }}>{node.hardware}</span></div>
                          <div><span style={{ color: C.muted }}>GPS Status:</span> <span style={{ color: "#34d399" }}>{node.gpsFix}</span></div>
                          <div><span style={{ color: C.muted }}>Power Source:</span> <span style={{ color: C.text }}>{node.power}</span></div>
                          {node.sosSwitch && (
                            <div><span style={{ color: C.muted }}>Tactile SOS Button:</span> <span style={{ color: "#fbbf24", fontWeight: 700 }}>{node.sosSwitch}</span></div>
                          )}
                          {node.groupDistance && (
                            <div><span style={{ color: C.muted }}>Group Integrity:</span> <span style={{ color: "#34d399" }}>{node.groupDistance}</span></div>
                          )}
                        </>
                      )}

                      {/* In-Card Action Buttons */}
                      <div style={{ gridColumn: "span 2", marginTop: 8, paddingTop: 8, borderTop: `1px solid rgba(255,255,255,0.06)`, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {isGateway && (
                          <Btn variant="primary" onClick={playSirenTest}>
                            🔊 Test MAX98357A 3W Siren
                          </Btn>
                        )}
                        {isWeather && (
                          <Btn variant="primary" onClick={() => handleDownlink("REQ_WEATHER", "02", "REMOTE_01")}>
                            📊 Query Instant Meteorological Packet
                          </Btn>
                        )}
                        {!isGateway && !isWeather && (
                          <>
                            <Btn variant="default" onClick={() => playBuzzerLocate(node.carrier || node.name)}>
                              🔊 Locate via Audio Buzzer (Fog Search)
                            </Btn>
                            {isSOS && (
                              <Btn variant="danger" onClick={() => handleDownlink("TEST_SOS_PING", "09", "BEACON_02")}>
                                🚨 Test Hardware SOS Radio Packet
                              </Btn>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          {/* Right Rail: Master Gateway & Radio Health Inspector */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Card style={{ background: "linear-gradient(135deg, rgba(20, 36, 60, 0.6), rgba(11, 20, 34, 0.95))" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                <span>📻</span>
                <span>Gateway Hardware Node Inspector</span>
              </div>

              <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 10, padding: 12, border: `1px solid ${C.border}`, marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Target Device</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#93c5fd" }}>{selectedNodeData.name}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{selectedNodeData.badge}</div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 11.5 }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ color: C.muted }}>Radio Frequency</span>
                  <span style={{ fontFamily: "monospace", color: C.teal }}>865.0625 MHz (IN865)</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ color: C.muted }}>Spreading Factor</span>
                  <span style={{ fontFamily: "monospace", color: "#fff" }}>SF{spreadingFactor} (125 kHz BW)</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ color: C.muted }}>Link Budget (RSSI)</span>
                  <span style={{ fontFamily: "monospace", color: "#34d399" }}>{selectedNodeData.rssi} dBm</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ color: C.muted }}>Signal-to-Noise Ratio</span>
                  <span style={{ fontFamily: "monospace", color: "#38bdf8" }}>+{selectedNodeData.snr} dB</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ color: C.muted }}>Estimated Airtime</span>
                  <span style={{ fontFamily: "monospace", color: C.text }}>~61 ms / packet</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
                  <span style={{ color: C.muted }}>Battery / Supply</span>
                  <span style={{ fontFamily: "monospace", color: "#34d399" }}>{selectedNodeData.battery}%</span>
                </div>
              </div>
            </Card>

            {/* Quick Actions */}
            <Card>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 8 }}>Field Maintenance Actions</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Btn onClick={() => handleDownlink("PING_NODE", "01", selectedNodeData.id)}>
                  📡 Ping Selected Node ({selectedNodeData.id})
                </Btn>
                <Btn onClick={playSirenTest}>
                  🔊 Test Base Camp Gateway Siren
                </Btn>
                <Btn onClick={() => setActiveTab("terminal")}>
                  💻 Open Live Raw Packet Terminal →
                </Btn>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ══ TAB: RAW PACKET TERMINAL ══ */}
      {activeTab === "terminal" && (
        <Card style={{ padding: 0, overflow: "hidden", background: "#06090e", border: `1px solid rgba(80,140,220,0.25)` }}>
          <div
            style={{
              padding: "10px 16px",
              background: "rgba(255,255,255,0.03)",
              borderBottom: `1px solid ${C.border}`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ display: "flex", gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444" }} />
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#f59e0b" }} />
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#22c55e" }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#93c5fd", fontFamily: "monospace" }}>
                LoRa-RX-TX-Console://865.0625MHz · IN865 · SF{spreadingFactor} · 115200 Baud
              </span>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: C.muted }}>Filter:</span>
              {["ALL", "REMOTE_01", "BEACON_01", "BEACON_02", "GATEWAY_BASE"].map((f) => (
                <button
                  key={f}
                  onClick={() => setFilterNode(f)}
                  style={{
                    padding: "3px 8px",
                    borderRadius: 5,
                    border: `1px solid ${filterNode === f ? C.accent : C.border}`,
                    background: filterNode === f ? "rgba(59,130,246,0.25)" : "transparent",
                    color: filterNode === f ? "#fff" : C.muted,
                    fontSize: 10,
                    fontFamily: "monospace",
                    cursor: "pointer",
                  }}
                >
                  {f}
                </button>
              ))}

              <button
                onClick={() => setAutoScroll((v) => !v)}
                style={{
                  padding: "3px 8px",
                  borderRadius: 5,
                  border: `1px solid ${autoScroll ? C.green : C.border}`,
                  background: autoScroll ? "rgba(34,197,94,0.15)" : "transparent",
                  color: autoScroll ? "#86efac" : C.muted,
                  fontSize: 10,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {autoScroll ? "● Auto-Scroll ON" : "○ Auto-Scroll OFF"}
              </button>

              <button
                onClick={() => setPackets([])}
                style={{
                  padding: "3px 8px",
                  borderRadius: 5,
                  border: `1px solid ${C.border}`,
                  background: "transparent",
                  color: C.muted,
                  fontSize: 10,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Clear
              </button>
            </div>
          </div>

          <div
            ref={terminalRef}
            style={{
              height: 440,
              overflowY: "auto",
              padding: 14,
              fontFamily: 'SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
              fontSize: 11.5,
              lineHeight: 1.6,
              color: "#e2e8f0",
              background: "#070b12",
            }}
          >
            {filteredPackets.length === 0 ? (
              <div style={{ color: C.muted, padding: "20px 0", textAlign: "center" }}>
                Listening on 865.0625 MHz (India IN865 Band)... Waiting for radio frames.
              </div>
            ) : (
              filteredPackets.map((pkt) => {
                const isTX = pkt.dir === "TX";
                const isSOS = pkt.raw.includes('"sos":true') || pkt.raw.includes("SOS");
                const isWeather = pkt.node === "REMOTE_01";

                return (
                  <div
                    key={pkt.id}
                    style={{
                      padding: "4px 0",
                      borderBottom: "1px solid rgba(255,255,255,0.03)",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 8,
                      color: isSOS ? "#fca5a5" : isTX ? "#fde047" : isWeather ? "#67e8f9" : "#e2e8f0",
                    }}
                  >
                    <span style={{ color: "#64748b", flexShrink: 0 }}>[{pkt.time}]</span>
                    <span
                      style={{
                        padding: "1px 5px",
                        borderRadius: 3,
                        fontSize: 9.5,
                        fontWeight: 700,
                        background: isTX ? "rgba(234,179,8,0.2)" : "rgba(34,197,94,0.15)",
                        color: isTX ? "#facc15" : "#4ade80",
                        flexShrink: 0,
                      }}
                    >
                      {pkt.dir}
                    </span>
                    <span style={{ color: "#93c5fd", fontWeight: 700, flexShrink: 0 }}>
                      {pkt.node}
                    </span>
                    {!isTX && (
                      <span style={{ color: "#94a3b8", fontSize: 10, flexShrink: 0 }}>
                        ({pkt.rssi}dBm / SNR {pkt.snr > 0 ? "+" : ""}{pkt.snr}dB)
                      </span>
                    )}
                    <span style={{ flex: 1, wordBreak: "break-all" }}>{pkt.raw}</span>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      )}

      {/* ══ TAB: RF MESH TRAIL TOPOLOGY ══ */}
      {activeTab === "rf-mesh" && (
        <div>
          <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 12, color: C.muted }}>
              📍 <strong>RF Coverage Corridor:</strong> Udhewadi Base Camp (829m ASL) → Manoranjan Ridge (842m ASL) → Shrivardhan Bastion
            </div>
            <Pill color="teal">Line-of-Sight Range: ~3.8 km</Pill>
          </div>
          <LiveMap points={users && users.length > 0 ? users : USERS} height={420} />
        </div>
      )}
    </div>
  );
};

/* ════════════════════════════════════════════════
   PAGE: FEATURE ACCESS
════════════════════════════════════════════════ */



/* ════════════════════════════════════════════════
   PAGE: BLUETOOTH DEVICES
════════════════════════════════════════════════ */
/* ════════════════════════════════════════════════
   PAGE: WEARABLES & BIOMETRIC TELEMETRY RADAR
   (Replaces unrealistic desktop BLE scanning with real trekker telemetry stream)
════════════════════════════════════════════════ */


/* ════════════════════════════════════════════════
   BACKWARD COMPATIBLE SOS ALIASES
════════════════════════════════════════════════ */
const PageSOSAdmin = PageSOSNavigation;
const PageSOSTracking = PageSOSNavigation;

/* ════════════════════════════════════════════════
   PAGE: LIVE TRACKING
════════════════════════════════════════════════ */
const PageLiveTracking = ({ navigate, users = USERS, connectionState = "disconnected", error = null }) => {
  const [filter, setFilter] = useState("all");
  const [sel, setSel] = useState(null);
  const displayUsers = users && users.length > 0 ? users : USERS;
  const filtered = filter === "all" ? displayUsers : displayUsers.filter(u => u.status === filter);
  const activeSOSUser = displayUsers.find((user) => user.status === "sos") || null;
  const activeTeam = SOS_TEAMS.find((team) => team.status === "deployed") || SOS_TEAMS[0];

  // Calculate distance from Admin (Ajay Saini) for each member
  const memberDistances = displayUsers.map(u => calculateDistanceMeters(RAJMACHI_ADMIN.lat, RAJMACHI_ADMIN.lon, u.lat, u.lon));
  const maxSpread = memberDistances.length > 0 ? Math.max(...memberDistances) : 0;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div style={{
          width: 8, height: 8, borderRadius: "50%",
          background: connectionState === "connected" ? C.green : connectionState === "connecting" ? C.amber : C.red,
          animation: connectionState === "connecting" ? "pulse 1s infinite" : "none"
        }} />
        <span style={{ fontSize: 11, color: C.muted }}>
          Server: <span style={{ color: connectionState === "connected" ? C.green : C.red }}>
            {connectionState === "connected" ? "✅ Connected" : connectionState === "connecting" ? "⏳ Connecting..." : "❌ Disconnected"}
          </span>
          {error && <span style={{ color: C.red, marginLeft: 8 }}>Error: {error}</span>}
        </span>
      </div>

      <PageHeader title="Live Navigation & User Tracking" sub="Real-time positions, member proximity and trail formation"
        right={<div style={{ display: "flex", gap: 6 }}>
          {["all", "active", "sos"].map(f => <button key={f} onClick={() => setFilter(f)} style={{ padding: "5px 12px", borderRadius: 7, border: `1px solid ${filter === f ? C.accent : C.border}`, background: filter === f ? "rgba(59,130,246,0.12)" : "transparent", color: filter === f ? C.accent : C.muted, fontSize: 11, cursor: "pointer", fontFamily: "inherit", textTransform: "capitalize" }}>{f}</button>)}
        </div>} />

      {/* Admin Location & Proximity Header Banner */}
      <div
        style={{
          background: "linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(11, 20, 34, 0.95))",
          border: "1px solid rgba(245, 158, 11, 0.35)",
          borderRadius: 14,
          padding: "14px 18px",
          marginBottom: 16,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 10,
              background: "rgba(245, 158, 11, 0.2)",
              border: "1px solid rgba(245, 158, 11, 0.4)",
              color: "#fbbf24",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
            }}
          >
            👑
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                Your Location: Ajay Saini (Expedition Leader & Field Guide)
              </span>
              <Pill color="green">● Leading Trail</Pill>
            </div>
            <div style={{ fontSize: 12, color: C.muted }}>
              📍 Manoranjan Fort Ridge (18.8312°N, 73.4008°E · 842m ASL) · VHF Channel: 145.500 MHz
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: C.muted2 }}>Group Formation Spread</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#34d399" }}>
              {formatDistance(maxSpread)} (Safe Corridor &lt; 2.5 km)
            </div>
          </div>
          <Pill color="teal">5/5 Trekkers Accounted</Pill>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 310px", gap: 14 }}>
        <div>
          <LiveMap
            points={filtered}
            teams={SOS_TEAMS.filter(t => t.status === "deployed")}
            routeFrom={activeTeam}
            routeTo={activeSOSUser}
            height={420}
          />
          {activeSOSUser && (
            <div style={{ marginTop: 10, background: "rgba(239,68,68,0.08)", border: `1px solid rgba(239,68,68,0.25)`, borderRadius: 10, padding: "10px 12px", fontSize: 12, color: C.text }}>
              <strong style={{ color: C.red }}>Nearest SOS route:</strong> {activeTeam.name} is routed to {activeSOSUser.name} at {activeSOSUser.city}.
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginTop: 12 }}>
            <StatCard label="Users tracked" value={displayUsers.filter(u => u.status === "active").length} sub="Online" color={C.accent} icon="📍" />
            <StatCard label="SOS active" value={displayUsers.filter(u => u.status === "sos").length} sub="Alert" color={C.red} icon="🚨" />
            <StatCard label="Teams deployed" value={SOS_TEAMS.filter(t => t.status === "deployed").length} sub="Moving" color={C.amber} icon="🚑" />
            <StatCard label="GPS accuracy" value="±6m" sub="Avg" color={C.green} icon="🛰️" />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 580, overflowY: "auto" }}>
          <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4, display: "flex", justifyContent: "space-between" }}>
            <span>Trekker Group ({filtered.length})</span>
            <span style={{ color: "#60a5fa" }}>Distances from You</span>
          </div>
          {filtered.map(u => {
            const distFromAdmin = calculateDistanceMeters(RAJMACHI_ADMIN.lat, RAJMACHI_ADMIN.lon, u.lat, u.lon);
            const distStr = formatDistance(distFromAdmin);
            const isClose = distFromAdmin < 500;
            const isMedium = distFromAdmin >= 500 && distFromAdmin <= 1200;

            return (
              <Card
                key={u.id}
                onClick={() => setSel(sel === u.id ? null : u.id)}
                style={{
                  cursor: "pointer",
                  marginBottom: 0,
                  borderColor: sel === u.id ? C.accent : u.status === "sos" ? "rgba(239,68,68,0.4)" : C.border,
                  background: sel === u.id ? "rgba(59,130,246,0.07)" : C.card,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ position: "relative" }}>
                    <Avatar initials={u.avatar || "TR"} bg={u.color ? u.color[0] : "#3b82f6"} text={u.color ? u.color[1] : "#fff"} />
                    <div
                      style={{
                        position: "absolute",
                        bottom: 0,
                        right: 0,
                        width: 9,
                        height: 9,
                        borderRadius: "50%",
                        background: u.status === "sos" ? C.red : u.status === "active" ? C.green : "#555",
                        border: "2px solid #080f1a",
                      }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{u.name}</div>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "1px 6px",
                          borderRadius: 8,
                          background: isClose ? "rgba(34,197,94,0.15)" : isMedium ? "rgba(59,130,246,0.15)" : "rgba(245,158,11,0.15)",
                          color: isClose ? "#86efac" : isMedium ? "#93c5fd" : "#fcd34d",
                        }}
                      >
                        {distStr} away
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                      {u.trailStatus || `📍 ${u.city || "Rajmachi"} · ${u.lastSeen || "Active"}`}
                    </div>
                  </div>
                  {u.status === "sos" && <span>🚨</span>}
                </div>

                {sel === u.id && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                    {[
                      ["Distance from Leader", `${distStr} away`],
                      ["Trail Status", u.trailStatus || "Ascending Trail"],
                      ["Altitude", u.altitude ? `${u.altitude}m ASL` : "—"],
                      ["Battery", u.battery ? `${u.battery}%` : "—"],
                      ["Heart Rate", u.heartRate ? `${u.heartRate} bpm` : "—"],
                      ["Blood SpO2", u.spO2 ? `${u.spO2}%` : "—"],
                      ["Synced Wearable", u.wearable || "No wearable linked"],
                      ["Latitude", Number.isFinite(Number(u.lat)) ? `${Number(u.lat).toFixed(4)}°N` : "—"],
                      ["Longitude", Number.isFinite(Number(u.lon)) ? `${Number(u.lon).toFixed(4)}°E` : "—"],
                      ["Blood", u.blood],
                      ["Emergency Contact", u.ec1Name ? `${u.ec1Name} (${u.ec1Rel || "Family"}) · ${u.ec1Ph || ""}` : "Registered"],
                    ].map(([k, v]) => (
                      <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "2px 0" }}>
                        <span style={{ color: C.muted2 }}>{k}</span>
                        <span style={{ color: C.text, fontWeight: 500, maxWidth: 170, textAlign: "right" }}>{v}</span>
                      </div>
                    ))}
                    <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                      <Btn style={{ flex: 1, justifyContent: "center", fontSize: 11 }} onClick={() => navigate("sos-navigation")}>
                        🗺 Route Team
                      </Btn>
                      {u.status === "sos" && (
                        <Btn variant="danger" style={{ flex: 1, justifyContent: "center", fontSize: 11 }} onClick={() => navigate("sos-navigation")}>
                          SOS Dispatch
                        </Btn>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
          <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em", margin: "12px 0 4px" }}>SOS Teams</div>
          {SOS_TEAMS.map(t => (
            <Card key={t.id} style={{ marginBottom: 0, borderColor: t.status === "deployed" ? "rgba(245,158,11,0.3)" : C.border }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(245,158,11,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🚑</div>
                <div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 500, color: C.text }}>{t.name}</div><div style={{ fontSize: 10, color: C.muted }}>{t.vehicle} · {t.speed} · ETA {t.eta}</div></div>
                <Pill color={t.status === "deployed" ? "amber" : "gray"}>{t.status}</Pill>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════
   LEAFLET MAP — no API key, free tiles, CDN loaded
════════════════════════════════════════════════ */
const TILE_LAYERS = {
  road: { url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", attr: "© OpenStreetMap contributors" },
  satellite: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attr: "© Esri World Imagery" },
  terrain: { url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", attr: "© OpenTopoMap contributors" },
};

const LeafletMap = ({ height = 480, tileType = "road", perspective = false, markers = [], center = [18.8286, 73.3986], zoom = 13 }) => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [leafletReady, setLeafletReady] = useState(!!window.L);

  /* Use shared loader so no duplicate script tags */
  useEffect(() => { injectLeafletStyles(); ensureLeaflet(() => setLeafletReady(true)); }, []);

  useEffect(() => {
    if (!leafletReady || !containerRef.current) return;
    const L = window.L;
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    const map = L.map(containerRef.current, { center, zoom, zoomControl: true });
    const { url, attr } = TILE_LAYERS[tileType] || TILE_LAYERS.road;
    L.tileLayer(url, { attribution: attr, maxZoom: 19 }).addTo(map);
    const mkIcon = (color = "#3b82f6") => L.divIcon({
      className: "",
      html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 0 0 5px ${color}44;"></div>`,
      iconSize: [14, 14], iconAnchor: [7, 7], popupAnchor: [0, -10]
    });
    const station = L.marker(center, { icon: mkIcon("#f59e0b") }).addTo(map);
    station.bindPopup(`<b>🏔️ Rajmachi Weather Station</b><br><small>Manoranjan Ridge Observation Post<br>18.8286°N · 73.3986°E · 829m ASL</small>`);
    markers.forEach(m => {
      const mk = L.marker([m.lat, m.lon], { icon: mkIcon(m.color || "#ef4444") }).addTo(map);
      if (m.popup) mk.bindPopup(m.popup);
    });
    mapRef.current = map;
    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, [leafletReady, tileType]);

  return (
    <div style={{
      borderRadius: 12, overflow: "hidden", border: `1px solid ${C.border}`, boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
      ...(perspective ? { transform: "perspective(900px) rotateX(28deg)", transformOrigin: "top center" } : {})
    }}>
      {!leafletReady && (
        <div style={{ height, background: "#080f1a", display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: 13 }}>
          ⏳ Loading mountain topographical map…
        </div>
      )}
      <div ref={containerRef} style={{ height, display: leafletReady ? "block" : "none" }} />
    </div>
  );
};

/* ════════════════════════════════════════════════
   PAGE: MOUNTAIN WEATHER & TRAIL HAZARD RADAR
   (Unified live meteorological telemetry for Rajmachi Fort & Sahyadris)
════════════════════════════════════════════════ */
const WX_CODES = {
  0: ["☀️", "Clear sky"], 1: ["🌤️", "Mainly clear"], 2: ["⛅", "Partly cloudy"], 3: ["☁️", "Overcast"],
  45: ["🌫️", "Dense mountain fog"], 48: ["🌫️", "Rime fog"], 51: ["🌦️", "Light drizzle"], 53: ["🌦️", "Drizzle"],
  55: ["🌧️", "Heavy drizzle"], 61: ["🌧️", "Light rain"], 63: ["🌧️", "Moderate mountain rain"], 65: ["⛈️", "Heavy monsoon downpour"],
  71: ["🌨️", "Light snow"], 73: ["❄️", "Snow"], 75: ["🌨️", "Heavy snow"], 80: ["🌦️", "Rain showers"],
  81: ["🌧️", "Heavy showers"], 82: ["⛈️", "Violent monsoon storm"], 95: ["⛈️", "Severe thunderstorm & lightning"], 99: ["⛈️", "Thunderstorm + hail"]
};
const windDir = (deg) => ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(deg / 45) % 8];
const feelsLike = (t, h) => +(t - 0.55 * (1 - h / 100) * (t - 14.5)).toFixed(1);

const PageMountainWeather = () => {
  const [tab, setTab] = useState("live");
  const [mapType, setMapType] = useState("terrain");
  const [mapPerspective, setMapPerspective] = useState(false);
  const [wx, setWx] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sensorOnline, setSensorOnline] = useState(true);
  const [advisorySent, setAdvisorySent] = useState(false);
  const [advisoryErr, setAdvisoryErr] = useState("");
  const [advisoryText, setAdvisoryText] = useState("");
  const [sensor, setSensor] = useState({
    temp: 24.2, humidity: 82, pressure: 928.4, windSpeed: 18.5, windDir: 240,
    uvIndex: 4.8, rainfall: 2.4, altitude: 829, co2: 408, aqi: 34,
    lastSync: new Date().toLocaleTimeString("en-IN")
  });

  // ── Fetch real mountain weather from Open-Meteo for Rajmachi Fort (18.8286°N, 73.3986°E) ──────────────
  useEffect(() => {
    const fetch_ = async () => {
      try {
        const r = await fetch(
          "https://api.open-meteo.com/v1/forecast?latitude=18.8286&longitude=73.3986" +
          "&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m," +
          "wind_direction_10m,cloud_cover,pressure_msl,uv_index,weather_code" +
          "&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code,wind_speed_10m_max" +
          "&hourly=temperature_2m,precipitation_probability" +
          "&timezone=Asia%2FKolkata&forecast_days=7"
        );
        const d = await r.json();
        setWx(d);
        if (d.current) {
          setSensor(prev => ({
            ...prev,
            temp: d.current.temperature_2m,
            humidity: d.current.relative_humidity_2m,
            pressure: d.current.pressure_msl,
            windSpeed: d.current.wind_speed_10m,
            windDir: d.current.wind_direction_10m,
            uvIndex: d.current.uv_index ?? prev.uvIndex,
            rainfall: d.current.precipitation,
            lastSync: new Date().toLocaleTimeString("en-IN"),
          }));
        }
        setLoading(false);
      } catch { setLoading(false); }
    };
    fetch_();
    const t = setInterval(fetch_, 300_000);
    return () => clearInterval(t);
  }, []);

  // Sensor readings come only from Open-Meteo — no synthetic drift.

  const handleBroadcastAdvisory = async () => {
    if (!advisoryText.trim()) return;
    setAdvisoryErr("");
    const res = await createSafetyProtocol({
      title: "⚡ Urgent Trail Weather Advisory",
      body: advisoryText.trim(),
      status: "published",
      author: "Field Guide Ajay Saini",
    });
    if (!res?.success) {
      setAdvisoryErr(res?.error || "Advisory was not saved. Check backend/Firestore connectivity.");
      return;
    }
    setAdvisorySent(true);
    setAdvisoryText("");
    setTimeout(() => setAdvisorySent(false), 5000);
  };

  const cur = wx?.current;
  const wxCode = cur?.weather_code ?? 0;
  const [wxIcon, wxDesc] = WX_CODES[wxCode] ?? ["⛅", "Mountain haze"];

  const TABS = [
    { id: "live", icon: "🌡️", label: "Live Trail Conditions & Hazards" },
    { id: "map", icon: "🗺️", label: "Topographic & Satellite Map" },
    { id: "hardware", icon: "📡", label: "Ridge Meteorological Sensors" },
    { id: "forecast", icon: "📅", label: "7-Day Elevation Forecast" },
    { id: "navigation", icon: "🧭", label: "3D Terrain View" },
  ];

  return (
    <div>
      <PageHeader
        title="Mountain Weather & Trail Hazards Console"
        sub={`Live Meteorological Telemetry · Rajmachi Fort (829m ASL) · Manoranjan Ridge · ${sensorOnline ? "🟢 Ridge Sensors Online" : "🔴 Sensors Offline"}`}
        right={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {loading && <Pill color="blue">Fetching Live Open-Meteo…</Pill>}
            <Pill color={sensorOnline ? "green" : "red"}>{sensorOnline ? "● 829m Station Online" : "○ Offline"}</Pill>
            <Btn onClick={() => setSensorOnline(s => !s)}>{sensorOnline ? "Disconnect Sensors" : "Reconnect Sensors"}</Btn>
          </div>
        }
      />

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "7px 14px", borderRadius: 9, border: `1px solid ${tab === t.id ? C.accent : C.border}`,
            background: tab === t.id ? "rgba(59,130,246,0.12)" : "transparent",
            color: tab === t.id ? C.accent : C.muted, fontSize: 12, cursor: "pointer",
            fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6,
          }}>{t.icon} {t.label}</button>
        ))}
      </div>

      {/* ══ LIVE WEATHER & HAZARDS ══ */}
      {tab === "live" && (
        <div>
          <Card style={{ marginBottom: 14, background: "linear-gradient(135deg,rgba(16,40,90,0.65),rgba(11,20,34,0.95))", border: `1px solid rgba(80,140,220,0.3)` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: "#60a5fa", fontWeight: 600, marginBottom: 6 }}>📍 Rajmachi Fort · Manoranjan Bastion (18.8286°N, 73.3986°E · 829m ASL)</div>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ fontSize: 68 }}>{wxIcon}</div>
                  <div>
                    <div style={{ fontSize: 54, fontWeight: 700, color: C.text, lineHeight: 1 }}>
                      {sensor.temp}<span style={{ fontSize: 28, color: C.muted }}>°C</span>
                    </div>
                    <div style={{ fontSize: 15, color: C.muted, marginTop: 2 }}>{wxDesc}</div>
                    <div style={{ fontSize: 11, color: C.muted2, marginTop: 2 }}>Mountain Wind Chill: {feelsLike(sensor.temp, sensor.humidity)}°C</div>
                  </div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  ["💧 Relative Humidity", `${sensor.humidity}%`],
                  ["🌬️ Wind Speed", `${sensor.windSpeed} km/h (${windDir(sensor.windDir)})`],
                  ["🌧️ Rain Rate", `${sensor.rainfall} mm/h`],
                  ["🌀 Atmospheric Pressure", `${sensor.pressure?.toFixed(1)} hPa`],
                ].map(([label, val]) => (
                  <div key={label} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px" }}>
                    <div style={{ fontSize: 10, color: C.muted }}>{label}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{val}</div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* ACTIVE HAZARDS & QUICK DISPATCH ADVISORY */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <Card>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                <span>⚠️</span>
                <span>Active Trail Hazard Directives (Sahyadri Western Ghats)</span>
              </div>
              {[
                ["Ulhas River Valley — Flash Flood Risk", "Heavy monsoon runoff into river crossings between Kondhane and base. River crossings restricted after 17:00.", "red"],
                ["Manoranjan Ridge Bastion — Lightning & High Wind", "Afternoon convective thunderstorms above 800m. Keep clear of exposed metal railings and lone trees.", "amber"],
                ["Forest Department Monsoon Notice", "Night trekking strictly permitted only with licensed Field Guide (Ajay Saini) and VHF radio link.", "blue"],
              ].map(([title, desc, col]) => (
                <div key={title} style={{ background: "rgba(255,255,255,0.025)", border: `1px solid ${col === "red" ? "rgba(239,68,68,0.3)" : col === "amber" ? "rgba(245,158,11,0.3)" : "rgba(59,130,246,0.25)"}`, borderRadius: 10, padding: "10px 14px", marginBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: col === "red" ? "#fca5a5" : col === "amber" ? "#fcd34d" : "#93c5fd", marginBottom: 2 }}>{title}</div>
                  <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.4 }}>{desc}</div>
                </div>
              ))}
            </Card>

            <Card>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                <span>📢</span>
                <span>Instant Trail Advisory Broadcaster</span>
              </div>
              <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 12 }}>
                Push immediate weather warnings directly to the 5 trekkers' User App notification feed:
              </div>

              {advisorySent && (
                <div style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#86efac", fontWeight: 600, marginBottom: 10 }}>
                  ✓ Advisory broadcasted to all active expedition members and saved to safety protocols!
                </div>
              )}

              <textarea
                value={advisoryText}
                onChange={(e) => setAdvisoryText(e.target.value)}
                placeholder="e.g. Heavy cloudburst approaching Manoranjan ridge. All trekkers hold position at stream shelter and report VHF check-in..."
                rows={3}
                style={{
                  width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 12, padding: 10, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", outline: "none", marginBottom: 10
                }}
              />
              <Btn variant="primary" onClick={handleBroadcastAdvisory} disabled={!advisoryText.trim()}>
                Broadcast Directive to Group →
              </Btn>
              {advisorySent && (
                <div style={{ fontSize: 11.5, color: "#86efac", marginTop: 8 }}>✓ Advisory published to the safety protocol feed.</div>
              )}
              {advisoryErr && (
                <div style={{ fontSize: 11.5, color: "#fca5a5", marginTop: 8 }}>✕ {advisoryErr}</div>
              )}
            </Card>
          </div>

          {/* Hourly temperature strip */}
          {wx?.hourly && (
            <Card style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>Hourly Forecast &amp; Rain Probability (Next 24h)</div>
              <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
                {wx.hourly.time.slice(0, 24).map((t, i) => {
                  const hr = t.split("T")[1]?.substring(0, 5);
                  const tmp = wx.hourly.temperature_2m[i];
                  const pp = wx.hourly.precipitation_probability?.[i] ?? 0;
                  return (
                    <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, flexShrink: 0, minWidth: 44, padding: "6px 4px", borderRadius: 8, background: i === 0 ? "rgba(59,130,246,0.1)" : "transparent" }}>
                      <div style={{ fontSize: 9, color: C.muted2 }}>{hr}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: tmp > 35 ? C.red : tmp > 30 ? C.amber : tmp > 25 ? C.accent : C.teal }}>{tmp}°</div>
                      {pp > 20 && <div style={{ fontSize: 9, color: C.teal }}>💧{pp}%</div>}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Alerts & Air Quality row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Card>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 10 }}>⚠️ Active Atmospheric Alerts</div>
              {[
                { col: "amber", title: "Monsoon Cloudburst Watch", desc: "Low barometric pressure detected at Manoranjan ridge (928.4 hPa). High convection squalls probable." },
                { col: "blue", title: "Wind & Mist Advisory", desc: `Moderate winds (${sensor.windSpeed} km/h) from ${windDir(sensor.windDir)}. Ridge visibility ~80m in cloud cover.` },
              ].map(a => (
                <div key={a.title} style={{ background: `rgba(255,255,255,0.03)`, border: `1px solid ${a.col === "amber" ? "rgba(245,158,11,0.3)" : "rgba(59,130,246,0.2)"}`, borderRadius: 9, padding: "9px 12px", marginBottom: 7 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: C.text, marginBottom: 2 }}>{a.title}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>{a.desc}</div>
                </div>
              ))}
            </Card>
            <Card>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 6 }}>📊 Ridge Air Quality &amp; Particulates</div>
              <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.55 }}>
                No PMS5003 particulate or CO₂ sensor is linked to this console, so AQI and CO₂ are <strong>not measured</strong>.
                Temperature, humidity, wind, UV and pressure above come live from Open-Meteo.
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ══ LIVE MAP ══ */}
      {tab === "map" && (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
            {[["road", "🗺️ Road"], ["satellite", "🛰️ Satellite"], ["terrain", "🏔️ Terrain"]].map(([v, label]) => (
              <button key={v} onClick={() => setMapType(v)} style={{
                padding: "6px 14px", borderRadius: 8, border: `1px solid ${mapType === v ? C.accent : C.border}`,
                background: mapType === v ? "rgba(59,130,246,0.12)" : "transparent",
                color: mapType === v ? C.accent : C.muted, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
              }}>{label}</button>
            ))}
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: C.muted }}>3D tilt</span>
              <Toggle on={mapPerspective} onChange={() => setMapPerspective(x => !x)} />
            </div>
          </div>
          <LeafletMap height={500} tileType={mapType} perspective={mapPerspective}
            markers={USERS.map(u => ({ lat: u.lat, lon: u.lon, color: u.status === "sos" ? "#ef4444" : u.status === "active" ? "#22c55e" : "#888", popup: `<b>${u.name}</b><br><small>${u.city} · ${u.status}</small>` }))} />
          <div style={{ marginTop: 10, display: "flex", gap: 16, fontSize: 11, color: C.muted2, flexWrap: "wrap" }}>
            <span>📍 18.52°N, 73.85°E</span>
            <span>🗺️ Mulshi Reservoir region · Western Ghats</span>
            <span>🏔️ Alt: {sensor.altitude}m ASL</span>
            <span>🌐 OpenStreetMap / ESRI · No ads · No API key</span>
          </div>
        </div>
      )}

      {/* ══ HARDWARE SENSORS ══ */}
      {tab === "hardware" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 14 }}>
            {[
              { label: "Temperature", value: `${sensor.temp}°C`, icon: "🌡️", color: sensor.temp > 35 ? C.red : sensor.temp > 28 ? C.amber : C.green, status: sensor.temp > 35 ? "High alert" : sensor.temp > 28 ? "Warm" : "Normal" },
              { label: "Humidity", value: `${sensor.humidity}%`, icon: "💧", color: sensor.humidity > 80 ? C.amber : C.teal, status: sensor.humidity > 80 ? "High" : sensor.humidity < 30 ? "Dry" : "Normal" },
              { label: "Pressure", value: `${sensor.pressure?.toFixed(1)} hPa`, icon: "🌀", color: C.purple, status: "Stable" },
              { label: "Wind Speed", value: `${sensor.windSpeed} km/h`, icon: "🌬️", color: sensor.windSpeed > 50 ? C.red : sensor.windSpeed > 25 ? C.amber : C.accent, status: sensor.windSpeed > 50 ? "Alert" : sensor.windSpeed > 25 ? "Moderate" : "Calm" },
              { label: "UV Index", value: `${sensor.uvIndex}`, icon: "☀️", color: sensor.uvIndex > 7 ? C.red : sensor.uvIndex > 3 ? C.amber : C.green, status: sensor.uvIndex > 7 ? "Danger" : sensor.uvIndex > 3 ? "Moderate" : "Low" },
              { label: "Rainfall", value: `${sensor.rainfall} mm/h`, icon: "🌧️", color: sensor.rainfall > 5 ? C.red : sensor.rainfall > 0 ? C.teal : C.muted, status: sensor.rainfall > 5 ? "Heavy" : sensor.rainfall > 0 ? "Light" : "None" },
              { label: "Altitude", value: `${sensor.altitude}m ASL`, icon: "🏔️", color: C.muted, status: "Fixed GPS" },
            ].map(({ label, value, icon, color, status }) => (
              <Card key={label} style={{ marginBottom: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</div>
                  <span style={{ fontSize: 16 }}>{icon}</span>
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, color, marginBottom: 5 }}>{value}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: sensorOnline ? C.green : "#555", flexShrink: 0 }} />
                  <div style={{ fontSize: 10, color: C.muted2 }}>{sensorOnline ? status : "Offline"}</div>
                </div>
              </Card>
            ))}
          </div>

          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                  Autonomous Ridge Weather Station · REMOTE_01 Hardware Sensors (842m ASL)
                </div>
                <div style={{ fontSize: 12.5, color: C.text, marginTop: 2, fontWeight: 600 }}>
                  LoRa RF Telemetry Hop to Base Camp Gateway (IN865 Band · 865.0625 MHz)
                </div>
              </div>
              <Pill color={sensorOnline ? "green" : "red"}>{sensorOnline ? "● RF Telemetry Linked" : "○ Station Offline"}</Pill>
            </div>

            {[
              { name: "Adafruit BMP280 — High-Precision Barometric Pressure & Temp", id: "BMP-01 (I2C 0x76)", latency: "28ms RF", fw: "v2.4 (16x Oversampling)" },
              { name: "DHT22 — Digital Relative Humidity & Heat Index", id: "DHT-01 (GPIO 4)", latency: "32ms RF", fw: "v1.9 (2s Cycle)" },
              { name: "Plantower PMS5003 — Laser PM2.5 / PM10 Alpine Air Sensor", id: "PMS-01 (UART2 16/17)", latency: "38ms RF", fw: "v3.2 (Active Stream)" },
              { name: "Optical & Tipping Bucket Precipitation Gauge", id: "RAIN-01 (ADC 34/35)", latency: "24ms RF", fw: "v1.5 (0.1mm Resolution)" },
              { name: "INMP441 — I2S Omnidirectional Acoustic Rockfall/Wind Mic", id: "MIC-01 (I2S 25/32/33)", latency: "30ms RF", fw: "v2.1 (16kHz 32-bit)" },
              { name: "Pressure Trend Engine — Cloudburst & Squall Predictor", id: "TREND-BUF (1-min)", latency: "Immediate", fw: "Drop >1.5hPa/min Alarm" },
            ].map(hw => (
              <div key={hw.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: `1px solid ${C.border}` }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: sensorOnline ? C.green : C.red, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>{hw.name}</div>
                  <div style={{ fontSize: 10, color: C.muted2 }}>{hw.id} · {hw.fw}</div>
                </div>
                <Pill color={sensorOnline ? "green" : "red"}>{sensorOnline ? "online" : "offline"}</Pill>
                <div style={{ fontSize: 10, color: "#93c5fd", minWidth: 50, textAlign: "right", fontFamily: "monospace" }}>{sensorOnline ? hw.latency : "—"}</div>
              </div>
            ))}
            <div style={{ fontSize: 10.5, color: C.muted2, marginTop: 12, display: "flex", gap: 18, flexWrap: "wrap" }}>
              <span>🔄 Last RF Packet: {sensor.lastSync}</span>
              <span>📻 Radio Transport: Semtech SX1276 LoRa (865.0625 MHz · India IN865 Ch 1)</span>
              <span>🔋 Ridge Solar BMS: 3.92V (91% · 5V 2W Solar Top)</span>
            </div>
          </Card>
        </div>
      )}

      {/* ══ 7-DAY FORECAST ══ */}
      {tab === "forecast" && (
        <div>
          {wx?.daily ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 10, marginBottom: 14 }}>
                {wx.daily.time.map((d, i) => {
                  const dt = new Date(d);
                  const dstr = dt.toLocaleDateString("en-IN", { weekday: "short", day: "numeric" });
                  const [ic] = WX_CODES[wx.daily.weather_code[i]] ?? ["🌤️"];
                  const tmax = wx.daily.temperature_2m_max[i];
                  const tmin = wx.daily.temperature_2m_min[i];
                  return (
                    <Card key={d} style={{ textAlign: "center", marginBottom: 0, padding: "14px 8px" }}>
                      <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>{dstr}</div>
                      <div style={{ fontSize: 30, marginBottom: 4 }}>{ic}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: C.red }}>{tmax}°</div>
                      <div style={{ fontSize: 13, color: C.muted }}>{tmin}°</div>
                      <div style={{ fontSize: 10, color: C.teal, marginTop: 3 }}>💧{wx.daily.precipitation_sum[i]}mm</div>
                      <div style={{ fontSize: 10, color: C.muted2, marginTop: 1 }}>💨{wx.daily.wind_speed_10m_max[i]}km/h</div>
                    </Card>
                  );
                })}
              </div>
              <Card>
                <div style={{ fontSize: 12, fontWeight: 500, color: C.text, marginBottom: 12 }}>Weekly Summary</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
                  {[
                    ["Avg High", `${(wx.daily.temperature_2m_max.reduce((a, b) => a + b, 0) / 7).toFixed(1)}°C`, C.red],
                    ["Avg Low", `${(wx.daily.temperature_2m_min.reduce((a, b) => a + b, 0) / 7).toFixed(1)}°C`, C.teal],
                    ["Total Rain", `${wx.daily.precipitation_sum.reduce((a, b) => a + b, 0).toFixed(1)} mm`, C.accent],
                    ["Max Wind", `${Math.max(...wx.daily.wind_speed_10m_max).toFixed(0)} km/h`, C.amber],
                  ].map(([k, v, col]) => (
                    <div key={k} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "10px 12px", border: `1px solid ${C.border}` }}>
                      <div style={{ fontSize: 10, color: C.muted2, marginBottom: 4 }}>{k}</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: col }}>{v}</div>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: C.muted2 }}>
              {loading ? "⏳ Loading forecast…" : "⚠️ Forecast unavailable"}
            </div>
          )}
        </div>
      )}

      {/* ══ 3D NAVIGATION ══ */}
      {tab === "navigation" && (
        <div>
          <div style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
            <Pill color="green">● 3D Navigation Active</Pill>
            <Pill color="blue">📍 Rajmachi Fort, Maharashtra</Pill>
            <Pill color="amber">🏔️ Western Ghats Terrain (829m ASL)</Pill>
            <span style={{ fontSize: 11, color: C.muted }}>Perspective tilt · Satellite + Terrain relief</span>
          </div>
          <LeafletMap height={520} tileType="satellite" perspective={true} zoom={13}
            center={[18.8286, 73.3986]}
            markers={SOS_TEAMS.map(t => ({ lat: t.lat, lon: t.lon, color: "#f59e0b", popup: `<b>${t.name}</b><br><small>${t.vehicle} · ETA ${t.eta}</small>` }))} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginTop: 14 }}>
            {[
              ["🧭", "Heading", `${windDir(sensor.windDir)} · ${sensor.windDir}°`, C.accent],
              ["🏔️", "Altitude", `${sensor.altitude}m ASL`, C.purple],
              ["📍", "Coordinates", "18.8286°N  73.3986°E", C.text],
              ["🌡️", "Conditions", `${sensor.temp}°C · ${wxDesc}`, C.amber],
            ].map(([icon, k, v, col]) => (
              <Card key={k} style={{ marginBottom: 0 }}>
                <div style={{ fontSize: 10, color: C.muted2, marginBottom: 4 }}>{icon} {k}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: col }}>{v}</div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const PageWeatherAdmin = PageMountainWeather;
const PageWeatherMapsAdmin = PageMountainWeather;

/* ════════════════════════════════════════════════
   SIDEBAR NAVIGATION
════════════════════════════════════════════════ */
const NAV = [
  {
    section: "Mission Overview",
    items: [{ id: "dashboard", label: "Operations Dashboard", icon: "⊞" }],
  },
  {
    section: "Expeditions & Trekkers",
    items: [
      { id: "trip-rosters", label: "Expeditions & Rosters", icon: "🧭" },
      { id: "all-users", label: "All Registered Users", icon: "👥" },
      { id: "admin-approvals", label: "Admin Duty Clearances", icon: "🛡️" },
    ],
  },
  {
    section: "Field Telemetry & Radar",
    items: [
      { id: "live-tracking", label: "Live Navigation & Trail", icon: "📍" },
      { id: "device-tracking", label: "Field Hardware & Beacons", icon: "📡" },
    ],
  },
  {
    section: "Mountain Environment",
    items: [
      { id: "weather-console", label: "Mountain Weather & Hazards", icon: "⛰️" },
    ],
  },
  {
    section: "Emergency Response",
    items: [
      { id: "sos-navigation", label: "Realtime SOS Dispatch", icon: "🚨", highlight: true },
    ],
  },
];

function toDisplayUsers(liveUsersMap, baseUsers = USERS) {
  const baseById = new Map(baseUsers.map((user) => [user.id, user]));
  const baseByName = new Map(baseUsers.map((user) => [user.name, user]));

  const merged = baseUsers.map((user) => ({ ...user }));
  const mergedIndexById = new Map(merged.map((user, index) => [user.id, index]));

  Array.from(liveUsersMap.values()).forEach((liveUser) => {
    const baseMatch = baseById.get(liveUser.id) || baseByName.get(liveUser.name);
    const resolved = {
      ...(baseMatch || {}),
      id: liveUser.id,
      name: liveUser.name,
      lat: liveUser.lat,
      lon: liveUser.lon,
      accuracy: liveUser.accuracy,
      status: liveUser.status || baseMatch?.status || "active",
      avatar: baseMatch?.avatar || liveUser.name?.split(" ").map((n) => n[0]).join("") || "U",
      color: baseMatch?.color || ["#E6F1FB", "#0C447C"],
      city: baseMatch?.city || "Live location",
      lastSeen: "just now",
      blood: liveUser.blood || baseMatch?.blood || "—",
      medical: liveUser.medical || baseMatch?.medical || "—",
      email: baseMatch?.email || `${(liveUser.name || "user").toLowerCase().replace(/\s+/g, ".")}@margsutra.app`,
      role: baseMatch?.role || "Field Guide",
      trips: baseMatch?.trips ?? 0,
      devices: baseMatch?.devices ?? 1,
    };

    const existingIndex = mergedIndexById.get(resolved.id);
    if (typeof existingIndex === "number") {
      merged[existingIndex] = resolved;
    } else {
      merged.push(resolved);
      mergedIndexById.set(resolved.id, merged.length - 1);
    }
  });

  return merged.length > 0 ? merged : USERS;
}

function distanceKm(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  return Math.sqrt(
    Math.pow((a.lat - b.lat) * 111, 2) +
    Math.pow((a.lon - b.lon) * 111, 2)
  );
}

/* ════════════════════════════════════════════════
   ROOT COMPONENT
════════════════════════════════════════════════ */
export default function AdminPanel() {
  const [activeAdmin, setActiveAdmin] = useState(() => {
    try {
      const stored = localStorage.getItem("margsutra_admin_session") || localStorage.getItem("coordage_admin_session");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && (parsed.email === "admin@coordage.app" || (parsed.email && parsed.email.includes("coordage.app")))) {
          parsed.email = DEMO_ADMIN_EMAIL;
          localStorage.setItem("margsutra_admin_session", JSON.stringify(parsed));
          localStorage.removeItem("coordage_admin_session");
        }
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  });
  const [loggedIn, setLoggedIn] = useState(() => {
    return !!(localStorage.getItem("margsutra_admin_session") || localStorage.getItem("coordage_admin_session"));
  });
  const [page, setPage] = useState("dashboard");
  const [firestoreUsers, setFirestoreUsers] = useState(USERS);
  const [firestoreSosEvents, setFirestoreSosEvents] = useState([]);
  const [sosFeedLoaded, setSosFeedLoaded] = useState(false);
  const [pendingAdmins, setPendingAdmins] = useState([]);
  const [refreshingPending, setRefreshingPending] = useState(false);
  const [pendingTrekkers, setPendingTrekkers] = useState([]);
  const [refreshingTrekkers, setRefreshingTrekkers] = useState(false);
  const [offGridSimulation, setOffGridSimulation] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const { liveUsers, sosEvents, connectionState, error } = useAdminTracking({ serverUrl: "http://localhost:4000" });
  const displayUsers = toDisplayUsers(liveUsers, firestoreUsers);
  const navigate = (p) => setPage(p);

  // Mutable mirror of the active-SOS count so the poll effect below can pick
  // a sensible cadence without re-subscribing.
  const activeSosRef = useRef(0);
  const socketRef = useRef(null);

  useEffect(() => {
    socketRef.current = connectionState;
  }, [connectionState]);

  useEffect(() => {
    // 1. Firestore real-time listener
    const unsub = subscribeToSOSEvents((events) => {
      if (Array.isArray(events)) {
        setFirestoreSosEvents(events);
      }
    });

    // 2. Direct Backend REST API Polling (bypasses any client rule issues).
    //    Adaptive cadence:
    //      - socket offline  → poll fast (this REST feed is then the only
    //                           live source for the console)
    //      - SOS active      → poll moderately fast
    //      - all quiet       → poll rarely (the default 2.5s poll drained
    //                           the project's Firestore read quota)
    //    Errors back off exponentially so a throttled project is not hammered.
    let timer = null;
    let stopped = false;
    let failures = 0;

    const pollBackendSOS = async () => {
      if (stopped) return;
      let nextDelay = 60000;
      try {
        const res = await fetch(`${AUTH_API_URL}/sos/events?limit=20`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.events)) {
            setFirestoreSosEvents(data.events);
          }
          setSosFeedLoaded(true);
          failures = 0;
          if (document.hidden) nextDelay = 120000;
          else if (socketRef.current !== "connected") nextDelay = 10000;
          else if (activeSosRef.current > 0) nextDelay = 15000;
          else nextDelay = 120000;
        } else {
          failures += 1;
          nextDelay = Math.min(120000, 15000 * Math.pow(2, failures));
        }
      } catch {
        failures += 1;
        nextDelay = Math.min(120000, 15000 * Math.pow(2, failures));
      }
      if (!stopped) timer = setTimeout(pollBackendSOS, nextDelay);
    };

    pollBackendSOS();

    // React immediately when the operator comes back to the console.
    const onVisibility = () => {
      if (document.hidden) return;
      if (timer) clearTimeout(timer);
      pollBackendSOS();
    };

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      if (unsub) unsub();
    };
  }, []);

  const allSosEvents = useMemo(() => {
    const map = new Map();
    firestoreSosEvents.forEach((ev) => {
      if (ev?.id) map.set(ev.id, ev);
    });
    if (sosEvents && typeof sosEvents.forEach === "function") {
      sosEvents.forEach((val, key) => {
        if (!map.has(key)) map.set(key, val);
      });
    }
    return Array.from(map.values());
  }, [firestoreSosEvents, sosEvents]);

  // ── Acknowledgement state ────────────────────────────────────────────────
  // A duty officer acknowledging a beacon silences the console alarm and the
  // flashing banner, but the incident stays live until stand-down.
  const [ackedSos, setAckedSos] = useState({});
  const ackedSosRef = useRef({});
  const [teamTrips, setTeamTrips] = useState([]);
  useEffect(() => {
    ackedSosRef.current = ackedSos;
  }, [ackedSos]);

  // ── Live incidents (single source of truth) ──────────────────────────────
  // The dispatch feed is authoritative. A trekker still flagged "sos" over the
  // socket after their beacon was resolved must not keep the console in an
  // emergency (that is what used to leave the alarm running forever).
  const liveIncidents = useMemo(() => {
    const list = [];
    const seenUserIds = new Set();

    allSosEvents.forEach((ev) => {
      if (!ev || ev.status !== "active") return;
      const id = ev.id || `sos-${ev.userId}`;
      if (ev.userId) seenUserIds.add(ev.userId);
      list.push({
        id,
        userId: ev.userId,
        name: ev.name || ev.userName || "Trekker",
        acknowledged: Boolean(ev.acknowledged) || Boolean(ackedSosRef.current[id]),
      });
    });

    // Only trust the socket's "sos" flag while the feed is unavailable.
    if (!sosFeedLoaded) {
      displayUsers.forEach((u) => {
        if (!u || u.status !== "sos" || seenUserIds.has(u.id)) return;
        const id = u.activeSosId || `sos-${u.id}`;
        list.push({
          id,
          userId: u.id,
          name: u.name || "Trekker",
          acknowledged: Boolean(ackedSosRef.current[id]),
        });
      });
    }

    return list;
  }, [allSosEvents, displayUsers, sosFeedLoaded, ackedSos]);

  const activeSOS = liveIncidents.length;

  // Keep the poll cadence informed by the live SOS count.
  useEffect(() => {
    activeSosRef.current = activeSOS;
  }, [activeSOS]);

  const handleAcknowledgeSOS = async (eventId, userId) => {
    if (!eventId) return { success: false, errors: ["Missing incident id"] };
    const result = await acknowledgeSOSEvent(
      eventId,
      activeAdmin?.email || activeAdmin?.name || "Lead Command Admin"
    );
    if (result?.success) {
      setAckedSos((prev) => ({
        ...prev,
        [eventId]: { by: activeAdmin?.email || activeAdmin?.name || "SAR Command", at: Date.now() },
      }));
      // Silence the console alarm the moment the incident is acknowledged —
      // do not wait for the feed to catch up.
      stopAlarm();
    }
    return result;
  };

  // ── Alarm controller ─────────────────────────────────────────────────────
  // The console alarm is driven by an explicit stop handle so that
  // acknowledging an incident silences it immediately — instead of waiting
  // for a state change that may never come.
  const alarmStopRef = useRef(null);
  const [alarmMuted, setAlarmMuted] = useState(false);

  const stopAlarm = useCallback(() => {
    if (!alarmStopRef.current) return;
    try { alarmStopRef.current(); } catch { }
    alarmStopRef.current = null;
  }, []);

  const startAlarm = useCallback(() => {
    stopAlarm();
    let audioCtx = null;
    let intervalId = null;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        audioCtx = new AudioCtx();
        const playBeep = () => {
          if (!audioCtx) return;
          try {
            if (audioCtx.state === "suspended") audioCtx.resume();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(740, audioCtx.currentTime);
            osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.12);
            gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.28);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.3);
          } catch { }
        };
        playBeep();
        intervalId = setInterval(playBeep, 2000);
      }
    } catch { }

    alarmStopRef.current = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      if (audioCtx) {
        try { audioCtx.close(); } catch { }
        audioCtx = null;
      }
    };
  }, [stopAlarm]);

  // The expeditions this console knows about — used to name the group that
  // SOS is limited to.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`${AUTH_API_URL}/trips`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data)) setTeamTrips(data);
      } catch {
        /* transient */
      }
    };
    load();
    const timer = setInterval(load, 60000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // The group the console speaks for: the expeditions this admin is in charge
  // of, the busiest one first (that is the group with the trekkers).
  const myTeam = useMemo(() => {
    const mine = teamTrips.filter((t) => !t.adminInCharge || t.adminInCharge === activeAdmin?.id);
    const pool = mine.length ? mine : teamTrips;
    return (
      [...pool].sort((a, b) => (Number(b.rosterCount) || 0) - (Number(a.rosterCount) || 0))[0] || null
    );
  }, [teamTrips, activeAdmin?.id]);

  // Incidents that are still waiting for a human to acknowledge them.
  const unacknowledgedSOSCount = useMemo(
    () => liveIncidents.filter((i) => !i.acknowledged).length,
    [liveIncidents]
  );

  // SAR Command Audio Alert Chime (plays while a beacon waits for a human)
  useEffect(() => {
    if (unacknowledgedSOSCount <= 0 || alarmMuted) {
      stopAlarm();
      return;
    }
    startAlarm();
    return () => stopAlarm();
  }, [unacknowledgedSOSCount, alarmMuted, startAlarm, stopAlarm]);

  // A brand new beacon always re-arms the alarm, even if the operator had
  // muted it earlier.
  const prevUnackedRef = useRef(0);
  useEffect(() => {
    if (unacknowledgedSOSCount > prevUnackedRef.current) setAlarmMuted(false);
    prevUnackedRef.current = unacknowledgedSOSCount;
  }, [unacknowledgedSOSCount]);

  // A beacon pulls the console to the SOS page from anywhere — the duty
  // officer must never have to hunt for the alert.
  useEffect(() => {
    if (unacknowledgedSOSCount > 0 && page !== "sos-navigation") {
      setPage("sos-navigation");
    }
  }, [unacknowledgedSOSCount, page]);

  const handleResolveSOS = async (eventId, userId, notes) => {
    return await resolveSOSEvent(eventId, userId, notes, activeAdmin?.name || "Lead Command Admin");
  };

  const handleTriggerDemoSOS = async (payload) => {
    return await triggerDemoSOSEvent(payload);
  };

  // Command team → every member of the group, in one action.
  const handleBroadcastAlert = async ({ message, severity, title }) => {
    return await broadcastSOSAlert({ message, severity, title });
  };

  const loadPendingAdmins = useCallback(async () => {
    setRefreshingPending(true);
    try {
      const list = await fetchPendingAdmins();
      setPendingAdmins(Array.isArray(list) ? list : []);
    } catch (err) {
      console.warn("Failed to load pending admins:", err);
    } finally {
      setRefreshingPending(false);
    }
  }, []);

  const loadPendingTrekkers = useCallback(async () => {
    setRefreshingTrekkers(true);
    try {
      const list = await fetchPendingTripRequests();
      setPendingTrekkers(Array.isArray(list) ? list : []);
    } catch (err) {
      console.warn("Failed to load pending trekker requests:", err);
    } finally {
      setRefreshingTrekkers(false);
    }
  }, []);

  const handleApproveTrekker = async (tripId, userId) => {
    const res = await approveTrekker(tripId, userId, activeAdmin?.email || DEMO_ADMIN_EMAIL);
    if (res?.success) {
      await loadPendingTrekkers();
      return { success: true };
    }
    return res;
  };

  const handleRemoveTrekker = async (tripId, userId) => {
    const res = await removeTrekker(tripId, userId, activeAdmin?.email || DEMO_ADMIN_EMAIL);
    if (res?.success) {
      await loadPendingTrekkers();
      return { success: true };
    }
    return res;
  };

  const handleApproveAdmin = async (adminId) => {
    const res = await approveAdmin(adminId, activeAdmin?.email || DEMO_ADMIN_EMAIL);
    if (res?.success) {
      await loadPendingAdmins();
      try {
        const response = await fetch(`${AUTH_API_URL}/users`, { headers: authHeaders() });
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data?.users)) setFirestoreUsers(data.users);
        }
      } catch { }
      return { success: true };
    }
    return res;
  };

  const handleRejectAdmin = async (adminId) => {
    const res = await rejectAdmin(adminId, activeAdmin?.email || DEMO_ADMIN_EMAIL);
    if (res?.success) {
      await loadPendingAdmins();
      return { success: true };
    }
    return res;
  };

  const approvedAdmins = useMemo(() => {
    return firestoreUsers
      .filter((u) => {
        const email = (u.email || "").toLowerCase();
        const role = (u.role || "").toLowerCase();
        return role === "admin" || email === DEMO_ADMIN_EMAIL;
      })
      .filter((u) => u.status !== "pending_approval" && u.status !== "rejected");
  }, [firestoreUsers]);

  useEffect(() => {
    loadPendingAdmins();
    loadPendingTrekkers();
    // 60s keeps the approval queue fresh without draining the Firestore
    // read quota (the console can stay open for hours).
    const interval = setInterval(() => {
      loadPendingAdmins();
      loadPendingTrekkers();
    }, 60000);
    return () => clearInterval(interval);
  }, [loadPendingAdmins, loadPendingTrekkers]);

  useEffect(() => {
    // 1. Live Firestore real-time listener for users
    const unsubscribe = subscribeToUsers((usersList) => {
      if (Array.isArray(usersList) && usersList.length > 0) {
        setFirestoreUsers(usersList.map(u => ({
          ...u,
          name: u.name || u.displayName || "Unknown User",
          avatar: u.avatar || (u.name || u.displayName || "EU").slice(0, 2).toUpperCase(),
          color: Array.isArray(u.color) && u.color.length === 2 ? u.color : ["#E6F1FB", "#0C447C"],
        })));
      }
    });

    // 2. Also fetch from backend as fallback
    let cancelled = false;
    const loadUsers = async () => {
      try {
        const response = await fetch(`${AUTH_API_URL}/users`, { headers: authHeaders() });
        if (response.status === 401) {
          // Session restored from localStorage without a valid API token.
          // Force a clean re-login instead of silently showing stale data.
          setAdminToken(null);
          if (!cancelled) handleLogout();
          return;
        }
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled && Array.isArray(data?.users) && data.users.length > 0) {
          setFirestoreUsers(data.users);
        }
      } catch {
        // Backend unreachable — keep whatever live Firestore data we have.
      }
    };

    loadUsers();
    // 5 minutes: the operator roster is not time-critical and the whole
    // project shares one daily Firestore read quota.
    const refresh = setInterval(loadUsers, 300000);
    return () => {
      cancelled = true;
      clearInterval(refresh);
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const handleLogin = (adminUser) => {
    const adminObj = adminUser || { email: DEMO_ADMIN_EMAIL, name: "Super Admin", role: "admin" };
    setActiveAdmin(adminObj);
    try {
      const { token, ...session } = adminObj;
      if (token) setAdminToken(token);
      localStorage.setItem("margsutra_admin_session", JSON.stringify(session));
    } catch { }
    setLoggedIn(true);
  };

  const handleLogout = () => {
    try {
      localStorage.removeItem("margsutra_admin_session"); localStorage.removeItem("coordage_admin_session");
      setAdminToken(null);
    } catch { }
    setActiveAdmin(null);
    setLoggedIn(false);
  };

  if (!loggedIn) return <PageAdminAuth onLogin={handleLogin} />;

  const pages = {
    dashboard: <PageDashboard navigate={navigate} users={displayUsers} pendingAdmins={pendingAdmins} pendingTrekkers={pendingTrekkers} />,
    "all-users": <PageAllUsers users={displayUsers} navigate={navigate} />,
    "trip-rosters": <PageTripRosters
      defaultTab="expeditions"
      pendingTrekkers={pendingTrekkers}
      onApprove={handleApproveTrekker}
      onRemove={handleRemoveTrekker}
      refreshing={refreshingTrekkers}
      onRefresh={loadPendingTrekkers}
      admins={displayUsers.filter((u) => (u.role || "").toLowerCase() === "admin")}
      currentAdmin={activeAdmin}
    />,
    "admin-approvals": <PageAdminApprovals
      pendingAdmins={pendingAdmins}
      approvedAdmins={approvedAdmins}
      onApprove={handleApproveAdmin}
      onReject={handleRejectAdmin}
      refreshing={refreshingPending}
      onRefresh={loadPendingAdmins}
      pendingTrekkers={pendingTrekkers}
      onApproveTrekker={handleApproveTrekker}
      onDenyTrekker={handleRemoveTrekker}
      onReviewTrekkers={() => setPage("trip-rosters")}
    />,
    "device-tracking": <PageDeviceTracking users={displayUsers} connectionState={connectionState} />,
    "weather-console": <PageMountainWeather />,
    "live-tracking": <PageLiveTracking navigate={navigate} users={displayUsers} connectionState={connectionState} error={error} />,
    "safety-protocol": <PageTripRosters
      defaultTab="protocols"
      pendingTrekkers={pendingTrekkers}
      onApprove={handleApproveTrekker}
      onRemove={handleRemoveTrekker}
      refreshing={refreshingTrekkers}
      onRefresh={loadPendingTrekkers}
      admins={displayUsers.filter((u) => (u.role || "").toLowerCase() === "admin")}
      currentAdmin={activeAdmin}
    />,
    "sos-navigation": (
      <PageSOSNavigation
        users={displayUsers}
        sosEvents={allSosEvents}
        onResolveSOS={handleResolveSOS}
        onTriggerDemo={handleTriggerDemoSOS}
        onAcknowledge={handleAcknowledgeSOS}
        onBroadcast={handleBroadcastAlert}
        acknowledgedMap={ackedSos}
        sosFeedLoaded={sosFeedLoaded}
        teamSize={Math.max(firestoreUsers.length, 1)}
        teamName={myTeam?.name}
        teamCode={myTeam?.code}
      />
    ),

    // Backward-compatible fallbacks
    "weather-admin": <PageMountainWeather />,
    "weather-maps": <PageMountainWeather />,
  };

  return (
    <div className="admin-shell" style={{ display: "grid", gridTemplateColumns: "244px 1fr", minHeight: "100vh", background: C.bg, fontFamily: "var(--font-sans)", color: C.text }}>
      {/* Sidebar — vertical control panel (drawer on small screens) */}
      <aside className={`admin-sidebar${navOpen ? " nav-open" : ""}`} style={{ background: C.sidebar, display: "flex", flexDirection: "column", borderRight: `1px solid ${C.border}` }}>
        <div className="admin-brand" style={{ padding: "18px 16px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(59,130,246,0.15)", border: `1px solid rgba(59,130,246,0.3)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke={C.accent} strokeWidth="1.5" /><circle cx="12" cy="12" r="4" stroke={C.accent} strokeWidth="1.5" /><circle cx="12" cy="12" r="1.5" fill={C.accent} /></svg>
          </div>
          <div style={{ minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 600, color: C.text, letterSpacing: "0.03em" }}>Margsutra <span style={{ color: C.accent }}>Admin</span></div><div style={{ fontSize: 10, color: C.muted2 }}>Control panel v3.0</div></div>
          <button className="admin-drawer-close" onClick={() => setNavOpen(false)} aria-label="Close menu">✕</button>
        </div>
        <div className="admin-profile" style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(59,130,246,0.18)", color: C.accent, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {(activeAdmin?.name || "SA").slice(0, 2).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activeAdmin?.name || "Super Admin"}</div>
            <div style={{ fontSize: 10, color: C.muted2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activeAdmin?.email || DEMO_ADMIN_EMAIL}</div>
          </div>
          {activeSOS > 0 && <div style={{ marginLeft: "auto", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "50%", width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: C.red, fontWeight: 700 }}>{activeSOS}</div>}
        </div>
        <nav className="admin-nav" style={{ flex: 1, overflowY: "auto", padding: "10px 0" }}>
          {NAV.map(({ section, items }) => (
            <div key={section} className="admin-nav-section">
              <div style={{ fontSize: 9, color: C.muted2, padding: "10px 16px 4px", letterSpacing: "0.12em", textTransform: "uppercase" }}>{section}</div>
              {items.map(item => {
                const active = page === item.id;
                const isSosNav = item.id === "sos-navigation";
                const isApprovals = item.id === "admin-approvals";
                return (
                  <div key={item.id} className="admin-nav-item" onClick={() => { setPage(item.id); setNavOpen(false); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", cursor: "pointer",
                      borderLeft: `2px solid ${active ? (isSosNav ? C.red : C.accent) : "transparent"}`,
                      background: active ? (isSosNav ? "rgba(239,68,68,0.1)" : "rgba(59,130,246,0.1)") : "transparent",
                      transition: "background 0.15s"
                    }}>
                    <span style={{ fontSize: 15, width: 18, textAlign: "center", flexShrink: 0 }}>{item.icon}</span>
                    <span style={{ fontSize: 12, color: active ? C.text : isSosNav ? "rgba(252,165,165,0.8)" : C.muted, fontWeight: active ? 500 : 400 }}>{item.label}</span>
                    {isSosNav && activeSOS > 0 && <div style={{ marginLeft: "auto", background: "rgba(239,68,68,0.2)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: "1px 7px", fontSize: 9, color: C.red, fontWeight: 700 }}>LIVE</div>}
                    {isApprovals && pendingAdmins.length > 0 && <div style={{ marginLeft: "auto", background: "rgba(245,158,11,0.2)", border: "1px solid rgba(245,158,11,0.35)", borderRadius: 10, padding: "1px 7px", fontSize: 9, color: C.amber, fontWeight: 700 }}>{pendingAdmins.length} PENDING</div>}
                    {isApprovals && pendingTrekkers.length > 0 && <div style={{ marginLeft: "auto", background: "rgba(16,185,129,0.2)", border: "1px solid rgba(16,185,129,0.35)", borderRadius: 10, padding: "1px 7px", fontSize: 9, color: "#6ee7b7", fontWeight: 700 }}>{pendingTrekkers.length} PENDING</div>}
                  </div>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="admin-footer" style={{ padding: "12px 16px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 10, color: C.muted2 }}>© 2026 Margsutra</span>
          <button onClick={handleLogout} style={{ fontSize: 11, color: C.muted, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>Sign out</button>
        </div>
      </aside>

      {/* Backdrop for the mobile drawer */}
      <div className={`admin-backdrop${navOpen ? "" : " nav-closed"}`} onClick={() => setNavOpen(false)} />

      {/* Main content container */}
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0, height: "100%" }}>
        {/* Compact top bar (small screens only) */}
        <div className="admin-mobile-bar">
          <button className="admin-menu-btn" onClick={() => setNavOpen(true)} aria-label="Open menu">☰</button>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="admin-mobile-title">Margsutra Admin</div>
            <div className="admin-mobile-sub">
              {activeSOS > 0
                ? `${activeSOS} active SOS · ${unacknowledgedSOSCount > 0 ? "awaiting acknowledgement" : "acknowledged"}`
                : "Expedition Command & SAR"}
            </div>
          </div>
          {activeSOS > 0 && (
            <button
              onClick={() => { setPage("sos-navigation"); setNavOpen(false); }}
              style={{
                background: unacknowledgedSOSCount > 0 ? "linear-gradient(135deg,#ef4444,#b91c1c)" : "rgba(245,158,11,0.18)",
                border: unacknowledgedSOSCount > 0 ? "none" : "1px solid rgba(245,158,11,0.45)",
                color: unacknowledgedSOSCount > 0 ? "#fff" : "#fcd34d",
                borderRadius: 10, padding: "8px 12px", fontSize: 11, fontWeight: 800,
                cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
                animation: unacknowledgedSOSCount > 0 ? "ud-sos-blink 1.2s infinite" : "none",
              }}
            >
              {unacknowledgedSOSCount > 0 ? "🚨 SOS" : "🛰 SOS"}
            </button>
          )}
        </div>

        {activeSOS > 0 && (
          <div
            onClick={() => setPage("sos-navigation")}
            style={{
              background: unacknowledgedSOSCount > 0
                ? "linear-gradient(90deg, #7f1d1d 0%, #dc2626 50%, #991b1b 100%)"
                : "linear-gradient(90deg, #78350f 0%, #b45309 50%, #78350f 100%)",
              color: "#ffffff",
              padding: "12px 24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 10,
              cursor: "pointer",
              boxShadow: unacknowledgedSOSCount > 0 ? "0 6px 25px rgba(220, 38, 38, 0.6)" : "0 4px 18px rgba(180, 83, 9, 0.45)",
              zIndex: 99999,
              animation: unacknowledgedSOSCount > 0 ? "ud-sos-blink 1.2s infinite" : "none",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ fontSize: 26 }}>🚨</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: "0.04em" }}>
                  {unacknowledgedSOSCount > 0
                    ? `EMERGENCY DISTRESS BEACON ACTIVE · ${allSosEvents.find(e => e.status === "active")?.name || "Anirban Panda"} IN DISTRESS`
                    : `BEACON ACKNOWLEDGED · ${activeSOS} INCIDENT${activeSOS > 1 ? "S" : ""} UNDER COMMAND CONTROL`}
                </div>
                <div style={{ fontSize: 12, opacity: 0.95 }}>
                  {unacknowledgedSOSCount > 0
                    ? "Telemetry received from field · Realtime SAR Incident Dispatch console activated"
                    : "Alarm silenced by the duty officer · dispatch a unit, then stand down when the trekker is safe"}
                </div>
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setPage("sos-navigation");
              }}
              style={{
                background: "#ffffff",
                color: unacknowledgedSOSCount > 0 ? "#b91c1c" : "#92400e",
                border: "none",
                borderRadius: 8,
                padding: "8px 18px",
                fontSize: 13,
                fontWeight: 900,
                cursor: "pointer",
                boxShadow: "0 2px 10px rgba(0,0,0,0.3)",
              }}
            >
              {unacknowledgedSOSCount > 0 ? "🚨 VIEW RESCUE DISPATCH HUD →" : "🛰 OPEN DISPATCH HUD →"}
            </button>
          </div>
        )}

        <main className="admin-main" style={{ flex: 1, overflow: "auto", padding: 24 }}>
          <PageErrorBoundary key={page}>
            {pages[page] || <div style={{ color: C.muted }}>Page not found.</div>}
          </PageErrorBoundary>
        </main>
      </div>
    </div>
  );
}
