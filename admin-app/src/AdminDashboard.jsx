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
  triggerDemoSOSEvent,
} from "./services/firebase";
import {
  calculateDistanceMeters,
  formatDistance,
  RAJMACHI_ADMIN,
  RAJMACHI_MEMBERS,
} from "./services/expeditionTeam";

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
  {id:"DEV001",name:"iPhone 15 Pro",user:"Anirban Panda",type:"phone",battery:88,signal:"strong",gps:true,sos:true,lat:18.8286,lon:73.3986},
  {id:"DEV002",name:"Garmin Instinct 2 Solar",user:"Anirban Panda",type:"watch",battery:92,signal:"strong",gps:true,sos:true,lat:18.8286,lon:73.3986},
  {id:"DEV003",name:"Apple Watch Ultra 2",user:"Rohan Sharma",type:"watch",battery:78,signal:"strong",gps:true,sos:true,lat:18.8271,lon:73.3971},
  {id:"DEV004",name:"Polar H10 Chest Sensor",user:"Pooja Iyer",type:"sensor",battery:82,signal:"strong",gps:true,sos:true,lat:18.8256,lon:73.3958},
  {id:"DEV005",name:"Coros Vertix 2",user:"Tanmay Deshmukh",type:"watch",battery:71,signal:"strong",gps:true,sos:true,lat:18.8242,lon:73.3945},
  {id:"DEV006",name:"Suunto 9 Peak",user:"Kavita Verma",type:"watch",battery:64,signal:"strong",gps:true,sos:true,lat:18.8229,lon:73.3932},
];

const BT_DEVICES = [
  {id:"BT001",name:"Garmin Instinct 2 Solar",mac:"A4:C1:38:1F:22:B5",rssi:-42,type:"watch",paired:true,user:"Anirban Panda"},
  {id:"BT002",name:"Apple Watch Ultra 2",mac:"98:B6:E9:12:43:A0",rssi:-55,type:"watch",paired:true,user:"Rohan Sharma"},
  {id:"BT003",name:"Polar H10 Chest Strap",mac:"00:22:D0:AA:3C:88",rssi:-48,type:"sensor",paired:true,user:"Pooja Iyer"},
  {id:"BT004",name:"Coros Vertix 2",mac:"7C:64:56:D8:3A:F1",rssi:-62,type:"watch",paired:true,user:"Tanmay Deshmukh"},
  {id:"BT005",name:"Suunto 9 Peak",mac:"B8:27:EB:4F:91:22",rssi:-69,type:"watch",paired:true,user:"Kavita Verma"},
  {id:"BT006",name:"Garmin InReach Mini 2",mac:"C0:38:96:E1:55:04",rssi:-36,type:"satellite",paired:true,user:"Ajay Saini"},
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
  {id:"P001",title:"Arrival & check-in protocol",body:"Upon arriving at the trek base, register at the check-in kiosk. Confirm your emergency contacts and ensure your device GPS is active.",status:"published",updated:"Apr 10, 2026",author:"Admin"},
  {id:"P002",title:"Daily check-in rules",body:"Send a live-status ping every 4 hours during active trekking. If no ping is received within 6 hours, the system triggers an automatic welfare check.",status:"published",updated:"Apr 8, 2026",author:"Admin"},
  {id:"P003",title:"Offline & no-signal zones",body:"Carry a LoRa-enabled satellite communicator when entering zones marked orange on your map. Pre-download offline maps before departure.",status:"draft",updated:"Apr 11, 2026",author:"Admin"},
  {id:"P004",title:"SOS trigger procedure",body:"Press and hold the SOS button for 3 seconds to prevent accidental triggers. The system broadcasts your GPS coordinates and medical profile to the nearest rescue team.",status:"published",updated:"Mar 28, 2026",author:"Admin"},
  {id:"P005",title:"Medical emergency guidelines",body:"Your blood group and medical conditions are auto-shared with any dispatched rescue team. Use the medical alert shortcut on your dashboard before triggering SOS.",status:"draft",updated:"Apr 9, 2026",author:"Admin"},
];

const FEATURES = ["Weather","Weather Maps","Join Trip","Safety Protocol","Device Connect","Emergency SOS","Live Navigation","Bluetooth Devices"];

const Pill = ({ color, children }) => {
  const map = { green:{bg:"rgba(34,197,94,0.12)",text:"#86efac"},red:{bg:"rgba(239,68,68,0.12)",text:"#fca5a5"},amber:{bg:"rgba(245,158,11,0.12)",text:"#fcd34d"},blue:{bg:"rgba(59,130,246,0.14)",text:"#93c5fd"},purple:{bg:"rgba(167,139,250,0.12)",text:"#c4b5fd"},teal:{bg:"rgba(20,184,166,0.12)",text:"#5eead4"},gray:{bg:"rgba(255,255,255,0.07)",text:"rgba(180,210,245,0.6)"} };
  const s = map[color] || map.gray;
  return <span style={{fontSize:11,padding:"2px 9px",borderRadius:20,fontWeight:500,background:s.bg,color:s.text}}>{children}</span>;
};
const Card = ({ children, style }) => <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"16px 18px",...style}}>{children}</div>;
const StatCard = ({ label, value, sub, color=C.accent, icon }) => (
  <Card style={{marginBottom:0}}>
    <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:8}}>
      <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em"}}>{label}</div>
      {icon && <span style={{fontSize:18}}>{icon}</span>}
    </div>
    <div style={{fontSize:26,fontWeight:700,color,marginBottom:2}}>{value}</div>
    {sub && <div style={{fontSize:11,color:C.muted2}}>{sub}</div>}
  </Card>
);
const TH = ({ children, style }) => <th style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",padding:"10px 12px",textAlign:"left",fontWeight:500,borderBottom:`1px solid ${C.border}`,...style}}>{children}</th>;
const TD = ({ children, style }) => <td style={{fontSize:13,padding:"11px 12px",color:C.text,borderBottom:`1px solid ${C.border}`,verticalAlign:"middle",...style}}>{children}</td>;
const Avatar = ({ initials, bg, text, size=32 }) => <div style={{width:size,height:size,borderRadius:"50%",background:bg||"rgba(59,130,246,0.18)",color:text||C.accent,fontSize:size*0.35,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{initials}</div>;
const Toggle = ({ on, onChange }) => <div onClick={onChange} style={{width:36,height:20,borderRadius:10,background:on?C.accent:"rgba(255,255,255,0.12)",position:"relative",cursor:"pointer",transition:"background 0.25s",flexShrink:0}}><div style={{position:"absolute",top:3,left:on?19:3,width:14,height:14,borderRadius:"50%",background:"#fff",transition:"left 0.25s"}}/></div>;
const Input = ({ value, onChange, placeholder, type="text", style:sx }) => <input type={type} value={value} onChange={onChange} placeholder={placeholder} style={{height:36,width:"100%",background:"rgba(255,255,255,0.04)",border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:13,padding:"0 12px",fontFamily:"inherit",boxSizing:"border-box",outline:"none",...sx}}/>;
const Btn = ({ children, onClick, variant="default", style:sx }) => {
  const v = { primary:{background:C.accent,color:"#fff",border:"none"}, danger:{background:C.red,color:"#fff",border:"none"}, success:{background:"rgba(34,197,94,0.15)",color:C.green,border:`1px solid rgba(34,197,94,0.3)`}, default:{background:"rgba(255,255,255,0.05)",color:C.text,border:`1px solid ${C.border}`}, ghost:{background:"transparent",color:C.muted,border:"none"} };
  return <button onClick={onClick} style={{padding:"7px 16px",borderRadius:8,fontSize:12,fontWeight:500,cursor:"pointer",fontFamily:"inherit",display:"inline-flex",alignItems:"center",gap:6,...v[variant],...sx}}>{children}</button>;
};
const PageHeader = ({ title, sub, right }) => (
  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:22}}>
    <div><h1 style={{fontSize:20,fontWeight:600,color:C.text,margin:0}}>{title}</h1>{sub && <div style={{fontSize:12,color:C.muted,marginTop:3}}>{sub}</div>}</div>
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

const makeDotIcon = (L, color, size=12, pulse=false, ringColor=null) => L.divIcon({
  className: "",
  html: `<div style="position:relative;width:${size+16}px;height:${size+16}px;">
    ${pulse ? `<div style="position:absolute;top:50%;left:50%;width:${size+10}px;height:${size+10}px;border-radius:50%;border:2.5px solid ${ringColor||color};animation:llm-pulse 1.6s ease-out infinite;"></div>` : ""}
    <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 0 0 4px ${color}44,0 2px 8px rgba(0,0,0,.5);z-index:1;"></div>
  </div>`,
  iconSize: [size+16, size+16],
  iconAnchor: [(size+16)/2, (size+16)/2],
  popupAnchor: [0, -(size/2+10)],
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

const LiveMap = ({ points=[], teams=[], height=380, showPulse=true, routeFrom=null, routeTo=null, routePath=null, zoom:_zoom, onZoom }) => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const routeRef = useRef(null);
  const [ready, setReady] = useState(!!window.L);

  useEffect(() => { injectLeafletStyles(); ensureLeaflet(() => setReady(true)); }, []);

  useEffect(() => {
    if (!ready || !containerRef.current || mapRef.current) return;
    const L = window.L;
    const map = L.map(containerRef.current, { center:[20.5937,78.9629], zoom:5, zoomControl:true, attributionControl:true, preferCanvas:true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution:"© <a href='https://www.openstreetmap.org/copyright' style='color:#64748b'>OpenStreetMap</a>", maxZoom:19 }).addTo(map);
    mapRef.current = map;
    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, [ready]);

  const pointsKey = JSON.stringify(points.map(p=>({id:p.id,lat:p.lat,lon:p.lon,status:p.status})));
  const teamsKey = JSON.stringify(teams.map(t=>({id:t.id,lat:t.lat,lon:t.lon,status:t.status})));

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

  const routeKey = JSON.stringify({ rf: routeFrom ? {lat:routeFrom.lat,lon:routeFrom.lon} : null, rt: routeTo ? {lat:routeTo.lat,lon:routeTo.lon} : null, rp: Array.isArray(routePath) ? routePath.slice(0, 8) : null });

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const L = window.L; const map = mapRef.current;
    if (routeRef.current) { map.removeLayer(routeRef.current); routeRef.current = null; }

    if ((routeFrom && routeTo) || Array.isArray(routePath)) {
      const from = routeFrom && [routeFrom.lat, routeFrom.lon];
      const to = routeTo && [routeTo.lat, routeTo.lon];
      const path = Array.isArray(routePath) && routePath.length > 1 ? routePath.map(([lon, lat]) => [lat, lon]) : [from, to].filter(Boolean);
      const shadow = L.polyline(path, { color:"#f59e0b", weight:6, opacity:0.18 }).addTo(map);
      const line = L.polyline(path, { color:"#f59e0b", weight:3, opacity:0.9, dashArray:"14 10", dashOffset:"0", className:"llm-route-line" }).addTo(map);
      const pulse = to ? L.circleMarker(to, { radius:14, color:"#ef4444", weight:2, opacity:0.5, fill:false, className:"llm-sos-ring" }).addTo(map) : null;
      const group = pulse ? L.layerGroup([shadow, line, pulse]).addTo(map) : L.layerGroup([shadow, line]).addTo(map);
      routeRef.current = group;
      map.fitBounds(path, { padding:[50,50], maxZoom:14 });
    }
  }, [ready, routeKey]);

  return (
    <div style={{ background:"#080f1a", borderRadius:12, overflow:"hidden", border:`1px solid ${C.border}`, position:"relative" }}>
      <div style={{ position:"absolute", top:10, left:10, zIndex:900, background:"rgba(8,15,26,0.92)", border:"1px solid rgba(80,140,220,0.22)", borderRadius:9, padding:"9px 13px", pointerEvents:"none" }}>
        {[[C.accent, "Active user", "dot"], [C.red, "SOS alert", "dot"], [C.amber, "SOS team", "rect"], [C.amber, "Route", "dash"]].map(([col, label, type]) => (
          <div key={label} style={{ display:"flex", alignItems:"center", gap:7, marginBottom:5, fontSize:10, color:C.muted }}>
            {type==="dot" && <div style={{ width:9, height:9, borderRadius:"50%", background:col, border:"1.5px solid #fff", flexShrink:0 }}/>} 
            {type==="rect" && <div style={{ width:13, height:9, borderRadius:3, background:col, flexShrink:0 }}/>} 
            {type==="dash" && <div style={{ width:14, borderTop:`2.5px dashed ${col}`, flexShrink:0 }}/>} 
            {label}
          </div>
        ))}
      </div>
      {onZoom && (
        <div style={{ position:"absolute", top:10, right:10, zIndex:900, display:"flex", flexDirection:"column", gap:4 }}>
          <button onClick={()=>{ mapRef.current?.zoomIn(); onZoom(1); }} style={{ width:30, height:30, background:"rgba(11,20,34,0.92)", border:`1px solid ${C.border}`, borderRadius:7, color:C.text, fontSize:17, cursor:"pointer", lineHeight:1 }}>+</button>
          <button onClick={()=>{ mapRef.current?.zoomOut(); onZoom(-1); }} style={{ width:30, height:30, background:"rgba(11,20,34,0.92)", border:`1px solid ${C.border}`, borderRadius:7, color:C.text, fontSize:17, cursor:"pointer", lineHeight:1 }}>−</button>
        </div>
      )}
      {!ready ? <div style={{ height, background:"#08101e", display:"flex", alignItems:"center", justifyContent:"center", color:C.muted, fontSize:13, gap:8 }}><span style={{ animation:"spin 1s linear infinite", display:"inline-block" }}>⏳</span> Loading map engine…</div> : <div ref={containerRef} style={{ height }} />}
    </div>
  );
};

const PageSOSNavigation = ({
  users = USERS,
  sosEvents = [],
  onResolveSOS,
  onTriggerDemo,
}) => {
  // 1. Separate Active Distress Incidents from Resolved Incidents
  const activeIncidents = useMemo(() => {
    const list = [];
    const seenUserIds = new Set();

    // From sosEvents where status === 'active'
    sosEvents.forEach((ev) => {
      if (!ev) return;
      if (ev.status === "active") {
        const u = users.find((item) => item.id === ev.userId || item.name === ev.userName || item.name === ev.name);
        const userId = ev.userId || u?.id || ev.id;
        seenUserIds.add(userId);

        list.push({
          id: ev.id || `sos-${userId}`,
          eventId: ev.id,
          userId: userId,
          user: ev.userName || ev.name || u?.name || "Trekker in Distress",
          city: ev.city || (u?.city ? `${u.city} (Trail)` : "Rajmachi Fort Trail (Stream Crossing)"),
          tripName: ev.tripName || "Rajmachi Fort Expedition",
          tripCode: ev.tripCode || "RAJM26",
          lat: typeof ev.lat === "number" ? ev.lat : (u?.lat ?? 18.8286),
          lon: typeof ev.lon === "number" ? ev.lon : (u?.lon ?? 73.3986),
          altitude: ev.altitude || u?.altitude || 829,
          blood: ev.blood || u?.blood || "B+",
          medical: ev.medical || u?.medical || "None reported",
          phone: ev.phone || u?.phone || "+91 86375 40813",
          ec: ev.ec || u?.ec || "Deepak Panda (Brother) · +91 91531 91902",
          time: ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : (ev.time || "Just now"),
          status: "active",
          type: ev.type || "Manual SOS Beacon",
          priority: ev.priority || "critical",
          vitals: ev.vitals || { hr: 114, spo2: 96, alt: 829, battery: 88 },
        });
      }
    });

    // Also check live users with status === 'sos'
    users.forEach((u) => {
      if (u.status === "sos" && !seenUserIds.has(u.id)) {
        seenUserIds.add(u.id);
        list.push({
          id: u.activeSosId || `sos-${u.id}`,
          eventId: u.activeSosId,
          userId: u.id,
          user: u.name,
          city: u.city ? `${u.city} (Trail)` : "Rajmachi Fort Trail (Sector 3)",
          tripName: u.tripName || "Rajmachi Fort Expedition",
          tripCode: u.tripCode || "RAJM26",
          lat: typeof u.lat === "number" ? u.lat : 18.8286,
          lon: typeof u.lon === "number" ? u.lon : 73.3986,
          altitude: u.altitude || 829,
          blood: u.blood || "B+",
          medical: u.medical || "None reported",
          phone: u.phone || "+91 86375 40813",
          ec: u.ec || "Emergency Contact · +91 91531 91902",
          time: u.lastSosAt ? new Date(u.lastSosAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Just now",
          status: "active",
          type: "Manual SOS Beacon",
          priority: "critical",
          vitals: { hr: 114, spo2: 96, alt: u.altitude || 829, battery: 88 },
        });
      }
    });

    return list;
  }, [sosEvents, users]);

  // 2. Resolved & Stand-down Historical Incidents Archive
  const resolvedIncidents = useMemo(() => {
    const list = [];
    sosEvents.forEach((ev) => {
      if (!ev) return;
      if (ev.status === "resolved" || ev.resolution) {
        const u = users.find((item) => item.id === ev.userId || item.name === ev.userName || item.name === ev.name);
        list.push({
          id: ev.id,
          userId: ev.userId || u?.id,
          user: ev.userName || ev.name || u?.name || "Trekker",
          tripName: ev.tripName || "Rajmachi Fort Expedition",
          city: ev.city || "Rajmachi Fort Trail",
          lat: ev.lat,
          lon: ev.lon,
          resolvedAt: ev.resolvedAt ? new Date(ev.resolvedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : (ev.updatedAt ? new Date(ev.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Resolved"),
          resolution: ev.resolution === "user_cancelled" ? "Cancelled by Trekker (Self-Resolved)" : (ev.resolutionNotes || "SAR Stand Down Executed"),
          resolvedBy: ev.resolvedBy || (ev.resolution === "user_cancelled" ? "Trekker (App Button)" : "SAR Command Admin"),
          time: ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : (ev.time || "Logged"),
          status: "resolved",
          type: ev.type || "SOS Beacon",
        });
      }
    });

    if (list.length === 0) {
      return SOS_EVENTS;
    }
    return list;
  }, [sosEvents, users]);

  // Selected active incident
  const [selectedId, setSelectedId] = useState(null);
  const selectedSOS = useMemo(() => {
    if (activeIncidents.length === 0) return null;
    if (selectedId) {
      const found = activeIncidents.find((i) => i.id === selectedId || i.userId === selectedId);
      if (found) return found;
    }
    return activeIncidents[0];
  }, [activeIncidents, selectedId]);

  // Team Assignment State
  const [teamsState, setTeamsState] = useState(SOS_TEAMS);
  const [navMode, setNavMode] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [teamPos, setTeamPos] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [voiceOn, setVoiceOn] = useState(true);
  const [calloutMsg, setCalloutMsg] = useState("");
  const [resolvingModal, setResolvingModal] = useState(false);
  const [resolutionNote, setResolutionNote] = useState("Victim safely assisted by Lead Guide Ajay Saini; safe and escorted back to base camp");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync teams when activeSOS changes
  useEffect(() => {
    if (!selectedSOS) {
      setTeamsState((prev) =>
        prev.map((t) => ({ ...t, status: "standby", speed: "0 km/h", assignedTo: null }))
      );
    } else {
      setTeamsState((prev) =>
        prev.map((t, idx) =>
          idx === 0
            ? { ...t, status: "deployed", speed: "35 km/h", assignedTo: selectedSOS.id }
            : { ...t, status: "standby", speed: "0 km/h", assignedTo: null }
        )
      );
    }
  }, [selectedSOS]);

  const assignedTeam = selectedSOS ? teamsState.find((t) => t.assignedTo === selectedSOS.id) || teamsState[0] : null;
  const steps = selectedSOS ? buildFallbackRoute(selectedSOS) : [];
  const etaVal = assignedTeam ? parseInt(assignedTeam.eta) || 14 : 14;
  const remainingEta = Math.max(0, etaVal - Math.floor(elapsed / 60));

  // Animate team position toward SOS target
  useEffect(() => {
    if (!selectedSOS || !assignedTeam || assignedTeam.status !== "deployed") return;
    setTeamPos({ lat: assignedTeam.lat, lon: assignedTeam.lon });
    const t = setInterval(() => {
      setTeamPos((prev) => {
        if (!prev) return prev;
        const dlat = (selectedSOS.lat - prev.lat) * 0.015;
        const dlon = (selectedSOS.lon - prev.lon) * 0.015;
        return { lat: prev.lat + dlat, lon: prev.lon + dlon };
      });
      setElapsed((e) => e + 4);
    }, 1000);
    return () => clearInterval(t);
  }, [selectedSOS, assignedTeam]);

  // Turn-by-turn auto-advance
  useEffect(() => {
    if (!navMode) return;
    const t = setInterval(() => setCurrentStep((s) => Math.min(s + 1, steps.length - 1)), 8000);
    return () => clearInterval(t);
  }, [navMode, steps.length]);

  const distToTarget = selectedSOS && teamPos ? (
    Math.sqrt(Math.pow((selectedSOS.lat - teamPos.lat) * 111, 2) + Math.pow((selectedSOS.lon - teamPos.lon) * 111, 2)).toFixed(1)
  ) : selectedSOS ? (
    (calculateDistanceMeters(RAJMACHI_ADMIN.lat, RAJMACHI_ADMIN.lon, selectedSOS.lat, selectedSOS.lon) / 1000).toFixed(1)
  ) : "—";

  const speedKmh = assignedTeam && assignedTeam.status === "deployed" ? parseInt(assignedTeam.speed) || 35 : 0;
  const compass = assignedTeam?.heading || 32;

  const handleDispatch = (teamId, sosId) => {
    setTeamsState((prev) =>
      prev.map((t) => (t.id === teamId ? { ...t, status: "deployed", speed: "35 km/h", assignedTo: sosId } : t))
    );
    setCalloutMsg("🚑 Rescue Unit assigned and en route to coordinates.");
    setTimeout(() => setCalloutMsg(""), 3500);
  };

  const handleStandDown = async () => {
    if (!selectedSOS) return;
    setIsSubmitting(true);
    try {
      if (onResolveSOS) {
        await onResolveSOS(selectedSOS.eventId || selectedSOS.id, selectedSOS.userId, resolutionNote);
      }
      setResolvingModal(false);
      setNavMode(false);
      setCalloutMsg(`✅ SAR Stand-down logged for ${selectedSOS.user}. Beacon cleared, user reset to active.`);
      setTimeout(() => setCalloutMsg(""), 5000);
    } catch (err) {
      console.error("Stand-down error:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTriggerDrill = async () => {
    setIsSubmitting(true);
    try {
      if (onTriggerDemo) {
        await onTriggerDemo();
      }
      setCalloutMsg("⚠️ Simulated SAR Emergency Drill activated! Dispatch radar locked on beacon.");
      setTimeout(() => setCalloutMsg(""), 4500);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVhfCheck = () => {
    setCalloutMsg("📻 VHF Tactical Link (156.800 MHz): Field Guide Ajay Saini reports signal 5x5. All trekkers safe in line-of-sight.");
    setTimeout(() => setCalloutMsg(""), 5000);
  };

  // ── Navigation Mode (fullscreen overlay) ──
  if (navMode && selectedSOS) {
    const step = steps[currentStep] || steps[0];
    const pct = ((currentStep) / (steps.length - 1)) * 100;
    return (
      <div style={{ position: "fixed", inset: 0, background: "#0a0f1e", zIndex: 200, display: "flex", flexDirection: "column", fontFamily: "inherit", color: C.text }}>
        {/* Top bar */}
        <div style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: C.red, boxShadow: `0 0 8px ${C.red}`, animation: "ping 1s infinite" }} />
            <span style={{ fontSize: 14, fontWeight: 700 }}>TACTICAL TURN-BY-TURN RESCUE NAVIGATION</span>
            <Pill color="red">TARGET: {selectedSOS.user}</Pill>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button onClick={() => setVoiceOn((v) => !v)} style={{ background: voiceOn ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.05)", border: `1px solid ${voiceOn ? C.accent : C.border}`, borderRadius: 8, padding: "6px 12px", color: voiceOn ? C.accent : C.muted, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
              {voiceOn ? "🔊 Voice Guidance On" : "🔇 Voice Off"}
            </button>
            <button onClick={() => setResolvingModal(true)} style={{ background: "rgba(34,197,94,0.2)", border: `1px solid ${C.green}`, borderRadius: 8, padding: "6px 14px", color: C.green, fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
              ✓ Stand Down SAR
            </button>
            <button onClick={() => { setNavMode(false); setCurrentStep(0); }} style={{ background: "rgba(239,68,68,0.15)", border: `1px solid rgba(239,68,68,0.3)`, borderRadius: 8, padding: "6px 14px", color: C.red, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
              ✕ Exit Navigation
            </button>
          </div>
        </div>

        {/* Main nav area */}
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 380px", overflow: "hidden" }}>
          {/* Simulated map view */}
          <div style={{ position: "relative", overflow: "hidden", background: "#0d1b2e" }}>
            <LiveMap
              points={users}
              teams={assignedTeam ? [{ ...assignedTeam, lat: teamPos?.lat || assignedTeam.lat, lon: teamPos?.lon || assignedTeam.lon }] : []}
              routeFrom={teamPos || assignedTeam}
              routeTo={selectedSOS}
              height={460}
            />

            {/* Compass */}
            <div style={{ position: "absolute", bottom: 24, right: 24, width: 68, height: 68, borderRadius: "50%", background: "rgba(8,15,26,0.92)", border: `2px solid ${C.border2}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="54" height="54" viewBox="0 0 50 50">
                <circle cx="25" cy="25" r="23" fill="none" stroke="rgba(80,140,220,0.2)" strokeWidth="1" />
                <g transform={`rotate(${compass},25,25)`}>
                  <polygon points="25,6 28,25 25,22 22,25" fill={C.red} />
                  <polygon points="25,44 28,25 25,28 22,25" fill="rgba(255,255,255,0.4)" />
                </g>
                <text x="25" y="13" textAnchor="middle" fontSize="7" fill={C.red} fontFamily="monospace" fontWeight="700">N</text>
                <text x="25" y="40" textAnchor="middle" fontSize="7" fill={C.muted} fontFamily="monospace">S</text>
                <text x="40" y="28" textAnchor="middle" fontSize="7" fill={C.muted} fontFamily="monospace">E</text>
                <text x="10" y="28" textAnchor="middle" fontSize="7" fill={C.muted} fontFamily="monospace">W</text>
              </svg>
            </div>

            {/* Speed indicator */}
            <div style={{ position: "absolute", bottom: 24, left: 24, background: "rgba(8,15,26,0.92)", border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 18px", textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: C.text, lineHeight: 1 }}>{speedKmh}</div>
              <div style={{ fontSize: 10, color: C.muted, letterSpacing: "0.1em" }}>KM/H</div>
            </div>
          </div>

          {/* Navigation panel */}
          <div style={{ background: "#0b1422", borderLeft: `1px solid ${C.border}`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Current instruction */}
            <div style={{ background: `linear-gradient(135deg,rgba(59,130,246,0.15),rgba(59,130,246,0.05))`, borderBottom: `1px solid ${C.border}`, padding: "20px 18px" }}>
              <div style={{ fontSize: 44, textAlign: "center", marginBottom: 10, lineHeight: 1 }}>{step?.icon}</div>
              <div style={{ fontSize: 15, fontWeight: 700, textAlign: "center", marginBottom: 4, color: C.text }}>{step?.instr}</div>
              {step?.road && <div style={{ fontSize: 12, color: C.muted, textAlign: "center" }}>{step.road}</div>}
            </div>

            {/* ETA / Distance */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: C.border }}>
              {[["ETA TO SCENE", `${remainingEta} min`, C.green], ["DISTANCE", `${distToTarget} km`, C.accent]].map(([l, v, col]) => (
                <div key={l} style={{ background: "#0b1422", padding: "14px 18px", textAlign: "center" }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: col }}>{v}</div>
                  <div style={{ fontSize: 10, color: C.muted, letterSpacing: "0.1em", marginTop: 2 }}>{l}</div>
                </div>
              ))}
            </div>

            {/* Progress bar */}
            <div style={{ padding: "10px 18px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.muted, marginBottom: 5 }}>
                <span>Step {currentStep + 1} of {steps.length}</span>
                <span>{Math.round(pct)}% complete</span>
              </div>
              <div style={{ height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 4 }}>
                <div style={{ height: "100%", borderRadius: 4, background: `linear-gradient(90deg,${C.accent},${C.green})`, width: `${pct}%`, transition: "width 0.5s" }} />
              </div>
            </div>

            {/* Turn-by-turn list */}
            <div style={{ flex: 1, overflowY: "auto", padding: "10px 0" }}>
              {steps.map((s, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 18px", background: i === currentStep ? "rgba(59,130,246,0.1)" : "transparent", borderLeft: `3px solid ${i === currentStep ? C.accent : "transparent"}`, transition: "background 0.3s" }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: i === currentStep ? "rgba(59,130,246,0.25)" : i < currentStep ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.05)", border: `1px solid ${i === currentStep ? C.accent : i < currentStep ? C.green : C.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0, color: i < currentStep ? C.green : C.text }}>
                    {i < currentStep ? "✓" : s.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: i === currentStep ? C.text : C.muted, fontWeight: i === currentStep ? 600 : 400 }}>{s.instr}</div>
                    <div style={{ fontSize: 10, color: C.muted2, marginTop: 2 }}>{s.dist}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* SOS Target info */}
            <div style={{ background: "rgba(239,68,68,0.08)", borderTop: `1px solid rgba(239,68,68,0.2)`, padding: "14px 18px" }}>
              <div style={{ fontSize: 10, color: "#fca5a5", letterSpacing: "0.1em", marginBottom: 6 }}>EMERGENCY TARGET · VICTIM TRIAGE</div>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{selectedSOS.user}</div>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>{selectedSOS.city} · {selectedSOS.altitude}m ASL</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                <Pill color="red">🩸 {selectedSOS.blood}</Pill>
                {selectedSOS.medical !== "None" && <Pill color="amber">⚕ {selectedSOS.medical}</Pill>}
              </div>
              <div style={{ fontSize: 11, color: C.muted }}>EC: {selectedSOS.ec}</div>
            </div>
          </div>
        </div>

        {/* Bottom controls */}
        <div style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", padding: "10px 20px", borderTop: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => setCurrentStep((s) => Math.max(0, s - 1))} style={{ padding: "8px 16px", background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
            ← Prev Waypoint
          </button>
          <button onClick={() => setCurrentStep((s) => Math.min(steps.length - 1, s + 1))} style={{ padding: "8px 16px", background: C.accent, border: "none", borderRadius: 8, color: "#fff", fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
            Next Waypoint →
          </button>
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 11, color: C.muted }}>
            Unit: <span style={{ color: C.amber, fontWeight: 600 }}>{assignedTeam?.name || "Team Alpha"}</span> · {assignedTeam?.vehicle} · VHF: {assignedTeam?.vhf}
          </div>
        </div>
      </div>
    );
  }

  // ── Stand Down Confirmation Modal ──
  const renderStandDownModal = () => {
    if (!resolvingModal || !selectedSOS) return null;
    return (
      <div style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)",
        backdropFilter: "blur(8px)", zIndex: 300, display: "flex",
        alignItems: "center", justifyContent: "center", padding: 20
      }}>
        <div style={{
          background: "#0d1b2e", border: `1px solid ${C.border2}`,
          borderRadius: 16, width: "100%", maxWidth: 520, padding: 24,
          boxShadow: "0 20px 50px rgba(0,0,0,0.7)"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: "rgba(34,197,94,0.15)", border: `1px solid ${C.green}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
              🛡️
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Execute SAR Stand-Down & Resolve Emergency</div>
              <div style={{ fontSize: 12, color: C.muted }}>Distressed Trekker: <strong style={{ color: C.text }}>{selectedSOS.user}</strong> ({selectedSOS.tripName})</div>
            </div>
          </div>

          <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginBottom: 14 }}>
            Executing Stand-Down will mark this emergency distress beacon as <strong style={{ color: C.green }}>resolved</strong> in Firestore, reset the trekker's status back to <strong style={{ color: C.green }}>Active/Safe</strong>, recall dispatched SAR units back to tactical standby, and archive the incident record.
          </p>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, color: C.muted2, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Resolution Notes & Incident Debrief</label>
            <textarea
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
              rows={3}
              style={{
                width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`,
                borderRadius: 8, padding: "10px 12px", color: C.text, fontSize: 12,
                fontFamily: "inherit", resize: "vertical"
              }}
            />
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
            {[
              "Victim safely assisted by Lead Guide Ajay Saini; safe and escorted back to base camp",
              "Trekker cancelled SOS beacon (Self-Resolved)",
              "Minor sprain treated on trail, proceeding to camp",
              "False alarm verified and cleared by dispatch",
            ].map((preset) => (
              <button
                key={preset}
                onClick={() => setResolutionNote(preset)}
                style={{
                  background: resolutionNote === preset ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${resolutionNote === preset ? C.accent : C.border}`,
                  borderRadius: 6, padding: "4px 8px", fontSize: 10, color: resolutionNote === preset ? C.accent : C.muted,
                  cursor: "pointer", fontFamily: "inherit"
                }}
              >
                + {preset.slice(0, 38)}…
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button
              onClick={() => setResolvingModal(false)}
              disabled={isSubmitting}
              style={{
                padding: "9px 18px", borderRadius: 8, background: "rgba(255,255,255,0.05)",
                border: `1px solid ${C.border}`, color: C.muted, fontSize: 12, cursor: "pointer", fontFamily: "inherit"
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleStandDown}
              disabled={isSubmitting}
              style={{
                padding: "9px 20px", borderRadius: 8, background: `linear-gradient(135deg, ${C.green}, #16a34a)`,
                border: "none", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit"
              }}
            >
              {isSubmitting ? "Stand-Down Executing…" : "✓ Stand Down SAR & Mark Safe"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ════════════════════════════════════════════════════════════════════════
  // VIEW A: ALL CLEAR / SAR TACTICAL STANDBY (0 Active Incidents)
  // ════════════════════════════════════════════════════════════════════════
  if (activeIncidents.length === 0) {
    return (
      <div>
        {renderStandDownModal()}

        <PageHeader
          title="Realtime SOS Command & SAR Dispatch"
          sub="Search & rescue tactical command — zero active distress alerts across Sahyadri trails"
          right={
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Pill color="green">🟢 ALL CLEAR · STANDBY</Pill>
              <Pill color="blue">📻 VHF 145.500 & 156.800 MHz</Pill>
            </div>
          }
        />

        {calloutMsg && (
          <div style={{ background: "rgba(34,197,94,0.12)", border: `1px solid rgba(34,197,94,0.35)`, borderRadius: 10, padding: "10px 16px", fontSize: 13, color: C.green, marginBottom: 14 }}>
            {calloutMsg}
          </div>
        )}

        {/* Tactical Readiness Banner */}
        <div style={{
          background: "linear-gradient(135deg, rgba(34,197,94,0.12), rgba(16,185,129,0.04))",
          border: `1px solid rgba(34,197,94,0.3)`,
          borderRadius: 14,
          padding: "16px 20px",
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 14
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(34,197,94,0.18)", border: `1px solid ${C.green}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
              🛡️
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.green, display: "flex", alignItems: "center", gap: 8 }}>
                SAR STATUS: ALL TRAILS NORMAL · OPERATIONAL MONITORING ACTIVE
              </div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                All expedition sectors secure. 0 active distress beacons. Mountain rescue teams staged at Khandala and Karjat safety posts. Field Guide Ajay Saini maintaining live escort on Rajmachi Fort trail.
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleTriggerDrill}
              disabled={isSubmitting}
              style={{
                padding: "8px 16px", borderRadius: 8, background: "rgba(239,68,68,0.15)",
                border: `1px solid rgba(239,68,68,0.35)`, color: "#fca5a5", fontSize: 12,
                fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6
              }}
            >
              🚨 Simulate SAR Emergency Drill
            </button>
            <button
              onClick={handleVhfCheck}
              style={{
                padding: "8px 16px", borderRadius: 8, background: "rgba(59,130,246,0.15)",
                border: `1px solid rgba(59,130,246,0.35)`, color: C.accent, fontSize: 12,
                fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6
              }}
            >
              📻 VHF Check with Guide Ajay Saini
            </button>
          </div>
        </div>

        {/* 4 KPI Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 18 }}>
          <StatCard label="Active SOS Distress Alerts" value="0" sub="All trails normal" color={C.green} icon="🛡️" />
          <StatCard label="SAR Teams on Standby" value="2 Units" sub="Khandala & Karjat Bases" color={C.accent} icon="🚑" />
          <StatCard label="VHF Tactical Radio SNR" value="100%" sub="145.500 MHz (Ch 1)" color={C.amber} icon="📻" />
          <StatCard label="Audited Incidents" value={`${resolvedIncidents.length} Closed`} sub="Complete audit trail" color={C.teal} icon="📋" />
        </div>

        {/* Main 2-Column Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1.7fr 1.3fr", gap: 16 }}>
          {/* LEFT: Tactical Trail Map & Staging Units */}
          <div>
            <Card style={{ padding: 0, overflow: "hidden", marginBottom: 14 }}>
              <div style={{ padding: "12px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Live Sector Overview & SAR Staging Bases</div>
                  <div style={{ fontSize: 11, color: C.muted }}>Rajmachi Fort Trail Corridor · Monitoring 6 registered trekkers</div>
                </div>
                <Pill color="green">● Telemetry Live</Pill>
              </div>
              <LiveMap points={users} teams={teamsState} height={380} zoom={zoom} onZoom={(d) => setZoom((z) => Math.max(0.5, Math.min(3, z + d * 0.5)))} />
            </Card>

            {/* Standby Deployment Units Card */}
            <Card>
              <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
                Search & Rescue Deployment Units (Standby Ready)
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {teamsState.map((t) => (
                  <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "rgba(255,255,255,0.02)", border: `1px solid ${C.border}`, borderRadius: 10 }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: C.green, boxShadow: `0 0 6px ${C.green}` }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{t.name}</div>
                      <div style={{ fontSize: 11, color: C.muted }}>Lead: {t.lead} · {t.members} Members · Vehicle: {t.vehicle}</div>
                      <div style={{ fontSize: 10, color: C.muted2, marginTop: 2 }}>Staging Base: {t.base} · Tactical VHF: {t.vhf}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <Pill color="green">STANDBY READY</Pill>
                      <div style={{ fontSize: 11, color: C.amber, marginTop: 4, fontWeight: 600 }}>ETA {t.eta}</div>
                    </div>
                  </div>
                ))}

                {/* Field Guide Unit */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "rgba(245,158,11,0.04)", border: `1px solid rgba(245,158,11,0.25)`, borderRadius: 10 }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: C.amber, boxShadow: `0 0 6px ${C.amber}` }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Field Guide Ajay Saini (Trail Escort Unit)</div>
                    <div style={{ fontSize: 11, color: C.muted }}>Equipped with Garmin InReach Mini 2 & Alpine First Aid trauma pack</div>
                    <div style={{ fontSize: 10, color: C.muted2, marginTop: 2 }}>Direct Tactical Frequency: 156.800 MHz (Channel 16)</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <Pill color="amber">ON-TRAIL ESCORT</Pill>
                    <div style={{ fontSize: 11, color: C.green, marginTop: 4 }}>In Direct Contact</div>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* RIGHT: Incident Log & Stand-Down History */}
          <div>
            <Card style={{ height: "100%", display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>SAR Incident Log & Stand-Down Archive</div>
                  <div style={{ fontSize: 11, color: C.muted }}>Historical emergency beacons and self-cancellations</div>
                </div>
                <Pill color="teal">{resolvedIncidents.length} Records</Pill>
              </div>

              <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
                {resolvedIncidents.map((incident) => (
                  <div
                    key={incident.id}
                    style={{
                      background: "rgba(255,255,255,0.02)",
                      border: `1px solid ${C.border}`,
                      borderRadius: 10,
                      padding: "12px 14px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{incident.user}</div>
                        <div style={{ fontSize: 11, color: C.muted }}>📍 {incident.city} · {incident.tripName}</div>
                      </div>
                      <Pill color={incident.resolution?.includes("Self-Resolved") ? "green" : "blue"}>
                        {incident.resolution?.includes("Self-Resolved") ? "✓ Self-Resolved" : "✓ Stood Down"}
                      </Pill>
                    </div>

                    <div style={{ background: "rgba(0,0,0,0.25)", borderRadius: 6, padding: "8px 10px", marginTop: 6, fontSize: 11, color: C.text }}>
                      <span style={{ color: C.muted2 }}>Debrief Note: </span>
                      {incident.resolution || "Trekker cancelled SOS beacon (Self-Resolved)"}
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.muted2, marginTop: 8 }}>
                      <span>Triggered: {incident.time}</span>
                      <span>Resolved: {incident.resolvedAt} ({incident.resolvedBy})</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // VIEW B: ACTIVE EMERGENCY DISPATCH CONSOLE (Active SOS > 0)
  // ════════════════════════════════════════════════════════════════════════
  return (
    <div>
      {renderStandDownModal()}

      <PageHeader
        title="Realtime SOS Command & SAR Dispatch"
        sub="🚨 CRITICAL RESCUE OPERATION IN PROGRESS — ROUTING RESCUE TEAMS"
        right={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Pill color="red">🚨 {activeIncidents.length} ACTIVE DISTRESS BEACON{activeIncidents.length > 1 ? "S" : ""}</Pill>
            <Pill color="green">● Tactical Live</Pill>
          </div>
        }
      />

      {calloutMsg && (
        <div style={{ background: "rgba(239,68,68,0.12)", border: `1px solid rgba(239,68,68,0.35)`, borderRadius: 10, padding: "10px 16px", fontSize: 13, color: "#fca5a5", marginBottom: 14 }}>
          {calloutMsg}
        </div>
      )}

      {/* Flashing Emergency Beacon Banner */}
      <div style={{
        background: "linear-gradient(135deg, rgba(239,68,68,0.22), rgba(185,28,28,0.08))",
        border: `1px solid rgba(239,68,68,0.5)`,
        borderRadius: 14,
        padding: "16px 20px",
        marginBottom: 16,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 14
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(239,68,68,0.25)", border: `1px solid ${C.red}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, animation: "pulse 1.2s infinite" }}>
            🚨
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#fca5a5", display: "flex", alignItems: "center", gap: 8 }}>
              CRITICAL DISTRESS SIGNAL ACTIVE · {selectedSOS.user.toUpperCase()}
            </div>
            <div style={{ fontSize: 12, color: C.text, marginTop: 2 }}>
              Location: <strong>{selectedSOS.city}</strong> · Altitude: <strong>{selectedSOS.altitude}m ASL</strong> · Coordinates: <span style={{ fontFamily: "monospace" }}>{selectedSOS.lat}°N, {selectedSOS.lon}°E</span> · Blood: <strong style={{ color: C.red }}>{selectedSOS.blood}</strong>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => setResolvingModal(true)}
            style={{
              padding: "10px 18px", borderRadius: 8, background: `linear-gradient(135deg, ${C.green}, #16a34a)`,
              border: "none", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", gap: 6, boxShadow: "0 4px 12px rgba(34,197,94,0.3)"
            }}
          >
            ✓ STAND DOWN SAR & RESOLVE
          </button>
        </div>
      </div>

      {/* 3-Column SAR Dispatch Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr 310px", gap: 14 }}>
        {/* LEFT COLUMN: Active SOS Queue */}
        <div>
          <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
            Distress Queue ({activeIncidents.length})
          </div>

          {activeIncidents.map((ev) => (
            <Card
              key={ev.id}
              onClick={() => setSelectedId(ev.id)}
              style={{
                marginBottom: 8,
                cursor: "pointer",
                borderColor: selectedSOS?.id === ev.id ? C.red : "rgba(239,68,68,0.35)",
                background: selectedSOS?.id === ev.id ? "rgba(239,68,68,0.12)" : C.card,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.red, animation: "ping 1s infinite", flexShrink: 0 }} />
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text, flex: 1 }}>{ev.user}</div>
                <Pill color="red">{ev.priority}</Pill>
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>📍 {ev.city}</div>
              <div style={{ fontSize: 10, color: C.muted2, marginBottom: 8 }}>Signal Ping: {ev.time}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Pill color="red">🚨 ACTIVE BEACON</Pill>
                <span style={{ fontSize: 11, color: C.amber, fontWeight: 600 }}>🩸 {ev.blood}</span>
              </div>
            </Card>
          ))}

          {/* Quick Metrics */}
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              ["Active Distress", activeIncidents.length, C.red],
              ["Units Deployed", teamsState.filter((t) => t.status === "deployed").length, C.amber],
              ["Resolved Today", resolvedIncidents.length, C.green],
            ].map(([l, v, col]) => (
              <Card key={l} style={{ marginBottom: 0, padding: "10px 14px" }}>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>{l}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: col }}>{v}</div>
              </Card>
            ))}
          </div>
        </div>

        {/* CENTER COLUMN: Tactical Route Map & Navigation */}
        <div>
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <LiveMap
              points={users}
              teams={teamsState.filter((t) => t.status === "deployed").map((t) => ({
                ...t,
                lat: teamPos && assignedTeam?.id === t.id ? teamPos.lat : t.lat,
                lon: teamPos && assignedTeam?.id === t.id ? teamPos.lon : t.lon,
              }))}
              routeFrom={teamPos || assignedTeam || undefined}
              routeTo={selectedSOS || undefined}
              height={400}
              zoom={zoom}
              onZoom={(d) => setZoom((z) => Math.max(0.5, Math.min(3, z + d * 0.5)))}
            />
          </Card>

          {/* Live Navigation Telemetry Row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 12 }}>
            <StatCard label="Distance to Target" value={`${distToTarget} km`} sub="From Rescue Unit" color={C.accent} icon="📏" />
            <StatCard label="Estimated Arrival" value={`${remainingEta} min`} sub={assignedTeam?.vehicle || "4x4 QRV"} color={C.green} icon="⏱" />
            <StatCard label="Response Speed" value={assignedTeam?.speed || "35 km/h"} sub="Tactical Transit" color={C.amber} icon="🚑" />
            <StatCard label="GPS Accuracy" value="±6m" sub="Live Satellite Fix" color={C.purple} icon="🛰" />
          </div>

          {/* Action Buttons Row */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1.3fr", gap: 10, marginTop: 12 }}>
            <button
              onClick={() => { setNavMode(true); setCurrentStep(0); }}
              style={{
                padding: "14px",
                background: `linear-gradient(135deg, ${C.red}, ${C.accent2})`,
                border: "none",
                borderRadius: 10,
                color: "#fff",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                boxShadow: "0 4px 14px rgba(239,68,68,0.4)"
              }}
            >
              🗺 LAUNCH REALTIME NAVIGATION
            </button>

            <button
              onClick={() => window.open(`https://www.google.com/maps?q=${selectedSOS.lat},${selectedSOS.lon}`, "_blank")}
              style={{
                padding: "14px",
                background: "rgba(255,255,255,0.06)",
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                color: C.text,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6
              }}
            >
              📍 Google Maps
            </button>

            <button
              onClick={() => setResolvingModal(true)}
              style={{
                padding: "14px",
                background: "rgba(34,197,94,0.18)",
                border: `1px solid ${C.green}`,
                borderRadius: 10,
                color: C.green,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6
              }}
            >
              ✓ Stand Down SAR
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN: Victim Triage & Medical Dossier */}
        <div>
          {/* Victim Details Card */}
          <Card style={{ marginBottom: 10, borderColor: "rgba(239,68,68,0.4)" }}>
            <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
              Victim Triage Dossier
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <Avatar initials={selectedSOS.user.slice(0, 2).toUpperCase()} bg="#E6F1FB" text="#0C447C" size={42} />
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{selectedSOS.user}</div>
                <div style={{ fontSize: 11, color: C.muted }}>{selectedSOS.tripName} ({selectedSOS.tripCode})</div>
              </div>
            </div>

            {[
              ["Distress Type", selectedSOS.type],
              ["Beacon Time", selectedSOS.time],
              ["Coordinates", `${selectedSOS.lat}°N, ${selectedSOS.lon}°E`],
              ["Trail Elevation", `${selectedSOS.altitude}m ASL`],
              ["From Guide Ajay Saini", formatDistance(calculateDistanceMeters(RAJMACHI_ADMIN.lat, RAJMACHI_ADMIN.lon, selectedSOS.lat, selectedSOS.lon)) + " away"],
              ["VHF Tactical Radio", "145.500 MHz (Channel 1)"],
              ["Live Biometrics", `❤️ ${selectedSOS.vitals?.hr || 114} bpm · 🫁 ${selectedSOS.vitals?.spo2 || 96}% SpO2`],
              ["Beacon Battery", `🔋 ${selectedSOS.vitals?.battery || 88}%`],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "5px 0", borderBottom: `1px solid ${C.border}` }}>
                <span style={{ color: C.muted2 }}>{k}</span>
                <span style={{ color: C.text, fontWeight: 500, fontFamily: k === "Coordinates" ? "monospace" : "inherit", fontSize: k === "Coordinates" ? 10 : 12 }}>{v}</span>
              </div>
            ))}
          </Card>

          {/* Medical Alerts & Emergency Contact Card */}
          <Card style={{ marginBottom: 10, borderColor: "rgba(167,139,250,0.35)" }}>
            <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
              Medical Profile & Contacts
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              <Pill color="red">🩸 {selectedSOS.blood}</Pill>
              <Pill color={selectedSOS.medical === "None" || selectedSOS.medical === "None reported" ? "green" : "amber"}>
                ⚕ {selectedSOS.medical}
              </Pill>
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>Primary Emergency Contact:</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 10 }}>{selectedSOS.ec}</div>
            <Btn
              variant="success"
              style={{ width: "100%", justifyContent: "center", fontSize: 11 }}
              onClick={() => window.open(`tel:${(selectedSOS.ec || "").replace(/[^0-9+]/g, "") || "+919153191902"}`)}
            >
              📞 Direct Call Emergency Contact
            </Btn>
          </Card>

          {/* Rescue Team Assignment Card */}
          <Card>
            <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
              Assigned SAR Tactical Unit
            </div>
            {teamsState.map((t) => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{t.name}</div>
                  <div style={{ fontSize: 10, color: C.muted }}>{t.vehicle} · {t.members}m · ETA {t.eta}</div>
                </div>
                <Pill color={t.status === "deployed" ? "amber" : "gray"}>{t.status}</Pill>
                <button
                  onClick={() => handleDispatch(t.id, selectedSOS.id)}
                  style={{
                    padding: "4px 10px", borderRadius: 6,
                    border: `1px solid ${t.assignedTo === selectedSOS.id ? C.green : C.border}`,
                    background: t.assignedTo === selectedSOS.id ? "rgba(34,197,94,0.15)" : "transparent",
                    color: t.assignedTo === selectedSOS.id ? C.green : C.muted,
                    fontSize: 10, cursor: "pointer", fontFamily: "inherit", fontWeight: 600
                  }}
                >
                  {t.assignedTo === selectedSOS.id ? "✓ En Route" : "Assign Unit"}
                </button>
              </div>
            ))}
          </Card>
        </div>
      </div>

      {/* Team Status Table */}
      <div style={{ marginTop: 20 }}>
        <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
          Search & Rescue Live Unit Status
        </div>
        <Card style={{ padding: 0, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Tactical Unit", "Field Commander", "Personnel", "Vehicle Payload", "Status", "Speed", "Heading", "ETA to Rajmachi", "Assigned Incident"].map((h) => (
                  <TH key={h}>{h}</TH>
                ))}
              </tr>
            </thead>
            <tbody>
              {teamsState.map((t, i) => {
                const assignedEv = activeIncidents.find((e) => e.id === t.assignedTo);
                return (
                  <tr key={t.id} style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.012)" }}>
                    <TD>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: t.status === "deployed" ? C.red : C.green }} />
                        <span style={{ fontWeight: 600 }}>{t.name}</span>
                      </div>
                    </TD>
                    <TD>{t.lead}</TD>
                    <TD><Pill color="blue">{t.members} members</Pill></TD>
                    <TD>{t.vehicle}</TD>
                    <TD><Pill color={t.status === "deployed" ? "red" : "green"}>{t.status.toUpperCase()}</Pill></TD>
                    <TD style={{ fontFamily: "monospace", color: t.status === "deployed" ? C.green : C.muted }}>{t.speed}</TD>
                    <TD style={{ fontFamily: "monospace" }}>{t.heading}°</TD>
                    <TD style={{ color: t.eta === "—" ? C.muted : C.amber, fontWeight: 600 }}>{t.eta}</TD>
                    <TD>
                      {assignedEv ? (
                        <div>
                          <div style={{ fontSize: 12, color: C.red, fontWeight: 600 }}>{assignedEv.user}</div>
                          <div style={{ fontSize: 10, color: C.muted }}>{assignedEv.city}</div>
                        </div>
                      ) : (
                        <span style={{ color: C.muted2 }}>Tactical Standby</span>
                      )}
                    </TD>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>
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
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const mountainBackdropUrl =
    themeConfig?.backdropUrl ||
    "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=2400&q=85";

  // Login form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPass, setLoginPass] = useState("");
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
        onLogin(res.userData || { email: trimmedEmail, name: "Admin", role: "admin" });
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
                placeholder="admin@margsutra.app"
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
                borderRadius: 12,
                border: "none",
                background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                color: "#ffffff",
                fontSize: 14,
                fontWeight: 600,
                cursor: loginLoading ? "not-allowed" : "pointer",
                boxShadow: "0 8px 24px rgba(37, 99, 235, 0.45)",
                transition: "all 0.2s ease",
                opacity: loginLoading ? 0.7 : 1,
              }}
            >
              {loginLoading ? "Authorizing..." : "Sign in to Margsutra"}
            </button>

            <div style={{ textAlign: "center", marginTop: 18, fontSize: 12, color: "rgba(180, 210, 245, 0.7)" }}>
              Need administrator access?{" "}
              <button
                type="button"
                onClick={() => {
                  setTab("register");
                  setLoginErr("");
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
                Request Admin Access →
              </button>
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
}) => {
  const [actingId, setActingId] = useState(null);
  const [toast, setToast] = useState(null);

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

        <Card>
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
   PAGE: TRIP ROSTERS & EXPEDITION APPROVALS
════════════════════════════════════════════════ */
const PageTripRosters = ({
  pendingTrekkers = [],
  onApprove,
  onRemove,
  refreshing,
  onRefresh,
}) => {
  const [trips, setTrips] = useState(TRIPS);
  const [actionLoading, setActionLoading] = useState({});
  const [rosters, setRosters] = useState({});
  const [loadingRoster, setLoadingRoster] = useState({});
  const [expandedTrip, setExpandedTrip] = useState(null);
  const [activeTabMap, setActiveTabMap] = useState({});

  // Geofence states
  const [geofenceRadiusMap, setGeofenceRadiusMap] = useState({});
  const [geofenceZoneMap, setGeofenceZoneMap] = useState({});
  const [savingGeofence, setSavingGeofence] = useState({});
  const [geofenceToast, setGeofenceToast] = useState({});

  // New Expedition Modal & Command States
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingExpedition, setCreatingExpedition] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [deleteModalTrip, setDeleteModalTrip] = useState(null);
  const [deletingTrip, setDeletingTrip] = useState(false);
  const [managingTripId, setManagingTripId] = useState(null);
  const [newExpForm, setNewExpForm] = useState({
    name: "Rajmachi Fort Monsoon Trek — Batch 13",
    startDate: "2026-06-13",
    startTime: "06:30 AM",
    endDate: "2026-06-14",
    endTime: "05:00 PM",
    duration: "2 Days / 1 Night",
    pickupLocation: "Lonavala Railway Station (Platform 1 Exit, Ticket Counter)",
    baseLocation: "Udhewadi Base Village Camp (829m ASL)",
    location: "Rajmachi Fort, Maharashtra",
    elevation: "829m ASL",
    difficulty: "Moderate (14 km Trail Circuit)",
    leader: "Field Guide Ajay Saini",
    vhfChannel: "145.500 MHz (VHF Ch 1)",
    maxRoster: 25,
    geofenceRadius: 2500,
  });

  useEffect(() => {
    const unsub = subscribeToTrips((liveTrips) => {
      if (liveTrips && liveTrips.length > 0) {
        setTrips(liveTrips);
      }
    });
    return () => unsub && unsub();
  }, []);

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

  const handleApprove = async (tripId, userId) => {
    const key = `${tripId}-${userId}`;
    setActionLoading((p) => ({ ...p, [key]: true }));
    try {
      await onApprove(tripId, userId);
      // Reload roster for this trip
      const updated = await fetchTripRoster(tripId);
      setRosters((p) => ({ ...p, [tripId]: updated }));
    } finally {
      setActionLoading((p) => ({ ...p, [key]: false }));
    }
  };

  const handleRemove = async (tripId, userId) => {
    const key = `${tripId}-${userId}`;
    setActionLoading((p) => ({ ...p, [key]: true }));
    try {
      await onRemove(tripId, userId);
      // Reload roster for this trip
      const updated = await fetchTripRoster(tripId);
      setRosters((p) => ({ ...p, [tripId]: updated }));
    } finally {
      setActionLoading((p) => ({ ...p, [key]: false }));
    }
  };

  const handleSetInFieldCommand = async (trip) => {
    const tripId = trip.id || trip.tripId;
    setManagingTripId(tripId);
    try {
      const res = await setActiveManagedTripRemote(tripId);
      if (res?.success) {
        setTrips((prev) =>
          prev.map((t) => {
            const tid = t.id || t.tripId;
            if (tid === tripId) {
              return { ...t, isManaged: true, status: "in-field" };
            }
            return {
              ...t,
              isManaged: false,
              status: t.status === "in-field" ? "upcoming" : (t.status || "upcoming"),
            };
          })
        );
        setToastMessage(`✓ In-Field Command transferred to "${trip.name}"! Lead Guide: ${trip.leader || "Field Guide Ajay Saini"}`);
        setTimeout(() => setToastMessage(null), 5000);
      }
    } catch (err) {
      console.error("Failed to switch active managed expedition:", err);
    } finally {
      setManagingTripId(null);
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
        if (expandedTrip === tripId) setExpandedTrip(null);
        setToastMessage(`✓ Expedition "${deleteModalTrip.name}" deleted and associated rosters cleared.`);
        setTimeout(() => setToastMessage(null), 5000);
      }
    } catch (err) {
      console.error("Failed to delete trip:", err);
    } finally {
      setDeletingTrip(false);
      setDeleteModalTrip(null);
    }
  };

  const handleSaveGeofence = async (trip) => {
    const tripId = trip.id || trip.tripId;
    const currentRadius = geofenceRadiusMap[tripId] ?? (trip.geofence?.radius || 2500);
    const currentZone = geofenceZoneMap[tripId] ?? (trip.geofence?.zoneName || `${trip.name} Safe Corridor`);

    setSavingGeofence((p) => ({ ...p, [tripId]: true }));
    try {
      await updateTripGeofenceRemote(tripId, {
        radius: Number(currentRadius),
        zoneName: currentZone,
        lat: trip.lat || 18.8286,
        lon: trip.lon || 73.3986,
      });

      setTrips((prev) =>
        prev.map((t) => {
          if ((t.id || t.tripId) === tripId) {
            return {
              ...t,
              geofence: {
                ...(t.geofence || {}),
                radius: Number(currentRadius),
                zoneName: currentZone,
              },
            };
          }
          return t;
        })
      );

      setGeofenceToast((p) => ({
        ...p,
        [tripId]: `✓ Safety perimeter updated to ${(currentRadius / 1000).toFixed(1)} km & broadcasted to all active trekkers via Cloud Firestore!`,
      }));
      setTimeout(() => {
        setGeofenceToast((p) => ({ ...p, [tripId]: null }));
      }, 5000);
    } catch (err) {
      console.error("Failed to update geofence:", err);
    } finally {
      setSavingGeofence((p) => ({ ...p, [tripId]: false }));
    }
  };

  const handleCreateExpedition = async (e) => {
    if (e) e.preventDefault();
    if (!newExpForm.name.trim() || creatingExpedition) return;
    setCreatingExpedition(true);
    try {
      const formattedDate = `${newExpForm.startDate} · ${newExpForm.startTime} – ${newExpForm.endDate} · ${newExpForm.endTime}`;
      const res = await createTripRemote({
        name: newExpForm.name.trim(),
        date: formattedDate,
        startDate: newExpForm.startDate,
        startTime: newExpForm.startTime,
        endDate: newExpForm.endDate,
        endTime: newExpForm.endTime,
        duration: newExpForm.duration || "2 Days / 1 Night",
        pickupLocation: newExpForm.pickupLocation || "Lonavala Railway Station (Platform 1 Exit, Ticket Counter)",
        baseLocation: newExpForm.baseLocation || "Udhewadi Base Village Camp (829m ASL)",
        location: newExpForm.location.trim(),
        elevation: newExpForm.elevation.trim(),
        difficulty: newExpForm.difficulty,
        leader: newExpForm.leader.trim() || "Field Guide Ajay Saini",
        vhfChannel: newExpForm.vhfChannel.trim() || "145.500 MHz (VHF Ch 1)",
        maxRoster: Number(newExpForm.maxRoster) || 25,
        isManaged: false,
        status: "upcoming",
        lat: 18.8286,
        lon: 73.3986,
        geofence: {
          lat: 18.8286,
          lon: 73.3986,
          radius: Number(newExpForm.geofenceRadius) || 2500,
          zoneName: `${newExpForm.name.trim()} Safe Corridor`,
        },
      });

      if (res?.success) {
        setToastMessage(`✓ Expedition created successfully! Join Code: ${res.code || res.trip?.code}`);
        setShowCreateModal(false);
        if (res.trip) {
          setTrips((p) => [res.trip, ...p.filter((t) => (t.id || t.tripId) !== res.trip.id)]);
        }
        setTimeout(() => setToastMessage(null), 5000);
      }
    } catch (err) {
      console.error("Failed to create expedition:", err);
    } finally {
      setCreatingExpedition(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Expedition Rosters & Approvals"
        sub="Review incoming trekker applications, configure geofence perimeters, and manage active mountain expedition rosters"
        right={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {pendingTrekkers.length > 0 ? (
              <Pill color="amber">⏳ {pendingTrekkers.length} Pending Approval</Pill>
            ) : (
              <Pill color="green">✓ All Trekkers Processed</Pill>
            )}
            <Btn variant="default" onClick={onRefresh} disabled={refreshing}>
              {refreshing ? "↻ Refreshing..." : "↻ Refresh Queue"}
            </Btn>
            <Btn variant="primary" onClick={() => setShowCreateModal(true)}>
              + Create Expedition
            </Btn>
          </div>
        }
      />

      {/* Global Toast Notification */}
      {toastMessage && (
        <div
          style={{
            marginBottom: 16,
            padding: "12px 18px",
            borderRadius: 12,
            background: "linear-gradient(90deg, rgba(34, 197, 94, 0.2), rgba(16, 185, 129, 0.15))",
            border: "1px solid rgba(34, 197, 94, 0.4)",
            color: "#86efac",
            fontSize: 13,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 10,
            boxShadow: "0 4px 16px rgba(34, 197, 94, 0.15)",
          }}
        >
          <span>🏔️</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* MODAL: CREATE NEW EXPEDITION */}
      {showCreateModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 999,
            background: "rgba(3, 7, 18, 0.85)",
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
              maxWidth: 620,
              background: "#0b1422",
              border: `1px solid ${C.border2}`,
              borderRadius: 16,
              boxShadow: "0 24px 60px rgba(0, 0, 0, 0.6)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "16px 22px",
                borderBottom: `1px solid ${C.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "rgba(255, 255, 255, 0.02)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 20 }}>🏔️</span>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Create New Mountain Expedition</div>
                  <div style={{ fontSize: 11, color: C.muted }}>Configure trail route, safety frequency, and geofence perimeter</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                style={{ background: "transparent", border: "none", color: C.muted, fontSize: 18, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateExpedition} style={{ padding: "20px 22px", maxHeight: "80vh", overflowY: "auto" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                <div style={{ gridColumn: "span 2" }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 6 }}>
                    Expedition Name
                  </label>
                  <Input
                    value={newExpForm.name}
                    onChange={(e) => setNewExpForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. Rajmachi Fort Night Trek — Batch 13"
                    required
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 6 }}>
                    Start Date & Assembly Time
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 6 }}>
                    <Input
                      type="date"
                      value={newExpForm.startDate}
                      onChange={(e) => setNewExpForm((p) => ({ ...p, startDate: e.target.value }))}
                      required
                    />
                    <Input
                      value={newExpForm.startTime}
                      onChange={(e) => setNewExpForm((p) => ({ ...p, startTime: e.target.value }))}
                      placeholder="06:30 AM"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 6 }}>
                    End Date & Return Time
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 6 }}>
                    <Input
                      type="date"
                      value={newExpForm.endDate}
                      onChange={(e) => setNewExpForm((p) => ({ ...p, endDate: e.target.value }))}
                      required
                    />
                    <Input
                      value={newExpForm.endTime}
                      onChange={(e) => setNewExpForm((p) => ({ ...p, endTime: e.target.value }))}
                      placeholder="05:00 PM"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 6 }}>
                    Trip Duration
                  </label>
                  <Input
                    value={newExpForm.duration}
                    onChange={(e) => setNewExpForm((p) => ({ ...p, duration: e.target.value }))}
                    placeholder="e.g. 2 Days / 1 Night"
                    required
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 6 }}>
                    Trail Difficulty
                  </label>
                  <Input
                    value={newExpForm.difficulty}
                    onChange={(e) => setNewExpForm((p) => ({ ...p, difficulty: e.target.value }))}
                    placeholder="e.g. Moderate (14 km Trail Circuit)"
                    required
                  />
                </div>

                <div style={{ gridColumn: "span 2" }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 6 }}>
                    Pickup & Assembly Point (Maharashtra Transit Hub)
                  </label>
                  <Input
                    value={newExpForm.pickupLocation}
                    onChange={(e) => setNewExpForm((p) => ({ ...p, pickupLocation: e.target.value }))}
                    placeholder="e.g. Lonavala Railway Station (Platform 1 Exit, Ticket Counter)"
                    required
                  />
                </div>

                <div style={{ gridColumn: "span 2" }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 6 }}>
                    Base Village / Trailhead Camp (Altitude & Camp)
                  </label>
                  <Input
                    value={newExpForm.baseLocation}
                    onChange={(e) => setNewExpForm((p) => ({ ...p, baseLocation: e.target.value }))}
                    placeholder="e.g. Udhewadi Base Village Camp (829m ASL)"
                    required
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 6 }}>
                    Location / Mountain Region
                  </label>
                  <Input
                    value={newExpForm.location}
                    onChange={(e) => setNewExpForm((p) => ({ ...p, location: e.target.value }))}
                    placeholder="e.g. Rajmachi Fort, Maharashtra"
                    required
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 6 }}>
                    Peak Elevation
                  </label>
                  <Input
                    value={newExpForm.elevation}
                    onChange={(e) => setNewExpForm((p) => ({ ...p, elevation: e.target.value }))}
                    placeholder="e.g. 829m ASL"
                  />
                </div>

                <div style={{ gridColumn: "span 2" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Walkie-Talkie Channel (VHF Radio)
                    </label>
                    <span style={{ fontSize: 10, color: "#93c5fd" }}>
                      Very High Frequency (136–174 MHz) for no-signal mountain valleys
                    </span>
                  </div>
                  <Input
                    value={newExpForm.vhfChannel}
                    onChange={(e) => setNewExpForm((p) => ({ ...p, vhfChannel: e.target.value }))}
                    placeholder="e.g. 145.500 MHz (VHF Ch 1)"
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 6 }}>
                    Expedition Leader
                  </label>
                  <Input
                    value={newExpForm.leader}
                    onChange={(e) => setNewExpForm((p) => ({ ...p, leader: e.target.value }))}
                    placeholder="Field Guide Ajay Saini"
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 6 }}>
                    Max Roster Capacity
                  </label>
                  <Input
                    type="number"
                    value={newExpForm.maxRoster}
                    onChange={(e) => setNewExpForm((p) => ({ ...p, maxRoster: e.target.value }))}
                    min="5"
                    max="100"
                  />
                </div>

                <div style={{ gridColumn: "span 2" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Initial Geofence Safety Radius
                    </label>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#f59e0b" }}>
                      {(newExpForm.geofenceRadius / 1000).toFixed(1)} km ({newExpForm.geofenceRadius} meters)
                    </span>
                  </div>
                  <input
                    type="range"
                    min="500"
                    max="5000"
                    step="100"
                    value={newExpForm.geofenceRadius}
                    onChange={(e) => setNewExpForm((p) => ({ ...p, geofenceRadius: Number(e.target.value) }))}
                    style={{ width: "100%", accentColor: "#f59e0b" }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.muted2, marginTop: 2 }}>
                    <span>500 m (High Fog / Alert)</span>
                    <span>2.5 km (Standard Trail)</span>
                    <span>5.0 km (Wide Plateau)</span>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18, borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
                <Btn variant="default" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </Btn>
                <Btn variant="primary" onClick={handleCreateExpedition} disabled={creatingExpedition}>
                  {creatingExpedition ? "Creating Expedition..." : "Create Expedition & Generate Code"}
                </Btn>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DELETE EXPEDITION CONFIRMATION */}
      {deleteModalTrip && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 999,
            background: "rgba(3, 7, 18, 0.85)",
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
              maxWidth: 480,
              background: "#0b1422",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              borderRadius: 16,
              boxShadow: "0 24px 60px rgba(0, 0, 0, 0.7)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "16px 20px",
                borderBottom: `1px solid ${C.border}`,
                display: "flex",
                alignItems: "center",
                gap: 12,
                background: "rgba(239, 68, 68, 0.08)",
              }}
            >
              <span style={{ fontSize: 24 }}>⚠️</span>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#fca5a5" }}>
                  Confirm Expedition Deletion
                </div>
                <div style={{ fontSize: 11, color: C.muted }}>
                  Permanently remove this expedition from Margsutra
                </div>
              </div>
            </div>

            <div style={{ padding: "20px 22px" }}>
              <p style={{ fontSize: 13, color: C.text, lineHeight: 1.5, margin: 0, marginBottom: 12 }}>
                Are you sure you want to permanently delete <strong>"{deleteModalTrip.name}"</strong> (Code: <strong>{deleteModalTrip.code}</strong>)?
              </p>

              <div
                style={{
                  background: "rgba(239, 68, 68, 0.08)",
                  border: "1px solid rgba(239, 68, 68, 0.25)",
                  borderRadius: 8,
                  padding: "10px 14px",
                  fontSize: 12,
                  color: "#fca5a5",
                  lineHeight: 1.45,
                  marginBottom: 16,
                }}
              >
                ⚠️ <strong>This will perform the following actions:</strong>
                <ul style={{ margin: "6px 0 0 16px", padding: 0 }}>
                  <li>Delete all enrolled trekker rosters for this expedition</li>
                  <li>Clear active expedition status from all enrolled users so they can join new treks</li>
                  <li>Erase expedition telemetry records from Cloud Firestore</li>
                </ul>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <Btn variant="default" onClick={() => setDeleteModalTrip(null)} disabled={deletingTrip}>
                  Cancel
                </Btn>
                <button
                  type="button"
                  onClick={handleConfirmDeleteTrip}
                  disabled={deletingTrip}
                  style={{
                    padding: "8px 18px",
                    borderRadius: 8,
                    background: "linear-gradient(135deg, #ef4444, #b91c1c)",
                    border: "none",
                    color: "#ffffff",
                    fontSize: 12.5,
                    fontWeight: 700,
                    cursor: deletingTrip ? "not-allowed" : "pointer",
                    boxShadow: "0 4px 14px rgba(239, 68, 68, 0.4)",
                    fontFamily: "inherit",
                    opacity: deletingTrip ? 0.7 : 1,
                  }}
                >
                  {deletingTrip ? "Deleting Expedition..." : "Yes, Delete Expedition"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 1: PENDING TREKKER APPLICATIONS QUEUE */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>⏳</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
              Pending Trekker Applications
            </span>
            <span
              style={{
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 12,
                background: pendingTrekkers.length > 0 ? "rgba(245,158,11,0.2)" : "rgba(255,255,255,0.08)",
                color: pendingTrekkers.length > 0 ? "#fbbf24" : C.muted,
                fontWeight: 600,
              }}
            >
              {pendingTrekkers.length}
            </span>
          </div>
        </div>

        {pendingTrekkers.length === 0 ? (
          <Card style={{ padding: "28px 20px", textAlign: "center", background: "rgba(255,255,255,0.02)" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🧭</div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: C.text, marginBottom: 4 }}>
              No Pending Trekker Applications
            </div>
            <div style={{ fontSize: 12, color: C.muted, maxWidth: 500, margin: "0 auto", lineHeight: 1.5 }}>
              All trekker expedition join requests have been processed. When a user enters a trip code or clicks Join from the user portal, their medical notes and emergency contact details will appear here for your review and clearance.
            </div>
          </Card>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {pendingTrekkers.map((applicant) => {
              const applicantId = applicant.userId || applicant.id;
              const key = `${applicant.tripId}-${applicantId}`;
              const isActing = !!actionLoading[key];
              const initials = (applicant.name || "Trekker")
                .split(/\s+/)
                .slice(0, 2)
                .map((p) => p[0])
                .join("")
                .toUpperCase() || "TR";

              return (
                <Card
                  key={key}
                  style={{
                    border: "1px solid rgba(245, 158, 11, 0.35)",
                    background: "linear-gradient(135deg, rgba(245, 158, 11, 0.08), rgba(11, 20, 34, 0.95))",
                    boxShadow: "0 4px 18px rgba(0, 0, 0, 0.35)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14 }}>
                    <div style={{ display: "flex", gap: 14 }}>
                      <div
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 12,
                          background: "rgba(245, 158, 11, 0.18)",
                          border: "1px solid rgba(245, 158, 11, 0.4)",
                          color: "#fbbf24",
                          fontSize: 15,
                          fontWeight: 700,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {initials}
                      </div>

                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                            {applicant.name || "Trekker Applicant"}
                          </span>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              padding: "2px 8px",
                              borderRadius: 10,
                              background: "rgba(245, 158, 11, 0.2)",
                              border: "1px solid rgba(245, 158, 11, 0.35)",
                              color: "#fbbf24",
                            }}
                          >
                            ⏳ AWAITING APPROVAL
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              padding: "2px 8px",
                              borderRadius: 6,
                              background: "rgba(59, 130, 246, 0.15)",
                              border: "1px solid rgba(59, 130, 246, 0.3)",
                              color: "#60a5fa",
                            }}
                          >
                            Expedition: {applicant.tripName} ({applicant.tripCode})
                          </span>
                        </div>

                        <div style={{ fontSize: 12, color: C.muted, display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 8 }}>
                          <span>✉️ {applicant.email || "No email"}</span>
                          <span>📞 {applicant.phone || "No phone"}</span>
                          <span>🩸 Blood: <strong>{applicant.blood || "Not specified"}</strong></span>
                          <span>🩺 Medical: <strong>{applicant.medical || "None reported"}</strong></span>
                        </div>

                        <div style={{ fontSize: 11.5, color: "rgba(180, 210, 245, 0.85)", background: "rgba(255,255,255,0.03)", padding: "6px 12px", borderRadius: 8, display: "inline-block" }}>
                          🆘 <strong>Emergency Contact:</strong> {applicant.ec1Name || "Family"} ({applicant.ec1Rel || "Next of Kin"}) — 📞 {applicant.ec1Ph || "—"}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => handleRemove(applicant.tripId, applicantId)}
                        disabled={isActing}
                        style={{
                          background: "transparent",
                          border: "1px solid rgba(239, 68, 68, 0.35)",
                          borderRadius: 8,
                          color: "#fca5a5",
                          padding: "8px 14px",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: isActing ? "not-allowed" : "pointer",
                          opacity: isActing ? 0.6 : 1,
                          fontFamily: "inherit",
                        }}
                      >
                        ✕ Decline Request
                      </button>

                      <button
                        type="button"
                        onClick={() => handleApprove(applicant.tripId, applicantId)}
                        disabled={isActing}
                        style={{
                          background: "linear-gradient(135deg, #10b981, #059669)",
                          border: "none",
                          borderRadius: 8,
                          color: "#ffffff",
                          padding: "8px 16px",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: isActing ? "not-allowed" : "pointer",
                          boxShadow: "0 4px 14px rgba(16, 185, 129, 0.35)",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          opacity: isActing ? 0.6 : 1,
                          fontFamily: "inherit",
                        }}
                      >
                        {isActing ? "Authorizing..." : "✓ Approve Trekker"}
                      </button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION 2: ACTIVE EXPEDITIONS & ROSTER MANAGEMENT */}
      <div>
        {/* In-Field Single Active Command Banner */}
        {(() => {
          const inFieldTrip = trips.find((t) => t.isManaged || t.status === "in-field") || trips[0];
          return (
            <div
              style={{
                marginBottom: 20,
                padding: "16px 20px",
                borderRadius: 14,
                background: "linear-gradient(135deg, rgba(34, 197, 94, 0.12), rgba(11, 20, 34, 0.95))",
                border: "1px solid rgba(34, 197, 94, 0.35)",
                boxShadow: "0 8px 24px rgba(0, 0, 0, 0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 14,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    background: "rgba(34, 197, 94, 0.2)",
                    border: "1px solid rgba(34, 197, 94, 0.4)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 22,
                  }}
                >
                  🛰️
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        padding: "2px 8px",
                        borderRadius: 6,
                        background: "rgba(34, 197, 94, 0.25)",
                        border: "1px solid rgba(34, 197, 94, 0.5)",
                        color: "#86efac",
                      }}
                    >
                      ● Active In-Field Command
                    </span>
                    <span style={{ fontSize: 11, color: C.muted2 }}>
                      (Admin manages 1 live expedition in the field at a time)
                    </span>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>
                    {inFieldTrip?.name || "No Active In-Field Expedition"}
                  </div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 4, display: "flex", gap: 16, flexWrap: "wrap" }}>
                    <span>🔑 Join Code: <strong style={{ color: "#60a5fa" }}>{inFieldTrip?.code || "—"}</strong></span>
                    <span>🧭 Field Guide: <strong style={{ color: C.text }}>{inFieldTrip?.leader || "Field Guide Ajay Saini"}</strong></span>
                    <span>📻 Walkie-Talkie: <strong style={{ color: "#fbbf24" }}>{inFieldTrip?.vhfChannel || "145.500 MHz (VHF Ch 1)"}</strong></span>
                    <span>👥 Enrolled: <strong style={{ color: "#34d399" }}>{inFieldTrip?.rosterCount || 0} / {inFieldTrip?.maxRoster || 25} Trekkers</strong></span>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, color: C.muted2 }}>Field Safety Duty-of-Care</div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "#86efac" }}>🟢 Live Telemetry Linked</div>
                </div>
              </div>
            </div>
          );
        })()}

        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <span>🏔️</span>
          <span>Expedition Batches & Management ({trips.length})</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {trips.map((trip) => {
            const tripId = trip.id || trip.tripId;
            const isExpanded = expandedTrip === tripId;
            const tripRoster = rosters[tripId] || [];
            const approvedMembers = tripRoster.filter((m) => m.status === "approved" || !m.status);
            const isInField = !!(trip.isManaged || trip.status === "in-field");

            return (
              <Card
                key={tripId}
                style={{
                  background: isInField
                    ? "linear-gradient(135deg, rgba(34, 197, 94, 0.06), rgba(11, 20, 34, 0.98))"
                    : "rgba(11, 20, 34, 0.95)",
                  border: isInField ? "1px solid rgba(34, 197, 94, 0.4)" : `1px solid ${C.border}`,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
                  <div style={{ flex: "1 1 500px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                      <span style={{ background: "rgba(59, 130, 246, 0.15)", border: "1px solid rgba(59, 130, 246, 0.3)", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700, color: "#60a5fa" }}>
                        {trip.code}
                      </span>
                      {isInField ? (
                        <span
                          style={{
                            fontSize: 10.5,
                            fontWeight: 800,
                            letterSpacing: "0.06em",
                            padding: "3px 9px",
                            borderRadius: 8,
                            background: "rgba(34, 197, 94, 0.2)",
                            border: "1px solid rgba(34, 197, 94, 0.45)",
                            color: "#86efac",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                          }}
                        >
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 6px #22c55e" }} />
                          IN-FIELD COMMAND (ACTIVE)
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: 10.5,
                            fontWeight: 700,
                            padding: "3px 8px",
                            borderRadius: 8,
                            background: "rgba(148, 163, 184, 0.12)",
                            border: "1px solid rgba(148, 163, 184, 0.25)",
                            color: "#cbd5e1",
                          }}
                        >
                          ⏳ UPCOMING SCHEDULED
                        </span>
                      )}
                      <span style={{ fontSize: 12, color: C.muted }}>📍 {trip.location}</span>
                    </div>

                    <div style={{ fontSize: 16.5, fontWeight: 700, color: C.text }}>{trip.name}</div>

                    <div style={{ fontSize: 12, color: C.muted, marginTop: 6, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 6 }}>
                      <div>
                        📅 <strong>Schedule:</strong> {trip.startDate || trip.date} {trip.startTime ? `at ${trip.startTime}` : ""} → {trip.endDate || ""} {trip.endTime ? `at ${trip.endTime}` : ""}
                        {trip.duration ? ` (${trip.duration})` : ""}
                      </div>
                      <div>
                        🚌 <strong>Assembly / Pickup:</strong> {trip.pickupLocation || "Lonavala Station (Exit Gate 1)"}
                      </div>
                      <div>
                        🏕️ <strong>Base Camp:</strong> {trip.baseLocation || "Udhewadi Base Camp (829m ASL)"}
                      </div>
                      <div>
                        📻 <strong>Walkie-Talkie Channel:</strong> <span style={{ color: "#fbbf24" }}>{trip.vhfChannel || "145.500 MHz (VHF Ch 1)"}</span>
                      </div>
                      <div>
                        🏔️ <strong>Elevation:</strong> {trip.elevation || "829m ASL"} · <strong>Trail:</strong> {trip.difficulty || "Moderate"}
                      </div>
                      <div>
                        🧭 <strong>Leader:</strong> {trip.leader || "Field Guide Ajay Saini"} · 🔒 <strong>Geofence:</strong> {((geofenceRadiusMap[tripId] ?? (trip.geofence?.radius || 2500)) / 1000).toFixed(1)} km
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 11, color: C.muted2 }}>Roster Strength</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#60a5fa" }}>
                        {trip.rosterCount || approvedMembers.length || 0} / {trip.maxRoster || 25} Trekkers
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      {!isInField && (
                        <button
                          type="button"
                          onClick={() => handleSetInFieldCommand(trip)}
                          disabled={managingTripId === tripId}
                          style={{
                            padding: "6px 12px",
                            borderRadius: 8,
                            background: "linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(16, 185, 129, 0.25))",
                            border: "1px solid rgba(34, 197, 94, 0.4)",
                            color: "#86efac",
                            fontSize: 11.5,
                            fontWeight: 700,
                            cursor: managingTripId === tripId ? "not-allowed" : "pointer",
                            fontFamily: "inherit",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            boxShadow: "0 2px 10px rgba(34, 197, 94, 0.15)",
                          }}
                        >
                          {managingTripId === tripId ? "Transferring..." : "🧭 Take Field Command"}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setDeleteModalTrip(trip)}
                        title="Cancel and delete this expedition from system"
                        style={{
                          padding: "6px 12px",
                          borderRadius: 8,
                          background: "transparent",
                          border: "1px solid rgba(239, 68, 68, 0.35)",
                          color: "#fca5a5",
                          fontSize: 11.5,
                          fontWeight: 600,
                          cursor: "pointer",
                          fontFamily: "inherit",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                        }}
                      >
                        🗑️ Delete Expedition
                      </button>

                      <Btn
                        variant={isExpanded ? "default" : "primary"}
                        onClick={() => {
                          if (isExpanded) {
                            setExpandedTrip(null);
                          } else {
                            setExpandedTrip(tripId);
                            loadRosterForTrip(tripId);
                          }
                        }}
                      >
                        {isExpanded ? "Hide Controls ▴" : "Manage Expedition ▾"}
                      </Btn>
                    </div>
                  </div>
                </div>

                {/* Expanded Controls Drawer */}
                {isExpanded && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
                    {/* Sub-tab navigation */}
                    <div style={{ display: "flex", gap: 8, marginBottom: 14, borderBottom: `1px solid ${C.border}`, paddingBottom: 8 }}>
                      <button
                        type="button"
                        onClick={() => setActiveTabMap((p) => ({ ...p, [tripId]: "roster" }))}
                        style={{
                          background: (activeTabMap[tripId] || "roster") === "roster" ? "rgba(59, 130, 246, 0.15)" : "transparent",
                          border: `1px solid ${(activeTabMap[tripId] || "roster") === "roster" ? C.accent : "transparent"}`,
                          borderRadius: 8,
                          padding: "6px 14px",
                          color: (activeTabMap[tripId] || "roster") === "roster" ? "#93c5fd" : C.muted,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        👥 Enrolled Trekkers ({approvedMembers.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTabMap((p) => ({ ...p, [tripId]: "geofence" }))}
                        style={{
                          background: activeTabMap[tripId] === "geofence" ? "rgba(245, 158, 11, 0.15)" : "transparent",
                          border: `1px solid ${activeTabMap[tripId] === "geofence" ? "#f59e0b" : "transparent"}`,
                          borderRadius: 8,
                          padding: "6px 14px",
                          color: activeTabMap[tripId] === "geofence" ? "#fbbf24" : C.muted,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        🔒 Geofence & Safety Perimeter
                      </button>
                    </div>

                    {/* SUB-VIEW 1: ENROLLED TREKKERS ROSTER */}
                    {(activeTabMap[tripId] || "roster") === "roster" && (
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span>Enrolled Trekkers Roster</span>
                          <button
                            type="button"
                            onClick={() => loadRosterForTrip(tripId)}
                            style={{ background: "transparent", border: "none", color: "#60a5fa", fontSize: 11, cursor: "pointer" }}
                          >
                            ↻ Refresh Roster
                          </button>
                        </div>

                        {loadingRoster[tripId] ? (
                          <div style={{ padding: "16px", textAlign: "center", color: C.muted, fontSize: 12 }}>
                            Loading expedition roster from database...
                          </div>
                        ) : approvedMembers.length === 0 ? (
                          <div style={{ padding: "16px", textAlign: "center", color: C.muted2, fontSize: 12, background: "rgba(255,255,255,0.02)", borderRadius: 8 }}>
                            No trekkers currently enrolled in this expedition. Trekkers who apply with code <strong>{trip.code}</strong> and get approved will appear here.
                          </div>
                        ) : (
                          <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead>
                              <tr>
                                <TH>Trekker</TH>
                                <TH>Contact & Blood</TH>
                                <TH>Emergency Contact</TH>
                                <TH>Status</TH>
                                <TH>Roster Actions</TH>
                              </tr>
                            </thead>
                            <tbody>
                              {approvedMembers.map((member) => {
                                const memberKey = `${tripId}-${member.id || member.userId}`;
                                const isActing = !!actionLoading[memberKey];

                                return (
                                  <tr key={memberKey}>
                                    <TD>
                                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                        <div
                                          style={{
                                            width: 30,
                                            height: 30,
                                            borderRadius: "50%",
                                            background: "rgba(59, 130, 246, 0.15)",
                                            border: "1px solid rgba(59, 130, 246, 0.3)",
                                            color: "#60a5fa",
                                            fontSize: 11,
                                            fontWeight: 700,
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                          }}
                                        >
                                          {(member.name || "TR").slice(0, 2).toUpperCase()}
                                        </div>
                                        <div>
                                          <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>
                                            {member.name || "Trekker"}
                                          </div>
                                          <div style={{ fontSize: 11, color: C.muted }}>{member.email || "No email"}</div>
                                        </div>
                                      </div>
                                    </TD>
                                    <TD>
                                      <div style={{ fontSize: 11.5, color: C.text }}>{member.phone || "—"}</div>
                                      <div style={{ fontSize: 11, color: C.muted2 }}>Blood: {member.blood || "B+"} · Medical: {member.medical || "None"}</div>
                                    </TD>
                                    <TD>
                                      <div style={{ fontSize: 11.5, color: C.text }}>{member.ec1Name || "Family"} ({member.ec1Rel || "Next of Kin"})</div>
                                      <div style={{ fontSize: 11, color: C.muted2 }}>📞 {member.ec1Ph || "—"}</div>
                                    </TD>
                                    <TD>
                                      <span
                                        style={{
                                          fontSize: 10,
                                          fontWeight: 700,
                                          padding: "2px 7px",
                                          borderRadius: 10,
                                          background: "rgba(34, 197, 94, 0.15)",
                                          border: "1px solid rgba(34, 197, 94, 0.3)",
                                          color: "#86efac",
                                        }}
                                      >
                                        ● ENROLLED
                                      </span>
                                    </TD>
                                    <TD>
                                      <button
                                        type="button"
                                        onClick={() => handleRemove(tripId, member.id || member.userId)}
                                        disabled={isActing}
                                        style={{
                                          background: "transparent",
                                          border: "1px solid rgba(239, 68, 68, 0.3)",
                                          borderRadius: 6,
                                          color: "#fca5a5",
                                          padding: "4px 10px",
                                          fontSize: 11,
                                          fontWeight: 600,
                                          cursor: isActing ? "not-allowed" : "pointer",
                                          opacity: isActing ? 0.6 : 1,
                                          fontFamily: "inherit",
                                        }}
                                      >
                                        {isActing ? "Removing..." : "Remove from Expedition"}
                                      </button>
                                    </TD>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}

                    {/* SUB-VIEW 2: GEOFENCE SAFETY PERIMETER MANAGEMENT */}
                    {activeTabMap[tripId] === "geofence" && (
                      <div
                        style={{
                          background: "rgba(245, 158, 11, 0.04)",
                          border: "1px solid rgba(245, 158, 11, 0.25)",
                          borderRadius: 12,
                          padding: "16px 20px",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 18 }}>🔒</span>
                              <span style={{ fontSize: 14, fontWeight: 700, color: "#fbbf24" }}>
                                Geofence Safety Perimeter Editor
                              </span>
                              <Pill color="amber">Admin Authority Only</Pill>
                            </div>
                            <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
                              Adjust the maximum allowable distance trekkers can venture from the trail center. Trekkers breaching this perimeter trigger automatic telemetry alerts on their mobile app and this admin radar.
                            </div>
                          </div>

                          <Btn
                            variant="primary"
                            onClick={() => handleSaveGeofence(trip)}
                            disabled={!!savingGeofence[tripId]}
                            style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", border: "none" }}
                          >
                            {savingGeofence[tripId] ? "Broadcasting..." : "Save & Broadcast Perimeter"}
                          </Btn>
                        </div>

                        {geofenceToast[tripId] && (
                          <div
                            style={{
                              marginBottom: 14,
                              padding: "10px 14px",
                              borderRadius: 8,
                              background: "rgba(34, 197, 94, 0.15)",
                              border: "1px solid rgba(34, 197, 94, 0.35)",
                              color: "#86efac",
                              fontSize: 12,
                              fontWeight: 600,
                            }}
                          >
                            {geofenceToast[tripId]}
                          </div>
                        )}

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                          <div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                              <label style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                                Safety Perimeter Radius
                              </label>
                              <span style={{ fontSize: 14, fontWeight: 800, color: "#fbbf24" }}>
                                {((geofenceRadiusMap[tripId] ?? (trip.geofence?.radius || 2500)) / 1000).toFixed(1)} km ({(geofenceRadiusMap[tripId] ?? (trip.geofence?.radius || 2500))} m)
                              </span>
                            </div>

                            <input
                              type="range"
                              min="500"
                              max="5000"
                              step="100"
                              value={geofenceRadiusMap[tripId] ?? (trip.geofence?.radius || 2500)}
                              onChange={(e) =>
                                setGeofenceRadiusMap((p) => ({ ...p, [tripId]: Number(e.target.value) }))
                              }
                              style={{ width: "100%", accentColor: "#f59e0b", marginBottom: 10 }}
                            />

                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                              {[
                                { label: "⚠️ 1.0 km (Dense Fog / Storm)", val: 1000 },
                                { label: "🧭 2.5 km (Standard Corridor)", val: 2500 },
                                { label: "🏔️ 4.0 km (Plateau Range)", val: 4000 },
                              ].map((preset) => (
                                <button
                                  key={preset.val}
                                  type="button"
                                  onClick={() =>
                                    setGeofenceRadiusMap((p) => ({ ...p, [tripId]: preset.val }))
                                  }
                                  style={{
                                    fontSize: 10.5,
                                    padding: "4px 9px",
                                    borderRadius: 6,
                                    border: `1px solid ${(geofenceRadiusMap[tripId] ?? (trip.geofence?.radius || 2500)) === preset.val ? "#f59e0b" : C.border}`,
                                    background: (geofenceRadiusMap[tripId] ?? (trip.geofence?.radius || 2500)) === preset.val ? "rgba(245, 158, 11, 0.2)" : "rgba(255, 255, 255, 0.04)",
                                    color: (geofenceRadiusMap[tripId] ?? (trip.geofence?.radius || 2500)) === preset.val ? "#fbbf24" : C.muted,
                                    cursor: "pointer",
                                    fontFamily: "inherit",
                                  }}
                                >
                                  {preset.label}
                                </button>
                              ))}
                            </div>

                            <label style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 6 }}>
                              Designated Safety Zone Name
                            </label>
                            <Input
                              value={geofenceZoneMap[tripId] ?? (trip.geofence?.zoneName || `${trip.name} Safe Corridor`)}
                              onChange={(e) =>
                                setGeofenceZoneMap((p) => ({ ...p, [tripId]: e.target.value }))
                              }
                              placeholder="e.g. Rajmachi Safe Trek Corridor"
                            />
                          </div>

                          <div
                            style={{
                              background: "rgba(0, 0, 0, 0.3)",
                              border: `1px solid ${C.border}`,
                              borderRadius: 10,
                              padding: "14px 16px",
                              display: "flex",
                              flexDirection: "column",
                              justifyContent: "space-between",
                            }}
                          >
                            <div>
                              <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                                Active Enforced Coordinates
                              </div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
                                📍 Trail Center: {trip.lat || 18.8286}°N, {trip.lon || 73.3986}°E
                              </div>
                              <div style={{ fontSize: 11, color: C.muted2, marginTop: 2 }}>
                                Reference: Rajmachi Fort / Manoranjan Ridge (829m ASL)
                              </div>
                            </div>

                            <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}`, fontSize: 11.5, color: C.muted }}>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                <span>Leader in Command:</span>
                                <span style={{ color: "#fbbf24", fontWeight: 600 }}>{trip.leader || "Field Guide Ajay Saini"}</span>
                              </div>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                <span>User App Enforced Status:</span>
                                <span style={{ color: "#86efac", fontWeight: 600 }}>Active (Locked to Admin)</span>
                              </div>
                              <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span>Walkie-Talkie Channel (VHF Radio):</span>
                                <span style={{ color: "#60a5fa" }}>{trip.vhfChannel || "145.500 MHz (VHF Ch 1)"}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════
   PAGE: DASHBOARD
════════════════════════════════════════════════ */
const PageDashboard = ({ navigate, users=USERS, pendingAdmins=[], pendingTrekkers=[] }) => {
  const active=users.filter(u=>u.status==="active").length;
  const sos=users.filter(u=>u.status==="sos").length;
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
      setTrips(t => [{ id: `TRIP${Date.now()}`, name: newName.trim(),
        date: newDate.trim() || "Date TBD", roster: 1, status: "active", code: genTripCode() }, ...t]);
    }
    setCreatingTrip(false);
    setNewName(""); setNewDate(""); setShowNewTrip(false);
  };
  return (
    <div>
      <PageHeader title="Operations Dashboard" sub="Live visibility for every trip, even where signal can't reach"
        right={<div style={{display:"flex",gap:8}}>{sos>0&&<Pill color="red">🚨 {sos} SOS Active</Pill>}<Pill color="green">● Live</Pill></div>}/>

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
          onClick={() => navigate("trip-rosters")}
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
            Review Rosters ›
          </div>
        </div>
      )}

      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:16}}>
        <StatCard label="Total users" value={users.length} sub="Registered" color={C.accent} icon="👥"/>
        <StatCard label="Active now" value={active} sub="On platform" color={C.green} icon="📍"/>
        <StatCard label="SOS alerts" value={sos} sub="Needs attention" color={C.red} icon="🚨"/>
        <StatCard label="Teams deployed" value={SOS_TEAMS.filter(t=>t.status==="deployed").length} sub="En route" color={C.amber} icon="🚑"/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:14,marginBottom:14}}>
        <div>
          <LiveMap points={users} teams={SOS_TEAMS} height={360}/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginTop:12}}>
            <StatCard label="Active Trips" value={trips.length} sub="In the field" color={C.purple} icon="🧭"/>
            <StatCard label="Devices" value={DEVICES.length} sub="Linked" color={C.teal} icon="📱"/>
            <StatCard label="GPS Accuracy" value="±6m" sub="System-wide" color={C.green} icon="🛰️"/>
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {sos>0&&<Card style={{borderColor:"rgba(239,68,68,0.4)",background:"rgba(239,68,68,0.06)"}}>
            <div style={{fontSize:12,fontWeight:600,color:C.red,marginBottom:8}}>🚨 Active SOS</div>
            {users.filter(u=>u.status==="sos").map(u=>(
              <div key={u.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
                <Avatar initials={u.avatar} bg={u.color[0]} text={u.color[1]}/>
                <div style={{flex:1}}><div style={{fontSize:12,fontWeight:500,color:C.text}}>{u.name}</div><div style={{fontSize:10,color:C.muted}}>📍{u.city} · {u.lastSeen}</div></div>
                <Btn variant="danger" style={{fontSize:10,padding:"4px 8px"}} onClick={()=>navigate("sos-navigation")}>Navigate</Btn>
              </div>
            ))}
          </Card>}
          <Card>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{fontSize:12,fontWeight:600,color:C.text,display:"flex",alignItems:"center",gap:6}}>Recent trips
                <span style={{fontSize:9,fontWeight:500,padding:"1px 6px",borderRadius:4,background:tripsAreLive?"rgba(34,197,94,0.15)":"rgba(255,255,255,0.08)",color:tripsAreLive?"#4ade80":C.muted2}}>{tripsAreLive?"LIVE":"DEMO DATA"}</span>
              </div>
              <button onClick={()=>setShowNewTrip(s=>!s)} style={{fontSize:11,color:C.accent,background:"none",border:"none",cursor:"pointer",fontFamily:"inherit"}}>{showNewTrip?"Cancel":"+ New trip"}</button>
            </div>
            {showNewTrip && (
              <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:10,padding:10,background:"rgba(255,255,255,0.03)",borderRadius:8}}>
                <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Trip name, e.g. Lonavala Night Trek" style={{height:32,background:"rgba(255,255,255,0.04)",border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:12,padding:"0 10px",fontFamily:"inherit",outline:"none"}}/>
                <input value={newDate} onChange={e=>setNewDate(e.target.value)} placeholder="Date, e.g. Jun 14–15, 2026" style={{height:32,background:"rgba(255,255,255,0.04)",border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:12,padding:"0 10px",fontFamily:"inherit",outline:"none"}}/>
                <Btn variant="primary" style={{justifyContent:"center",fontSize:12}} onClick={createTrip} disabled={creatingTrip}>{creatingTrip?"Creating…":"Create trip & generate code"}</Btn>
              </div>
            )}
            {trips.slice(0,4).map(t=>(
              <div key={t.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${C.border}`,fontSize:12}}>
                <div>
                  <div style={{color:C.text}}>{t.name}</div>
                  <div style={{fontSize:10,color:C.muted,marginTop:2}}>Join code: <span style={{fontWeight:600,letterSpacing:1,color:C.accent}}>{t.code}</span></div>
                </div>
                <Pill color={t.status==="active"?"green":t.status==="completed"?"amber":"red"}>{t.status}</Pill>
              </div>
            ))}
          </Card>
          <Card>
            <div style={{fontSize:12,fontWeight:600,color:C.text,marginBottom:10}}>SOS Teams</div>
            {SOS_TEAMS.map(t=>(
              <div key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:`1px solid ${C.border}`}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:t.status==="deployed"?C.amber:C.muted2}}/>
                <div style={{flex:1,fontSize:12,color:C.text}}>{t.name}</div>
                <div style={{fontSize:11,color:C.muted}}>{t.eta!=="—"?`ETA ${t.eta}`:t.status}</div>
              </div>
            ))}
            <button onClick={()=>navigate("sos-navigation")} style={{marginTop:10,fontSize:11,color:C.red,background:"none",border:"none",cursor:"pointer",fontFamily:"inherit"}}>Launch Navigation →</button>
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
                <TD style={{ color: C.muted, fontSize: 12 }}>{u.lastSeen || "Just now"}</TD>
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
   PAGE: DEVICE TRACKING
════════════════════════════════════════════════ */
const PageDeviceTracking = ({ users = USERS, connectionState = "disconnected" }) => {
  const [sel, setSel] = useState(null);
  const sigColor = { strong: C.green, medium: C.amber, low: C.red };
  const displayUsers = users && users.length > 0 ? users : USERS;

  // Build live devices list dynamically for all expedition members
  const liveDevices = useMemo(() => {
    return displayUsers.map((u, idx) => {
      const isLead = u.id === RAJMACHI_ADMIN.id || u.isAdmin;
      const deviceModel = isLead
        ? "Garmin InReach Mini 2 (SatCom)"
        : idx % 4 === 0
        ? "Garmin Instinct 2 Solar"
        : idx % 4 === 1
        ? "Apple Watch Ultra 2"
        : idx % 4 === 2
        ? "Polar H10 Chest Strap"
        : "Coros Vertix 2";

      return {
        id: `DEV-00${idx + 1}`,
        name: deviceModel,
        user: u.name,
        type: isLead ? "satellite" : idx % 4 === 2 ? "sensor" : "watch",
        battery: u.battery || (88 - idx * 4),
        signal: (u.battery || 85) > 40 ? "strong" : "medium",
        gps: true,
        sos: true,
        lat: u.lat,
        lon: u.lon,
        alt: u.altitude || 820,
        status: u.status || "active",
        lastSeen: u.lastSeen || "Just now",
      };
    });
  }, [displayUsers]);

  const liveGpsCount = liveDevices.filter((d) => d.gps && d.lat && d.lon).length;

  return (
    <div>
      <PageHeader
        title="Connected Field Devices & Sensors"
        sub="Continuous GPS telemetry and beacon tracking across the Rajmachi trail"
        right={
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Pill color={connectionState === "connected" ? "green" : connectionState === "connecting" ? "amber" : "green"}>
              ● Dual Mesh (LoRa + 4G)
            </Pill>
            <Pill color="green">● {liveGpsCount} Active GPS Beacons</Pill>
          </div>
        }
      />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 14 }}>
        <div>
          <LiveMap points={displayUsers} height={380} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginTop: 12 }}>
            <StatCard label="Total devices" value={liveDevices.length} sub="Registered" color={C.accent} icon="📱" />
            <StatCard label="GPS tracking" value={liveGpsCount} sub="Live on trail" color={C.green} icon="📡" />
            <StatCard label="SOS capable" value={liveDevices.filter((d) => d.sos).length} sub="Hardware triggers" color={C.purple} icon="🛰️" />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>
            Expedition Hardware List ({liveDevices.length})
          </div>
          {liveDevices.map((d) => (
            <Card
              key={d.id}
              style={{
                cursor: "pointer",
                borderColor: sel === d.id ? C.accent : C.border,
                background: sel === d.id ? "rgba(59,130,246,0.07)" : C.card,
                marginBottom: 0,
              }}
              onClick={() => setSel(sel === d.id ? null : d.id)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ fontSize: 20, width: 36, height: 36, background: "rgba(255,255,255,0.05)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {d.type === "phone" ? "📱" : d.type === "watch" ? "⌚" : d.type === "satellite" ? "🛰️" : "🫁"}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>{d.name}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>{d.user}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, color: sigColor[d.signal] }}>● {d.signal}</div>
                  <div style={{ fontSize: 11, color: C.muted2 }}>🔋 {d.battery}%</div>
                </div>
              </div>
              {sel===d.id&&(
                <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${C.border}`,display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                  {[["GPS",d.gps?"Active":"Off"],["SOS",d.sos?"Enabled":"Disabled"],["Live status",d.status],["ID",d.id],["Lat",typeof d.lat === "number" ? d.lat.toFixed(5) : "—"],["Lon",typeof d.lon === "number" ? d.lon.toFixed(5) : "—"],["Signal",d.signal],["Last seen",d.lastSeen || "—"]].map(([k,v])=>(
                    <div key={k}><div style={{fontSize:10,color:C.muted2}}>{k}</div><div style={{fontSize:12,color:C.text}}>{v}</div></div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════
   PAGE: FEATURE ACCESS
════════════════════════════════════════════════ */
const PageFeatureAccess = ({ users = [] }) => {
  // Compute initial access state from dynamic users list
  const computeInit = () => {
    const init = {};
    const allUsers = users && users.length > 0 ? users : USERS;
    allUsers.forEach(u => {
      if (!u?.id) return;
      init[u.id] = {};
      FEATURES.forEach(f => {
        init[u.id][f] = u.role === "Field Guide" || ["Weather", "Emergency SOS"].includes(f);
      });
    });
    return init;
  };
  
  const [access, setAccess] = useState(computeInit);
  const [saved, setSaved] = useState(false);
  const allUsers = users && users.length > 0 ? users : USERS;
  
  const toggle = (uid, feat) => setAccess(a => ({ ...a, [uid]: { ...a[uid], [feat]: !a[uid][feat] } }));
  const grantAll = uid => setAccess(a => ({ ...a, [uid]: Object.fromEntries(FEATURES.map(f => [f, true])) }));
  const revokeAll = uid => setAccess(a => ({ ...a, [uid]: Object.fromEntries(FEATURES.map(f => [f, false])) }));
  const save = async () => {
    setSaved(true);
    // Save to backend (TODO: implement persistence)
    console.log("Feature access saved:", access);
    setTimeout(() => setSaved(false), 2500);
  };
  return (
    <div>
      <PageHeader title="Feature Access Control" sub="Grant or revoke access per user" right={<Btn variant="primary" onClick={save}>{saved?"✓ Saved":"Save changes"}</Btn>}/>
      {saved&&<div style={{background:"rgba(34,197,94,0.1)",border:"1px solid rgba(34,197,94,0.25)",borderRadius:10,padding:"10px 16px",fontSize:13,color:"#86efac",marginBottom:16}}>Access settings saved successfully.</div>}
      <Card style={{padding:0,overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr><TH style={{minWidth:180}}>User</TH>{FEATURES.map(f=><TH key={f} style={{textAlign:"center",minWidth:90,fontSize:10}}>{f}</TH>)}<TH style={{textAlign:"center"}}>Actions</TH></tr></thead>
          <tbody>{allUsers.map((u, i) => (
            <tr key={u.id} style={{background:i%2===0?"transparent":"rgba(255,255,255,0.012)"}}>
              <TD><div style={{display:"flex",alignItems:"center",gap:8}}><Avatar initials={u.avatar} bg={u.color[0]} text={u.color[1]}/><div><div style={{fontSize:12,fontWeight:500}}>{u.name}</div><Pill color="blue">{u.role}</Pill></div></div></TD>
              {FEATURES.map(f=><TD key={f} style={{textAlign:"center"}}><Toggle on={access[u.id]?.[f]} onChange={()=>toggle(u.id,f)}/></TD>)}
              <TD style={{textAlign:"center"}}><div style={{display:"flex",gap:6,justifyContent:"center"}}><Btn onClick={()=>grantAll(u.id)}>All</Btn><Btn onClick={()=>revokeAll(u.id)}>None</Btn></div></TD>
            </tr>
          ))}</tbody>
        </table>
      </Card>
    </div>
  );
};

/* ════════════════════════════════════════════════
   PAGE: SAFETY PROTOCOL
════════════════════════════════════════════════ */
const PageSafetyProtocol = () => {
  const [protocols,setProtocols]=useState(PROTOCOLS);
  const [editing,setEditing]=useState(null);
  const [title,setTitle]=useState("");
  const [body,setBody]=useState("");
  const [showNew,setShowNew]=useState(false);
  useEffect(()=>{
    let isMounted = true;
    const unsubscribe = subscribeToSafetyProtocols((items)=>{
      if (!isMounted) return;
      if (items.length > 0) {
        setProtocols(items);
      }
    });
    return ()=>{
      isMounted = false;
      unsubscribe();
    };
  },[]);
  const startEdit=p=>{setEditing(p.id);setTitle(p.title);setBody(p.body || "");setShowNew(false);};
  const saveP=async()=>{
    if(!title.trim()) return;
    const payload={title:title.trim(),body:body.trim(),status:"published",author:"Admin"};
    if(editing) await updateSafetyProtocol(editing,payload);
    else await createSafetyProtocol(payload);
    setEditing(null);setShowNew(false);setTitle("");setBody("");
  };
  return (
    <div>
      <PageHeader title="Safety Protocol Editor" sub="Write and publish safety guidelines"
        right={<Btn variant="primary" onClick={()=>{setShowNew(true);setEditing(null);setTitle("");setBody("");}}>+ New protocol</Btn>}/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        <div>
          {protocols.map(p=>(
            <Card key={p.id} style={{marginBottom:10,borderColor:p.status==="published"?"rgba(34,197,94,0.2)":C.border}}>
              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10}}>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}><div style={{fontSize:13,fontWeight:500,color:C.text}}>{p.title}</div><Pill color={p.status==="published"?"green":"amber"}>{p.status}</Pill></div>
                  <div style={{fontSize:11,color:C.muted2}}>Updated {p.updated} · by {p.author}</div>
                </div>
                <div style={{display:"flex",gap:6,flexShrink:0}}>
                  <Btn onClick={()=>startEdit(p)}>Edit</Btn>
                  {p.status==="draft"&&<Btn variant="success" onClick={()=>updateSafetyProtocol(p.id,{status:"published",title:p.title,body:p.body,author:p.author||"Admin"})}>Publish</Btn>}
                  <Btn variant="ghost" onClick={()=>deleteSafetyProtocol(p.id)} style={{color:C.red}}>✕</Btn>
                </div>
              </div>
            </Card>
          ))}
        </div>
        {(editing||showNew)?<div>
          <Card>
            <label style={{fontSize:11,color:C.muted,display:"block",marginBottom:6}}>Protocol title</label>
            <Input value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Emergency weather response" style={{marginBottom:12}}/>
            <label style={{fontSize:11,color:C.muted,display:"block",marginBottom:6}}>Protocol body</label>
            <textarea value={body} onChange={e=>setBody(e.target.value)} rows={10} placeholder={"Step 1: ...\nStep 2: ..."}
              style={{width:"100%",background:"rgba(255,255,255,0.04)",border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:13,padding:12,fontFamily:"inherit",resize:"vertical",boxSizing:"border-box",outline:"none",lineHeight:1.6,marginBottom:14}}/>
            <div style={{display:"flex",gap:10}}>
              <Btn variant="primary" onClick={saveP}>Save &amp; Publish</Btn>
              <Btn onClick={()=>{setEditing(null);setShowNew(false);}}>Cancel</Btn>
            </div>
          </Card>
        </div>:<div style={{display:"flex",alignItems:"center",justifyContent:"center",border:`1px dashed ${C.border}`,borderRadius:14,color:C.muted2,fontSize:13,cursor:"pointer",minHeight:200}} onClick={()=>{setShowNew(true);setTitle("");setBody("");}}>+ Create new protocol</div>}
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════
   PAGE: BLUETOOTH DEVICES
════════════════════════════════════════════════ */
/* ════════════════════════════════════════════════
   PAGE: WEARABLES & BIOMETRIC TELEMETRY RADAR
   (Replaces unrealistic desktop BLE scanning with real trekker telemetry stream)
════════════════════════════════════════════════ */
const PageWearablesRadar = ({ users = USERS }) => {
  const [syncing, setSyncing] = useState(false);
  const [syncToast, setSyncToast] = useState("");
  const [stressSim, setStressSim] = useState(false);

  const displayUsers = users && users.length > 0 ? users : USERS;

  // Build full 6-member wearable telemetry list
  const memberTelemetry = useMemo(() => {
    return [
      {
        id: RAJMACHI_ADMIN.id,
        name: "Ajay Saini",
        role: "Expedition Leader & Field Guide",
        badge: "Lead Navigator",
        avatar: "AS",
        color: ["#f59e0b", "#78350f"],
        device: "Garmin InReach Mini 2 + Fenix 7X Pro",
        type: "SatCom + Tactical Watch",
        battery: 95,
        hr: 76,
        spo2: 98,
        alt: 842,
        steps: 11420,
        pace: "3.6 km/h",
        signal: "strong",
        protocol: "Iridium Satellite + VHF 145.500 MHz",
        lastSync: "Just now",
        status: "Leading at Manoranjan Ridge",
      },
      ...displayUsers.map((u, idx) => {
        const isAnirban = u.name === "Anirban Panda";
        const hr = stressSim && isAnirban ? 168 : (u.heartRate || (82 + (idx * 3)));
        const spo2 = stressSim && isAnirban ? 89 : (u.spo2 || 98);
        const deviceName = isAnirban
          ? "Garmin Instinct 2 Solar"
          : idx === 1
          ? "Apple Watch Ultra 2"
          : idx === 2
          ? "Polar H10 Chest Strap"
          : idx === 3
          ? "Coros Vertix 2"
          : "Suunto 9 Peak";

        const deviceType = idx === 2 ? "Optical Chest Sensor" : "GPS Multisport Watch";

        return {
          id: u.id,
          name: u.name,
          role: u.badge || (u.isAdmin ? "Expedition Leader" : "Enrolled Trekker"),
          badge: u.trailStatus || "On Trail",
          avatar: u.avatar || (u.name || "TR").slice(0, 2).toUpperCase(),
          color: u.color || ["#3b82f6", "#1e3a8a"],
          device: deviceName,
          type: deviceType,
          battery: u.battery || (88 - idx * 4),
          hr,
          spo2,
          alt: u.altitude || (829 - idx * 12),
          steps: isAnirban ? 9420 : (8100 - idx * 450),
          pace: "3.2 km/h",
          signal: "strong",
          protocol: "LoRa 868MHz Mesh + BLE Stream",
          lastSync: "12s ago",
          status: u.trailStatus || "Active on Trail",
          isElevated: hr > 150 || spo2 < 90,
        };
      }).filter(u => u.name !== "Ajay Saini"),
    ];
  }, [displayUsers, stressSim]);

  const handleSyncAll = () => {
    setSyncing(true);
    setSyncToast("Requesting immediate biometric telemetry sync across all active expedition wearables...");
    setTimeout(() => {
      setSyncing(false);
      setSyncToast("✓ Telemetry refreshed: All 6 field wearables transmitting live biometrics.");
      setTimeout(() => setSyncToast(""), 4500);
    }, 1200);
  };

  const avgHr = Math.round(memberTelemetry.reduce((acc, m) => acc + m.hr, 0) / memberTelemetry.length);
  const avgSpo2 = (memberTelemetry.reduce((acc, m) => acc + m.spo2, 0) / memberTelemetry.length).toFixed(1);
  const criticalCount = memberTelemetry.filter((m) => m.hr > 150 || m.spo2 < 90 || m.battery < 20).length;

  return (
    <div>
      <PageHeader
        title="Expedition Wearables & Biometrics Radar"
        sub="Continuous physiological telemetry streamed from trekkers' paired fitness gadgets and smartwatches"
        right={
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Pill color="green">● 6/6 Wearables Synced</Pill>
            <Pill color="blue">LoRa + Cellular Mesh</Pill>
            <button
              type="button"
              onClick={() => setStressSim((s) => !s)}
              style={{
                fontSize: 11,
                padding: "6px 12px",
                borderRadius: 8,
                border: `1px solid ${stressSim ? C.red : C.border}`,
                background: stressSim ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.04)",
                color: stressSim ? "#fca5a5" : C.muted,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {stressSim ? "⚠️ Bio-Stress Alert Active" : "🧪 Test Stress Event"}
            </button>
            <Btn variant="primary" onClick={handleSyncAll} disabled={syncing}>
              {syncing ? "↻ Syncing Telemetry..." : "↻ Refresh Vitals"}
            </Btn>
          </div>
        }
      />

      {syncToast && (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 16px",
            borderRadius: 10,
            background: "rgba(34, 197, 94, 0.12)",
            border: "1px solid rgba(34, 197, 94, 0.35)",
            color: "#86efac",
            fontSize: 12.5,
            fontWeight: 600,
          }}
        >
          {syncToast}
        </div>
      )}

      {/* Quick Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
        <StatCard label="Avg Group Heart Rate" value={`${avgHr} BPM`} sub="Target: 60–130 BPM" color={avgHr > 120 ? C.amber : C.green} icon="❤️" />
        <StatCard label="Avg Blood Oxygen" value={`${avgSpo2}%`} sub="Normal &gt; 95% SpO2" color={avgSpo2 < 92 ? C.red : C.teal} icon="🫁" />
        <StatCard label="Active Biometric Beacons" value="6 / 6" sub="Garmin · Apple · Polar · Coros" color={C.accent} icon="⌚" />
        <StatCard label="Health Alerts" value={criticalCount} sub={criticalCount > 0 ? "Elevated Exertion Detected" : "All Normal"} color={criticalCount > 0 ? C.red : C.green} icon="🛡️" />
      </div>

      {/* Telemetry Cards Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 14 }}>
        {memberTelemetry.map((m) => {
          const isLead = m.id === RAJMACHI_ADMIN.id;
          const isWarning = m.isElevated;

          return (
            <Card
              key={m.id}
              style={{
                background: isWarning ? "rgba(239, 68, 68, 0.08)" : "rgba(11, 20, 34, 0.95)",
                borderColor: isWarning ? "rgba(239, 68, 68, 0.45)" : isLead ? "rgba(245, 158, 11, 0.4)" : C.border,
                position: "relative",
                overflow: "hidden",
              }}
            >
              {isLead && (
                <div style={{ position: "absolute", top: 12, right: 12 }}>
                  <Pill color="amber">Expedition Leader</Pill>
                </div>
              )}
              {isWarning && (
                <div style={{ position: "absolute", top: 12, right: 12 }}>
                  <Pill color="red">🚨 High Bio-Stress Alert</Pill>
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <Avatar initials={m.avatar} bg={m.color[0]} text={m.color[1]} size={42} />
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{m.name}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>{m.role} · {m.status}</div>
                </div>
              </div>

              {/* Gadget Model Header */}
              <div
                style={{
                  background: "rgba(255, 255, 255, 0.03)",
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  padding: "8px 12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 12,
                }}
              >
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#60a5fa" }}>{m.device}</div>
                  <div style={{ fontSize: 10, color: C.muted2 }}>{m.type} · {m.protocol}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: m.battery < 25 ? C.red : C.green }}>
                    🔋 {m.battery}%
                  </div>
                  <div style={{ fontSize: 9.5, color: C.muted2 }}>{m.lastSync}</div>
                </div>
              </div>

              {/* Vitals Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div
                  style={{
                    background: "rgba(255, 255, 255, 0.02)",
                    border: `1px solid ${m.hr > 150 ? "rgba(239, 68, 68, 0.4)" : C.border}`,
                    borderRadius: 8,
                    padding: "10px",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>
                    Heart Rate
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: m.hr > 150 ? C.red : m.hr > 120 ? C.amber : "#86efac" }}>
                    ❤️ {m.hr} <span style={{ fontSize: 11, fontWeight: 500, color: C.muted }}>BPM</span>
                  </div>
                  <div style={{ fontSize: 10, color: m.hr > 150 ? "#fca5a5" : C.muted2, marginTop: 2 }}>
                    {m.hr > 150 ? "Anaerobic Max" : m.hr > 120 ? "Cardio Exertion" : "Aerobic Steady"}
                  </div>
                </div>

                <div
                  style={{
                    background: "rgba(255, 255, 255, 0.02)",
                    border: `1px solid ${m.spo2 < 90 ? "rgba(239, 68, 68, 0.4)" : C.border}`,
                    borderRadius: 8,
                    padding: "10px",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>
                    Blood Oxygen
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: m.spo2 < 90 ? C.red : "#38bdf8" }}>
                    🫁 {m.spo2}%
                  </div>
                  <div style={{ fontSize: 10, color: m.spo2 < 90 ? "#fca5a5" : C.muted2, marginTop: 2 }}>
                    {m.spo2 < 90 ? "Hypoxia Risk Alert" : "Optimal Saturation"}
                  </div>
                </div>

                <div style={{ background: "rgba(255, 255, 255, 0.02)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px" }}>
                  <div style={{ fontSize: 10, color: C.muted2 }}>Elevation</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>🏔️ {m.alt}m ASL</div>
                </div>

                <div style={{ background: "rgba(255, 255, 255, 0.02)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px" }}>
                  <div style={{ fontSize: 10, color: C.muted2 }}>Trail Activity</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>👟 {m.steps.toLocaleString()} steps</div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

const PageBluetooth = PageWearablesRadar;

/* ════════════════════════════════════════════════
   PAGE: SOS ADMIN
════════════════════════════════════════════════ */
const PageSOSAdmin = ({ navigate, users=USERS }) => {
  const [resolvedUserIds,setResolvedUserIds]=useState(() => new Set());

  useEffect(() => {
    setResolvedUserIds((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const userId of next) {
        const stillSOS = users.some((user) => user.id === userId && user.status === "sos");
        if (!stillSOS) {
          next.delete(userId);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [users]);

  const events = useMemo(() => {
    const liveIncidents = users
      .filter((user) => user.status === "sos" && !resolvedUserIds.has(user.id))
      .map((user) => {
        const profile = USERS.find((candidate) => candidate.id === user.id || candidate.name === user.name);
        const template = SOS_EVENTS.find((incident) => incident.userId === user.id) || SOS_EVENTS[0] || {};

        return {
          id: `sos-${user.id}`,
          userId: user.id,
          user: user.name || profile?.name || "Trekker in Distress",
          city: user.city || profile?.city || "Rajmachi Fort Trail",
          lat: typeof user.lat === "number" ? user.lat : (template.lat ?? 18.8286),
          lon: typeof user.lon === "number" ? user.lon : (template.lon ?? 73.3986),
          blood: user.blood || profile?.blood || template.blood || "B+",
          medical: user.medical || profile?.medical || template.medical || "None reported",
          status: "active",
          ec: profile?.ec || template.ec || "Emergency Contact",
          priority: "critical",
          team: "Team Alpha (Lonavala Mountain SAR)",
          type: "Manual SOS Beacon",
          time: "Just now",
        };
      });

    const acknowledged = users
      .filter((user) => resolvedUserIds.has(user.id))
      .map((user) => {
        const profile = USERS.find((candidate) => candidate.id === user.id || candidate.name === user.name);
        const template = SOS_EVENTS.find((incident) => incident.userId === user.id) || SOS_EVENTS[0] || {};

        return {
          id: `resolved-${user.id}`,
          userId: user.id,
          user: user.name || profile?.name || "Trekker",
          city: user.city || profile?.city || "Rajmachi Fort Trail",
          lat: typeof user.lat === "number" ? user.lat : (template.lat ?? 18.8286),
          lon: typeof user.lon === "number" ? user.lon : (template.lon ?? 73.3986),
          blood: user.blood || profile?.blood || template.blood || "B+",
          medical: user.medical || profile?.medical || template.medical || "None reported",
          status: "resolved",
          ec: profile?.ec || template.ec || "Emergency Contact",
          priority: "high",
          team: "Team Alpha (Lonavala Mountain SAR)",
          type: "Manual SOS Beacon",
          time: "Acknowledged",
        };
      });

    return [...liveIncidents, ...acknowledged];
  }, [resolvedUserIds, users]);

  const activeCount = useMemo(() => events.filter((event) => event.status === "active").length, [events]);
  const resolvedCount = useMemo(() => events.filter((event) => event.status === "resolved").length, [events]);

  const resolve = (id) => {
    const incident = events.find((event) => event.id === id);
    if (!incident) return;
    setResolvedUserIds((prev) => new Set(prev).add(incident.userId));
  };
  return (
    <div>
      <PageHeader title="SOS Admin Service" sub="Manage all emergency SOS events"
        right={<div style={{display:"flex",gap:8}}><Pill color="red">🚨 {activeCount} active</Pill><button onClick={()=>navigate("sos-navigation")} style={{padding:"7px 14px",borderRadius:8,border:"none",background:`linear-gradient(135deg,${C.red},${C.accent2})`,color:"#fff",fontSize:12,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>🗺 Navigate</button></div>}/>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:16}}>
        <StatCard label="Active SOS" value={activeCount} sub="Needs response" color={C.red} icon="🚨"/>
        <StatCard label="Resolved" value={resolvedCount} sub="Closed" color={C.green} icon="✅"/>
        <StatCard label="Teams deployed" value={SOS_TEAMS.filter(t=>t.status==="deployed").length} sub="En route" color={C.amber} icon="🚑"/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:14}}>
        <div>
          <LiveMap points={users} teams={SOS_TEAMS} height={340}/>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {events.map(ev=>(
            <Card key={ev.id} style={{borderColor:ev.status==="active"?"rgba(239,68,68,0.4)":C.border,background:ev.status==="active"?"rgba(239,68,68,0.05)":C.card}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                <div><div style={{fontSize:13,fontWeight:600,color:C.text,marginBottom:2}}>{ev.user}</div><div style={{fontSize:11,color:C.muted}}>📍{ev.city} · {ev.time}</div></div>
                <Pill color={ev.priority==="critical"?"red":ev.priority==="high"?"amber":"blue"}>{ev.priority}</Pill>
              </div>
              <div style={{fontSize:11,color:C.muted2,marginBottom:8}}>{ev.type} · {ev.team}</div>
              <div style={{display:"flex",gap:6}}>
                <Pill color={ev.status==="active"?"red":"green"}>{ev.status}</Pill>
                {ev.status==="active"&&<>
                  <Btn style={{fontSize:10,padding:"3px 8px"}} onClick={()=>navigate("sos-navigation")}>🗺 Nav</Btn>
                  <Btn variant="success" style={{fontSize:10,padding:"3px 8px"}} onClick={()=>resolve(ev.id)}>✓ Resolve</Btn>
                </>}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════
   PAGE: SOS TEAM TRACKING
════════════════════════════════════════════════ */
const PageSOSTracking = ({ users=USERS }) => (
  <div>
    <PageHeader title="SOS Team Tracking" sub="Live positions of all rescue teams" right={<Pill color="amber">{SOS_TEAMS.filter(t=>t.status==="deployed").length} teams deployed</Pill>}/>
    <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:14}}>
      <LiveMap points={users} teams={SOS_TEAMS} height={400}/>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {SOS_TEAMS.map(t=>(
          <Card key={t.id} style={{borderColor:t.status==="deployed"?"rgba(245,158,11,0.3)":C.border}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
              <div style={{width:38,height:38,borderRadius:"50%",background:"rgba(245,158,11,0.12)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>🚑</div>
              <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:C.text}}>{t.name}</div><div style={{fontSize:11,color:C.muted}}>{t.vehicle} · Lead: {t.lead}</div></div>
              <Pill color={t.status==="deployed"?"amber":"gray"}>{t.status}</Pill>
            </div>
            {[["Members",t.members],["Speed",t.speed],["Heading",`${t.heading}°`],["ETA",t.eta]].map(([k,v])=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"4px 0",borderBottom:`1px solid ${C.border}`}}>
                <span style={{color:C.muted2}}>{k}</span><span style={{color:C.text,fontFamily:"monospace"}}>{v}</span>
              </div>
            ))}
          </Card>
        ))}
      </div>
    </div>
  </div>
);

/* ════════════════════════════════════════════════
   PAGE: LIVE TRACKING
════════════════════════════════════════════════ */
const PageLiveTracking = ({ navigate, users=USERS, connectionState="disconnected", error=null }) => {
  const [filter,setFilter]=useState("all");
  const [sel,setSel]=useState(null);
  const displayUsers = users && users.length > 0 ? users : USERS;
  const filtered = filter === "all" ? displayUsers : displayUsers.filter(u => u.status === filter);
  const activeSOSUser = displayUsers.find((user) => user.status === "sos") || null;
  const activeTeam = SOS_TEAMS.find((team) => team.status === "deployed") || SOS_TEAMS[0];

  // Calculate distance from Admin (Ajay Saini) for each member
  const memberDistances = displayUsers.map(u => calculateDistanceMeters(RAJMACHI_ADMIN.lat, RAJMACHI_ADMIN.lon, u.lat, u.lon));
  const maxSpread = memberDistances.length > 0 ? Math.max(...memberDistances) : 0;
  
  return (
    <div>
      <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:12}}>
        <div style={{
          width:8, height:8, borderRadius:"50%", 
          background: connectionState === "connected" ? C.green : connectionState === "connecting" ? C.amber : C.red,
          animation: connectionState === "connecting" ? "pulse 1s infinite" : "none"
        }}/>
        <span style={{fontSize:11, color:C.muted}}>
          Server: <span style={{color: connectionState === "connected" ? C.green : C.red}}>
            {connectionState === "connected" ? "✅ Connected" : connectionState === "connecting" ? "⏳ Connecting..." : "❌ Disconnected"}
          </span>
          {error && <span style={{color:C.red, marginLeft:8}}>Error: {error}</span>}
        </span>
      </div>

      <PageHeader title="Live Navigation & User Tracking" sub="Real-time positions, member proximity and trail formation"
        right={<div style={{display:"flex",gap:6}}>
          {["all","active","sos"].map(f=><button key={f} onClick={()=>setFilter(f)} style={{padding:"5px 12px",borderRadius:7,border:`1px solid ${filter===f?C.accent:C.border}`,background:filter===f?"rgba(59,130,246,0.12)":"transparent",color:filter===f?C.accent:C.muted,fontSize:11,cursor:"pointer",fontFamily:"inherit",textTransform:"capitalize"}}>{f}</button>)}
        </div>}/>

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

      <div style={{display:"grid",gridTemplateColumns:"1fr 310px",gap:14}}>
        <div>
          <LiveMap
            points={filtered}
            teams={SOS_TEAMS.filter(t=>t.status==="deployed")}
            routeFrom={activeTeam}
            routeTo={activeSOSUser}
            height={420}
          />
          {activeSOSUser && (
            <div style={{marginTop:10,background:"rgba(239,68,68,0.08)",border:`1px solid rgba(239,68,68,0.25)`,borderRadius:10,padding:"10px 12px",fontSize:12,color:C.text}}>
              <strong style={{color:C.red}}>Nearest SOS route:</strong> {activeTeam.name} is routed to {activeSOSUser.name} at {activeSOSUser.city}.
            </div>
          )}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginTop:12}}>
            <StatCard label="Users tracked" value={displayUsers.filter(u=>u.status==="active").length} sub="Online" color={C.accent} icon="📍"/>
            <StatCard label="SOS active" value={displayUsers.filter(u=>u.status==="sos").length} sub="Alert" color={C.red} icon="🚨"/>
            <StatCard label="Teams deployed" value={SOS_TEAMS.filter(t=>t.status==="deployed").length} sub="Moving" color={C.amber} icon="🚑"/>
            <StatCard label="GPS accuracy" value="±6m" sub="Avg" color={C.green} icon="🛰️"/>
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:580,overflowY:"auto"}}>
          <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4,display:"flex",justifyContent:"space-between"}}>
            <span>Trekker Group ({filtered.length})</span>
            <span style={{color:"#60a5fa"}}>Distances from You</span>
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
                      ["Altitude", u.altitude ? `${u.altitude}m ASL` : "820m ASL"],
                      ["Battery", u.battery ? `${u.battery}%` : "85%"],
                      ["Heart Rate", u.heartRate ? `${u.heartRate} bpm` : "82 bpm"],
                      ["Blood SpO2", `${u.spO2 || 98}% (Optimal Saturation)`],
                      ["Synced Wearable", u.wearable || "Garmin Instinct 2 (BLE Synced)"],
                      ["Latitude", `${u.lat?.toFixed(4)}°N` || "—"],
                      ["Longitude", `${u.lon?.toFixed(4)}°E` || "—"],
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
                        <Btn variant="danger" style={{ flex: 1, justifyContent: "center", fontSize: 11 }}>
                          SOS Dispatch
                        </Btn>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
          <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",margin:"12px 0 4px"}}>SOS Teams</div>
          {SOS_TEAMS.map(t=>(
            <Card key={t.id} style={{marginBottom:0,borderColor:t.status==="deployed"?"rgba(245,158,11,0.3)":C.border}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:32,height:32,borderRadius:"50%",background:"rgba(245,158,11,0.15)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>🚑</div>
                <div style={{flex:1}}><div style={{fontSize:12,fontWeight:500,color:C.text}}>{t.name}</div><div style={{fontSize:10,color:C.muted}}>{t.vehicle} · {t.speed} · ETA {t.eta}</div></div>
                <Pill color={t.status==="deployed"?"amber":"gray"}>{t.status}</Pill>
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
  road:      { url:"https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",      attr:"© OpenStreetMap contributors" },
  satellite: { url:"https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attr:"© Esri World Imagery" },
  terrain:   { url:"https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",        attr:"© OpenTopoMap contributors" },
};

const LeafletMap = ({ height=480, tileType="road", perspective=false, markers=[], center=[18.8286, 73.3986], zoom=13 }) => {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  const [leafletReady, setLeafletReady] = useState(!!window.L);

  /* Use shared loader so no duplicate script tags */
  useEffect(() => { injectLeafletStyles(); ensureLeaflet(() => setLeafletReady(true)); }, []);

  useEffect(() => {
    if (!leafletReady || !containerRef.current) return;
    const L = window.L;
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    const map = L.map(containerRef.current, { center, zoom, zoomControl:true });
    const { url, attr } = TILE_LAYERS[tileType] || TILE_LAYERS.road;
    L.tileLayer(url, { attribution:attr, maxZoom:19 }).addTo(map);
    const mkIcon = (color="#3b82f6") => L.divIcon({
      className:"",
      html:`<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 0 0 5px ${color}44;"></div>`,
      iconSize:[14,14], iconAnchor:[7,7], popupAnchor:[0,-10]
    });
    const station = L.marker(center, { icon:mkIcon("#f59e0b") }).addTo(map);
    station.bindPopup(`<b>🏔️ Rajmachi Weather Station</b><br><small>Manoranjan Ridge Observation Post<br>18.8286°N · 73.3986°E · 829m ASL</small>`);
    markers.forEach(m => {
      const mk = L.marker([m.lat,m.lon], { icon:mkIcon(m.color||"#ef4444") }).addTo(map);
      if (m.popup) mk.bindPopup(m.popup);
    });
    mapRef.current = map;
    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, [leafletReady, tileType]);

  return (
    <div style={{ borderRadius:12, overflow:"hidden", border:`1px solid ${C.border}`, boxShadow:"0 4px 24px rgba(0,0,0,0.4)",
      ...(perspective ? { transform:"perspective(900px) rotateX(28deg)", transformOrigin:"top center" } : {}) }}>
      {!leafletReady && (
        <div style={{height, background:"#080f1a", display:"flex", alignItems:"center", justifyContent:"center", color:C.muted, fontSize:13}}>
          ⏳ Loading mountain topographical map…
        </div>
      )}
      <div ref={containerRef} style={{ height, display: leafletReady ? "block" : "none" }}/>
    </div>
  );
};

/* ════════════════════════════════════════════════
   PAGE: MOUNTAIN WEATHER & TRAIL HAZARD RADAR
   (Unified live meteorological telemetry for Rajmachi Fort & Sahyadris)
════════════════════════════════════════════════ */
const WX_CODES = {
  0:["☀️","Clear sky"],1:["🌤️","Mainly clear"],2:["⛅","Partly cloudy"],3:["☁️","Overcast"],
  45:["🌫️","Dense mountain fog"],48:["🌫️","Rime fog"],51:["🌦️","Light drizzle"],53:["🌦️","Drizzle"],
  55:["🌧️","Heavy drizzle"],61:["🌧️","Light rain"],63:["🌧️","Moderate mountain rain"],65:["⛈️","Heavy monsoon downpour"],
  71:["🌨️","Light snow"],73:["❄️","Snow"],75:["🌨️","Heavy snow"],80:["🌦️","Rain showers"],
  81:["🌧️","Heavy showers"],82:["⛈️","Violent monsoon storm"],95:["⛈️","Severe thunderstorm & lightning"],99:["⛈️","Thunderstorm + hail"]
};
const windDir = (deg) => ["N","NE","E","SE","S","SW","W","NW"][Math.round(deg/45)%8];
const feelsLike = (t, h) => +(t - 0.55*(1-h/100)*(t-14.5)).toFixed(1);

const PageMountainWeather = () => {
  const [tab, setTab]               = useState("live");
  const [mapType, setMapType]       = useState("terrain");
  const [mapPerspective, setMapPerspective] = useState(false);
  const [wx, setWx]                 = useState(null);
  const [loading, setLoading]       = useState(true);
  const [sensorOnline, setSensorOnline] = useState(true);
  const [advisorySent, setAdvisorySent] = useState(false);
  const [advisoryText, setAdvisoryText] = useState("");
  const [sensor, setSensor] = useState({
    temp:24.2, humidity:82, pressure:928.4, windSpeed:18.5, windDir:240,
    uvIndex:4.8, rainfall:2.4, altitude:829, co2:408, aqi:34,
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
            temp:       d.current.temperature_2m,
            humidity:   d.current.relative_humidity_2m,
            pressure:   d.current.pressure_msl,
            windSpeed:  d.current.wind_speed_10m,
            windDir:    d.current.wind_direction_10m,
            uvIndex:    d.current.uv_index ?? prev.uvIndex,
            rainfall:   d.current.precipitation,
            lastSync:   new Date().toLocaleTimeString("en-IN"),
          }));
        }
        setLoading(false);
      } catch { setLoading(false); }
    };
    fetch_();
    const t = setInterval(fetch_, 300_000);
    return () => clearInterval(t);
  }, []);

  // ── Simulate live hardware sensor drift at Manoranjan Ridge (842m ASL) ──────────────────────
  useEffect(() => {
    const t = setInterval(() => {
      if (!sensorOnline) return;
      setSensor(p => ({
        ...p,
        temp:      +(p.temp      + (Math.random()-0.5)*0.2).toFixed(1),
        humidity:  +Math.min(100,Math.max(0, p.humidity  + (Math.random()-0.5))).toFixed(1),
        windSpeed: +Math.max(0, (p.windSpeed + (Math.random()-0.5)*1.5)).toFixed(1),
        co2:       Math.round(p.co2 + (Math.random()-0.5)*4),
        aqi:       Math.min(200,Math.max(10, Math.round(p.aqi + (Math.random()-0.5)*2))),
        lastSync:  new Date().toLocaleTimeString("en-IN"),
      }));
    }, 2000);
    return () => clearInterval(t);
  }, [sensorOnline]);

  const handleBroadcastAdvisory = async () => {
    if (!advisoryText.trim()) return;
    try {
      await createSafetyProtocol({
        title: "⚡ Urgent Trail Weather Advisory",
        body: advisoryText.trim(),
        status: "published",
        author: "Field Guide Ajay Saini",
      });
      setAdvisorySent(true);
      setAdvisoryText("");
      setTimeout(() => setAdvisorySent(false), 5000);
    } catch (err) {
      console.error("Failed to broadcast advisory:", err);
    }
  };

  const cur    = wx?.current;
  const wxCode = cur?.weather_code ?? 0;
  const [wxIcon, wxDesc] = WX_CODES[wxCode] ?? ["⛅","Mountain haze"];

  const TABS = [
    {id:"live",       icon:"🌡️", label:"Live Trail Conditions & Hazards"},
    {id:"map",        icon:"🗺️", label:"Topographic & Satellite Map"},
    {id:"hardware",   icon:"📡", label:"Ridge Meteorological Sensors"},
    {id:"forecast",   icon:"📅", label:"7-Day Elevation Forecast"},
    {id:"navigation", icon:"🧭", label:"3D Terrain View"},
  ];

  return (
    <div>
      <PageHeader
        title="Mountain Weather & Trail Hazards Console"
        sub={`Live Meteorological Telemetry · Rajmachi Fort (829m ASL) · Manoranjan Ridge · ${sensorOnline ? "🟢 Ridge Sensors Online" : "🔴 Sensors Offline"}`}
        right={
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {loading && <Pill color="blue">Fetching Live Open-Meteo…</Pill>}
            <Pill color={sensorOnline?"green":"red"}>{sensorOnline?"● 829m Station Online":"○ Offline"}</Pill>
            <Btn onClick={()=>setSensorOnline(s=>!s)}>{sensorOnline?"Disconnect Sensors":"Reconnect Sensors"}</Btn>
          </div>
        }
      />

      {/* Tab bar */}
      <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            padding:"7px 14px",borderRadius:9,border:`1px solid ${tab===t.id?C.accent:C.border}`,
            background:tab===t.id?"rgba(59,130,246,0.12)":"transparent",
            color:tab===t.id?C.accent:C.muted,fontSize:12,cursor:"pointer",
            fontFamily:"inherit",display:"flex",alignItems:"center",gap:6,
          }}>{t.icon} {t.label}</button>
        ))}
      </div>

      {/* ══ LIVE WEATHER & HAZARDS ══ */}
      {tab==="live" && (
        <div>
          <Card style={{marginBottom:14,background:"linear-gradient(135deg,rgba(16,40,90,0.65),rgba(11,20,34,0.95))",border:`1px solid rgba(80,140,220,0.3)`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:16}}>
              <div>
                <div style={{fontSize:11,color:"#60a5fa",fontWeight:600,marginBottom:6}}>📍 Rajmachi Fort · Manoranjan Bastion (18.8286°N, 73.3986°E · 829m ASL)</div>
                <div style={{display:"flex",alignItems:"center",gap:14}}>
                  <div style={{fontSize:68}}>{wxIcon}</div>
                  <div>
                    <div style={{fontSize:54,fontWeight:700,color:C.text,lineHeight:1}}>
                      {sensor.temp}<span style={{fontSize:28,color:C.muted}}>°C</span>
                    </div>
                    <div style={{fontSize:15,color:C.muted,marginTop:2}}>{wxDesc}</div>
                    <div style={{fontSize:11,color:C.muted2,marginTop:2}}>Mountain Wind Chill: {feelsLike(sensor.temp,sensor.humidity)}°C</div>
                  </div>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                {[
                  ["💧 Relative Humidity", `${sensor.humidity}%`],
                  ["🌬️ Wind Speed", `${sensor.windSpeed} km/h (${windDir(sensor.windDir)})`],
                  ["🌧️ Rain Rate", `${sensor.rainfall} mm/h`],
                  ["🌀 Atmospheric Pressure", `${sensor.pressure?.toFixed(1)} hPa`],
                ].map(([label, val]) => (
                  <div key={label} style={{background:"rgba(255,255,255,0.03)",border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 12px"}}>
                    <div style={{fontSize:10,color:C.muted}}>{label}</div>
                    <div style={{fontSize:13,fontWeight:700,color:C.text}}>{val}</div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* ACTIVE HAZARDS & QUICK DISPATCH ADVISORY */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
            <Card>
              <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:12,display:"flex",alignItems:"center",gap:8}}>
                <span>⚠️</span>
                <span>Active Trail Hazard Directives (Sahyadri Western Ghats)</span>
              </div>
              {[
                ["Ulhas River Valley — Flash Flood Risk","Heavy monsoon runoff into river crossings between Kondhane and base. River crossings restricted after 17:00.","red"],
                ["Manoranjan Ridge Bastion — Lightning & High Wind","Afternoon convective thunderstorms above 800m. Keep clear of exposed metal railings and lone trees.","amber"],
                ["Forest Department Monsoon Notice","Night trekking strictly permitted only with licensed Field Guide (Ajay Saini) and VHF radio link.","blue"],
              ].map(([title,desc,col])=>(
                <div key={title} style={{background:"rgba(255,255,255,0.025)",border:`1px solid ${col==="red"?"rgba(239,68,68,0.3)":col==="amber"?"rgba(245,158,11,0.3)":"rgba(59,130,246,0.25)"}`,borderRadius:10,padding:"10px 14px",marginBottom:8}}>
                  <div style={{fontSize:12,fontWeight:600,color:col==="red"?"#fca5a5":col==="amber"?"#fcd34d":"#93c5fd",marginBottom:2}}>{title}</div>
                  <div style={{fontSize:11,color:C.muted,lineHeight:1.4}}>{desc}</div>
                </div>
              ))}
            </Card>

            <Card>
              <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:8,display:"flex",alignItems:"center",gap:8}}>
                <span>📢</span>
                <span>Instant Trail Advisory Broadcaster</span>
              </div>
              <div style={{fontSize:11.5,color:C.muted,marginBottom:12}}>
                Push immediate weather warnings directly to the 5 trekkers' User App notification feed:
              </div>

              {advisorySent && (
                <div style={{background:"rgba(34,197,94,0.15)",border:"1px solid rgba(34,197,94,0.3)",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#86efac",fontWeight:600,marginBottom:10}}>
                  ✓ Advisory broadcasted to all active expedition members and saved to safety protocols!
                </div>
              )}

              <textarea
                value={advisoryText}
                onChange={(e) => setAdvisoryText(e.target.value)}
                placeholder="e.g. Heavy cloudburst approaching Manoranjan ridge. All trekkers hold position at stream shelter and report VHF check-in..."
                rows={3}
                style={{
                  width:"100%",background:"rgba(255,255,255,0.04)",border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:12,padding:10,fontFamily:"inherit",resize:"vertical",boxSizing:"border-box",outline:"none",marginBottom:10
                }}
              />
              <Btn variant="primary" onClick={handleBroadcastAdvisory} disabled={!advisoryText.trim()}>
                Broadcast Directive to Group →
              </Btn>
            </Card>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            padding:"7px 14px",borderRadius:9,border:`1px solid ${tab===t.id?C.accent:C.border}`,
            background:tab===t.id?"rgba(59,130,246,0.12)":"transparent",
            color:tab===t.id?C.accent:C.muted,fontSize:12,cursor:"pointer",
            fontFamily:"inherit",display:"flex",alignItems:"center",gap:6,
          }}>{t.icon} {t.label}</button>
        ))}
      </div>

      {/* ══ LIVE WEATHER ══ */}
      {tab==="live" && (
        <div>
          <Card style={{marginBottom:14,background:"linear-gradient(135deg,rgba(20,50,110,0.55),rgba(11,20,34,0.92))"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:16}}>
              <div>
                <div style={{fontSize:11,color:C.muted,marginBottom:6}}>📍 Mulshi, Maharashtra · Hinjawadi</div>
                <div style={{display:"flex",alignItems:"center",gap:14}}>
                  <div style={{fontSize:68}}>{wxIcon}</div>
                  <div>
                    <div style={{fontSize:54,fontWeight:700,color:C.text,lineHeight:1}}>
                      {sensor.temp}<span style={{fontSize:28,color:C.muted}}>°C</span>
                    </div>
                    <div style={{fontSize:15,color:C.muted,marginTop:2}}>{wxDesc}</div>
                    <div style={{fontSize:11,color:C.muted2,marginTop:2}}>Feels like {feelsLike(sensor.temp,sensor.humidity)}°C</div>
                  </div>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                {[
                  ["💧","Humidity",`${sensor.humidity}%`],
                  ["🌬️","Wind",`${sensor.windSpeed} km/h ${windDir(sensor.windDir)}`],
                  ["🌀","Pressure",`${sensor.pressure?.toFixed(0)} hPa`],
                  ["🌂","Rainfall",`${sensor.rainfall} mm`],
                  ["☀️","UV Index",`${sensor.uvIndex}`],
                  ["☁️","Cloud",`${cur?.cloud_cover ?? "—"}%`],
                ].map(([icon,k,v])=>(
                  <div key={k} style={{background:"rgba(255,255,255,0.05)",border:`1px solid ${C.border}`,borderRadius:10,padding:"8px 12px",minWidth:120}}>
                    <div style={{fontSize:10,color:C.muted2,marginBottom:2}}>{icon} {k}</div>
                    <div style={{fontSize:16,fontWeight:600,color:C.text}}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{marginTop:12,paddingTop:10,borderTop:`1px solid ${C.border}`,fontSize:10,color:C.muted2,display:"flex",gap:16,flexWrap:"wrap"}}>
              <span>⚡ Open-Meteo API + Hardware sensor</span>
              <span>🔄 Last sync: {sensor.lastSync}</span>
              <span>📡 Protocol: MQTT over WiFi</span>
            </div>
          </Card>

          {/* Hourly temperature strip */}
          {wx?.hourly && (
            <Card style={{marginBottom:14}}>
              <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>Hourly Temperature (next 24h)</div>
              <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:4}}>
                {wx.hourly.time.slice(0,24).map((t,i)=>{
                  const hr  = t.split("T")[1]?.substring(0,5);
                  const tmp = wx.hourly.temperature_2m[i];
                  const pp  = wx.hourly.precipitation_probability?.[i] ?? 0;
                  return (
                    <div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,flexShrink:0,minWidth:44,padding:"6px 4px",borderRadius:8,background:i===0?"rgba(59,130,246,0.1)":"transparent"}}>
                      <div style={{fontSize:9,color:C.muted2}}>{hr}</div>
                      <div style={{fontSize:13,fontWeight:600,color:tmp>35?C.red:tmp>30?C.amber:tmp>25?C.accent:C.teal}}>{tmp}°</div>
                      {pp>20&&<div style={{fontSize:9,color:C.teal}}>💧{pp}%</div>}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Alerts row */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <Card>
              <div style={{fontSize:12,fontWeight:500,color:C.text,marginBottom:10}}>⚠️ Active Alerts</div>
              {[
                {col:"amber",title:"Heat advisory",desc:"Temp >30°C expected 12–15h. Hydration advised for trekkers."},
                {col:"blue", title:"Wind advisory",desc:`${sensor.windSpeed>20?"Moderate":"Low"} winds from ${windDir(sensor.windDir)}. Trail conditions normal.`},
              ].map(a=>(
                <div key={a.title} style={{background:`rgba(255,255,255,0.03)`,border:`1px solid ${a.col==="amber"?"rgba(245,158,11,0.3)":"rgba(59,130,246,0.2)"}`,borderRadius:9,padding:"9px 12px",marginBottom:7}}>
                  <div style={{fontSize:12,fontWeight:500,color:C.text,marginBottom:2}}>{a.title}</div>
                  <div style={{fontSize:11,color:C.muted}}>{a.desc}</div>
                </div>
              ))}
            </Card>
            <Card>
              <div style={{fontSize:12,fontWeight:500,color:C.text,marginBottom:10}}>📊 Air Quality</div>
              {[
                ["AQI",sensor.aqi,200,sensor.aqi<50?C.green:sensor.aqi<100?C.amber:C.red],
                ["CO₂",sensor.co2-350,200,sensor.co2<450?C.green:C.amber],
                ["Humidity",sensor.humidity,100,C.teal],
              ].map(([label,val,max,col])=>(
                <div key={label} style={{marginBottom:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:3}}>
                    <span style={{color:C.muted}}>{label}</span>
                    <span style={{color:col,fontWeight:600}}>{label==="CO₂"?sensor.co2+" ppm":label==="AQI"?sensor.aqi:sensor.humidity+"%"}</span>
                  </div>
                  <div style={{height:5,borderRadius:4,background:"rgba(255,255,255,0.07)"}}>
                    <div style={{height:"100%",width:`${Math.min(100,(val/max)*100)}%`,borderRadius:4,background:col,transition:"width 0.5s"}}/>
                  </div>
                </div>
              ))}
            </Card>
          </div>
        </div>
      )}

      {/* ══ LIVE MAP ══ */}
      {tab==="map" && (
        <div>
          <div style={{display:"flex",gap:8,marginBottom:12,alignItems:"center",flexWrap:"wrap"}}>
            {[["road","🗺️ Road"],["satellite","🛰️ Satellite"],["terrain","🏔️ Terrain"]].map(([v,label])=>(
              <button key={v} onClick={()=>setMapType(v)} style={{
                padding:"6px 14px",borderRadius:8,border:`1px solid ${mapType===v?C.accent:C.border}`,
                background:mapType===v?"rgba(59,130,246,0.12)":"transparent",
                color:mapType===v?C.accent:C.muted,fontSize:12,cursor:"pointer",fontFamily:"inherit",
              }}>{label}</button>
            ))}
            <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:12,color:C.muted}}>3D tilt</span>
              <Toggle on={mapPerspective} onChange={()=>setMapPerspective(x=>!x)}/>
            </div>
          </div>
          <LeafletMap height={500} tileType={mapType} perspective={mapPerspective}
            markers={USERS.map(u=>({ lat:u.lat, lon:u.lon, color:u.status==="sos"?"#ef4444":u.status==="active"?"#22c55e":"#888", popup:`<b>${u.name}</b><br><small>${u.city} · ${u.status}</small>` }))}/>
          <div style={{marginTop:10,display:"flex",gap:16,fontSize:11,color:C.muted2,flexWrap:"wrap"}}>
            <span>📍 18.52°N, 73.85°E</span>
            <span>🗺️ Mulshi Reservoir region · Western Ghats</span>
            <span>🏔️ Alt: {sensor.altitude}m ASL</span>
            <span>🌐 OpenStreetMap / ESRI · No ads · No API key</span>
          </div>
        </div>
      )}

      {/* ══ HARDWARE SENSORS ══ */}
      {tab==="hardware" && (
        <div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:14}}>
            {[
              {label:"Temperature",    value:`${sensor.temp}°C`,                 icon:"🌡️", color:sensor.temp>35?C.red:sensor.temp>28?C.amber:C.green, status:sensor.temp>35?"High alert":sensor.temp>28?"Warm":"Normal"},
              {label:"Humidity",       value:`${sensor.humidity}%`,               icon:"💧", color:sensor.humidity>80?C.amber:C.teal,                   status:sensor.humidity>80?"High":sensor.humidity<30?"Dry":"Normal"},
              {label:"Pressure",       value:`${sensor.pressure?.toFixed(1)} hPa`,icon:"🌀", color:C.purple,                                            status:"Stable"},
              {label:"Wind Speed",     value:`${sensor.windSpeed} km/h`,          icon:"🌬️", color:sensor.windSpeed>50?C.red:sensor.windSpeed>25?C.amber:C.accent, status:sensor.windSpeed>50?"Alert":sensor.windSpeed>25?"Moderate":"Calm"},
              {label:"UV Index",       value:`${sensor.uvIndex}`,                 icon:"☀️", color:sensor.uvIndex>7?C.red:sensor.uvIndex>3?C.amber:C.green, status:sensor.uvIndex>7?"Danger":sensor.uvIndex>3?"Moderate":"Low"},
              {label:"CO₂",            value:`${sensor.co2} ppm`,                 icon:"🌿", color:sensor.co2>450?C.amber:C.green,                     status:sensor.co2>450?"Elevated":"Normal"},
              {label:"Rainfall",       value:`${sensor.rainfall} mm/h`,           icon:"🌧️", color:sensor.rainfall>5?C.red:sensor.rainfall>0?C.teal:C.muted, status:sensor.rainfall>5?"Heavy":sensor.rainfall>0?"Light":"None"},
              {label:"AQI",            value:`${sensor.aqi}`,                     icon:"💨", color:sensor.aqi<50?C.green:sensor.aqi<100?C.amber:C.red, status:sensor.aqi<50?"Good":sensor.aqi<100?"Moderate":"Poor"},
              {label:"Altitude",       value:`${sensor.altitude}m ASL`,           icon:"🏔️", color:C.muted,                                            status:"Fixed GPS"},
            ].map(({label,value,icon,color,status})=>(
              <Card key={label} style={{marginBottom:0}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                  <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em"}}>{label}</div>
                  <span style={{fontSize:16}}>{icon}</span>
                </div>
                <div style={{fontSize:24,fontWeight:700,color,marginBottom:5}}>{value}</div>
                <div style={{display:"flex",alignItems:"center",gap:5}}>
                  <div style={{width:6,height:6,borderRadius:"50%",background:sensorOnline?C.green:"#555",flexShrink:0}}/>
                  <div style={{fontSize:10,color:C.muted2}}>{sensorOnline?status:"Offline"}</div>
                </div>
              </Card>
            ))}
          </div>

          <Card>
            <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:12}}>Hardware Device Registry</div>
            {[
              {name:"BME280 — Temp / Humidity / Pressure",     id:"HW-001", latency:"12ms", fw:"v2.3.1"},
              {name:"Ultrasonic Anemometer — Wind Speed/Dir",  id:"HW-002", latency:"18ms", fw:"v1.8.0"},
              {name:"VEML6075 — UV Sensor",                    id:"HW-003", latency:"9ms",  fw:"v1.2.4"},
              {name:"SDS011 — PM2.5 / AQI Particulate",        id:"HW-004", latency:"25ms", fw:"v3.1.0"},
              {name:"MH-Z19B — CO₂ NDIR Sensor",               id:"HW-005", latency:"32ms", fw:"v2.0.5"},
              {name:"Tipping Bucket Rain Gauge",               id:"HW-006", latency:"15ms", fw:"v1.5.2"},
            ].map(hw=>(
              <div key={hw.id} style={{display:"flex",alignItems:"center",gap:12,padding:"9px 0",borderBottom:`1px solid ${C.border}`}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:sensorOnline?C.green:C.red,flexShrink:0}}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,color:C.text,fontWeight:500}}>{hw.name}</div>
                  <div style={{fontSize:10,color:C.muted2}}>{hw.id} · Firmware {hw.fw}</div>
                </div>
                <Pill color={sensorOnline?"green":"red"}>{sensorOnline?"online":"offline"}</Pill>
                <div style={{fontSize:10,color:C.muted2,minWidth:36,textAlign:"right"}}>{sensorOnline?hw.latency:"—"}</div>
              </div>
            ))}
            <div style={{fontSize:10,color:C.muted2,marginTop:10,display:"flex",gap:16}}>
              <span>🔄 Last sync: {sensor.lastSync}</span>
              <span>📡 Protocol: MQTT / ESP32 WiFi bridge</span>
              <span>🔋 Battery: 87%</span>
            </div>
          </Card>
        </div>
      )}

      {/* ══ 7-DAY FORECAST ══ */}
      {tab==="forecast" && (
        <div>
          {wx?.daily ? (
            <>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:10,marginBottom:14}}>
                {wx.daily.time.map((d,i)=>{
                  const dt    = new Date(d);
                  const dstr  = dt.toLocaleDateString("en-IN",{weekday:"short",day:"numeric"});
                  const [ic]  = WX_CODES[wx.daily.weather_code[i]] ?? ["🌤️"];
                  const tmax  = wx.daily.temperature_2m_max[i];
                  const tmin  = wx.daily.temperature_2m_min[i];
                  return (
                    <Card key={d} style={{textAlign:"center",marginBottom:0,padding:"14px 8px"}}>
                      <div style={{fontSize:10,color:C.muted,marginBottom:4}}>{dstr}</div>
                      <div style={{fontSize:30,marginBottom:4}}>{ic}</div>
                      <div style={{fontSize:16,fontWeight:700,color:C.red}}>{tmax}°</div>
                      <div style={{fontSize:13,color:C.muted}}>{tmin}°</div>
                      <div style={{fontSize:10,color:C.teal,marginTop:3}}>💧{wx.daily.precipitation_sum[i]}mm</div>
                      <div style={{fontSize:10,color:C.muted2,marginTop:1}}>💨{wx.daily.wind_speed_10m_max[i]}km/h</div>
                    </Card>
                  );
                })}
              </div>
              <Card>
                <div style={{fontSize:12,fontWeight:500,color:C.text,marginBottom:12}}>Weekly Summary</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
                  {[
                    ["Avg High",`${(wx.daily.temperature_2m_max.reduce((a,b)=>a+b,0)/7).toFixed(1)}°C`,C.red],
                    ["Avg Low", `${(wx.daily.temperature_2m_min.reduce((a,b)=>a+b,0)/7).toFixed(1)}°C`,C.teal],
                    ["Total Rain",`${wx.daily.precipitation_sum.reduce((a,b)=>a+b,0).toFixed(1)} mm`,C.accent],
                    ["Max Wind",`${Math.max(...wx.daily.wind_speed_10m_max).toFixed(0)} km/h`,C.amber],
                  ].map(([k,v,col])=>(
                    <div key={k} style={{background:"rgba(255,255,255,0.04)",borderRadius:10,padding:"10px 12px",border:`1px solid ${C.border}`}}>
                      <div style={{fontSize:10,color:C.muted2,marginBottom:4}}>{k}</div>
                      <div style={{fontSize:20,fontWeight:700,color:col}}>{v}</div>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          ) : (
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:200,color:C.muted2}}>
              {loading ? "⏳ Loading forecast…" : "⚠️ Forecast unavailable"}
            </div>
          )}
        </div>
      )}

      {/* ══ 3D NAVIGATION ══ */}
      {tab==="navigation" && (
        <div>
          <div style={{display:"flex",gap:10,marginBottom:12,alignItems:"center",flexWrap:"wrap"}}>
            <Pill color="green">● 3D Navigation Active</Pill>
            <Pill color="blue">📍 Rajmachi Fort, Maharashtra</Pill>
            <Pill color="amber">🏔️ Western Ghats Terrain (829m ASL)</Pill>
            <span style={{fontSize:11,color:C.muted}}>Perspective tilt · Satellite + Terrain relief</span>
          </div>
          <LeafletMap height={520} tileType="satellite" perspective={true} zoom={13}
            center={[18.8286, 73.3986]}
            markers={SOS_TEAMS.map(t=>({ lat:t.lat, lon:t.lon, color:"#f59e0b", popup:`<b>${t.name}</b><br><small>${t.vehicle} · ETA ${t.eta}</small>` }))}/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginTop:14}}>
            {[
              ["🧭","Heading",`${windDir(sensor.windDir)} · ${sensor.windDir}°`,C.accent],
              ["🏔️","Altitude",`${sensor.altitude}m ASL`,C.purple],
              ["📍","Coordinates","18.8286°N  73.3986°E",C.text],
              ["🌡️","Conditions",`${sensor.temp}°C · ${wxDesc}`,C.amber],
            ].map(([icon,k,v,col])=>(
              <Card key={k} style={{marginBottom:0}}>
                <div style={{fontSize:10,color:C.muted2,marginBottom:4}}>{icon} {k}</div>
                <div style={{fontSize:14,fontWeight:600,color:col}}>{v}</div>
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
      { id: "wearables-radar", label: "Wearables & Vitals Radar", icon: "⌚" },
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
    section: "Emergency & Directives",
    items: [
      { id: "sos-navigation", label: "Realtime SOS Dispatch", icon: "🚨", highlight: true },
      { id: "safety-protocol", label: "Safety Directives & Protocols", icon: "🛡️" },
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
      return stored ? JSON.parse(stored) : null;
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
  const [pendingAdmins, setPendingAdmins] = useState([]);
  const [refreshingPending, setRefreshingPending] = useState(false);
  const [pendingTrekkers, setPendingTrekkers] = useState([]);
  const [refreshingTrekkers, setRefreshingTrekkers] = useState(false);
  const { liveUsers, sosEvents, connectionState, error } = useAdminTracking({ serverUrl: "http://localhost:4000" });
  const displayUsers = toDisplayUsers(liveUsers, firestoreUsers);
  const navigate = (p) => setPage(p);

  useEffect(() => {
    // 1. Firestore real-time listener
    const unsub = subscribeToSOSEvents((events) => {
      if (Array.isArray(events)) {
        setFirestoreSosEvents(events);
      }
    });

    // 2. Direct Backend REST API Polling every 2.5s (bypasses any client rule issues)
    const pollBackendSOS = async () => {
      try {
        const res = await fetch(`${AUTH_API_URL}/sos/events?limit=50`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.events)) {
            setFirestoreSosEvents(data.events);
          }
        }
      } catch {}
    };
    pollBackendSOS();
    const interval = setInterval(pollBackendSOS, 2500);

    return () => {
      if (unsub) unsub();
      clearInterval(interval);
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

  const activeSOS = useMemo(() => {
    const activeFromEvents = allSosEvents.filter((e) => e && e.status === "active").length;
    const activeFromUsers = displayUsers.filter((u) => u.status === "sos").length;
    return Math.max(activeFromEvents, activeFromUsers);
  }, [allSosEvents, displayUsers]);

  // SAR Command Audio Alert Chime (plays sound when emergency beacon is received)
  useEffect(() => {
    if (activeSOS <= 0) return;
    let isCancelled = false;
    let audioCtx = null;
    let intervalId = null;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        audioCtx = new AudioCtx();
        const playBeep = () => {
          if (isCancelled || !audioCtx) return;
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
          } catch {}
        };
        playBeep();
        intervalId = setInterval(playBeep, 2000);
      }
    } catch {}

    return () => {
      isCancelled = true;
      if (intervalId) clearInterval(intervalId);
      if (audioCtx) {
        try { audioCtx.close(); } catch {}
      }
    };
  }, [activeSOS]);

  // Auto-switch view to Realtime SOS Dispatch whenever an active distress incident is detected
  useEffect(() => {
    if (activeSOS > 0 && page === "dashboard") {
      setPage("sos-navigation");
    }
  }, [activeSOS, page]);

  const handleResolveSOS = async (eventId, userId, notes) => {
    return await resolveSOSEvent(eventId, userId, notes, activeAdmin?.name || "Lead Command Admin");
  };

  const handleTriggerDemoSOS = async (payload) => {
    return await triggerDemoSOSEvent(payload);
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
    const res = await approveTrekker(tripId, userId, activeAdmin?.email || "admin@margsutra.app");
    if (res?.success) {
      await loadPendingTrekkers();
      return { success: true };
    }
    return res;
  };

  const handleRemoveTrekker = async (tripId, userId) => {
    const res = await removeTrekker(tripId, userId, activeAdmin?.email || "admin@margsutra.app");
    if (res?.success) {
      await loadPendingTrekkers();
      return { success: true };
    }
    return res;
  };

  const handleApproveAdmin = async (adminId) => {
    const res = await approveAdmin(adminId, activeAdmin?.email || "admin@margsutra.app");
    if (res?.success) {
      await loadPendingAdmins();
      try {
        const response = await fetch(`${AUTH_API_URL}/users`);
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data?.users)) setFirestoreUsers(data.users);
        }
      } catch {}
      return { success: true };
    }
    return res;
  };

  const handleRejectAdmin = async (adminId) => {
    const res = await rejectAdmin(adminId, activeAdmin?.email || "admin@margsutra.app");
    if (res?.success) {
      await loadPendingAdmins();
      return { success: true };
    }
    return res;
  };

  const approvedAdmins = useMemo(() => {
    const list = firestoreUsers
      .filter((u) => {
        const email = (u.email || "").toLowerCase();
        const role = (u.role || "").toLowerCase();
        return role === "admin" || email === "admin@margsutra.app" || email === "admin@coordage.app";
      })
      .filter((u) => u.status !== "pending_approval" && u.status !== "rejected");

    if (!list.some((u) => (u.email || "").toLowerCase() === "admin@margsutra.app" || (u.email || "").toLowerCase() === "admin@coordage.app")) {
      list.unshift({
        id: "demo-admin-001",
        name: "Super Admin",
        email: "admin@margsutra.app",
        role: "admin",
        roleTitle: "Lead Command Dispatcher",
        organization: "Margsutra SAR Dispatch",
        phone: "+91 98765 00000",
        status: "approved",
      });
    }
    return list;
  }, [firestoreUsers]);

  useEffect(() => {
    loadPendingAdmins();
    loadPendingTrekkers();
    const interval = setInterval(() => {
      loadPendingAdmins();
      loadPendingTrekkers();
    }, 12000);
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
        const response = await fetch(`${AUTH_API_URL}/users`);
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled && Array.isArray(data?.users) && data.users.length > 0) {
          setFirestoreUsers(data.users);
        }
      } catch {
        // Keep static users as fallback if backend is not reachable.
      }
    };

    loadUsers();
    const refresh = setInterval(loadUsers, 15050);
    return () => {
      cancelled = true;
      clearInterval(refresh);
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const handleLogin = (adminUser) => {
    const adminObj = adminUser || { email: "admin@margsutra.app", name: "Super Admin", role: "admin" };
    setActiveAdmin(adminObj);
    try {
      localStorage.setItem("margsutra_admin_session", JSON.stringify(adminObj));
    } catch {}
    setLoggedIn(true);
  };

  const handleLogout = () => {
    try {
      localStorage.removeItem("margsutra_admin_session"); localStorage.removeItem("coordage_admin_session");
    } catch {}
    setActiveAdmin(null);
    setLoggedIn(false);
  };

  if(!loggedIn) return <PageAdminAuth onLogin={handleLogin}/>;

  const pages = {
    dashboard:        <PageDashboard navigate={navigate} users={displayUsers} pendingAdmins={pendingAdmins} pendingTrekkers={pendingTrekkers}/>,
    "all-users":      <PageAllUsers users={displayUsers} navigate={navigate}/>,
    "trip-rosters":   <PageTripRosters
                        pendingTrekkers={pendingTrekkers}
                        onApprove={handleApproveTrekker}
                        onRemove={handleRemoveTrekker}
                        refreshing={refreshingTrekkers}
                        onRefresh={loadPendingTrekkers}
                      />,
    "admin-approvals": <PageAdminApprovals
                        pendingAdmins={pendingAdmins}
                        approvedAdmins={approvedAdmins}
                        onApprove={handleApproveAdmin}
                        onReject={handleRejectAdmin}
                        refreshing={refreshingPending}
                        onRefresh={loadPendingAdmins}
                      />,
    "device-tracking":<PageDeviceTracking users={displayUsers} connectionState={connectionState}/>,
    "wearables-radar":<PageWearablesRadar users={displayUsers}/>,
    "weather-console":<PageMountainWeather/>,
    "live-tracking":  <PageLiveTracking navigate={navigate} users={displayUsers} connectionState={connectionState} error={error}/>,
    "safety-protocol":<PageSafetyProtocol/>,
    "sos-navigation": (
      <PageSOSNavigation
        users={displayUsers}
        sosEvents={allSosEvents}
        onResolveSOS={handleResolveSOS}
        onTriggerDemo={handleTriggerDemoSOS}
      />
    ),

    // Backward-compatible fallbacks
    bluetooth:        <PageWearablesRadar users={displayUsers}/>,
    "weather-admin":  <PageMountainWeather/>,
    "weather-maps":   <PageMountainWeather/>,
    "feature-access": <PageWearablesRadar users={displayUsers}/>,
  };

  return (
    <div style={{display:"grid",gridTemplateColumns:"240px 1fr",minHeight:"780px",background:C.bg,fontFamily:"var(--font-sans)",color:C.text}}>
      {/* Sidebar */}
      <aside style={{background:C.sidebar,display:"flex",flexDirection:"column",borderRight:`1px solid ${C.border}`}}>
        <div style={{padding:"18px 16px 14px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:32,height:32,borderRadius:"50%",background:"rgba(59,130,246,0.15)",border:`1px solid rgba(59,130,246,0.3)`,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke={C.accent} strokeWidth="1.5"/><circle cx="12" cy="12" r="4" stroke={C.accent} strokeWidth="1.5"/><circle cx="12" cy="12" r="1.5" fill={C.accent}/></svg>
          </div>
          <div><div style={{fontSize:14,fontWeight:600,color:C.text,letterSpacing:"0.03em"}}>Margsutra <span style={{color:C.accent}}>Admin</span></div><div style={{fontSize:10,color:C.muted2}}>Control panel v3.0</div></div>
        </div>
        <div style={{padding:"12px 16px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:34,height:34,borderRadius:"50%",background:"rgba(59,130,246,0.18)",color:C.accent,fontSize:12,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center"}}>
            {(activeAdmin?.name || "SA").slice(0, 2).toUpperCase()}
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:12,fontWeight:500,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{activeAdmin?.name || "Super Admin"}</div>
            <div style={{fontSize:10,color:C.muted2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{activeAdmin?.email || "admin@margsutra.app"}</div>
          </div>
          {activeSOS>0&&<div style={{marginLeft:"auto",background:"rgba(239,68,68,0.15)",border:"1px solid rgba(239,68,68,0.3)",borderRadius:"50%",width:22,height:22,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:C.red,fontWeight:700}}>{activeSOS}</div>}
        </div>
        <nav style={{flex:1,overflowY:"auto",padding:"10px 0"}}>
          {NAV.map(({section,items})=>(
            <div key={section}>
              <div style={{fontSize:9,color:C.muted2,padding:"10px 16px 4px",letterSpacing:"0.12em",textTransform:"uppercase"}}>{section}</div>
              {items.map(item=>{
                const active=page===item.id;
                const isSosNav=item.id==="sos-navigation";
                const isApprovals=item.id==="admin-approvals";
                return (
                  <div key={item.id} onClick={()=>setPage(item.id)}
                    style={{display:"flex",alignItems:"center",gap:10,padding:"8px 16px",cursor:"pointer",
                      borderLeft:`2px solid ${active?(isSosNav?C.red:C.accent):"transparent"}`,
                      background:active?(isSosNav?"rgba(239,68,68,0.1)":"rgba(59,130,246,0.1)"):"transparent",
                      transition:"background 0.15s"}}>
                    <span style={{fontSize:15,width:18,textAlign:"center",flexShrink:0}}>{item.icon}</span>
                    <span style={{fontSize:12,color:active?C.text:isSosNav?"rgba(252,165,165,0.8)":C.muted,fontWeight:active?500:400}}>{item.label}</span>
                    {isSosNav&&activeSOS>0&&<div style={{marginLeft:"auto",background:"rgba(239,68,68,0.2)",border:"1px solid rgba(239,68,68,0.3)",borderRadius:10,padding:"1px 7px",fontSize:9,color:C.red,fontWeight:700}}>LIVE</div>}
                    {isApprovals&&pendingAdmins.length>0&&<div style={{marginLeft:"auto",background:"rgba(245,158,11,0.2)",border:"1px solid rgba(245,158,11,0.35)",borderRadius:10,padding:"1px 7px",fontSize:9,color:C.amber,fontWeight:700}}>{pendingAdmins.length} PENDING</div>}
                    {item.id==="trip-rosters"&&pendingTrekkers.length>0&&<div style={{marginLeft:"auto",background:"rgba(16,185,129,0.2)",border:"1px solid rgba(16,185,129,0.35)",borderRadius:10,padding:"1px 7px",fontSize:9,color:"#6ee7b7",fontWeight:700}}>{pendingTrekkers.length} PENDING</div>}
                  </div>
                );
              })}
            </div>
          ))}
        </nav>
        <div style={{padding:"12px 16px",borderTop:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:10,color:C.muted2}}>© 2026 Margsutra</span>
          <button onClick={handleLogout} style={{fontSize:11,color:C.muted,background:"none",border:"none",cursor:"pointer",fontFamily:"inherit"}}>Sign out</button>
        </div>
      </aside>

      {/* Main content container */}
      <div style={{display:"flex",flexDirection:"column",minWidth:0,height:"100%"}}>
        {activeSOS > 0 && (
          <div
            onClick={() => setPage("sos-navigation")}
            style={{
              background: "linear-gradient(90deg, #7f1d1d 0%, #dc2626 50%, #991b1b 100%)",
              color: "#ffffff",
              padding: "12px 24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "pointer",
              boxShadow: "0 6px 25px rgba(220, 38, 38, 0.6)",
              zIndex: 99999,
              animation: "ud-sos-blink 1.2s infinite",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ fontSize: 26 }}>🚨</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: "0.04em" }}>
                  EMERGENCY DISTRESS BEACON ACTIVE · {allSosEvents.find(e => e.status === "active")?.name || "Anirban Panda"} IN DISTRESS
                </div>
                <div style={{ fontSize: 12, opacity: 0.95 }}>
                  Telemetry received from field · Realtime SAR Incident Dispatch console activated
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
                color: "#b91c1c",
                border: "none",
                borderRadius: 8,
                padding: "8px 18px",
                fontSize: 13,
                fontWeight: 900,
                cursor: "pointer",
                boxShadow: "0 2px 10px rgba(0,0,0,0.3)",
              }}
            >
              🚨 VIEW RESCUE DISPATCH HUD →
            </button>
          </div>
        )}

        <main style={{flex:1,overflow:"auto",padding:24}}>
          {pages[page]||<div style={{color:C.muted}}>Page not found.</div>}
        </main>
      </div>
    </div>
  );
}
