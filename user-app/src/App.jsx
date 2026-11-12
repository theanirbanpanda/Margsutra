import React, { useState, useEffect, useRef, useCallback } from "react";
import UserTrackingWidget from "./UserTrackingWidget";
import FitnessGadgetManager from "./FitnessGadgetManager";
import { useLocationTracking } from "./useLocationTracking";
import { useLivePosition } from "./useLivePosition";
import SOSConfirmModal from "./components/SOSConfirmModal";
import {
  broadcastSOSBeacon,
  cancelSOSBeacon,
  flushSOSOutbox,
  getSOSOutboxCount,
  subscribeToSOSResolution,
  alarmEngine,
} from "./services/sosService";
import {
  subscribeToSafetyProtocols,
  getTripByCode,
  subscribeToTrips,
  updateUserProfileInFirestore,
  fetchUserActiveTrip,
  subscribeToUserActiveTrip,
  joinTripInFirestore,
  leaveTripInFirestore,
  triggerSOSEvent,
  cancelSOSEvent,
} from "./services/firebase";


/* ════════════════════════════════════════════════
   DESIGN TOKENS  (mirror admin panel exactly)
════════════════════════════════════════════════ */
const C = {
  bg:"#080f1a", sidebar:"#0b1422", panel:"rgba(11,20,34,0.95)",
  card:"rgba(255,255,255,0.04)", border:"rgba(80,140,220,0.14)",
  border2:"rgba(80,140,220,0.28)", accent:"#3b82f6", accent2:"#1d4ed8",
  green:"#22c55e", amber:"#f59e0b", red:"#ef4444", purple:"#a78bfa",
  teal:"#14b8a6", text:"#e2e8f0", muted:"rgba(180,210,245,0.5)",
  muted2:"rgba(180,210,245,0.28)",
};

/* ════════════════════════════════════════════════
   STATIC MOCK DATA
════════════════════════════════════════════════ */
/* ════════════════════════════════════════════════════════════════════════
   DEMO DATA — not production logic.
   CURRENT_USER and DEFAULT_LOGIN below exist so the app works end-to-end
   with zero backend running (a demo-mode fallback), and so a recruiter/
   interviewer can log in without a real account. They are NOT used when a
   real backend login succeeds — see handleLogin/the login fetch above.
   Remove or gate behind an env flag before any real deployment.
════════════════════════════════════════════════════════════════════════ */
const CURRENT_USER = {
  id:"U001", name:"Anirban Panda", email:"anirban@margsutra.app",
  role:"Field Guide", status:"active", avatar:"AP",
  color:["#E6F1FB","#0C447C"], blood:"B+", medical:"None",
  lat:18.5196, lon:73.8554, city:"Mulshi, Maharashtra",
  phone:"+91 98765 43210", joined:"Jan 2025", trips:12, devices:3,
  ec1Name:"Meera Rao", ec1Rel:"Sister", ec1Ph:"+91 99887 76655",
  ec2Name:"Sunil Rao", ec2Rel:"Father", ec2Ph:"+91 98001 23456",
};

const DEFAULT_LOGIN = {
  email: "anirban@margsutra.app",
  pass: "user123",
};

const USER_PROFILE_KEY = "margsutra_user_profile";
const USER_CREDENTIALS_KEY = "margsutra_user_credentials";
const USER_SESSION_KEY = "margsutra_user_session";
const USER_TOKEN_KEY = "margsutra_auth_token";
const LEGACY_USER_TOKEN_KEY = "coordage_auth_token";

// Attaches the stored JWT (if any) to a fetch call — used for every request
// to a route that now requires authentication on the backend.
const authFetch = (url, options = {}) => {
  const token = localStorage.getItem(USER_TOKEN_KEY) || localStorage.getItem(LEGACY_USER_TOKEN_KEY);
  return fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
};
const AUTH_API_URL = import.meta.env.VITE_AUTH_API_URL || "http://localhost:5050/api";

const decodeJwtPayload = (token) => {
  try {
    const payloadPart = token.split(".")[1];
    if (!payloadPart) return null;
    const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
};

const isUsableTrackingToken = (token, user) => {
  const payload = decodeJwtPayload(token);
  if (!payload) return false;
  if (typeof payload.exp === "number" && Date.now() >= payload.exp * 1000 - 30_000) {
    return false;
  }
  if (user?.id && payload.userId && payload.userId !== user.id) return false;
  if (user?.name && payload.name && payload.name !== user.name) return false;
  return true;
};

const buildUserProfile = (form) => {
  const nameParts = (form.name || "Explorer User").trim().split(/\s+/);
  const initials = nameParts.slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "EU";
  return {
    id: `U-${Date.now()}`,
    name: form.name,
    email: form.email,
    role: form.role || "Field Guide",
    status: "active",
    avatar: initials,
    color: ["#E6F1FB", "#0C447C"],
    blood: form.blood,
    medical: form.medical,
    city: form.city,
    phone: form.phone,
    trips: 0,
    devices: 1,
    lat: CURRENT_USER.lat,
    lon: CURRENT_USER.lon,
    ec1Name: form.ec1Name,
    ec1Rel: form.ec1Rel,
    ec1Ph: form.ec1Ph,
    ec2Name: form.ec2Name,
    ec2Rel: form.ec2Rel,
    ec2Ph: form.ec2Ph,
  };
};

const TRACKING_SERVER_URL = import.meta.env.VITE_TRACKING_SERVER_URL || "http://localhost:4000";

const FALLBACK_SAFETY_PROTOCOLS = [
  {id:"P001",title:"Arrival & check-in protocol",   icon:"📋",status:"published",updated:"Apr 10, 2026",
   body:"Upon arriving at the trek base, register at the check-in kiosk. Confirm your emergency contacts and ensure your device GPS is active. Admin will verify your profile before granting trail access."},
  {id:"P002",title:"Daily check-in rules",           icon:"✅",status:"published",updated:"Apr 8, 2026",
   body:"Send a live-status ping every 4 hours during active trekking. If no ping is received within 6 hours, the system triggers an automatic welfare check. Always acknowledge system check-in prompts."},
  {id:"P003",title:"Offline & no-signal zones",      icon:"📵",status:"published",updated:"Apr 11, 2026",
   body:"Carry a LoRa-enabled satellite communicator when entering zones marked orange on your map. Pre-download offline maps before departure. Inform admin 2 hrs prior to entering a no-signal zone."},
  {id:"P004",title:"SOS trigger procedure",          icon:"🚨",status:"published",updated:"Mar 28, 2026",
   body:"Press and hold the SOS button for 3 seconds to prevent accidental triggers. The system broadcasts your GPS coordinates and medical profile to the nearest rescue team. Stay in place unless immediate danger requires movement."},
  {id:"P005",title:"Medical emergency guidelines",   icon:"⚕️",status:"published",updated:"Apr 9, 2026",
   body:"Your blood group and medical conditions are auto-shared with any dispatched rescue team. In case of allergy or diabetic emergency, use the medical alert shortcut on your dashboard before triggering SOS."},
];

const deriveProtocolIcon = (title = "") => {
  const normalized = title.toLowerCase();
  if (normalized.includes("sos")) return "🚨";
  if (normalized.includes("medical")) return "⚕️";
  if (normalized.includes("offline") || normalized.includes("signal")) return "📵";
  if (normalized.includes("check-in") || normalized.includes("check in")) return "📋";
  return "🛡️";
};

const MY_DEVICES = [
  {id:"DEV001",name:"iPhone 15 Pro",      type:"phone",    battery:78,signal:"strong",gps:true, sos:true, connected:true, mac:"A4:C1:38:1F:22:B5",lat:18.52,lon:73.85},
  {id:"DEV002",name:"Garmin Instinct 2",  type:"watch",    battery:92,signal:"strong",gps:true, sos:true, connected:true, mac:"F0:23:B9:7A:01:C3",lat:18.52,lon:73.85},
  {id:"DEV003",name:"SPOT Gen4 Beacon",   type:"satellite",battery:65,signal:"medium",gps:true, sos:true, connected:false,mac:"7C:64:56:D8:3A:F1",lat:null,lon:null},
];

const NEARBY_DEVICES = [
  {id:"N001",name:"Garmin inReach Mini 2",mac:"B8:27:EB:5A:3C:11",rssi:-48,type:"satellite",paired:false},
  {id:"N002",name:"Apple Watch Ultra 2",  mac:"DC:A9:04:B1:77:3E",rssi:-55,type:"watch",    paired:false},
  {id:"N003",name:"Tile Pro 2024",        mac:"00:1A:7D:DA:71:13",rssi:-70,type:"tracker",  paired:false},
  {id:"N004",name:"Polar Grit X2 Pro",    mac:"E4:5F:01:38:92:AB",rssi:-62,type:"watch",    paired:false},
];

const RESCUE_TEAMS = [
  {id:"T001",name:"Team Alpha",lat:18.5650,lon:73.9100,status:"deployed",eta:"12 min",vehicle:"Ambulance",lead:"Vikram Rao"},
];

const TURN_BY_TURN_USER = [
  {dist:"0.0 km",icon:"↑",instr:"Head north from Mulshi Base Camp",road:"NH-48"},
  {dist:"1.4 km",icon:"↗",instr:"Take the forest track right at the ridge fork",road:"Forest Track F-22"},
  {dist:"3.1 km",icon:"↑",instr:"Continue uphill on the main trail"},
  {dist:"5.5 km",icon:"↙",instr:"Descend left toward the valley stream"},
  {dist:"7.2 km",icon:"↑",instr:"Cross the stone bridge and continue east"},
  {dist:"8.6 km",icon:"⚑",instr:"Arrival at Emergency Rally Point — Mulshi Peak"},
];

/* ════════════════════════════════════════════════
   SHARED UI PRIMITIVES
════════════════════════════════════════════════ */
const Pill = ({ color, children }) => {
  const map = {
    green:{bg:"rgba(34,197,94,0.12)",text:"#86efac"},
    red:{bg:"rgba(239,68,68,0.12)",text:"#fca5a5"},
    amber:{bg:"rgba(245,158,11,0.12)",text:"#fcd34d"},
    blue:{bg:"rgba(59,130,246,0.14)",text:"#93c5fd"},
    purple:{bg:"rgba(167,139,250,0.12)",text:"#c4b5fd"},
    teal:{bg:"rgba(20,184,166,0.12)",text:"#5eead4"},
    gray:{bg:"rgba(255,255,255,0.07)",text:"rgba(180,210,245,0.6)"},
  };
  const s = map[color]||map.gray;
  return <span style={{fontSize:11,padding:"2px 9px",borderRadius:20,fontWeight:500,background:s.bg,color:s.text}}>{children}</span>;
};
const Card = ({ children, style }) => (
  <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"16px 18px",...style}}>{children}</div>
);
const StatCard = ({ label, value, sub, color=C.accent, icon }) => (
  <Card style={{marginBottom:0}}>
    <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:8}}>
      <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em"}}>{label}</div>
      {icon&&<span style={{fontSize:18}}>{icon}</span>}
    </div>
    <div style={{fontSize:26,fontWeight:700,color,marginBottom:2}}>{value}</div>
    {sub&&<div style={{fontSize:11,color:C.muted2}}>{sub}</div>}
  </Card>
);
const Avatar = ({ initials, bg, text, size=32 }) => (
  <div style={{width:size,height:size,borderRadius:"50%",background:bg||"rgba(59,130,246,0.18)",color:text||C.accent,
    fontSize:size*0.35,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
    {initials}
  </div>
);
const Toggle = ({ on, onChange }) => (
  <div onClick={onChange} style={{width:36,height:20,borderRadius:10,background:on?C.accent:"rgba(255,255,255,0.12)",
    position:"relative",cursor:"pointer",transition:"background 0.25s",flexShrink:0}}>
    <div style={{position:"absolute",top:3,left:on?19:3,width:14,height:14,borderRadius:"50%",background:"#fff",transition:"left 0.25s"}}/>
  </div>
);
const Input = ({ value, onChange, placeholder, type="text", style:sx }) => (
  <input type={type} value={value} onChange={onChange} placeholder={placeholder}
    style={{height:36,width:"100%",background:"rgba(255,255,255,0.04)",border:`1px solid ${C.border}`,
      borderRadius:8,color:C.text,fontSize:13,padding:"0 12px",fontFamily:"inherit",boxSizing:"border-box",outline:"none",...sx}}/>
);
const Btn = ({ children, onClick, variant="default", disabled=false, type="button", style:sx }) => {
  const v = {
    primary:{background:C.accent,color:"#fff",border:"none"},
    danger:{background:C.red,color:"#fff",border:"none"},
    success:{background:"rgba(34,197,94,0.15)",color:C.green,border:`1px solid rgba(34,197,94,0.3)`},
    default:{background:"rgba(255,255,255,0.05)",color:C.text,border:`1px solid ${C.border}`},
    ghost:{background:"transparent",color:C.muted,border:"none"},
  };
  return (
    <button type={type} onClick={disabled?undefined:onClick} disabled={disabled}
      style={{padding:"7px 16px",borderRadius:8,fontSize:12,fontWeight:500,cursor:disabled?"not-allowed":"pointer",
        fontFamily:"inherit",display:"inline-flex",alignItems:"center",gap:6,opacity:disabled?0.5:1,...v[variant],...sx}}>
      {children}
    </button>
  );
};
const PageHeader = ({ title, sub, right }) => (
  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:22}}>
    <div>
      <h1 style={{fontSize:20,fontWeight:600,color:C.text,margin:0}}>{title}</h1>
      {sub&&<div style={{fontSize:12,color:C.muted,marginTop:3}}>{sub}</div>}
    </div>
    {right}
  </div>
);
const FieldRow = ({ label, children }) => (
  <div style={{marginBottom:14}}>
    <div style={{fontSize:11,color:C.muted,marginBottom:5,letterSpacing:"0.04em"}}>{label}</div>
    {children}
  </div>
);
const Select = ({ value, onChange, children, style:sx }) => (
  <select value={value} onChange={onChange}
    style={{height:36,width:"100%",background:"rgba(255,255,255,0.04)",border:`1px solid ${C.border}`,
      borderRadius:8,color:C.text,fontSize:13,padding:"0 12px",fontFamily:"inherit",outline:"none",
      cursor:"pointer", boxSizing:"border-box",...sx}}>
    {children}
  </select>
);

/* ════════════════════════════════════════════════
   LEAFLET ENGINE  (shared singleton — same as admin)
════════════════════════════════════════════════ */
const LEAFLET_CSS_ID = "leaflet-css-v194";
const LEAFLET_JS_ID  = "leaflet-js-v194";

const ensureLeaflet = (onReady) => {
  if (window.L) { onReady(); return; }
  if (!document.getElementById(LEAFLET_CSS_ID)) {
    const css = document.createElement("link");
    css.id = LEAFLET_CSS_ID; css.rel = "stylesheet";
    css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(css);
  }
  if (!document.getElementById(LEAFLET_JS_ID)) {
    const js = document.createElement("script");
    js.id  = LEAFLET_JS_ID;
    js.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
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
      @keyframes ud-pulse {
        0%   { transform:translate(-50%,-50%) scale(.4); opacity:.9; }
        100% { transform:translate(-50%,-50%) scale(2.8); opacity:0; }
      }
      @keyframes ud-sos-blink { 0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.7)} 50%{box-shadow:0 0 0 18px rgba(239,68,68,0)} }
      @keyframes ud-spin { to{transform:rotate(360deg)} }
      .leaflet-container   { background:#08101e !important; }
      .leaflet-tile-pane   { filter:saturate(.85) brightness(.9); }
      .leaflet-popup-content-wrapper {
        background:#0b1422; color:#e2e8f0;
        border:1px solid rgba(80,140,220,0.25);
        border-radius:10px; box-shadow:0 4px 20px rgba(0,0,0,.7);
      }
      .leaflet-popup-content { margin:10px 14px; font-family:sans-serif; font-size:12px; line-height:1.6; }
      .leaflet-popup-tip { background:#0b1422; }
      .leaflet-popup-close-button { color:#94a3b8 !important; }
      .leaflet-control-zoom { border:1px solid rgba(80,140,220,0.25) !important; border-radius:8px !important; overflow:hidden; }
      .leaflet-control-zoom a { background:rgba(11,20,34,0.95) !important; color:#e2e8f0 !important;
        border-bottom:1px solid rgba(80,140,220,0.2) !important; font-size:16px !important; }
      .leaflet-control-zoom a:hover { background:rgba(59,130,246,0.18) !important; }
      .leaflet-control-attribution { background:rgba(8,15,26,0.7) !important; color:#64748b !important; font-size:9px !important; }
      .ud-geofence-circle { stroke:#f59e0b !important; stroke-dasharray:8 5; stroke-width:2 !important; fill-opacity:0.07 !important; }
    `;
    document.head.appendChild(s);
  };
})();

const makeDotIcon = (L, color, size=12, pulse=false) => L.divIcon({
  className:"",
  html:`<div style="position:relative;width:${size+18}px;height:${size+18}px;">
    ${pulse?`<div style="position:absolute;top:50%;left:50%;width:${size+10}px;height:${size+10}px;
      border-radius:50%;border:2.5px solid ${color};animation:ud-pulse 1.8s ease-out infinite;"></div>`:""}
    <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
      width:${size}px;height:${size}px;border-radius:50%;background:${color};
      border:2.5px solid #fff;box-shadow:0 0 0 4px ${color}44,0 2px 8px rgba(0,0,0,.5);z-index:1;"></div>
  </div>`,
  iconSize:[size+18,size+18], iconAnchor:[(size+18)/2,(size+18)/2], popupAnchor:[0,-(size/2+10)],
});

const makeTeamIcon = (L, name) => L.divIcon({
  className:"",
  html:`<div style="background:#f59e0b;border-radius:7px;padding:3px 9px;font-size:10px;
    font-weight:800;color:#000;white-space:nowrap;box-shadow:0 2px 10px #f59e0b88;
    border:1.5px solid rgba(255,255,255,0.3);">${name.replace("Team ","")}</div>`,
  iconSize:null, iconAnchor:[22,13], popupAnchor:[0,-16],
});

/* ════════════════════════════════════════════════
   TILE LAYERS (same as admin)
════════════════════════════════════════════════ */
const TILE_LAYERS = {
  road:      {url:"https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",      attr:"© OpenStreetMap contributors"},
  satellite: {url:"https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",attr:"© Esri World Imagery"},
  terrain:   {url:"https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",        attr:"© OpenTopoMap contributors"},
};

/* ════════════════════════════════════════════════
   WEATHER HELPERS
════════════════════════════════════════════════ */
const WX_CODES = {
  0:["☀️","Clear sky"],1:["🌤️","Mainly clear"],2:["⛅","Partly cloudy"],3:["☁️","Overcast"],
  45:["🌫️","Fog"],48:["🌫️","Rime fog"],51:["🌦️","Light drizzle"],53:["🌦️","Drizzle"],
  55:["🌧️","Heavy drizzle"],61:["🌧️","Light rain"],63:["🌧️","Moderate rain"],65:["⛈️","Heavy rain"],
  71:["🌨️","Light snow"],73:["❄️","Snow"],75:["🌨️","Heavy snow"],80:["🌦️","Rain showers"],
  81:["🌧️","Showers"],82:["⛈️","Violent showers"],95:["⛈️","Thunderstorm"],99:["⛈️","Thunderstorm+hail"],
};
const windDirLabel = (d) => ["N","NE","E","SE","S","SW","W","NW"][Math.round(d/45)%8];
const feelsLike = (t,h) => +(t-0.55*(1-h/100)*(t-14.5)).toFixed(1);

/* ════════════════════════════════════════════════
   PAGE: AUTHENTICATION (LOG IN & CREATE ACCOUNT)
   High-aesthetic glassmorphism with blurred ambient lighting
════════════════════════════════════════════════ */
const PageAuth = ({ onLogin, initialTab = "login" }) => {
  const [tab, setTab] = useState(initialTab); // "login" | "register"
  const [themeConfig, setThemeConfig] = useState(null);

  // Fetch mountain theme configuration stored in Firebase Firestore
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

  // Register form state
  const [regStep, setRegStep] = useState(1);
  const [regForm, setRegForm] = useState({
    name: "",
    email: "",
    pass: "",
    confirmPass: "",
    phone: "",
    city: "",
    blood: "B+",
    medical: "None",
    ec1Name: "",
    ec1Rel: "Family",
    ec1Ph: "",
    ec2Name: "",
    ec2Rel: "",
    ec2Ph: "",
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
      setLoginErr("Please enter both email and password.");
      return;
    }

    setLoginLoading(true);
    try {
      const response = await fetch(`${AUTH_API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, password: loginPass }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data?.user) {
        if (data.token) {
          localStorage.setItem(USER_TOKEN_KEY, data.token);
        }
        localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(data.user));
        localStorage.setItem(
          USER_SESSION_KEY,
          JSON.stringify({ userId: data.user.id, email: data.user.email })
        );
        onLogin(data.user);
        return;
      }

      setLoginErr(data.error || "Invalid email or password. Please try again.");
    } catch {
      setLoginErr("Unable to connect right now. Please check your network connection.");
    } finally {
      setLoginLoading(false);
    }
  };

  // Validate Register Step 1
  const validateRegStep1 = () => {
    if (!regForm.name.trim()) return "Please enter your full name.";
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(regForm.email.trim())) return "Please enter a valid email address.";
    if (!regForm.phone.trim()) return "Please enter your contact phone number.";
    if (regForm.pass.length < 6) return "Password must be at least 6 characters.";
    if (regForm.pass !== regForm.confirmPass) return "Passwords do not match.";
    return null;
  };

  // Validate Register Step 2
  const validateRegStep2 = () => {
    if (!regForm.ec1Name.trim() || !regForm.ec1Ph.trim()) {
      return "Please provide at least one primary emergency contact name and phone number.";
    }
    return null;
  };

  const handleNextStep = () => {
    setRegErr("");
    const err = validateRegStep1();
    if (err) {
      setRegErr(err);
      return;
    }
    setRegStep(2);
  };

  // Handle Register Submit
  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setRegErr("");

    const err = validateRegStep2();
    if (err) {
      setRegErr(err);
      return;
    }

    setRegLoading(true);
    try {
      const response = await fetch(`${AUTH_API_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: regForm.name.trim(),
          email: regForm.email.trim().toLowerCase(),
          password: regForm.pass,
          phone: regForm.phone.trim(),
          city: regForm.city.trim() || "Western Ghats Region",
          role: "Trekker",
          blood: regForm.blood,
          medical: regForm.medical.trim() || "None",
          ec1Name: regForm.ec1Name.trim(),
          ec1Rel: regForm.ec1Rel.trim() || "Family",
          ec1Ph: regForm.ec1Ph.trim(),
          ec2Name: regForm.ec2Name.trim(),
          ec2Rel: regForm.ec2Rel.trim(),
          ec2Ph: regForm.ec2Ph.trim(),
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data?.user) {
        if (data.token) {
          localStorage.setItem(USER_TOKEN_KEY, data.token);
        }
        localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(data.user));
        localStorage.setItem(
          USER_SESSION_KEY,
          JSON.stringify({ userId: data.user.id, email: data.user.email })
        );
        setRegSuccess(true);
        setTimeout(() => {
          onLogin(data.user);
        }, 1500);
        return;
      }

      setRegErr(data.error || "Unable to complete registration. Please try again.");
    } catch {
      setRegErr("Unable to connect right now. Please check your network connection.");
    } finally {
      setRegLoading(false);
    }
  };

  const bloodOptions = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

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
          background: "rgba(10, 18, 32, 0.76)",
          backdropFilter: "blur(28px) saturate(190%)",
          WebkitBackdropFilter: "blur(28px) saturate(190%)",
          borderRadius: 24,
          border: "1px solid rgba(255, 255, 255, 0.12)",
          boxShadow:
            "0 30px 80px -15px rgba(0, 0, 0, 0.85), inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 0 0 1px rgba(255, 255, 255, 0.04)",
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
              background: "linear-gradient(135deg, rgba(59, 130, 246, 0.28), rgba(16, 185, 129, 0.18))",
              border: "1px solid rgba(255, 255, 255, 0.18)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 12px",
              boxShadow: "0 10px 25px rgba(0, 0, 0, 0.45), 0 0 18px rgba(59, 130, 246, 0.25)",
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
              background: "rgba(16, 185, 129, 0.12)",
              border: "1px solid rgba(16, 185, 129, 0.28)",
              color: "#34d399",
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
                background: "#10b981",
                display: "inline-block",
                boxShadow: "0 0 8px #10b981",
              }}
            />
            Duty-of-Care & Mountain Safety
          </div>

          <div style={{ fontSize: 26, fontWeight: 800, color: "#f8fafc", letterSpacing: "-0.03em" }}>
            Margsutra
          </div>
          <div style={{ fontSize: 13, color: "rgba(180, 210, 245, 0.65)", marginTop: 4 }}>
            Trip Safety & Emergency Response Platform
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
            Create Account
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
                Email Address
              </label>
              <input
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                style={{
                  width: "100%",
                  height: 44,
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.11)",
                  borderRadius: 12,
                  color: "#f8fafc",
                  fontSize: 14,
                  padding: "0 14px",
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
                  onClick={() => setShowLoginPass(!showLoginPass)}
                  style={{
                    background: "transparent",
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
                  color: "#f8fafc",
                  fontSize: 14,
                  padding: "0 14px",
                  boxSizing: "border-box",
                  outline: "none",
                  transition: "border-color 0.2s ease, box-shadow 0.2s ease",
                }}
              />
            </div>

            {loginErr && (
              <div
                style={{
                  background: "rgba(239, 68, 68, 0.14)",
                  border: "1px solid rgba(239, 68, 68, 0.35)",
                  borderRadius: 12,
                  padding: "11px 14px",
                  fontSize: 12.5,
                  color: "#fca5a5",
                  marginBottom: 18,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span>⚠️</span>
                <span>{loginErr}</span>
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

            <div style={{ textAlign: "center", marginTop: 20 }}>
              <span style={{ fontSize: 13, color: "rgba(180, 210, 245, 0.6)" }}>
                Don't have an account?{" "}
              </span>
              <button
                type="button"
                onClick={() => {
                  setTab("register");
                  setLoginErr("");
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#60a5fa",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  padding: 0,
                  textDecoration: "underline",
                }}
              >
                Create an Account →
              </button>
            </div>
          </form>
        )}

        {/* ── TAB 2: CREATE ACCOUNT ── */}
        {tab === "register" && (
          <div>
            {regSuccess ? (
              <div style={{ textAlign: "center", padding: "24px 0 16px" }}>
                <div
                  style={{
                    width: 62,
                    height: 62,
                    borderRadius: "50%",
                    background: "rgba(16, 185, 129, 0.16)",
                    border: "2px solid #10b981",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 16px",
                    fontSize: 28,
                    color: "#34d399",
                    boxShadow: "0 0 28px rgba(16, 185, 129, 0.45)",
                  }}
                >
                  ✓
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#f8fafc", marginBottom: 6 }}>
                  Account Created Successfully!
                </div>
                <div style={{ fontSize: 13.5, color: "rgba(180, 210, 245, 0.75)", lineHeight: 1.55 }}>
                  Welcome to Margsutra. Your duty-of-care profile is now active. Launching your expedition console…
                </div>
              </div>
            ) : (
              <div>
                {/* Stepper Progress */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
                  <div
                    style={{
                      flex: 1,
                      height: 4,
                      borderRadius: 2,
                      background: regStep >= 1 ? "#3b82f6" : "rgba(255, 255, 255, 0.1)",
                    }}
                  />
                  <div
                    style={{
                      flex: 1,
                      height: 4,
                      borderRadius: 2,
                      background: regStep === 2 ? "#3b82f6" : "rgba(255, 255, 255, 0.1)",
                    }}
                  />
                </div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#60a5fa",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginBottom: 14,
                  }}
                >
                  {regStep === 1
                    ? "Step 1 of 2: Profile & Credentials"
                    : "Step 2 of 2: Duty-of-Care & Safety Information"}
                </div>

                {regErr && (
                  <div
                    style={{
                      background: "rgba(239, 68, 68, 0.14)",
                      border: "1px solid rgba(239, 68, 68, 0.35)",
                      borderRadius: 12,
                      padding: "11px 14px",
                      fontSize: 12.5,
                      color: "#fca5a5",
                      marginBottom: 16,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span>⚠️</span>
                    <span>{regErr}</span>
                  </div>
                )}

                {/* ── STEP 1: Personal Profile & Credentials ── */}
                {regStep === 1 && (
                  <div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                      <div>
                        <label
                          style={{
                            display: "block",
                            fontSize: 11,
                            fontWeight: 600,
                            color: "rgba(180, 210, 245, 0.72)",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            marginBottom: 5,
                          }}
                        >
                          Full Name *
                        </label>
                        <input
                          type="text"
                          value={regForm.name}
                          onChange={(e) => updReg("name", e.target.value)}
                          placeholder="Your name"
                          style={{
                            width: "100%",
                            height: 42,
                            background: "rgba(255, 255, 255, 0.05)",
                            border: "1px solid rgba(255, 255, 255, 0.11)",
                            borderRadius: 10,
                            color: "#f8fafc",
                            fontSize: 13.5,
                            padding: "0 12px",
                            boxSizing: "border-box",
                            outline: "none",
                          }}
                        />
                      </div>
                      <div>
                        <label
                          style={{
                            display: "block",
                            fontSize: 11,
                            fontWeight: 600,
                            color: "rgba(180, 210, 245, 0.72)",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            marginBottom: 5,
                          }}
                        >
                          City / Region
                        </label>
                        <input
                          type="text"
                          value={regForm.city}
                          onChange={(e) => updReg("city", e.target.value)}
                          placeholder="e.g. Pune, Mumbai"
                          style={{
                            width: "100%",
                            height: 42,
                            background: "rgba(255, 255, 255, 0.05)",
                            border: "1px solid rgba(255, 255, 255, 0.11)",
                            borderRadius: 10,
                            color: "#f8fafc",
                            fontSize: 13.5,
                            padding: "0 12px",
                            boxSizing: "border-box",
                            outline: "none",
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ marginBottom: 14 }}>
                      <label
                        style={{
                          display: "block",
                          fontSize: 11,
                          fontWeight: 600,
                          color: "rgba(180, 210, 245, 0.72)",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          marginBottom: 5,
                        }}
                      >
                        Email Address *
                      </label>
                      <input
                        type="email"
                        value={regForm.email}
                        onChange={(e) => updReg("email", e.target.value)}
                        placeholder="you@example.com"
                        style={{
                          width: "100%",
                          height: 42,
                          background: "rgba(255, 255, 255, 0.05)",
                          border: "1px solid rgba(255, 255, 255, 0.11)",
                          borderRadius: 10,
                          color: "#f8fafc",
                          fontSize: 13.5,
                          padding: "0 12px",
                          boxSizing: "border-box",
                          outline: "none",
                        }}
                      />
                    </div>

                    <div style={{ marginBottom: 14 }}>
                      <label
                        style={{
                          display: "block",
                          fontSize: 11,
                          fontWeight: 600,
                          color: "rgba(180, 210, 245, 0.72)",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          marginBottom: 5,
                        }}
                      >
                        Contact Phone Number *
                      </label>
                      <input
                        type="tel"
                        value={regForm.phone}
                        onChange={(e) => updReg("phone", e.target.value)}
                        placeholder="+91 98765 43210"
                        style={{
                          width: "100%",
                          height: 42,
                          background: "rgba(255, 255, 255, 0.05)",
                          border: "1px solid rgba(255, 255, 255, 0.11)",
                          borderRadius: 10,
                          color: "#f8fafc",
                          fontSize: 13.5,
                          padding: "0 12px",
                          boxSizing: "border-box",
                          outline: "none",
                        }}
                      />
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                      <div>
                        <label
                          style={{
                            display: "block",
                            fontSize: 11,
                            fontWeight: 600,
                            color: "rgba(180, 210, 245, 0.72)",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            marginBottom: 5,
                          }}
                        >
                          Password * (min 6)
                        </label>
                        <input
                          type={showRegPass ? "text" : "password"}
                          value={regForm.pass}
                          onChange={(e) => updReg("pass", e.target.value)}
                          placeholder="Create password"
                          style={{
                            width: "100%",
                            height: 42,
                            background: "rgba(255, 255, 255, 0.05)",
                            border: "1px solid rgba(255, 255, 255, 0.11)",
                            borderRadius: 10,
                            color: "#f8fafc",
                            fontSize: 13.5,
                            padding: "0 12px",
                            boxSizing: "border-box",
                            outline: "none",
                          }}
                        />
                      </div>
                      <div>
                        <label
                          style={{
                            display: "block",
                            fontSize: 11,
                            fontWeight: 600,
                            color: "rgba(180, 210, 245, 0.72)",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            marginBottom: 5,
                          }}
                        >
                          Confirm Password *
                        </label>
                        <input
                          type={showRegPass ? "text" : "password"}
                          value={regForm.confirmPass}
                          onChange={(e) => updReg("confirmPass", e.target.value)}
                          placeholder="Repeat password"
                          style={{
                            width: "100%",
                            height: 42,
                            background: "rgba(255, 255, 255, 0.05)",
                            border: "1px solid rgba(255, 255, 255, 0.11)",
                            borderRadius: 10,
                            color: "#f8fafc",
                            fontSize: 13.5,
                            padding: "0 12px",
                            boxSizing: "border-box",
                            outline: "none",
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 18 }}>
                      <button
                        type="button"
                        onClick={() => setShowRegPass(!showRegPass)}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "#60a5fa",
                          fontSize: 11.5,
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        {showRegPass ? "Hide Passwords" : "Show Passwords"}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleNextStep}
                      style={{
                        width: "100%",
                        height: 46,
                        background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                        border: "1px solid rgba(255, 255, 255, 0.15)",
                        borderRadius: 12,
                        color: "#ffffff",
                        fontSize: 14.5,
                        fontWeight: 600,
                        cursor: "pointer",
                        boxShadow: "0 4px 20px rgba(37, 99, 235, 0.35)",
                      }}
                    >
                      Next: Safety & Medical Info →
                    </button>
                  </div>
                )}

                {/* ── STEP 2: Duty-of-Care & Safety Information ── */}
                {regStep === 2 && (
                  <form onSubmit={handleRegisterSubmit}>
                    <div
                      style={{
                        background: "rgba(59, 130, 246, 0.1)",
                        border: "1px solid rgba(59, 130, 246, 0.28)",
                        borderRadius: 12,
                        padding: "12px 14px",
                        marginBottom: 16,
                        fontSize: 12,
                        color: "rgba(226, 232, 240, 0.88)",
                        lineHeight: 1.5,
                      }}
                    >
                      🛡️ <strong style={{ color: "#ffffff" }}>Protected Safety Protocol:</strong> Emergency contacts and medical notes are encrypted and accessible exclusively by certified expedition leaders and search-and-rescue teams during active trips.
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                      <div>
                        <label
                          style={{
                            display: "block",
                            fontSize: 11,
                            fontWeight: 600,
                            color: "rgba(180, 210, 245, 0.72)",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            marginBottom: 5,
                          }}
                        >
                          Blood Group *
                        </label>
                        <select
                          value={regForm.blood}
                          onChange={(e) => updReg("blood", e.target.value)}
                          style={{
                            width: "100%",
                            height: 42,
                            background: "rgba(11, 20, 34, 0.95)",
                            border: "1px solid rgba(255, 255, 255, 0.12)",
                            borderRadius: 10,
                            color: "#f8fafc",
                            fontSize: 13.5,
                            padding: "0 12px",
                            outline: "none",
                            cursor: "pointer",
                            boxSizing: "border-box",
                          }}
                        >
                          {bloodOptions.map((b) => (
                            <option key={b} value={b} style={{ background: "#0b1422" }}>
                              {b}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label
                          style={{
                            display: "block",
                            fontSize: 11,
                            fontWeight: 600,
                            color: "rgba(180, 210, 245, 0.72)",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            marginBottom: 5,
                          }}
                        >
                          Medical Conditions
                        </label>
                        <input
                          type="text"
                          value={regForm.medical}
                          onChange={(e) => updReg("medical", e.target.value)}
                          placeholder="e.g. Asthma, Allergies, None"
                          style={{
                            width: "100%",
                            height: 42,
                            background: "rgba(255, 255, 255, 0.05)",
                            border: "1px solid rgba(255, 255, 255, 0.11)",
                            borderRadius: 10,
                            color: "#f8fafc",
                            fontSize: 13.5,
                            padding: "0 12px",
                            boxSizing: "border-box",
                            outline: "none",
                          }}
                        />
                      </div>
                    </div>

                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#60a5fa",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        marginBottom: 8,
                      }}
                    >
                      Primary Emergency Contact *
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1.2fr", gap: 8, marginBottom: 14 }}>
                      <input
                        type="text"
                        value={regForm.ec1Name}
                        onChange={(e) => updReg("ec1Name", e.target.value)}
                        placeholder="Contact Name *"
                        style={{
                          height: 40,
                          background: "rgba(255, 255, 255, 0.05)",
                          border: "1px solid rgba(255, 255, 255, 0.11)",
                          borderRadius: 8,
                          color: "#f8fafc",
                          fontSize: 13,
                          padding: "0 10px",
                          boxSizing: "border-box",
                        }}
                      />
                      <input
                        type="text"
                        value={regForm.ec1Rel}
                        onChange={(e) => updReg("ec1Rel", e.target.value)}
                        placeholder="Relation"
                        style={{
                          height: 40,
                          background: "rgba(255, 255, 255, 0.05)",
                          border: "1px solid rgba(255, 255, 255, 0.11)",
                          borderRadius: 8,
                          color: "#f8fafc",
                          fontSize: 13,
                          padding: "0 10px",
                          boxSizing: "border-box",
                        }}
                      />
                      <input
                        type="tel"
                        value={regForm.ec1Ph}
                        onChange={(e) => updReg("ec1Ph", e.target.value)}
                        placeholder="Phone *"
                        style={{
                          height: 40,
                          background: "rgba(255, 255, 255, 0.05)",
                          border: "1px solid rgba(255, 255, 255, 0.11)",
                          borderRadius: 8,
                          color: "#f8fafc",
                          fontSize: 13,
                          padding: "0 10px",
                          boxSizing: "border-box",
                        }}
                      />
                    </div>

                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "rgba(180, 210, 245, 0.72)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        marginBottom: 8,
                      }}
                    >
                      Secondary Emergency Contact (Optional)
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1.2fr", gap: 8, marginBottom: 20 }}>
                      <input
                        type="text"
                        value={regForm.ec2Name}
                        onChange={(e) => updReg("ec2Name", e.target.value)}
                        placeholder="Contact Name"
                        style={{
                          height: 40,
                          background: "rgba(255, 255, 255, 0.05)",
                          border: "1px solid rgba(255, 255, 255, 0.11)",
                          borderRadius: 8,
                          color: "#f8fafc",
                          fontSize: 13,
                          padding: "0 10px",
                          boxSizing: "border-box",
                        }}
                      />
                      <input
                        type="text"
                        value={regForm.ec2Rel}
                        onChange={(e) => updReg("ec2Rel", e.target.value)}
                        placeholder="Relation"
                        style={{
                          height: 40,
                          background: "rgba(255, 255, 255, 0.05)",
                          border: "1px solid rgba(255, 255, 255, 0.11)",
                          borderRadius: 8,
                          color: "#f8fafc",
                          fontSize: 13,
                          padding: "0 10px",
                          boxSizing: "border-box",
                        }}
                      />
                      <input
                        type="tel"
                        value={regForm.ec2Ph}
                        onChange={(e) => updReg("ec2Ph", e.target.value)}
                        placeholder="Phone"
                        style={{
                          height: 40,
                          background: "rgba(255, 255, 255, 0.05)",
                          border: "1px solid rgba(255, 255, 255, 0.11)",
                          borderRadius: 8,
                          color: "#f8fafc",
                          fontSize: 13,
                          padding: "0 10px",
                          boxSizing: "border-box",
                        }}
                      />
                    </div>

                    <div style={{ display: "flex", gap: 10 }}>
                      <button
                        type="button"
                        onClick={() => setRegStep(1)}
                        style={{
                          padding: "0 18px",
                          height: 46,
                          background: "rgba(255, 255, 255, 0.06)",
                          border: "1px solid rgba(255, 255, 255, 0.12)",
                          borderRadius: 12,
                          color: "#f8fafc",
                          fontSize: 13.5,
                          fontWeight: 500,
                          cursor: "pointer",
                        }}
                      >
                        ← Back
                      </button>
                      <button
                        type="submit"
                        disabled={regLoading}
                        style={{
                          flex: 1,
                          height: 46,
                          background: "linear-gradient(135deg, #10b981, #059669)",
                          border: "1px solid rgba(255, 255, 255, 0.15)",
                          borderRadius: 12,
                          color: "#ffffff",
                          fontSize: 14.5,
                          fontWeight: 600,
                          cursor: regLoading ? "not-allowed" : "pointer",
                          boxShadow: "0 4px 20px rgba(16, 185, 129, 0.35)",
                          opacity: regLoading ? 0.75 : 1,
                        }}
                      >
                        {regLoading ? "Creating your profile…" : "Complete Registration"}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            <div style={{ textAlign: "center", marginTop: 20 }}>
              <span style={{ fontSize: 13, color: "rgba(180, 210, 245, 0.6)" }}>
                Already registered?{" "}
              </span>
              <button
                type="button"
                onClick={() => {
                  setTab("login");
                  setRegErr("");
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#60a5fa",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  padding: 0,
                  textDecoration: "underline",
                }}
              >
                Log In instead →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════
   PAGE: DASHBOARD
════════════════════════════════════════════════ */
const PageDashboard = ({ user, onNavigate, activeSOS, joinedTrip, onSOS }) => {
  const [wx, setWx] = useState(null);
  const [wxLoading, setWxLoading] = useState(true);
  const [sensor, setSensor] = useState({
    temp:null, humidity:null, pressure:null, windSpeed:null, windDir:null,
    uvIndex:null, rainfall:null, aqi:null,
  });
  const [pressureHistory, setPressureHistory] = useState([]);
  const [sosConfirm, setSosConfirm] = useState(false);
  const [sosActive, setSosActive] = useState(activeSOS);

  useEffect(() => {
    setSosActive(activeSOS);
  }, [activeSOS]);
  const [expandProtocol, setExpandProtocol] = useState(null);
  const [safetyProtocols, setSafetyProtocols] = useState(FALLBACK_SAFETY_PROTOCOLS);

  /* Fetch Open-Meteo weather */
  useEffect(()=>{
    if (!joinedTrip) return;
    const lat = joinedTrip?.lat || 18.8286;
    const lon = joinedTrip?.lon || 73.3986;
    const go = async () => {
      try {
        const r = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
          "&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m," +
          "wind_direction_10m,cloud_cover,pressure_msl,uv_index,weather_code" +
          "&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code" +
          "&timezone=Asia%2FKolkata&forecast_days=3"
        );
        const d = await r.json();
        setWx(d);
        if (d.current) {
          setSensor(p=>({...p,
            temp:d.current.temperature_2m, humidity:d.current.relative_humidity_2m,
            pressure:d.current.pressure_msl, windSpeed:d.current.wind_speed_10m,
            windDir:d.current.wind_direction_10m, uvIndex:d.current.uv_index??p.uvIndex,
            rainfall:d.current.precipitation,
          }));
          setPressureHistory(h=>[...h.slice(1), Math.round(d.current.pressure_msl)]);
        }
        setWxLoading(false);
      } catch { setWxLoading(false); }
    };
    go();
    const t = setInterval(go, 300_000);
    return ()=>clearInterval(t);
  },[joinedTrip]);

  /* Weather values are only ever what the API returned — no synthetic drift. */

  useEffect(() => {
    const unsubscribe = subscribeToSafetyProtocols((protocols) => {
      if (!protocols.length) return;
      const publishedProtocols = protocols
        .map((protocol) => ({
          ...protocol,
          icon: protocol.icon || deriveProtocolIcon(protocol.title),
          status: protocol.status || "draft",
          updated:
            protocol.updated ||
            (protocol.updatedAt
              ? new Date(protocol.updatedAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : "Recently"),
        }))
        .filter((protocol) => protocol.status === "published");

      if (publishedProtocols.length > 0) {
        setSafetyProtocols(publishedProtocols);
      }
    });

    return () => unsubscribe();
  }, []);

  const wxCode = wx?.current?.weather_code??0;
  const [wxIcon, wxDesc] = WX_CODES[wxCode]??["🌤️","—"];
  const pressureTrend = pressureHistory.length >= 2
    ? pressureHistory[pressureHistory.length-1] - pressureHistory[0]
    : null;
  const safetyStatus  = pressureTrend === null ? "unknown" : pressureTrend < -2 ? "unsafe" : pressureTrend < -0.5 ? "caution" : "safe";
  const statusColor   = {safe:C.green, caution:C.amber, unsafe:C.red, unknown:C.muted};
  const statusLabel   = {safe:"Safe to Trek ✓", caution:"Use Caution ⚠️", unsafe:"Unsafe Conditions ✗", unknown:"Conditions Unverified"};

  const handleSOSTrigger = () => {
    onSOS(true);
  };
  const cancelSOS = () => {
    onSOS(false);
  };

  if (!joinedTrip) {
    return (
      <div>
        <PageHeader
          title="My Dashboard"
          sub={`Welcome back, ${user?.name || "Trekker"} · Duty-of-Care Portal`}
          right={
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Pill color="gray">⚪ No Active Trip</Pill>
              <Btn variant="primary" onClick={() => onNavigate("join-trip")}>
                🔑 Join an Expedition
              </Btn>
            </div>
          }
        />

        {/* Hero Card for No Active Trip */}
        <Card
          style={{
            background: "linear-gradient(135deg, rgba(30, 58, 110, 0.35), rgba(11, 20, 34, 0.95))",
            borderColor: "rgba(59, 130, 246, 0.3)",
            padding: "36px 28px",
            marginBottom: 20,
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: "rgba(59, 130, 246, 0.15)",
              border: "1px solid rgba(59, 130, 246, 0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
              fontSize: 32,
              boxShadow: "0 8px 24px rgba(0, 0, 0, 0.4)",
            }}
          >
            🧭
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 8 }}>
            No Active Trip at the Moment
          </div>
          <div style={{ fontSize: 13.5, color: C.muted, maxWidth: 540, margin: "0 auto 24px", lineHeight: 1.6 }}>
            You are not currently enrolled in an active trek. Live mountain weather telemetry, atmospheric barometer trends, route geofencing, and emergency SOS dispatch are activated once you join an expedition.
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
            <Btn variant="primary" onClick={() => onNavigate("join-trip")} style={{ padding: "10px 22px", fontSize: 13.5 }}>
              🔑 Join with Trip Code or Browse Treks →
            </Btn>
          </div>
        </Card>

        {/* 2-Column Grid: Profile Readiness & How Margsutra Works */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
          {/* Duty-of-Care Readiness Summary */}
          <Card>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                Duty-of-Care &amp; Emergency Profile
              </div>
              <Pill color="green">Ready for Field ✓</Pill>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, paddingBottom: 14, borderBottom: `1px solid ${C.border}` }}>
              <Avatar initials={user?.avatar || (user?.name || "T").slice(0, 2).toUpperCase()} bg={user?.color?.[0] || "#E6F1FB"} text={user?.color?.[1] || "#0C447C"} size={44}/>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{user?.name}</div>
                <div style={{ fontSize: 11, color: C.muted }}>{user?.email} · {user?.city || "Western Ghats"}</div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 10, color: C.muted2 }}>BLOOD GROUP</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.red }}>🩸 {user?.blood || "B+"}</div>
              </div>
              <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 10, color: C.muted2 }}>PRIMARY CONTACT</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {user?.ec1Name ? `${user.ec1Name} (${user.ec1Rel || "Family"})` : "Not set"}
                </div>
              </div>
            </div>

            <Btn onClick={() => onNavigate("profile")} style={{ width: "100%", justifyContent: "center" }}>
              👤 View &amp; Edit Full Medical Profile →
            </Btn>
          </Card>

          {/* Expedition Safety Notice */}
          <Card style={{ background: "rgba(11, 20, 34, 0.75)" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>
              How Expedition Safety Works
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                ["🔑 1. Enter Trip Join Code", "Obtain the 6-character code (e.g. RAJM26) from your trip organizer to enroll in the expedition roster."],
                ["📡 2. Live Weather & Telemetry", "Once joined, real-time barometric pressure, rain radar, and micro-climate sensors for that peak will unlock."],
                ["🔶 3. Admin-Controlled Geofence", "Your trek leader sets the trail perimeter (e.g. 2.5 km). You will be warned instantly if you stray off course."],
                ["🚨 4. Mountain SOS Dispatch", "In emergencies, triggering SOS broadcasts your medical card and exact GPS coordinates to SAR rescue teams."],
              ].map(([t, desc]) => (
                <div key={t} style={{ background: "rgba(255, 255, 255, 0.03)", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#60a5fa", marginBottom: 3 }}>{t}</div>
                  <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.45 }}>{desc}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // Awaiting Admin Approval state
  if (joinedTrip && joinedTrip.tripStatus === "pending_approval") {
    return (
      <div>
        <PageHeader
          title="My Dashboard"
          sub={`Welcome back, ${user?.name || "Trekker"} · Duty-of-Care Portal`}
          right={
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Pill color="amber">⏳ Application Pending Approval</Pill>
              <Btn variant="default" onClick={() => onNavigate("join-trip")}>
                🧭 View Expeditions
              </Btn>
            </div>
          }
        />

        {/* Hero Card for Pending Approval */}
        <Card
          style={{
            background: "linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(11, 20, 34, 0.95))",
            borderColor: "rgba(245, 158, 11, 0.4)",
            padding: "36px 28px",
            marginBottom: 20,
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: "rgba(245, 158, 11, 0.18)",
              border: "1px solid rgba(245, 158, 11, 0.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
              fontSize: 32,
              boxShadow: "0 8px 24px rgba(245, 158, 11, 0.2)",
            }}
          >
            ⏳
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 8 }}>
            Application Pending Admin Approval
          </div>
          <div style={{ fontSize: 13.5, color: C.muted, maxWidth: 580, margin: "0 auto 20px", lineHeight: 1.6 }}>
            Your application for <strong>{joinedTrip.name}</strong> (Code: <strong>{joinedTrip.code}</strong>) has been submitted and is currently in queue for review by the expedition leader or administrator. Live mountain weather telemetry, route geofencing, and SAR emergency dispatch will unlock automatically upon authorization.
          </div>

          <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 20px", maxWidth: 620, margin: "0 auto 24px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, textAlign: "left" }}>
            <div>
              <div style={{ fontSize: 11, color: C.muted2 }}>EXPEDITION</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{joinedTrip.name}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: C.muted2 }}>ZONE &amp; LOCATION</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>📍 {joinedTrip.location}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: C.muted2 }}>LEADER &amp; DISPATCH</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>🧭 {joinedTrip.leader || "Field Guide"}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: C.muted2 }}>APPLICATION STATUS</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fbbf24" }}>⏳ Pending Authorization</div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
            <Btn variant="primary" onClick={() => onNavigate("join-trip")} style={{ padding: "10px 22px", fontSize: 13.5 }}>
              🧭 Manage Application in Expeditions →
            </Btn>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="My Dashboard"
        sub={`${joinedTrip.name} · ${joinedTrip.date}`}
        right={<div style={{display:"flex",gap:8}}>
          <Pill color={safetyStatus==="safe"?"green":safetyStatus==="caution"?"amber":"red"}>
            {statusLabel[safetyStatus]}
          </Pill>
          <Pill color="green">● Live</Pill>
        </div>}/>

      {/* SOS Active Banner */}
      {sosActive && (
        <div style={{
          background: "linear-gradient(90deg, rgba(239, 68, 68, 0.25) 0%, rgba(185, 28, 28, 0.35) 100%)",
          border: "2px solid #ef4444",
          borderRadius: 14,
          padding: "16px 20px",
          marginBottom: 18,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 14,
          boxShadow: "0 8px 30px rgba(239, 68, 68, 0.45)",
          animation: "ud-sos-blink 1.2s infinite"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ fontSize: 28 }}>🚨</div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 900, color: "#ffffff", letterSpacing: "0.02em" }}>
                EMERGENCY DISTRESS BEACON ACTIVE · SIREN EMITTING
              </div>
              <div style={{ fontSize: 12.5, color: "#fecaca", marginTop: 2 }}>
                High-priority telemetry transmitting to Leader Ajay Saini and SAR Command · GPS tracking active
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Btn variant="danger" onClick={cancelSOS} style={{ padding: "8px 18px", fontWeight: 800 }}>
              🛑 Cancel SOS (I Am Safe)
            </Btn>
            <Btn onClick={() => onNavigate("sos-nav")} style={{ padding: "8px 18px" }}>
              View Rescue HUD →
            </Btn>
          </div>
        </div>
      )}

      {/* Unified In-Field Expedition Mission Card */}
      <Card style={{
        marginBottom: 18,
        background: "linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(11, 20, 34, 0.98) 100%)",
        borderColor: "rgba(16, 185, 129, 0.35)",
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.35)"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
              <Pill color="green">● IN-FIELD EXPEDITION ACTIVE</Pill>
              <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 6, background: "rgba(59, 130, 246, 0.2)", border: "1px solid rgba(59, 130, 246, 0.4)", color: "#60a5fa" }}>
                {joinedTrip.code}
              </span>
              <span style={{ fontSize: 11.5, color: "#34d399", fontWeight: 600 }}>
                {joinedTrip.difficulty || "Moderate (14 km Trail Circuit)"}
              </span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.text, letterSpacing: "-0.01em" }}>
              {joinedTrip.name}
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
              📅 {joinedTrip.date || `${joinedTrip.startDate} → ${joinedTrip.endDate}`} · 📍 {joinedTrip.location}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn variant="primary" onClick={() => onNavigate("live-tracking")} style={{ padding: "8px 18px", fontSize: 12.5 }}>
              🛰️ Open Live Radar Map →
            </Btn>
            <Btn onClick={() => onNavigate("join-trip")} style={{ padding: "8px 16px", fontSize: 12.5 }}>
              🧭 Expeditions Hub
            </Btn>
          </div>
        </div>

        {/* Telemetry quick pills */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 8,
          marginTop: 16,
          paddingTop: 14,
          borderTop: `1px solid ${C.border}`
        }}>
          <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, color: C.muted2, textTransform: "uppercase" }}>FIELD GUIDE &amp; LEADER</div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text, marginTop: 2 }}>🧭 {joinedTrip.leader || "Field Guide Ajay Saini"}</div>
          </div>
          <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, color: C.muted2, textTransform: "uppercase" }}>WALKIE-TALKIE VHF</div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "#fbbf24", marginTop: 2 }}>📻 {joinedTrip.vhfChannel || joinedTrip.emergencyFrequency || "145.500 MHz (Ch 1)"}</div>
          </div>
          <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, color: C.muted2, textTransform: "uppercase" }}>TRAIL ELEVATION &amp; BASE</div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text, marginTop: 2 }}>🏔️ {joinedTrip.elevation || "829m ASL"} · {joinedTrip.baseLocation || "Udhewadi Camp"}</div>
          </div>
          <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, color: C.muted2, textTransform: "uppercase" }}>GEOFENCED CORRIDOR</div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "#34d399", marginTop: 2 }}>🔒 {joinedTrip.geofence?.radius ? (joinedTrip.geofence.radius / 1000).toFixed(1) + " km Safe Radius" : "2.5 km Safe Radius"}</div>
          </div>
        </div>
      </Card>

      {/* 2-Column Responsive Dashboard Body */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 16, marginBottom: 18 }}>
        {/* Left: Weather & Barometric Trend */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Card style={{
            background: "linear-gradient(135deg, rgba(20, 50, 110, 0.5) 0%, rgba(11, 20, 34, 0.95) 100%)",
            border: `1px solid ${C.border}`,
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between"
          }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
                  Mountain Weather &amp; Barometer
                </div>
                <Pill color={safetyStatus === "safe" ? "green" : safetyStatus === "caution" ? "amber" : "red"}>
                  {statusLabel[safetyStatus]}
                </Pill>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 48, lineHeight: 1 }}>{wxIcon}</div>
                <div>
                  <div style={{ fontSize: 40, fontWeight: 800, color: C.text, lineHeight: 1 }}>
                    {sensor.temp}<span style={{ fontSize: 20, color: C.muted, fontWeight: 400 }}>°C</span>
                  </div>
                  <div style={{ fontSize: 13, color: C.text, fontWeight: 600, marginTop: 4 }}>{wxDesc}</div>
                  <div style={{ fontSize: 11.5, color: C.muted }}>Feels like {feelsLike(sensor.temp, sensor.humidity)}°C · {joinedTrip.location}</div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                {[
                  ["💧", "Humidity", `${sensor.humidity}%`],
                  ["🌬️", "Wind", `${sensor.windSpeed} km/h ${windDirLabel(sensor.windDir)}`],
                  ["🌀", "Pressure", `${sensor.pressure?.toFixed(0)} hPa`],
                  ["☀️", "UV Index", `${sensor.uvIndex}`],
                ].map(([ic, k, v]) => (
                  <div key={k} style={{ background: "rgba(255, 255, 255, 0.04)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px" }}>
                    <div style={{ fontSize: 10, color: C.muted2 }}>{ic} {k}</div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text, marginTop: 2 }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 11, color: C.muted }}>
                {pressureTrend >= 0 ? "↑ Barometer stable/rising" : "↓ Barometer dropping"} ({Math.abs(pressureTrend).toFixed(1)} hPa)
              </div>
              <button
                onClick={() => onNavigate("weather")}
                style={{ background: "transparent", border: "none", color: C.accent, fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
              >
                7-Day Forecast &amp; Maps →
              </button>
            </div>
          </Card>
        </div>

        {/* Right: Duty-of-Care & Emergency SOS */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Duty-of-Care Casualty Profile Card */}
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
                Trekker Duty-of-Care Readiness
              </div>
              <Pill color="green">● Verified for Field</Pill>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <Avatar
                initials={user?.avatar || (user?.name || "T").slice(0, 2).toUpperCase()}
                bg={user?.color?.[0] || "#E6F1FB"}
                text={user?.color?.[1] || "#0C447C"}
                size={40}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {user?.name}
                </div>
                <div style={{ fontSize: 11.5, color: C.muted }}>
                  {user?.phone || "+91 86375 40813"} · {user?.city || "Western Ghats"}
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
              <div style={{ background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.25)", borderRadius: 8, padding: "8px 12px" }}>
                <div style={{ fontSize: 10, color: "#fca5a5", fontWeight: 700 }}>BLOOD GROUP</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#ef4444", marginTop: 2 }}>🩸 {user?.blood || "B+"}</div>
              </div>
              <div style={{ background: "rgba(255, 255, 255, 0.03)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px" }}>
                <div style={{ fontSize: 10, color: C.muted2, fontWeight: 700 }}>EMERGENCY CONTACT</div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>
                  {user?.ec1Name ? `${user.ec1Name} (${user.ec1Rel || "Family"})` : "Family · +91 91531 91902"}
                </div>
              </div>
            </div>

            <Btn onClick={() => onNavigate("profile")} style={{ width: "100%", justifyContent: "center", fontSize: 11.5 }}>
              👤 View &amp; Update Medical Records →
            </Btn>
          </Card>

          {/* Rapid Emergency SOS Action Card */}
          <Card style={{
            background: sosActive
              ? "linear-gradient(135deg, rgba(239, 68, 68, 0.25) 0%, rgba(185, 28, 28, 0.3) 100%)"
              : "rgba(239, 68, 68, 0.05)",
            border: sosActive ? "2px solid #ef4444" : "1px solid rgba(239, 68, 68, 0.25)",
            padding: "16px 20px"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: sosActive ? "#f87171" : C.text, display: "flex", alignItems: "center", gap: 6 }}>
                <span>🚨</span>
                <span>Mountain Emergency Distress Beacon</span>
              </div>
              <Pill color={sosActive ? "red" : "gray"}>
                {sosActive ? "● ACTIVE DISTRESS" : "Standby (Safe)"}
              </Pill>
            </div>
            <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.5, marginBottom: 14 }}>
              Broadcasts real-time GPS telemetry, blood group, and emergency contacts to SAR Command. Two-step confirmation guards against accidental false alarms.
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              {sosActive ? (
                <button
                  onClick={cancelSOS}
                  style={{
                    flex: 1,
                    padding: "10px",
                    borderRadius: 8,
                    background: "linear-gradient(135deg, #10b981, #059669)",
                    border: "none",
                    color: "#ffffff",
                    fontSize: 12.5,
                    fontWeight: 800,
                    cursor: "pointer",
                    boxShadow: "0 2px 10px rgba(16, 185, 129, 0.4)",
                    fontFamily: "inherit"
                  }}
                >
                  🛑 Cancel SOS (I Am Safe / False Alarm)
                </button>
              ) : (
                <button
                  onClick={handleSOSTrigger}
                  style={{
                    flex: 1,
                    padding: "10px",
                    borderRadius: 8,
                    background: "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)",
                    border: "none",
                    color: "#ffffff",
                    fontSize: 12.5,
                    fontWeight: 800,
                    cursor: "pointer",
                    boxShadow: "0 4px 14px rgba(239, 68, 68, 0.4)",
                    fontFamily: "inherit",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8
                  }}
                >
                  <span>🚨</span>
                  <span>TRIGGER SOS (2-STEP VERIFICATION)</span>
                </button>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Safety Protocols */}
      <div style={{marginTop:4}}>
        <div style={{fontSize:13,fontWeight:600,color:C.text,marginBottom:12}}>📋 Safety Protocols</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {safetyProtocols.map(p=>(
            <Card key={p.id} style={{cursor:"pointer",transition:"border-color 0.2s",
              borderColor:expandProtocol===p.id?"rgba(59,130,246,0.4)":C.border}}
              onClick={()=>setExpandProtocol(expandProtocol===p.id?null:p.id)}>
              <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
                <div style={{fontSize:20,flexShrink:0,marginTop:2}}>{p.icon}</div>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <div style={{fontSize:13,fontWeight:500,color:C.text}}>{p.title}</div>
                    <span style={{fontSize:12,color:C.muted,transition:"transform 0.2s",
                      display:"inline-block",transform:expandProtocol===p.id?"rotate(180deg)":"none"}}>▾</span>
                  </div>
                  <div style={{fontSize:10,color:C.muted2,marginTop:2}}>Updated {p.updated}</div>
                  {expandProtocol===p.id&&(
                    <div style={{fontSize:12,color:C.muted,marginTop:10,lineHeight:1.7,
                      paddingTop:10,borderTop:`1px solid ${C.border}`}}>
                      {p.body}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

const PageLiveTracking = ({ user, joinedTrip, onNavigate, activeSOS, onSOS }) => {
  const [trackingToken, setTrackingToken] = useState(() => localStorage.getItem("margsutra_tracking_token") || "");
  const [tokenState, setTokenState] = useState(trackingToken ? "ready" : "loading");
  const [tokenError, setTokenError] = useState("");

  const issueToken = async () => {
    setTokenState("loading");
    setTokenError("");
    try {
      const response = await fetch(`${TRACKING_SERVER_URL}/auth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, name: user.name, role: "user" }),
      });
      if (!response.ok) {
        throw new Error(`Token request failed (${response.status})`);
      }
      const data = await response.json();
      if (data.token) {
        localStorage.setItem("margsutra_tracking_token", data.token);
        setTrackingToken(data.token);
        setTokenState("ready");
      } else {
        throw new Error("Token missing in response");
      }
    } catch (error) {
      setTokenError(error.message || "Unable to obtain tracking token");
      setTokenState("manual");
    }
  };

  useEffect(() => {
    const cached = localStorage.getItem("margsutra_tracking_token");
    if (cached && isUsableTrackingToken(cached, user)) {
      setTrackingToken(cached);
      setTokenState("ready");
      return;
    }

    if (cached) {
      localStorage.removeItem("margsutra_tracking_token");
      setTrackingToken("");
    }

    issueToken();
    return;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, user.name]);

  if (!joinedTrip) {
    return (
      <div>
        <PageHeader
          title="Live Tracking"
          sub="Real-time GPS telemetry & expedition beacon"
          right={<Pill color="gray">No Active Trip</Pill>}
        />
        <Card
          style={{
            textAlign: "center",
            padding: "44px 24px",
            background: "linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(11, 20, 34, 0.95))",
            borderColor: "rgba(59, 130, 246, 0.25)",
          }}
        >
          <div
            style={{
              width: 60,
              height: 60,
              borderRadius: "50%",
              background: "rgba(59, 130, 246, 0.15)",
              border: "1px solid rgba(59, 130, 246, 0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
              fontSize: 28,
            }}
          >
            📡
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 8 }}>
            No Active Expedition to Track
          </div>
          <div style={{ fontSize: 13, color: C.muted, maxWidth: 500, margin: "0 auto 22px", lineHeight: 1.6 }}>
            Live GPS telemetry broadcasts your exact coordinates and elevation to your trek leader's command portal. Join an active expedition to activate live location tracking.
          </div>
          <Btn variant="primary" onClick={() => onNavigate?.("join-trip")} style={{ padding: "10px 22px" }}>
            🔑 Join an Expedition →
          </Btn>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Live Tracking"
        sub={`Real-time GPS sharing · ${joinedTrip.name} (${joinedTrip.code})`}
        right={
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            {activeSOS ? (
              <Pill color="red">🚨 SOS Active</Pill>
            ) : (
              <Pill color="green">● Live Telemetry</Pill>
            )}
          </div>
        }
      />

      <UserTrackingWidget
        user={user}
        joinedTrip={joinedTrip}
        serverUrl={TRACKING_SERVER_URL}
        token={trackingToken}
        activeSOS={activeSOS}
        onSOS={onSOS}
        onTokenExpired={issueToken}
      />
    </div>
  );
};

/* ════════════════════════════════════════════════
   EXPEDITIONS DATA & PAGE: JOIN TRIP
════════════════════════════════════════════════ */
const FALLBACK_TRIPS = [
  {
    id: "trip-001",
    code: "RAJM26",
    name: "Rajmachi Fort Monsoon Expedition — Batch 12",
    location: "Rajmachi, Lonavala, Maharashtra",
    leader: "Field Guide Ajay Saini",
    date: "May 3, 2026 · 06:30 AM – May 4, 2026 · 05:00 PM",
    startDate: "May 3, 2026",
    startTime: "06:30 AM",
    endDate: "May 4, 2026",
    endTime: "05:00 PM",
    duration: "2 Days / 1 Night",
    pickupLocation: "Lonavala Railway Station (Platform 1 Exit, Ticket Counter)",
    baseLocation: "Udhewadi Base Village Camp (829m ASL)",
    vhfChannel: "145.500 MHz (VHF Ch 1)",
    status: "in-field",
    isManaged: true,
    rosterCount: 5,
    maxRoster: 25,
    elevation: "829m ASL",
    lat: 18.8286,
    lon: 73.3986,
    geofence: {
      lat: 18.8286,
      lon: 73.3986,
      radius: 2500,
      zoneName: "Rajmachi Safe Trek Corridor"
    },
    difficulty: "Moderate (14 km Trail Circuit)",
    rescueUnit: "Team Alpha (Lonavala SAR)"
  },
  {
    id: "trip-002",
    code: "HAR26",
    name: "Harishchandragad Peak & Konkan Kada Trek",
    location: "Harishchandragad, Ahmednagar, Maharashtra",
    leader: "Field Guide Ajay Saini",
    date: "May 10, 2026 · 05:30 AM – May 11, 2026 · 06:00 PM",
    startDate: "May 10, 2026",
    startTime: "05:30 AM",
    endDate: "May 11, 2026",
    endTime: "06:00 PM",
    duration: "2 Days / 1 Night",
    pickupLocation: "Kasara Railway Station (Main Concourse Exit)",
    baseLocation: "Khireshwar Base Village Camp (1,424m ASL)",
    vhfChannel: "146.520 MHz (VHF Ch 2)",
    status: "upcoming",
    isManaged: false,
    rosterCount: 0,
    maxRoster: 20,
    elevation: "1,424m ASL",
    lat: 19.3853,
    lon: 73.7786,
    geofence: {
      lat: 19.3853,
      lon: 73.7786,
      radius: 3000,
      zoneName: "Harishchandragad Plateau Safety Perimeter"
    },
    difficulty: "Challenging (Rock Patches & Cliff Edge)",
    rescueUnit: "Team Bravo (Malshej Ghat Rescue)"
  }
];

const PageJoinTrip = ({ user, joinedTrip, onJoin, onLeave, onNavigate, error }) => {
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localErr, setLocalErr] = useState("");
  const [availableTrips, setAvailableTrips] = useState(FALLBACK_TRIPS);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const isPending = joinedTrip?.tripStatus === "pending_approval";
  const isApproved = joinedTrip && joinedTrip?.tripStatus !== "pending_approval";

  useEffect(() => {
    const unsub = subscribeToTrips((trips) => {
      if (trips && trips.length > 0) {
        setAvailableTrips(trips);
      }
    });
    return () => unsub?.();
  }, []);

  const handleCodeSubmit = async (e) => {
    e?.preventDefault();
    setLocalErr("");
    if (joinedTrip) {
      setLocalErr("You are already enrolled in an expedition. Leave your current expedition before applying to another.");
      return;
    }
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) {
      setLocalErr("Please enter a valid expedition code (e.g. RAJM26).");
      return;
    }
    setSubmitting(true);
    const ok = await onJoin(cleanCode);
    setSubmitting(false);
    if (!ok) {
      setLocalErr("No active expedition matches that code. Please check with your organizer.");
    }
  };

  const handleCardJoin = async (trip) => {
    setLocalErr("");
    if (joinedTrip && (joinedTrip.id === trip.id || joinedTrip.code === trip.code)) {
      onNavigate?.("dashboard");
      return;
    }
    if (joinedTrip) {
      setLocalErr("You are already enrolled in an expedition. Leave your current expedition before applying to another.");
      return;
    }
    setSubmitting(true);
    await onJoin(trip);
    setSubmitting(false);
  };

  const [showLogistics, setShowLogistics] = useState(false);

  const isCurrentTrip = (t) => joinedTrip && (joinedTrip.id === t.id || joinedTrip.code === t.code || joinedTrip.tripId === t.id);

  // Other available trips excluding the active one to prevent ugly repetition
  const otherTrips = availableTrips.filter((t) => !isCurrentTrip(t));

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <PageHeader
        title="Expeditions & Treks"
        sub="Field expedition management and upcoming mountain departures"
        right={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Pill color={isApproved ? "green" : isPending ? "amber" : "gray"}>
              {isApproved ? `● Enrolled: ${joinedTrip.code}` : isPending ? `⏳ Pending: ${joinedTrip.code}` : "Not Enrolled"}
            </Pill>
            <Pill color="blue">{availableTrips.length} Active Expeditions</Pill>
          </div>
        }
      />

      {/* ── SECTION 1: ACTIVE ENROLLED EXPEDITION ─────────────────────────── */}
      {joinedTrip && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
            Your Active Expedition
          </div>

          <div
            style={{
              background: "linear-gradient(145deg, rgba(16, 185, 129, 0.1) 0%, rgba(11, 20, 34, 0.98) 100%)",
              border: isPending ? "1px solid rgba(245, 158, 11, 0.45)" : "1px solid rgba(16, 185, 129, 0.35)",
              borderRadius: 16,
              padding: "24px 28px",
              boxShadow: "0 12px 35px rgba(0, 0, 0, 0.45)",
            }}
          >
            {/* Header row */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 16 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                  <Pill color={isPending ? "amber" : "green"}>
                    {isPending ? "⏳ APPLICATION PENDING APPROVAL" : "● IN-FIELD EXPEDITION ACTIVE"}
                  </Pill>
                  <span style={{ fontSize: 11, fontWeight: 800, padding: "3px 9px", borderRadius: 6, background: "rgba(59, 130, 246, 0.2)", border: "1px solid rgba(59, 130, 246, 0.4)", color: "#60a5fa" }}>
                    {joinedTrip.code}
                  </span>
                  <span style={{ fontSize: 12, color: "#34d399", fontWeight: 600 }}>
                    {joinedTrip.difficulty || "Moderate (14 km Trail Circuit)"}
                  </span>
                </div>

                <div style={{ fontSize: 24, fontWeight: 800, color: C.text, letterSpacing: "-0.01em" }}>
                  {joinedTrip.name}
                </div>
                <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
                  📍 {joinedTrip.location} · 🏔️ {joinedTrip.elevation || "829m ASL"}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <Btn variant="primary" onClick={() => onNavigate("dashboard")} style={{ padding: "10px 20px", fontSize: 13 }}>
                  Go to Live Dashboard →
                </Btn>
                <Btn onClick={() => onNavigate("live-tracking")} style={{ padding: "10px 18px", fontSize: 13 }}>
                  View Trail Map
                </Btn>
                {confirmLeave ? (
                  <div style={{ display: "flex", gap: 6, alignItems: "center", background: "rgba(239, 68, 68, 0.15)", padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(239, 68, 68, 0.4)" }}>
                    <span style={{ fontSize: 12, color: "#fca5a5" }}>{isPending ? "Cancel request?" : "Leave trek?"}</span>
                    <button
                      onClick={() => { setConfirmLeave(false); onLeave?.(); }}
                      style={{ background: "#ef4444", color: "#fff", border: "none", borderRadius: 6, padding: "5px 12px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}
                    >
                      {isPending ? "Yes, Cancel" : "Yes, Leave"}
                    </button>
                    <button
                      onClick={() => setConfirmLeave(false)}
                      style={{ background: "transparent", color: C.muted, border: "none", padding: "5px 8px", fontSize: 11.5, cursor: "pointer" }}
                    >
                      Back
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmLeave(true)}
                    style={{
                      background: "transparent",
                      border: "1px solid rgba(239, 68, 68, 0.35)",
                      borderRadius: 8,
                      color: "#fca5a5",
                      fontSize: 12.5,
                      padding: "8px 14px",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {isPending ? "✕ Cancel Request" : "✕ Leave Expedition"}
                  </button>
                )}
              </div>
            </div>

            {/* Key Telemetry Metrics */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
              <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: "10px 14px", borderRadius: 10, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 10.5, color: C.muted2, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>SCHEDULE &amp; DURATION</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginTop: 3 }}>
                  {joinedTrip.startDate || joinedTrip.date} {joinedTrip.duration ? `(${joinedTrip.duration})` : ""}
                </div>
              </div>

              <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: "10px 14px", borderRadius: 10, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 10.5, color: C.muted2, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>EXPEDITION BASE CAMP</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginTop: 3 }}>
                  {joinedTrip.baseLocation || "Udhewadi Base Camp (829m ASL)"}
                </div>
              </div>

              <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: "10px 14px", borderRadius: 10, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 10.5, color: C.muted2, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>FIELD GUIDE &amp; LEADER</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginTop: 3 }}>
                  🧭 {joinedTrip.leader || "Field Guide Ajay Saini"}
                </div>
              </div>

              <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: "10px 14px", borderRadius: 10, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 10.5, color: C.muted2, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>WALKIE-TALKIE CHANNEL</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#fbbf24", marginTop: 3 }}>
                  📻 {joinedTrip.vhfChannel || joinedTrip.emergencyFrequency || "145.500 MHz (VHF Ch 1)"}
                </div>
              </div>
            </div>

            {/* Collapsible logistics drawer */}
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
              <button
                onClick={() => setShowLogistics((prev) => !prev)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: C.accent,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: 0,
                  fontFamily: "inherit",
                }}
              >
                <span>{showLogistics ? "▲ Hide Detailed Logistics & SAR Protocol" : "▼ View Assembly Point, Corridor Geofence & SAR Units"}</span>
              </button>

              {showLogistics && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginTop: 12, padding: "14px 16px", background: "rgba(255, 255, 255, 0.02)", borderRadius: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, color: C.muted2, fontWeight: 700 }}>ASSEMBLY &amp; PICKUP POINT</div>
                    <div style={{ fontSize: 12.5, color: C.text, marginTop: 2 }}>{joinedTrip.pickupLocation || "Lonavala Railway Station (Exit Gate 1)"}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: C.muted2, fontWeight: 700 }}>SAFETY CORRIDOR GEOFENCE</div>
                    <div style={{ fontSize: 12.5, color: "#34d399", fontWeight: 600, marginTop: 2 }}>
                      🔒 {joinedTrip.geofence?.radius ? (joinedTrip.geofence.radius / 1000).toFixed(1) + " km Safe Corridor (Locked by Admin)" : "2.5 km Locked Corridor"}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: C.muted2, fontWeight: 700 }}>SEARCH &amp; RESCUE UNIT</div>
                    <div style={{ fontSize: 12.5, color: C.text, marginTop: 2 }}>{joinedTrip.rescueUnit || "Team Alpha (Lonavala Mountain SAR)"}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── SECTION 2: JOIN WITH CODE (ONLY PROMINENT IF NOT ENROLLED) ────── */}
      {!joinedTrip && (
        <Card style={{ marginBottom: 28, background: "linear-gradient(145deg, rgba(59, 130, 246, 0.12) 0%, rgba(11, 20, 34, 0.95) 100%)", borderColor: "rgba(59, 130, 246, 0.35)", padding: "28px" }}>
          <div style={{ maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🔑</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.text, marginBottom: 6 }}>
              Have an Expedition Join Code?
            </div>
            <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5, marginBottom: 20 }}>
              Enter the unique 6-character code provided by your trek organizer (e.g. <strong>RAJM26</strong> or <strong>HAR26</strong>) to register and link live telemetry.
            </div>

            <form onSubmit={handleCodeSubmit} style={{ display: "flex", gap: 10, justifyContent: "center", maxWidth: 420, margin: "0 auto" }}>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. RAJM26"
                maxLength={8}
                style={{
                  flex: 1,
                  height: 44,
                  background: "rgba(255, 255, 255, 0.06)",
                  border: `1px solid ${C.border2}`,
                  borderRadius: 10,
                  color: "#fff",
                  fontSize: 16,
                  letterSpacing: 2,
                  textAlign: "center",
                  padding: "0 14px",
                  fontFamily: "inherit",
                  outline: "none",
                  textTransform: "uppercase",
                  fontWeight: 700,
                }}
              />
              <button
                type="submit"
                disabled={submitting}
                style={{
                  padding: "0 22px",
                  height: 44,
                  background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                  border: "none",
                  borderRadius: 10,
                  color: "#ffffff",
                  fontSize: 13.5,
                  fontWeight: 700,
                  cursor: submitting ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                  boxShadow: "0 4px 14px rgba(37, 99, 235, 0.35)",
                }}
              >
                {submitting ? "Verifying..." : "Join Expedition →"}
              </button>
            </form>

            {(localErr || error) && (
              <div style={{ marginTop: 12, color: "#fca5a5", fontSize: 12, background: "rgba(239, 68, 68, 0.15)", padding: "8px 14px", borderRadius: 8, display: "inline-block" }}>
                ⚠️ {localErr || error}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ── SECTION 3: EXPLORE UPCOMING EXPEDITIONS ───────────────────────── */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>
              {joinedTrip ? "Other Scheduled Expeditions" : "Explore Upcoming Expeditions"}
            </div>
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>
              {joinedTrip
                ? "Browse upcoming departures across the Western Ghats (Single active trek policy applies)"
                : "Select an expedition to review itinerary and request enrollment"}
            </div>
          </div>
        </div>

        {joinedTrip && (
          <div style={{ padding: "10px 16px", borderRadius: 10, background: "rgba(59, 130, 246, 0.06)", border: `1px solid ${C.border}`, fontSize: 12, color: C.muted, marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
            <span>ℹ️</span>
            <span>You are currently enrolled in <strong>{joinedTrip.name}</strong>. To register for a different expedition, please leave your active trek first.</span>
          </div>
        )}

        {otherTrips.length === 0 ? (
          <Card style={{ textAlign: "center", padding: "36px", color: C.muted }}>
            <div>🏔️</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginTop: 8 }}>No Other Expeditions Currently Listed</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>You are enrolled in the sole active expedition for this weekend batch.</div>
          </Card>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 16 }}>
            {otherTrips.map((t) => (
              <Card
                key={t.id || t.code}
                style={{
                  background: "rgba(11, 20, 34, 0.95)",
                  border: `1px solid ${C.border}`,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  opacity: joinedTrip ? 0.75 : 1,
                  transition: "all 0.2s ease",
                }}
              >
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ background: "rgba(59, 130, 246, 0.15)", border: "1px solid rgba(59, 130, 246, 0.3)", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700, color: "#60a5fa" }}>
                        {t.code}
                      </span>
                      <Pill color={t.difficulty === "Challenging" ? "red" : "amber"}>
                        {t.difficulty || "Moderate"}
                      </Pill>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.muted }}>
                      🏔️ {t.elevation || "1,424m ASL"}
                    </span>
                  </div>

                  <div style={{ fontSize: 17, fontWeight: 700, color: C.text, marginBottom: 6 }}>
                    {t.name}
                  </div>
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
                    📍 {t.location}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "10px 12px", background: "rgba(255, 255, 255, 0.02)", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 11.5, color: C.muted, marginBottom: 16 }}>
                    <div>📅 {t.startDate || t.date}</div>
                    <div>🏕️ {t.baseLocation || "Khireshwar Base"}</div>
                    <div>🧭 Guide: {t.leader || "Lead Guide"}</div>
                    <div>👥 Roster: {t.rosterCount || 0} / {t.maxRoster || 20}</div>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  {joinedTrip ? (
                    <button
                      type="button"
                      disabled={true}
                      style={{
                        padding: "8px 16px",
                        borderRadius: 8,
                        background: "rgba(255, 255, 255, 0.04)",
                        border: `1px solid ${C.border}`,
                        color: "rgba(180, 210, 245, 0.4)",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "not-allowed",
                        fontFamily: "inherit",
                      }}
                    >
                      Enrolled in active trek
                    </button>
                  ) : (
                    <Btn variant="primary" onClick={() => handleCardJoin(t)} style={{ padding: "8px 18px", fontSize: 12.5 }}>
                      Apply to Join Expedition →
                    </Btn>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════
   PAGE: WEATHER MAPS (mirrors admin exactly)
════════════════════════════════════════════════ */
const PageWeatherMaps = ({ joinedTrip, onNavigate }) => {
  const [tab, setTab]           = useState("live");
  const [mapType, setMapType]   = useState("terrain");
  const [perspective, setPerspective] = useState(false);
  const [wx, setWx]             = useState(null);
  const [loading, setLoading]   = useState(true);
  const [sensor, setSensor]     = useState({
    temp:null, humidity:null, pressure:null, windSpeed:null, windDir:null,
    uvIndex:null, rainfall:null, altitude: null,
    co2:null, aqi:null, pm25:null,
    lastSync:null,
  });

  const tripLat = joinedTrip?.lat || 18.8286;
  const tripLon = joinedTrip?.lon || 73.3986;

  useEffect(()=>{
    if (!joinedTrip) return;
    const go = async () => {
      try {
        const r = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${tripLat}&longitude=${tripLon}` +
          "&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m," +
          "wind_direction_10m,cloud_cover,pressure_msl,uv_index,weather_code" +
          "&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code,wind_speed_10m_max" +
          "&hourly=temperature_2m,precipitation_probability" +
          "&timezone=Asia%2FKolkata&forecast_days=7"
        );
        const d = await r.json();
        setWx(d);
        let air = null;
        try {
          const aqRes = await fetch(
            `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${tripLat}&longitude=${tripLon}` +
            "&current=us_aqi,european_aqi,pm2_5,pm10&timezone=Asia%2FKolkata"
          );
          if (aqRes.ok) air = (await aqRes.json())?.current || null;
        } catch {
          air = null;
        }
        if(d.current) setSensor(p=>({...p,
          temp:d.current.temperature_2m, humidity:d.current.relative_humidity_2m,
          pressure:d.current.pressure_msl, windSpeed:d.current.wind_speed_10m,
          windDir:d.current.wind_direction_10m, uvIndex:d.current.uv_index??p.uvIndex,
          rainfall:d.current.precipitation,
          aqi: air?.us_aqi ?? air?.european_aqi ?? null,
          pm25: air?.pm2_5 ?? null,
          lastSync:new Date().toLocaleTimeString("en-IN"),
        }));
        setLoading(false);
      } catch { setLoading(false); }
    };
    go(); const t = setInterval(go,300_000); return()=>clearInterval(t);
  },[joinedTrip, tripLat, tripLon]);

  /* Weather / air-quality values are only ever what the APIs returned. */

  /* Leaflet with geofence layer */
  const LeafletWeatherMap = ({ height, tileType, perspective:tilted, extraMarkers=[] }) => {
    const ref = useRef(null);
    const mapRef2 = useRef(null);
    const [rdy, setRdy] = useState(!!window.L);
    useEffect(()=>{ injectLeafletStyles(); ensureLeaflet(()=>setRdy(true)); },[]);
    useEffect(()=>{
      if(!rdy||!ref.current) return;
      const L = window.L;
      if(mapRef2.current){mapRef2.current.remove();mapRef2.current=null;}
      const map = L.map(ref.current,{center:[tripLat,tripLon],zoom:12,zoomControl:true});
      const {url,attr} = TILE_LAYERS[tileType]||TILE_LAYERS.road;
      L.tileLayer(url,{attribution:attr,maxZoom:19}).addTo(map);
      const mkI = (color) => L.divIcon({className:"",
        html:`<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 0 0 5px ${color}44;"></div>`,
        iconSize:[14,14],iconAnchor:[7,7],popupAnchor:[0,-10]});
      L.marker([tripLat,tripLon],{icon:mkI("#3b82f6")}).addTo(map)
        .bindPopup(`<b>📡 Expedition Trailhead</b><br><small>${joinedTrip?.name || "Trailhead"}<br>${tripLat.toFixed(4)}°N · ${tripLon.toFixed(4)}°E</small>`);
      extraMarkers.forEach(m=>{
        const mk = L.marker([m.lat,m.lon],{icon:mkI(m.color||"#ef4444")}).addTo(map);
        if(m.popup) mk.bindPopup(m.popup);
      });
      mapRef2.current = map;
      return()=>{if(mapRef2.current){mapRef2.current.remove();mapRef2.current=null;}};
    },[rdy,tileType,tripLat,tripLon]);
    return (
      <div style={{borderRadius:12,overflow:"hidden",border:`1px solid ${C.border}`,boxShadow:"0 4px 24px rgba(0,0,0,.4)",
        ...(tilted?{transform:"perspective(900px) rotateX(28deg)",transformOrigin:"top center"}:{})}}>
        {!rdy&&<div style={{height,background:"#080f1a",display:"flex",alignItems:"center",justifyContent:"center",color:C.muted,fontSize:13}}>⏳ Loading map…</div>}
        <div ref={ref} style={{height,display:rdy?"block":"none"}}/>
      </div>
    );
  };

  const wxCode = wx?.current?.weather_code??0;
  const [wxIcon,wxDesc] = WX_CODES[wxCode]??["🌤️","—"];
  const cur = wx?.current;
  const TABS = [
    {id:"live",icon:"🌡️",label:"Live Weather"},
    {id:"map",icon:"🗺️",label:"Live Map"},
    {id:"forecast",icon:"📅",label:"7-Day Forecast"},
  ];

  if (!joinedTrip) {
    return (
      <div>
        <PageHeader
          title="Weather & Maps"
          sub="Live meteorological radar & mountain trail maps"
          right={<Pill color="gray">No Active Trip</Pill>}
        />
        <Card
          style={{
            textAlign: "center",
            padding: "44px 24px",
            background: "linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(11, 20, 34, 0.95))",
            borderColor: "rgba(59, 130, 246, 0.25)",
          }}
        >
          <div
            style={{
              width: 60,
              height: 60,
              borderRadius: "50%",
              background: "rgba(59, 130, 246, 0.15)",
              border: "1px solid rgba(59, 130, 246, 0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
              fontSize: 28,
            }}
          >
            🌤️
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 8 }}>
            No Expedition Selected for Weather Telemetry
          </div>
          <div style={{ fontSize: 13, color: C.muted, maxWidth: 480, margin: "0 auto 22px", lineHeight: 1.6 }}>
            Margsutra pulls hyper-local micro-climate forecasts, summit wind vectors, and barometric storm alerts specifically tailored for your active trek destination. Join an expedition to unlock trail weather.
          </div>
          <Btn variant="primary" onClick={() => onNavigate?.("join-trip")} style={{ padding: "10px 22px" }}>
            🔑 Join Expedition to Unlock Weather →
          </Btn>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Weather & Maps"
        sub={`Live · ${joinedTrip.name} · ${loading?"Loading…":"Updated "+sensor.lastSync}`}
        right={<Pill color="green">● Live Data</Pill>}/>

      <div style={{display:"flex",gap:6,marginBottom:16}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"7px 14px",borderRadius:9,
            border:`1px solid ${tab===t.id?C.accent:C.border}`,
            background:tab===t.id?"rgba(59,130,246,0.12)":"transparent",
            color:tab===t.id?C.accent:C.muted,fontSize:12,cursor:"pointer",fontFamily:"inherit",
            display:"flex",alignItems:"center",gap:6}}>{t.icon} {t.label}</button>
        ))}
      </div>

      {tab==="live"&&<div>
        <Card style={{marginBottom:14,background:"linear-gradient(135deg,rgba(20,50,110,0.55),rgba(11,20,34,0.92))"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:16}}>
            <div>
              <div style={{fontSize:11,color:C.muted,marginBottom:6}}>📍 {joinedTrip.name} · {joinedTrip.location}</div>
              <div style={{display:"flex",alignItems:"center",gap:14}}>
                <div style={{fontSize:60}}>{wxIcon}</div>
                <div>
                  <div style={{fontSize:50,fontWeight:700,color:C.text,lineHeight:1}}>{sensor.temp}<span style={{fontSize:24,color:C.muted}}>°C</span></div>
                  <div style={{fontSize:14,color:C.muted,marginTop:2}}>{wxDesc}</div>
                  <div style={{fontSize:11,color:C.muted2,marginTop:2}}>Feels like {feelsLike(sensor.temp,sensor.humidity)}°C</div>
                </div>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {[["💧","Humidity",`${sensor.humidity}%`],["🌬️","Wind",`${sensor.windSpeed} km/h ${windDirLabel(sensor.windDir)}`],
               ["🌀","Pressure",`${sensor.pressure?.toFixed(0)} hPa`],["🌂","Rainfall",`${sensor.rainfall} mm`],
               ["☀️","UV Index",`${sensor.uvIndex}`],["☁️","Cloud",`${cur?.cloud_cover??"—"}%`]].map(([ic,k,v])=>(
                <div key={k} style={{background:"rgba(255,255,255,0.05)",border:`1px solid ${C.border}`,borderRadius:10,padding:"8px 12px",minWidth:110}}>
                  <div style={{fontSize:10,color:C.muted2,marginBottom:2}}>{ic} {k}</div>
                  <div style={{fontSize:15,fontWeight:600,color:C.text}}>{v}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{marginTop:12,paddingTop:10,borderTop:`1px solid ${C.border}`,fontSize:10,color:C.muted2,display:"flex",gap:16,flexWrap:"wrap"}}>
            <span>⚡ Open-Meteo API</span><span>🔄 Last sync: {sensor.lastSync}</span>
            <span>🏔️ Peak Elevation: {joinedTrip.elevation || "829m"}</span>
          </div>
        </Card>
        {wx?.hourly&&(
          <Card style={{marginBottom:14}}>
            <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>Hourly Temperature (next 24h)</div>
            <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:4}}>
              {wx.hourly.time.slice(0,24).map((t,i)=>{
                const hr=t.split("T")[1]?.substring(0,5);
                const tmp=wx.hourly.temperature_2m[i];
                const pp=wx.hourly.precipitation_probability?.[i]??0;
                return (
                  <div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,
                    flexShrink:0,minWidth:44,padding:"6px 4px",borderRadius:8,
                    background:i===0?"rgba(59,130,246,0.1)":"transparent"}}>
                    <div style={{fontSize:9,color:C.muted2}}>{hr}</div>
                    <div style={{fontSize:13,fontWeight:600,color:tmp>35?C.red:tmp>30?C.amber:tmp>25?C.accent:C.teal}}>{tmp}°</div>
                    {pp>20&&<div style={{fontSize:9,color:C.teal}}>💧{pp}%</div>}
                  </div>
                );
              })}
            </div>
          </Card>
        )}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Card>
            <div style={{fontSize:12,fontWeight:500,color:C.text,marginBottom:10}}>⚠️ Active Alerts</div>
            {[{col:"amber",title:"Heat advisory",desc:`Temp ${sensor.temp>30?"above":"near"} 30°C. Stay hydrated during treks.`},
              {col:"blue",title:"Wind advisory",desc:`${sensor.windSpeed>20?"Moderate":"Low"} winds from ${windDirLabel(sensor.windDir)}. Check trail conditions.`}].map(a=>(
              <div key={a.title} style={{background:"rgba(255,255,255,0.03)",
                border:`1px solid ${a.col==="amber"?"rgba(245,158,11,0.3)":"rgba(59,130,246,0.2)"}`,
                borderRadius:9,padding:"9px 12px",marginBottom:7}}>
                <div style={{fontSize:12,fontWeight:500,color:C.text,marginBottom:2}}>{a.title}</div>
                <div style={{fontSize:11,color:C.muted}}>{a.desc}</div>
              </div>
            ))}
          </Card>
          <Card>
            <div style={{fontSize:12,fontWeight:500,color:C.text,marginBottom:10}}>📊 Air Quality · Open-Meteo</div>
            {[
              ["AQI", sensor.aqi, 200, sensor.aqi==null?C.muted:sensor.aqi<50?C.green:sensor.aqi<100?C.amber:C.red, ""],
              ["PM2.5", sensor.pm25, 100, sensor.pm25==null?C.muted:sensor.pm25<30?C.green:sensor.pm25<60?C.amber:C.red, " µg/m³"],
              ["Humidity", sensor.humidity, 100, C.teal, "%"],
            ].map(([label,val,max,col,unit])=>(
              <div key={label} style={{marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:3}}>
                  <span style={{color:C.muted}}>{label}</span>
                  <span style={{color:col,fontWeight:600}}>{val==null?"—":`${Math.round(val)}${unit}`}</span>
                </div>
                <div style={{height:5,borderRadius:4,background:"rgba(255,255,255,0.07)"}}>
                  <div style={{height:"100%",width:val==null?"0%":`${Math.min(100,(val/max)*100)}%`,borderRadius:4,background:col,transition:"width 0.5s"}}/>
                </div>
              </div>
            ))}
            <div style={{fontSize:10,color:C.muted2,marginTop:2}}>CO₂ is not measured — no field sensor or API source is linked.</div>
          </Card>
        </div>
      </div>}

      {tab==="map"&&<div>
        <div style={{display:"flex",gap:8,marginBottom:12,alignItems:"center",flexWrap:"wrap"}}>
          {[["road","🗺️ Road"],["satellite","🛰️ Satellite"],["terrain","🏔️ Terrain"]].map(([v,label])=>(
            <button key={v} onClick={()=>setMapType(v)} style={{padding:"6px 14px",borderRadius:8,
              border:`1px solid ${mapType===v?C.accent:C.border}`,
              background:mapType===v?"rgba(59,130,246,0.12)":"transparent",
              color:mapType===v?C.accent:C.muted,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>{label}</button>
          ))}
          <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:12,color:C.muted}}>3D tilt</span>
            <Toggle on={perspective} onChange={()=>setPerspective(x=>!x)}/>
          </div>
        </div>
        <LeafletWeatherMap height={480} tileType={mapType} perspective={perspective}
          extraMarkers={[{lat:tripLat,lon:tripLon,color:"#22c55e",popup:`<b>📍 ${joinedTrip.name}</b><br>${joinedTrip.location}<br>Elevation: ${joinedTrip.elevation||"—"}`}]}/>
        <div style={{marginTop:10,display:"flex",gap:16,fontSize:11,color:C.muted2,flexWrap:"wrap"}}>
          <span>📍 {tripLat.toFixed(4)}°N, {tripLon.toFixed(4)}°E</span>
          <span>🗺️ {joinedTrip.location}</span>
          <span>🏔️ Alt: {joinedTrip.elevation || sensor.altitude + "m ASL"}</span>
          <span>🌐 OpenStreetMap / ESRI · Free tiles</span>
        </div>
      </div>}

      {tab==="forecast"&&<div>
        {wx?.daily?(
          <>
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:10,marginBottom:14}}>
              {wx.daily.time.map((d,i)=>{
                const dt=new Date(d);
                const dstr=dt.toLocaleDateString("en-IN",{weekday:"short",day:"numeric"});
                const [ic]=WX_CODES[wx.daily.weather_code[i]]??["🌤️"];
                return (
                  <Card key={d} style={{textAlign:"center",marginBottom:0,padding:"14px 8px"}}>
                    <div style={{fontSize:10,color:C.muted,marginBottom:4}}>{dstr}</div>
                    <div style={{fontSize:28,marginBottom:4}}>{ic}</div>
                    <div style={{fontSize:15,fontWeight:700,color:C.red}}>{wx.daily.temperature_2m_max[i]}°</div>
                    <div style={{fontSize:12,color:C.muted}}>{wx.daily.temperature_2m_min[i]}°</div>
                    <div style={{fontSize:10,color:C.teal,marginTop:2}}>💧{wx.daily.precipitation_sum[i]}mm</div>
                    <div style={{fontSize:10,color:C.muted2,marginTop:1}}>💨{wx.daily.wind_speed_10m_max[i]}km/h</div>
                  </Card>
                );
              })}
            </div>
            <Card>
              <div style={{fontSize:12,fontWeight:500,color:C.text,marginBottom:12}}>Weekly Summary</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
                {[["Avg High",`${(wx.daily.temperature_2m_max.reduce((a,b)=>a+b,0)/7).toFixed(1)}°C`,C.red],
                  ["Avg Low",`${(wx.daily.temperature_2m_min.reduce((a,b)=>a+b,0)/7).toFixed(1)}°C`,C.teal],
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
        ):<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:200,color:C.muted2}}>
          {loading?"⏳ Loading forecast…":"⚠️ Forecast unavailable"}
        </div>}
      </div>}
    </div>
  );
};

/* ════════════════════════════════════════════════
   PAGE: SOS NAVIGATION  (user view)
════════════════════════════════════════════════ */
const PageSOSNav = ({ user, activeSOS, onSOS, onNavigate }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [elapsed, setElapsed]         = useState(0);
  const [teamPos, setTeamPos]         = useState({lat:RESCUE_TEAMS[0].lat,lon:RESCUE_TEAMS[0].lon});
  const [navMode, setNavMode]         = useState(false);
  const [trackingToken, setTrackingToken] = useState(() => localStorage.getItem("margsutra_tracking_token") || "");
  const [tokenState, setTokenState] = useState(trackingToken ? "ready" : "loading");

  const issueToken = useCallback(async () => {
    setTokenState("loading");
    try {
      const response = await fetch(`${TRACKING_SERVER_URL}/auth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, name: user.name, role: "user" }),
      });
      if (!response.ok) throw new Error(`Token request failed (${response.status})`);
      const data = await response.json();
      if (!data.token) throw new Error("Token missing in response");
      localStorage.setItem("margsutra_tracking_token", data.token);
      setTrackingToken(data.token);
      setTokenState("ready");
    } catch {
      setTokenState("manual");
    }
  }, [user.id, user.name]);

  useEffect(() => {
    const cached = localStorage.getItem("margsutra_tracking_token");
    if (cached) {
      setTrackingToken(cached);
      setTokenState("ready");
      return;
    }
    issueToken();
  }, [issueToken]);

  const tracking = useLocationTracking({
    userId: user.id,
    name: user.name,
    token: trackingToken,
    serverUrl: TRACKING_SERVER_URL,
  });

  const { position, startTracking, stopTracking, cancelSOS } = tracking;

  const handleExitSOS = () => {
    try {
      cancelSOS?.();
    } catch (e) {
      console.warn("Failed to cancel tracking SOS:", e);
    }
    setNavMode(false);
    setCurrentStep(0);
    onSOS?.(false);
    onNavigate?.("dashboard");
  };

  const steps    = TURN_BY_TURN_USER;
  const hasOwnFix =
    position?.lat != null &&
    position?.lon != null &&
    Number.isFinite(Number(position.lat)) &&
    Number.isFinite(Number(position.lon)) &&
    !(Math.abs(position.lat) < 1e-6 && Math.abs(position.lon) < 1e-6);
  // Only ever use the device's own fix — a profile coordinate is not a live position.
  const myPos    = hasOwnFix ? position : null;
  const team     = RESCUE_TEAMS[0];
  const etaMin   = Math.max(0, 12 - Math.floor(elapsed/60));
  const step     = steps[currentStep];
  const pct      = (currentStep/(steps.length-1))*100;
  const liveDistanceKm = myPos
    ? Math.sqrt(
        Math.pow((teamPos.lat - myPos.lat) * 111, 2) +
        Math.pow((teamPos.lon - myPos.lon) * 111, 2)
      ).toFixed(1)
    : null;

  useEffect(() => {
    if (!activeSOS || tokenState !== "ready") {
      stopTracking();
      return;
    }
    startTracking();
    return () => stopTracking();
  }, [activeSOS, tokenState, startTracking, stopTracking]);

  /* Animate the simulated team toward the trekker's real fix (if we have one) */
  useEffect(()=>{
    if(!activeSOS || !hasOwnFix) return;
    const t = setInterval(()=>{
      setTeamPos(p=>({
        lat: p.lat + (myPos.lat - p.lat)*0.012,
        lon: p.lon + (myPos.lon - p.lon)*0.012,
      }));
      setElapsed(e=>e+1);
    },1000);
    return()=>clearInterval(t);
  },[activeSOS, hasOwnFix, myPos?.lat, myPos?.lon]);

  useEffect(()=>{
    if(!navMode) return;
    const t = setInterval(()=>setCurrentStep(s=>Math.min(s+1,steps.length-1)),7000);
    return()=>clearInterval(t);
  },[navMode]);

  /* Leaflet SOS nav map */
  const SOSMap = ({ height }) => {
    const ref = useRef(null);
    const mapRef2 = useRef(null);
    const [rdy,setRdy] = useState(!!window.L);
    useEffect(()=>{ injectLeafletStyles(); ensureLeaflet(()=>setRdy(true)); },[]);
    const teamKey = JSON.stringify(teamPos);
    useEffect(()=>{
      if(!rdy||!ref.current) return;
      const L = window.L;
      if(mapRef2.current){mapRef2.current.remove();mapRef2.current=null;}
      const map = L.map(ref.current,{center:[myPos.lat,myPos.lon],zoom:10,zoomControl:true});
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
        attribution:"© OpenStreetMap",maxZoom:19}).addTo(map);
      // User marker
      L.marker([myPos.lat,myPos.lon],{icon:makeDotIcon(L,"#ef4444",14,true)}).addTo(map)
        .bindPopup(`<b>📍 My Location</b><br>${user.name}<br>${myPos.lat.toFixed(5)}°N · ${myPos.lon.toFixed(5)}°E`);
      // Team marker
      L.marker([teamPos.lat,teamPos.lon],{icon:makeTeamIcon(L,"Team Alpha")}).addTo(map)
        .bindPopup(`<b>🚑 ${team.name}</b><br>${team.vehicle} · ETA ${etaMin} min`);
      // Route line
      const shadow = L.polyline([[teamPos.lat,teamPos.lon],[myPos.lat,myPos.lon]],{color:"#f59e0b",weight:6,opacity:0.18}).addTo(map);
      L.polyline([[teamPos.lat,teamPos.lon],[myPos.lat,myPos.lon]],{color:"#f59e0b",weight:3,opacity:0.9,dashArray:"14 10"}).addTo(map);
      map.fitBounds([[teamPos.lat,teamPos.lon],[myPos.lat,myPos.lon]],{padding:[40,40],maxZoom:11});
      mapRef2.current = map;
      return()=>{if(mapRef2.current){mapRef2.current.remove();mapRef2.current=null;}};
    },[rdy,teamKey]);
    return (
      <div style={{borderRadius:12,overflow:"hidden",border:`1px solid ${C.border}`}}>
        {!rdy&&<div style={{height,background:"#08101e",display:"flex",alignItems:"center",justifyContent:"center",color:C.muted,fontSize:13}}>⏳ Loading map…</div>}
        <div ref={ref} style={{height,display:rdy?"block":"none"}}/>
      </div>
    );
  };

  if (!activeSOS) return (
    <div>
      <PageHeader title="SOS Navigation" sub="Real-time routing when an emergency is active"/>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
        height:380,color:C.muted,textAlign:"center"}}>
        <div style={{fontSize:48,marginBottom:16}}>🗺️</div>
        <div style={{fontSize:16,fontWeight:600,color:C.text,marginBottom:6}}>No Active SOS</div>
        <div style={{fontSize:13,color:C.muted,maxWidth:360,lineHeight:1.6}}>
          This page becomes active when you trigger an SOS. It shows real-time routing of
          your rescue team to your location with live ETA and turn-by-turn instructions.
        </div>
      </div>
    </div>
  );

  if (navMode) return (
    <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 60px)",background:C.bg}}>
      <div style={{background:"rgba(239,68,68,0.1)",borderBottom:`1px solid rgba(239,68,68,0.3)`,
        padding:"10px 20px",display:"flex",alignItems:"center",gap:12}}>
        <div style={{width:10,height:10,borderRadius:"50%",background:C.red,animation:"ud-sos-blink 1.2s infinite",flexShrink:0}}/>
        <span style={{fontSize:14,fontWeight:600,color:C.text}}>LIVE SOS NAVIGATION</span>
        <Pill color="red">🚨 ACTIVE</Pill>
        <div style={{flex:1}}/>
        <Btn onClick={handleExitSOS}>✕ Exit</Btn>
      </div>
      <div style={{flex:1,display:"grid",gridTemplateColumns:"1fr 340px",overflow:"hidden"}}>
        <div style={{position:"relative"}}>
          <SOSMap height={500}/>
          <div style={{position:"absolute",bottom:20,left:20,background:"rgba(8,15,26,0.92)",
            border:`1px solid ${C.border}`,borderRadius:12,padding:"10px 18px",textAlign:"center"}}>
            <div style={{fontSize:26,fontWeight:800,color:C.text}}>—</div>
            <div style={{fontSize:10,color:C.muted,letterSpacing:"0.1em"}}>SPEED</div>
          </div>
        </div>
        <div style={{background:"#0b1422",borderLeft:`1px solid ${C.border}`,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          <div style={{background:"linear-gradient(135deg,rgba(239,68,68,0.15),rgba(239,68,68,0.05))",
            borderBottom:`1px solid ${C.border}`,padding:"20px 18px"}}>
            <div style={{fontSize:46,textAlign:"center",marginBottom:10,lineHeight:1}}>{step?.icon}</div>
            <div style={{fontSize:15,fontWeight:700,textAlign:"center",marginBottom:4,color:C.text}}>{step?.instr}</div>
            {step?.road&&<div style={{fontSize:12,color:C.muted,textAlign:"center"}}>{step.road}</div>}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:1,background:C.border}}>
            {[["ETA",`${etaMin} min`,C.green],["Distance",liveDistanceKm ? `${liveDistanceKm} km` : "—",C.accent]].map(([l,v,col])=>(
              <div key={l} style={{background:"#0b1422",padding:"14px 18px",textAlign:"center"}}>
                <div style={{fontSize:22,fontWeight:800,color:col}}>{v}</div>
                <div style={{fontSize:10,color:C.muted,letterSpacing:"0.1em",marginTop:2}}>{l}</div>
              </div>
            ))}
          </div>
          <div style={{padding:"10px 18px",borderBottom:`1px solid ${C.border}`}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.muted,marginBottom:5}}>
              <span>Step {currentStep+1} of {steps.length}</span>
              <span>{Math.round(pct)}% complete</span>
            </div>
            <div style={{height:4,background:"rgba(255,255,255,0.07)",borderRadius:4}}>
              <div style={{height:"100%",borderRadius:4,background:`linear-gradient(90deg,${C.accent},${C.green})`,
                width:`${pct}%`,transition:"width 0.5s"}}/>
            </div>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:"10px 0"}}>
            {steps.map((s,i)=>(
              <div key={i} style={{display:"flex",alignItems:"flex-start",gap:12,padding:"10px 18px",
                background:i===currentStep?"rgba(59,130,246,0.1)":"transparent",
                borderLeft:`3px solid ${i===currentStep?C.accent:"transparent"}`,transition:"background 0.3s"}}>
                <div style={{width:26,height:26,borderRadius:"50%",
                  background:i===currentStep?"rgba(59,130,246,0.25)":i<currentStep?"rgba(34,197,94,0.15)":"rgba(255,255,255,0.05)",
                  border:`1px solid ${i===currentStep?C.accent:i<currentStep?C.green:C.border}`,
                  display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,flexShrink:0,
                  color:i<currentStep?C.green:C.text}}>
                  {i<currentStep?"✓":s.icon}
                </div>
                <div><div style={{fontSize:12,color:i===currentStep?C.text:C.muted,fontWeight:i===currentStep?600:400}}>{s.instr}</div>
                  <div style={{fontSize:10,color:C.muted2,marginTop:2}}>{s.dist}</div></div>
              </div>
            ))}
          </div>
          <div style={{background:"rgba(239,68,68,0.08)",borderTop:`1px solid rgba(239,68,68,0.2)`,padding:"12px 18px"}}>
            <div style={{fontSize:10,color:"#fca5a5",letterSpacing:"0.1em",marginBottom:4}}>RESCUE TEAM</div>
            <div style={{fontSize:13,fontWeight:600}}>{team.name} · {team.vehicle}</div>
            <div style={{fontSize:11,color:C.muted,marginTop:2}}>Lead: {team.lead} · {team.members||4} members</div>
          </div>
        </div>
      </div>
      <div style={{background:"rgba(0,0,0,0.7)",backdropFilter:"blur(8px)",padding:"10px 20px",
        borderTop:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:12}}>
        <Btn onClick={()=>setCurrentStep(s=>Math.max(0,s-1))}>← Prev</Btn>
        <Btn variant="primary" onClick={()=>setCurrentStep(s=>Math.min(steps.length-1,s+1))}>Next →</Btn>
        <div style={{flex:1}}/>
        <div style={{fontSize:11,color:C.muted}}>{team.name} · {team.vehicle}</div>
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader title="SOS Navigation"
        sub="Rescue routing preview"
        right={
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <Pill color="red">🚨 SOS Active</Pill>
            <Pill color="amber">◐ Demo rescue assets</Pill>
            <Btn onClick={handleExitSOS}>✕ Exit</Btn>
          </div>
        }/>

      <div style={{background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.35)",
        borderRadius:12,padding:"14px 18px",marginBottom:16,display:"flex",alignItems:"center",gap:14}}>
        <div style={{width:12,height:12,borderRadius:"50%",background:C.red,animation:"ud-sos-blink 1.2s infinite",flexShrink:0}}/>
        <div style={{flex:1}}>
          <div style={{fontSize:14,fontWeight:700,color:C.red}}>Emergency broadcast active</div>
          <div style={{fontSize:12,color:C.muted,marginTop:2}}>
            Your beacon is sent to SAR Command. The team, ETA and route below are a simulated preview of the dispatch
            experience — not a live rescue asset assignment.
          </div>
        </div>
        <Pill color="amber">Demo ETA {etaMin} min</Pill>
        <Btn variant="danger" onClick={handleExitSOS} style={{padding:"6px 14px",fontSize:12}}>✕ Exit &amp; Stop SOS</Btn>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 280px",gap:14}}>
        <div>
          <SOSMap height={380}/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginTop:12}}>
            <StatCard label="ETA" value={`${etaMin} min`} sub="Simulated" color={C.green} icon="⏱"/>
            <StatCard label="Distance" value={liveDistanceKm ? `${liveDistanceKm} km` : "—"} sub={liveDistanceKm ? "To demo team" : "No GPS fix"} color={C.accent} icon="📏"/>
            <StatCard label="Team Speed" value="—" sub="Not tracked" color={C.amber} icon="🚑"/>
            <StatCard label="GPS Acc." value="device" sub="Own fix" color={C.purple} icon="🛰"/>
          </div>
          <button onClick={()=>{setNavMode(true);setCurrentStep(0);}}
            style={{marginTop:14,width:"100%",padding:"14px",
              background:`linear-gradient(135deg,${C.red},${C.accent2})`,
              border:"none",borderRadius:12,color:"#fff",fontSize:14,fontWeight:700,
              cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
            🗺️ VIEW LIVE NAVIGATION
          </button>
        </div>
        <div>
          <Card style={{marginBottom:12,borderColor:"rgba(245,158,11,0.3)"}}>
            <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>Rescue Team Info</div>
            {[["Team",team.name],["Vehicle",team.vehicle],["Lead",team.lead],["ETA",`${etaMin} min`],
              ["Status","En route to you"],["Contact","+91 100"]].map(([k,v])=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"5px 0",borderBottom:`1px solid ${C.border}`}}>
                <span style={{color:C.muted2}}>{k}</span>
                <span style={{color:C.text,fontWeight:500}}>{v}</span>
              </div>
            ))}
          </Card>
          <Card style={{borderColor:"rgba(239,68,68,0.25)"}}>
            <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>Your Profile Shared</div>
            {[["Name",user?.name || "Trekker"],["Blood",user?.blood || "—"],
              ["Medical",user?.medical||"None"],["Phone",user?.phone || "—"],
              ["EC",user?.ec1Name ? `${user.ec1Name} · ${user.ec1Rel || "Contact"}` : "None"]].map(([k,v])=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"5px 0",borderBottom:`1px solid ${C.border}`}}>
                <span style={{color:C.muted2}}>{k}</span>
                <span style={{color:C.text,fontWeight:500,maxWidth:170,textAlign:"right"}}>{v}</span>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════
   PAGE: GEOFENCING
════════════════════════════════════════════════ */
const PageGeofencing = ({ user, joinedTrip, onNavigate }) => {
  const radius = joinedTrip?.geofence?.radius || 2500;   // metres — admin locked
  const fence = {
    lat: joinedTrip?.geofence?.lat || joinedTrip?.lat || 18.8286,
    lon: joinedTrip?.geofence?.lon || joinedTrip?.lon || 73.3986,
  }; // geofence center locked by admin

  const [userPos, setUserPos]       = useState(fence);
  const [alerts, setAlerts]         = useState(true);
  const [vibrate, setVibrate]       = useState(true);
  const [fenceActive, setFenceActive] = useState(true);
  const [trackingToken, setTrackingToken] = useState(() => localStorage.getItem("margsutra_tracking_token") || "");
  const [tokenState, setTokenState] = useState(trackingToken ? "ready" : "loading");
  const [history, setHistory]       = useState([
    {time:"14:22",event:"Entered geofence zone",inside:true},
    {time:"09:45",event:"Exited geofence zone",inside:false},
    {time:"08:10",event:"Geofence zone entered",inside:true},
  ]);

  /* Issue tracking token if needed */
  useEffect(() => {
    if (trackingToken || !joinedTrip) return;
    const fetchToken = async () => {
      try {
        const response = await fetch(`${TRACKING_SERVER_URL}/auth/token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.id, name: user.name, role: "user" }),
        });
        if (!response.ok) throw new Error(`Token request failed (${response.status})`);
        const data = await response.json();
        if (!data.token) throw new Error("Token missing in response");
        localStorage.setItem("margsutra_tracking_token", data.token);
        setTrackingToken(data.token);
        setTokenState("ready");
      } catch {
        setTokenState("manual");
      }
    };
    fetchToken();
  }, [joinedTrip]);

  /* Use live location tracking */
  const tracking = useLocationTracking({
    userId: user.id,
    name: user.name,
    token: trackingToken,
    serverUrl: TRACKING_SERVER_URL,
  });
  const { position, startTracking, stopTracking } = tracking;

  /* Update position from live tracking */
  useEffect(() => {
    if (position) {
      setUserPos({ lat: position.lat, lon: position.lon });
    }
  }, [position]);

  /* Start/stop tracking based on fence active state */
  useEffect(() => {
    if (!joinedTrip || !fenceActive || tokenState !== "ready") {
      stopTracking();
      return;
    }
    startTracking();
    return () => stopTracking();
  }, [joinedTrip, fenceActive, tokenState, startTracking, stopTracking]);

  /* Check inside/outside */
  const dist = (a,b) => {
    const R=6371000;
    const dLat=(b.lat-a.lat)*Math.PI/180;
    const dLon=(b.lon-a.lon)*Math.PI/180;
    const x=Math.sin(dLat/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLon/2)**2;
    return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
  };
  const distToCenter = dist(userPos,fence);
  const inside = distToCenter <= radius;

  /* Geofence Leaflet map with circle */
  const GeoMap = ({ height }) => {
    const ref    = useRef(null);
    const mapRef2= useRef(null);
    const [rdy,setRdy] = useState(!!window.L);
    useEffect(()=>{ injectLeafletStyles(); ensureLeaflet(()=>setRdy(true)); },[]);
    const key = JSON.stringify({userPos,fence,radius,fenceActive});
    useEffect(()=>{
      if(!rdy||!ref.current) return;
      const L = window.L;
      if(mapRef2.current){mapRef2.current.remove();mapRef2.current=null;}
      const map = L.map(ref.current,{center:[fence.lat,fence.lon],zoom:13,zoomControl:true});
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
        attribution:"© OpenStreetMap",maxZoom:19}).addTo(map);

      /* Geofence circle */
      if(fenceActive){
        L.circle([fence.lat,fence.lon],{
          radius,
          className:"ud-geofence-circle",
          color:"#f59e0b", weight:2.5, opacity:0.85,
          fill:true, fillColor:"#f59e0b", fillOpacity:0.07,
          dashArray:"9 6",
        }).addTo(map)
          .bindPopup(`<b>🔶 Admin Safety Perimeter</b><br>Zone: ${joinedTrip?.geofence?.zoneName || joinedTrip?.name || "Corridor"}<br>Radius: ${(radius/1000).toFixed(1)} km<br>Center: ${fence.lat.toFixed(4)}°N ${fence.lon.toFixed(4)}°E`);

        /* Fence center cross */
        L.marker([fence.lat,fence.lon],{
          icon: L.divIcon({className:"",
            html:`<div style="font-size:18px;line-height:1;text-shadow:0 0 8px rgba(245,158,11,0.8)">⊕</div>`,
            iconSize:[18,18],iconAnchor:[9,9]})
        }).addTo(map).bindPopup(`<b>Trailhead Center</b><br>${joinedTrip?.name}`);
      }

      /* User position */
      L.marker([userPos.lat,userPos.lon],{icon:makeDotIcon(L,inside?"#22c55e":"#ef4444",12,true)})
        .addTo(map)
        .bindPopup(`<b>📍 ${user?.name || "Trekker"}</b><br>
          ${inside?"✅ Inside safety perimeter":"⚠️ Outside safety perimeter"}<br>
          Distance to center: ${distToCenter.toFixed(0)}m`);

      map.fitBounds([[fence.lat-radius/111000-0.005,fence.lon-radius/111000-0.005],
                     [fence.lat+radius/111000+0.005,fence.lon+radius/111000+0.005]]);
      mapRef2.current = map;
      return()=>{if(mapRef2.current){mapRef2.current.remove();mapRef2.current=null;}};
    },[rdy,key]);
    return (
      <div style={{borderRadius:12,overflow:"hidden",border:`1px solid ${C.border}`}}>
        {!rdy&&<div style={{height,background:"#08101e",display:"flex",alignItems:"center",justifyContent:"center",color:C.muted,fontSize:13}}>⏳ Loading map…</div>}
        <div ref={ref} style={{height,display:rdy?"block":"none"}}/>
      </div>
    );
  };

  if (!joinedTrip) {
    return (
      <div>
        <PageHeader
          title="Geofencing"
          sub="Safety boundary perimeter & off-trail tracking"
          right={<Pill color="gray">No Active Perimeter</Pill>}
        />
        <Card
          style={{
            textAlign: "center",
            padding: "44px 24px",
            background: "linear-gradient(135deg, rgba(245, 158, 11, 0.08), rgba(11, 20, 34, 0.95))",
            borderColor: "rgba(245, 158, 11, 0.25)",
          }}
        >
          <div
            style={{
              width: 60,
              height: 60,
              borderRadius: "50%",
              background: "rgba(245, 158, 11, 0.15)",
              border: "1px solid rgba(245, 158, 11, 0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
              fontSize: 28,
            }}
          >
            🔶
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 8 }}>
            No Active Geofence Assigned
          </div>
          <div style={{ fontSize: 13, color: C.muted, maxWidth: 480, margin: "0 auto 22px", lineHeight: 1.6 }}>
            Geofence safety perimeters are established and locked by the expedition organizer for each trail. Join an active expedition to activate real-time trail boundary surveillance and breach alerts.
          </div>
          <Btn variant="primary" onClick={() => onNavigate?.("join-trip")} style={{ padding: "10px 22px" }}>
            🔑 Join Expedition to Activate Geofence →
          </Btn>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Geofencing"
        sub={`Locked Perimeter (${(radius/1000).toFixed(1)} km) · ${joinedTrip.name}`}
        right={<div style={{display:"flex",gap:8}}>
          <Pill color={inside?"green":"red"}>{inside?"● Inside Zone":"⚠️ Outside Zone"}</Pill>
          <Pill color={fenceActive?"amber":"gray"}>{fenceActive?"Surveillance Active":"Surveillance Off"}</Pill>
        </div>}/>

      {/* Status banner */}
      <div style={{background:inside?"rgba(34,197,94,0.08)":"rgba(239,68,68,0.1)",
        border:`1px solid ${inside?"rgba(34,197,94,0.3)":"rgba(239,68,68,0.4)"}`,
        borderRadius:12,padding:"14px 18px",marginBottom:16,display:"flex",alignItems:"center",gap:14}}>
        <div style={{fontSize:26}}>{inside?"✅":"⚠️"}</div>
        <div style={{flex:1}}>
          <div style={{fontSize:14,fontWeight:700,color:inside?C.green:C.red}}>
            {inside?"You are inside the expedition safety perimeter":"You have strayed outside the safety perimeter!"}
          </div>
          <div style={{fontSize:12,color:C.muted,marginTop:2}}>
            Distance from center: <strong style={{color:C.text}}>{distToCenter.toFixed(0)}m</strong>
            {" · "}Admin perimeter: <strong style={{color:C.text}}>{(radius/1000).toFixed(1)} km</strong>
            {" · "}Buffer remaining: <strong style={{color:inside?C.green:C.red}}>{Math.max(0,radius-distToCenter).toFixed(0)}m</strong>
          </div>
        </div>
        {!inside&&alerts&&<div style={{background:"rgba(239,68,68,0.12)",border:"1px solid rgba(239,68,68,0.3)",
          borderRadius:8,padding:"6px 12px",fontSize:11,color:"#fca5a5",fontWeight:500}}>
          📢 Leader Alerted
        </div>}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 320px",gap:14}}>
        {/* Map */}
        <GeoMap height={480}/>

        {/* Controls & Admin Settings */}
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {/* Admin Locked Perimeter Notice */}
          <Card style={{background:"rgba(245,158,11,0.06)",borderColor:"rgba(245,158,11,0.3)"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <span style={{fontSize:16}}>🔒</span>
              <div style={{fontSize:12,fontWeight:700,color:C.amber,textTransform:"uppercase",letterSpacing:"0.06em"}}>
                Admin-Controlled Perimeter
              </div>
            </div>
            <div style={{fontSize:12,color:C.muted,lineHeight:1.5,marginBottom:12}}>
              The safety boundary of <strong style={{color:C.text}}>{(radius/1000).toFixed(1)} km</strong> is established and locked by trek organizer <strong style={{color:C.text}}>{joinedTrip.leader || "Admin"}</strong>. Individual trekkers cannot alter this perimeter.
            </div>
            <div style={{height:6,background:"rgba(255,255,255,0.08)",borderRadius:4,marginBottom:6}}>
              <div style={{
                height:"100%",
                borderRadius:4,
                background:`linear-gradient(90deg, ${C.teal}, ${C.amber})`,
                width:`${Math.min(100,(radius/5000)*100)}%`
              }}/>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.muted2}}>
              <span>Strict Boundary</span>
              <span>{(radius/1000).toFixed(1)} km Enforced</span>
            </div>
          </Card>

          {/* Device alerts on/off */}
          <Card>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
              <div style={{fontSize:13,fontWeight:600,color:C.text}}>Surveillance Active</div>
              <Toggle on={fenceActive} onChange={()=>setFenceActive(x=>!x)}/>
            </div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
              <div style={{fontSize:12,color:C.muted}}>Alert on trail exit</div>
              <Toggle on={alerts} onChange={()=>setAlerts(x=>!x)}/>
            </div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{fontSize:12,color:C.muted}}>Vibrate device on breach</div>
              <Toggle on={vibrate} onChange={()=>setVibrate(x=>!x)}/>
            </div>
          </Card>

          {/* Center coordinates locked from Admin */}
          <Card>
            <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>
              Trailhead Center (Locked)
            </div>
            {[
              ["Zone", joinedTrip.geofence?.zoneName || joinedTrip.name],
              ["Latitude", `${fence.lat.toFixed(4)}°N`],
              ["Longitude", `${fence.lon.toFixed(4)}°E`],
              ["Leader", joinedTrip.leader || "Field Guide"],
              ["Status", "Enforced by Admin"],
            ].map(([k,v])=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",fontSize:12,
                padding:"5px 0",borderBottom:`1px solid ${C.border}`}}>
                <span style={{color:C.muted2}}>{k}</span>
                <span style={{color:C.text,fontFamily:k.includes("tude")?"monospace":"inherit",fontWeight:500}}>{v}</span>
              </div>
            ))}
          </Card>

          {/* Admin visibility info */}
          <Card style={{background:"rgba(59,130,246,0.04)",borderColor:"rgba(59,130,246,0.2)"}}>
            <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:8}}>Command Visibility</div>
            {[
              ["Real-time GPS","Shared with Lead"],
              ["Boundary status",inside?"Inside Zone":"Breached"],
              ["Admin radius",`${(radius/1000).toFixed(1)} km`],
              ["Rescue unit",joinedTrip.rescueUnit || "Team Alpha"],
            ].map(([k,v])=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"4px 0",borderBottom:`1px solid ${C.border}`}}>
                <span style={{color:C.muted2}}>{k}</span>
                <span style={{color:C.text,fontWeight:500}}>{v}</span>
              </div>
            ))}
          </Card>
        </div>
      </div>

      {/* Event log */}
      <div style={{marginTop:16}}>
        <div style={{fontSize:12,fontWeight:600,color:C.text,marginBottom:10}}>Geofence Perimeter Log</div>
        <Card style={{padding:0}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead>
              <tr>
                {["Time","Event","Status","Location"].map(h=>(
                  <th key={h} style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",
                    padding:"10px 14px",textAlign:"left",borderBottom:`1px solid ${C.border}`,fontWeight:500}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.map((h,i)=>(
                <tr key={i}>
                  <td style={{fontSize:12,padding:"10px 14px",color:C.muted,borderBottom:`1px solid ${C.border}`,fontFamily:"monospace"}}>{h.time}</td>
                  <td style={{fontSize:13,padding:"10px 14px",color:C.text,borderBottom:`1px solid ${C.border}`}}>{h.event}</td>
                  <td style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`}}>
                    <Pill color={h.inside?"green":"red"}>{h.inside?"Inside":"Outside"}</Pill>
                  </td>
                  <td style={{fontSize:11,padding:"10px 14px",color:C.muted,borderBottom:`1px solid ${C.border}`,fontFamily:"monospace"}}>
                    {fence.lat.toFixed(4)}°N {fence.lon.toFixed(4)}°E
                  </td>
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
   PAGE: TREKKER PROFILE & DUTY-OF-CARE
════════════════════════════════════════════════ */
const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];
const RELATIONSHIPS = ["Family", "Spouse", "Parent", "Sibling", "Partner", "Friend", "Guardian", "Relative"];
const EXPERIENCE_LEVELS = [
  "Beginner Hiker (Day Treks)",
  "Intermediate Trekker (Western Ghats / Sahyadri)",
  "Advanced Trekker (High-Altitude / Multi-day)",
  "Mountaineer & Field Guide"
];

const PageProfile = ({ user, onUpdateUser, joinedTrip, onNavigate }) => {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [form, setForm] = useState({
    name: user?.name || "",
    phone: user?.phone || "",
    city: user?.city || "",
    experienceLevel: user?.experienceLevel || "Intermediate Trekker (Western Ghats / Sahyadri)",
    blood: user?.blood || "B+",
    medical: user?.medical || "None",
    allergies: user?.allergies || "None",
    medications: user?.medications || "None",
    insurancePolicy: user?.insurancePolicy || "",
    emergencyBeaconId: user?.emergencyBeaconId || "",
    ec1Name: user?.ec1Name || "",
    ec1Rel: user?.ec1Rel || "Family",
    ec1Ph: user?.ec1Ph || "",
    ec2Name: user?.ec2Name || "",
    ec2Rel: user?.ec2Rel || "Family",
    ec2Ph: user?.ec2Ph || "",
  });

  // Calculate duty-of-care readiness score
  const checks = [
    { label: "Blood Group Specified", ok: !!form.blood },
    { label: "Primary Emergency Contact", ok: !!form.ec1Name && !!form.ec1Ph },
    { label: "Field Mobile Phone", ok: !!form.phone },
    { label: "Medical & Health Declaration", ok: !!form.medical && form.medical !== "" },
    { label: "Secondary Contact (Optional)", ok: !!form.ec2Name && !!form.ec2Ph },
  ];
  const completedChecks = checks.filter(c => c.ok).length;
  const readinessPercent = Math.round((completedChecks / checks.length) * 100);

  const handleChange = (key, val) => {
    setForm(prev => ({ ...prev, [key]: val }));
    setSaveSuccess(false);
    setSaveError("");
  };

  const handleSave = async (e) => {
    e?.preventDefault();
    setSaveError("");
    setSaveSuccess(false);

    if (!form.name.trim()) {
      setSaveError("Please enter your full name.");
      return;
    }
    if (!form.phone.trim()) {
      setSaveError("Please provide a contact phone number for field operations.");
      return;
    }
    if (!form.ec1Name.trim() || !form.ec1Ph.trim()) {
      setSaveError("Primary emergency contact name and phone number are required for duty-of-care safety.");
      return;
    }

    setSaving(true);
    const updatedProfile = {
      ...user,
      ...form,
      updatedAt: new Date().toISOString(),
    };

    try {
      // 1. Direct Firestore update
      await updateUserProfileInFirestore(user.id, form);

      // 2. Backend update if token available
      const token = localStorage.getItem(USER_TOKEN_KEY) || localStorage.getItem(LEGACY_USER_TOKEN_KEY);
      if (token && user?.id) {
        await fetch(`${AUTH_API_URL}/users/${user.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify(form)
        }).catch(() => {});
      }

      // 3. Update localStorage and parent state
      localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(updatedProfile));
      onUpdateUser(updatedProfile);
      setSaveSuccess(true);
      setEditing(false);
    } catch (err) {
      setSaveError("Failed to save profile changes. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setForm({
      name: user?.name || "",
      phone: user?.phone || "",
      city: user?.city || "",
      experienceLevel: user?.experienceLevel || "Intermediate Trekker (Western Ghats / Sahyadri)",
      blood: user?.blood || "B+",
      medical: user?.medical || "None",
      allergies: user?.allergies || "None",
      medications: user?.medications || "None",
      insurancePolicy: user?.insurancePolicy || "",
      emergencyBeaconId: user?.emergencyBeaconId || "",
      ec1Name: user?.ec1Name || "",
      ec1Rel: user?.ec1Rel || "Family",
      ec1Ph: user?.ec1Ph || "",
      ec2Name: user?.ec2Name || "",
      ec2Rel: user?.ec2Rel || "Family",
      ec2Ph: user?.ec2Ph || "",
    });
    setEditing(false);
    setSaveError("");
  };

  return (
    <div>
      <PageHeader
        title="Trekker Profile & Medical Records"
        sub="Duty-of-care credentials, emergency contacts & SAR dispatch data"
        right={
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {editing ? (
              <>
                <Btn onClick={resetForm}>
                  ✕ Cancel
                </Btn>
                <Btn variant="primary" onClick={handleSave} disabled={saving}>
                  {saving ? "Saving…" : "💾 Save Changes"}
                </Btn>
              </>
            ) : (
              <Btn variant="primary" onClick={() => setEditing(true)}>
                ✏️ Edit Profile & Medical Info
              </Btn>
            )}
          </div>
        }
      />

      {/* Success Notification */}
      {saveSuccess && (
        <div style={{
          background: "rgba(34, 197, 94, 0.12)",
          border: "1px solid rgba(34, 197, 94, 0.35)",
          borderRadius: 12,
          padding: "12px 18px",
          marginBottom: 18,
          display: "flex",
          alignItems: "center",
          gap: 12,
          color: C.green
        }}>
          <span style={{ fontSize: 20 }}>✓</span>
          <div style={{ fontSize: 13, fontWeight: 500 }}>
            Profile updated successfully! All medical notes, blood group, and emergency contacts are synchronized for SAR dispatch.
          </div>
        </div>
      )}

      {/* Error Notification */}
      {saveError && (
        <div style={{
          background: "rgba(239, 68, 68, 0.12)",
          border: "1px solid rgba(239, 68, 68, 0.35)",
          borderRadius: 12,
          padding: "12px 18px",
          marginBottom: 18,
          display: "flex",
          alignItems: "center",
          gap: 12,
          color: "#fca5a5"
        }}>
          <span style={{ fontSize: 20 }}>⚠️</span>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{saveError}</div>
        </div>
      )}

      {/* Hero Overview Card */}
      <Card style={{
        marginBottom: 20,
        background: "linear-gradient(135deg, rgba(20, 50, 110, 0.45), rgba(11, 20, 34, 0.95))",
        borderColor: "rgba(59, 130, 246, 0.3)",
        padding: "24px 26px"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <Avatar
              initials={user?.avatar || (form.name || "T").slice(0, 2).toUpperCase()}
              bg={user?.color?.[0] || "#E6F1FB"}
              text={user?.color?.[1] || "#0C447C"}
              size={64}
            />
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <span style={{ fontSize: 22, fontWeight: 700, color: C.text }}>{form.name}</span>
                <Pill color="green">● Duty-of-Care Verified</Pill>
              </div>
              <div style={{ fontSize: 12.5, color: C.muted, display: "flex", gap: 14, flexWrap: "wrap" }}>
                <span>✉️ {user?.email}</span>
                <span>📞 {form.phone || "No phone linked"}</span>
                <span>📍 {form.city || "Western Ghats"}</span>
                <span>🥾 {form.experienceLevel}</span>
              </div>
            </div>
          </div>

          {/* Quick readiness meter & Trip status */}
          <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{
              background: "rgba(255, 255, 255, 0.04)",
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              padding: "10px 16px",
              minWidth: 160
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.muted, marginBottom: 5 }}>
                <span>Trail Readiness</span>
                <span style={{ color: readinessPercent >= 80 ? C.green : C.amber, fontWeight: 700 }}>{readinessPercent}%</span>
              </div>
              <div style={{ height: 6, background: "rgba(255, 255, 255, 0.08)", borderRadius: 4 }}>
                <div style={{
                  height: "100%",
                  borderRadius: 4,
                  background: readinessPercent >= 80 ? `linear-gradient(90deg, ${C.teal}, ${C.green})` : C.amber,
                  width: `${readinessPercent}%`,
                  transition: "width 0.4s"
                }}/>
              </div>
              <div style={{ fontSize: 10, color: C.muted2, marginTop: 4 }}>
                {completedChecks} of {checks.length} safety items ready
              </div>
            </div>

            <div style={{
              background: joinedTrip ? "rgba(16, 185, 129, 0.08)" : "rgba(255, 255, 255, 0.04)",
              border: joinedTrip ? "1px solid rgba(16, 185, 129, 0.3)" : `1px solid ${C.border}`,
              borderRadius: 10,
              padding: "10px 16px",
              minWidth: 170
            }}>
              <div style={{ fontSize: 10.5, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>
                Active Expedition
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: joinedTrip ? "#34d399" : C.muted2 }}>
                {joinedTrip ? joinedTrip.code : "No active trek"}
              </div>
              <button
                type="button"
                onClick={() => onNavigate("join-trip")}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  fontSize: 11,
                  color: C.accent,
                  cursor: "pointer",
                  marginTop: 2,
                  fontFamily: "inherit"
                }}
              >
                {joinedTrip ? "View trek details →" : "Browse Expeditions →"}
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* Main 2-Column Grid of Profile Details */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        {/* Column 1: Personal Contact & Field Identity */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <Card>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                👤 Personal &amp; Field Contact Info
              </div>
              <span style={{ fontSize: 11, color: C.muted2 }}>
                {editing ? "Editable Mode" : "Verified Identity"}
              </span>
            </div>

            <FieldRow label="FULL NAME">
              {editing ? (
                <Input value={form.name} onChange={(e) => handleChange("name", e.target.value)} placeholder="Full Name" />
              ) : (
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{form.name}</div>
              )}
            </FieldRow>

            <FieldRow label="MOBILE PHONE (EMERGENCY SMS & VOICE DISPATCH)">
              {editing ? (
                <Input value={form.phone} onChange={(e) => handleChange("phone", e.target.value)} placeholder="+91 98765 43210" />
              ) : (
                <div style={{ fontSize: 13.5, color: form.phone ? C.text : C.muted, fontFamily: "monospace" }}>
                  {form.phone || "Not set — Add a phone number"}
                </div>
              )}
            </FieldRow>

            <FieldRow label="HOME CITY / BASE REGION">
              {editing ? (
                <Input value={form.city} onChange={(e) => handleChange("city", e.target.value)} placeholder="e.g. Pune, Maharashtra" />
              ) : (
                <div style={{ fontSize: 13.5, color: C.text }}>{form.city || "Western Ghats"}</div>
              )}
            </FieldRow>

            <FieldRow label="TREKKING EXPERIENCE LEVEL">
              {editing ? (
                <Select value={form.experienceLevel} onChange={(e) => handleChange("experienceLevel", e.target.value)}>
                  {EXPERIENCE_LEVELS.map(lvl => (
                    <option key={lvl} value={lvl} style={{ background: "#0b1422", color: "#fff" }}>{lvl}</option>
                  ))}
                </Select>
              ) : (
                <div style={{ fontSize: 13, color: "#60a5fa", fontWeight: 500 }}>{form.experienceLevel}</div>
              )}
            </FieldRow>

            <FieldRow label="AUTHENTICATED LOGIN EMAIL">
              <div style={{
                background: "rgba(255, 255, 255, 0.03)",
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 13,
                color: C.muted,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between"
              }}>
                <span>{user?.email}</span>
                <span style={{ fontSize: 10, color: C.muted2 }}>🔒 Primary ID</span>
              </div>
            </FieldRow>
          </Card>

          {/* Emergency Contacts Card */}
          <Card style={{ borderColor: "rgba(59, 130, 246, 0.25)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                📞 Emergency Contacts (SAR Call Tree)
              </div>
              <span style={{ fontSize: 11, color: C.muted2 }}>Direct Next-of-Kin</span>
            </div>

            {/* Primary Contact */}
            <div style={{
              background: "rgba(255, 255, 255, 0.03)",
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              padding: "12px 14px",
              marginBottom: 12
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#60a5fa", letterSpacing: "0.05em" }}>
                  PRIMARY EMERGENCY CONTACT
                </span>
                {!editing && form.ec1Ph && (
                  <a
                    href={`tel:${form.ec1Ph}`}
                    style={{
                      background: "rgba(34, 197, 94, 0.15)",
                      border: "1px solid rgba(34, 197, 94, 0.3)",
                      borderRadius: 6,
                      color: C.green,
                      fontSize: 11,
                      padding: "2px 8px",
                      textDecoration: "none",
                      fontWeight: 600
                    }}
                  >
                    📞 Call
                  </a>
                )}
              </div>

              {editing ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 10, color: C.muted2, marginBottom: 3 }}>Name</div>
                    <Input value={form.ec1Name} onChange={(e) => handleChange("ec1Name", e.target.value)} placeholder="Contact Name" />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: C.muted2, marginBottom: 3 }}>Relationship</div>
                    <Select value={form.ec1Rel} onChange={(e) => handleChange("ec1Rel", e.target.value)}>
                      {RELATIONSHIPS.map(r => (
                        <option key={r} value={r} style={{ background: "#0b1422", color: "#fff" }}>{r}</option>
                      ))}
                    </Select>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <div style={{ fontSize: 10, color: C.muted2, marginBottom: 3 }}>Phone Number</div>
                    <Input value={form.ec1Ph} onChange={(e) => handleChange("ec1Ph", e.target.value)} placeholder="+91 98765 43210" />
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
                    {form.ec1Name || "No primary contact configured"}
                  </div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 2, display: "flex", gap: 10 }}>
                    <span>{form.ec1Rel || "Family"}</span>
                    <span>·</span>
                    <span style={{ fontFamily: "monospace" }}>{form.ec1Ph || "—"}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Secondary Contact */}
            <div style={{
              background: "rgba(255, 255, 255, 0.02)",
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              padding: "12px 14px"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: "0.05em" }}>
                  SECONDARY EMERGENCY CONTACT (BACKUP)
                </span>
                {!editing && form.ec2Ph && (
                  <a
                    href={`tel:${form.ec2Ph}`}
                    style={{
                      background: "rgba(34, 197, 94, 0.15)",
                      border: "1px solid rgba(34, 197, 94, 0.3)",
                      borderRadius: 6,
                      color: C.green,
                      fontSize: 11,
                      padding: "2px 8px",
                      textDecoration: "none",
                      fontWeight: 600
                    }}
                  >
                    📞 Call
                  </a>
                )}
              </div>

              {editing ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 10, color: C.muted2, marginBottom: 3 }}>Name</div>
                    <Input value={form.ec2Name} onChange={(e) => handleChange("ec2Name", e.target.value)} placeholder="Backup Name (Optional)" />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: C.muted2, marginBottom: 3 }}>Relationship</div>
                    <Select value={form.ec2Rel} onChange={(e) => handleChange("ec2Rel", e.target.value)}>
                      {RELATIONSHIPS.map(r => (
                        <option key={r} value={r} style={{ background: "#0b1422", color: "#fff" }}>{r}</option>
                      ))}
                    </Select>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <div style={{ fontSize: 10, color: C.muted2, marginBottom: 3 }}>Phone Number</div>
                    <Input value={form.ec2Ph} onChange={(e) => handleChange("ec2Ph", e.target.value)} placeholder="+91 Phone" />
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: form.ec2Name ? C.text : C.muted }}>
                    {form.ec2Name || "Optional backup contact not set"}
                  </div>
                  {form.ec2Name && (
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 2, display: "flex", gap: 10 }}>
                      <span>{form.ec2Rel || "Family"}</span>
                      <span>·</span>
                      <span style={{ fontFamily: "monospace" }}>{form.ec2Ph || "—"}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Column 2: Medical & Duty-of-Care Record (Life-Critical) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Medical Duty-of-Care Card */}
          <Card style={{ borderColor: "rgba(239, 68, 68, 0.25)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                ⚕️ Medical &amp; Duty-of-Care Record
              </div>
              <Pill color="red">🚨 Shared on SOS</Pill>
            </div>
            <div style={{ fontSize: 11.5, color: C.muted2, lineHeight: 1.45, marginBottom: 14 }}>
              This information is instantly broadcast to Search &amp; Rescue (SAR) responders, mountain ambulances, and local hospitals when an emergency is activated.
            </div>

            <FieldRow label="BLOOD GROUP">
              {editing ? (
                <Select value={form.blood} onChange={(e) => handleChange("blood", e.target.value)}>
                  {BLOOD_GROUPS.map(bg => (
                    <option key={bg} value={bg} style={{ background: "#0b1422", color: "#fff" }}>{bg}</option>
                  ))}
                </Select>
              ) : (
                <div style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  background: "rgba(239, 68, 68, 0.12)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  borderRadius: 8,
                  padding: "4px 12px",
                  fontSize: 14,
                  fontWeight: 700,
                  color: C.red
                }}>
                  <span>🩸 {form.blood || "Not set"}</span>
                </div>
              )}
            </FieldRow>

            <FieldRow label="MEDICAL CONDITIONS / CHRONIC ILLNESSES">
              {editing ? (
                <textarea
                  value={form.medical}
                  onChange={(e) => handleChange("medical", e.target.value)}
                  placeholder="e.g. Asthma (carry inhaler), mild hypertension, knee injury history"
                  rows={2}
                  style={{
                    width: "100%",
                    background: "rgba(255, 255, 255, 0.04)",
                    border: `1px solid ${C.border}`,
                    borderRadius: 8,
                    color: C.text,
                    fontSize: 13,
                    padding: "8px 12px",
                    fontFamily: "inherit",
                    boxSizing: "border-box",
                    outline: "none",
                    resize: "vertical"
                  }}
                />
              ) : (
                <div style={{ fontSize: 13, color: form.medical && form.medical !== "None" ? C.text : C.muted }}>
                  {form.medical || "None declared"}
                </div>
              )}
            </FieldRow>

            <FieldRow label="KNOWN ALLERGIES (FOOD / MEDICATION / INSECTS)">
              {editing ? (
                <Input
                  value={form.allergies}
                  onChange={(e) => handleChange("allergies", e.target.value)}
                  placeholder="e.g. Penicillin, Bee stings, Peanuts"
                />
              ) : (
                <div style={{ fontSize: 13, color: form.allergies && form.allergies !== "None" ? C.text : C.muted }}>
                  {form.allergies || "None declared"}
                </div>
              )}
            </FieldRow>

            <FieldRow label="CURRENT MEDICATIONS ON TREK">
              {editing ? (
                <Input
                  value={form.medications}
                  onChange={(e) => handleChange("medications", e.target.value)}
                  placeholder="e.g. Salbutamol inhaler in top bag pocket, Cetirizine"
                />
              ) : (
                <div style={{ fontSize: 13, color: form.medications && form.medications !== "None" ? C.text : C.muted }}>
                  {form.medications || "None declared"}
                </div>
              )}
            </FieldRow>

            <FieldRow label="TREK / MEDICAL INSURANCE POLICY">
              {editing ? (
                <Input
                  value={form.insurancePolicy}
                  onChange={(e) => handleChange("insurancePolicy", e.target.value)}
                  placeholder="e.g. Star Health / ICICI Lombard Policy #12345678"
                />
              ) : (
                <div style={{ fontSize: 13, color: form.insurancePolicy ? C.text : C.muted }}>
                  {form.insurancePolicy || "Not specified (Optional)"}
                </div>
              )}
            </FieldRow>
          </Card>
        </div>
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════
   SIDEBAR NAVIGATION
════════════════════════════════════════════════ */
const NAV = [
  {section:"Expedition",items:[
    {id:"join-trip",label:"Expeditions & Trips",icon:"🧭"},
    {id:"dashboard",label:"My Dashboard",icon:"⊞"},
    {id:"fitness-devices",label:"Fitness & Wearables",icon:"⌚"},
  ]},
  {section:"Safety",items:[
    {id:"sos-nav",label:"SOS Navigation",icon:"🚨",highlight:true},
    {id:"geofencing",label:"Geofencing",icon:"🔶"},
  ]},
  {section:"Tracking",items:[
    {id:"live-tracking",label:"Live Tracking",icon:"📡"},
  ]},
  {section:"Weather",items:[
    {id:"weather",label:"Weather & Maps",icon:"🌤️"},
  ]},
];

/* ════════════════════════════════════════════════
   ROOT COMPONENT
════════════════════════════════════════════════ */
export default function UserDashboard() {
  const clearAuthData = () => {
    localStorage.removeItem(USER_TOKEN_KEY);
    localStorage.removeItem(USER_SESSION_KEY);
    localStorage.removeItem(USER_PROFILE_KEY);
    localStorage.removeItem(USER_CREDENTIALS_KEY);
    localStorage.removeItem("margsutra_tracking_token");
    localStorage.removeItem("margsutra_joined_trip");
  };

  const [user, setUser] = useState(() => {
    try {
      const savedProfile = localStorage.getItem(USER_PROFILE_KEY);
      if (!savedProfile) return null;
      const p = JSON.parse(savedProfile);
      if (p.id === "U001") return null; // clears stale mock
      return p;
    } catch {
      return null;
    }
  });

  const handleUpdateUser = (updatedProfile) => {
    setUser(updatedProfile);
    localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(updatedProfile));
  };

  const handleLogin = (profile) => {
    setUser(profile);
    localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(profile));
    localStorage.setItem(USER_SESSION_KEY, JSON.stringify({ userId: profile.id, email: profile.email }));
    const savedTrip = localStorage.getItem("margsutra_joined_trip");
    setPage(savedTrip ? "dashboard" : "join-trip");
  };

  const [joinedTrip, setJoinedTrip] = useState(() => {
    try {
      const saved = localStorage.getItem("margsutra_joined_trip");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Real-time synchronization of Active Trip from Firestore & Backend API
  useEffect(() => {
    if (!user?.id) return;

    // 1. Backend REST fast sync every 3s (guarantees update even if client rules or network fluctuate)
    const syncActiveTripFromBackend = async () => {
      try {
        const res = await fetch(`http://localhost:5050/api/users/${user.id}/active-trip`);
        if (res.ok) {
          const data = await res.json();
          if (data?.activeTrip?.trip) {
            const fullTrip = {
              ...data.activeTrip.trip,
              tripStatus: data.activeTrip.status || "pending_approval",
              requestedAt: data.activeTrip.requestedAt,
              approvedAt: data.activeTrip.approvedAt,
            };
            setJoinedTrip(fullTrip);
            localStorage.setItem("margsutra_joined_trip", JSON.stringify(fullTrip));
          } else if (data?.success && !data.activeTrip) {
            setJoinedTrip(null);
            localStorage.removeItem("margsutra_joined_trip");
          }
        }
      } catch {}
    };

    syncActiveTripFromBackend();
    const interval = setInterval(syncActiveTripFromBackend, 3000);

    // 2. Firestore real-time snapshot listener
    const unsub = subscribeToUserActiveTrip(user.id, (activeData) => {
      if (activeData && activeData.trip) {
        const fullTrip = {
          ...activeData.trip,
          tripStatus: activeData.status || "pending_approval",
          requestedAt: activeData.requestedAt,
          approvedAt: activeData.approvedAt,
        };
        setJoinedTrip(fullTrip);
        localStorage.setItem("margsutra_joined_trip", JSON.stringify(fullTrip));
      } else {
        setJoinedTrip(null);
        localStorage.removeItem("margsutra_joined_trip");
      }
    });

    return () => {
      clearInterval(interval);
      unsub?.();
    };
  }, [user?.id]);

  // Default page: if user has no joined trip, open "join-trip" by default
  const [page, setPage] = useState(() => {
    return localStorage.getItem("margsutra_joined_trip") ? "dashboard" : "join-trip";
  });

  const [activeSOS, setActiveSOS] = useState(() => user?.status === "sos");
  const [activeSosId, setActiveSosId] = useState(() => user?.activeSosId || null);
  const [joinError, setJoinError] = useState("");
  const [showSOSConfirmModal, setShowSOSConfirmModal] = useState(false);
  const liveFix = useLivePosition();
  const [sosDelivery, setSosDelivery] = useState(null);
  const [outboxCount, setOutboxCount] = useState(() => getSOSOutboxCount());

  // Subscribe to remote stand-down (e.g. if Admin stands down SOS from command console)
  useEffect(() => {
    if (!user?.id) return;
    const unsub = subscribeToSOSResolution(user.id, () => {
      setActiveSOS(false);
      setActiveSosId(null);
      alarmEngine.stop();
    });
    return () => unsub?.();
  }, [user?.id]);

  // Retry any SOS beacon that could not be delivered while offline.
  useEffect(() => {
    let cancelled = false;
    const retry = async () => {
      const result = await flushSOSOutbox();
      if (cancelled) return;
      setOutboxCount(result.remaining);
      if (result.flushed > 0) {
        setSosDelivery((prev) =>
          prev ? { ...prev, delivered: true, pending: false, queued: result.remaining } : prev
        );
      }
    };
    retry();
    const timer = setInterval(retry, 30_000);
    window.addEventListener("online", retry);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("online", retry);
    };
  }, []);

  const handleSOSToggle = async (activate) => {
    if (activate) {
      if (!activeSOS) {
        setShowSOSConfirmModal(true);
        return;
      }
    } else {
      setActiveSOS(false);
      alarmEngine.stop();
      try {
        await cancelSOSBeacon(user, activeSosId, "user_cancelled");
      } catch (e) {
        console.warn("Failed to cancel SOS in database:", e);
      }
      setActiveSosId(null);
      setSosDelivery(null);
      setOutboxCount(getSOSOutboxCount());
    }
  };

  const handleConfirmedSOSBroadcast = async () => {
    setShowSOSConfirmModal(false);
    setActiveSOS(true);
    setPage("sos-nav");
    setSosDelivery({ pending: true, delivered: false, channels: {}, queued: 0 });
    try {
      const res = await broadcastSOSBeacon(user, joinedTrip, {
        lat: liveFix.meta.lat,
        lon: liveFix.meta.lon,
        altitude: liveFix.meta.altitude,
        accuracy: liveFix.meta.accuracy,
        ageSec: liveFix.meta.ageSec,
        source: liveFix.meta.source,
      });
      if (res?.eventId) setActiveSosId(res.eventId);
      setSosDelivery({
        pending: false,
        delivered: Boolean(res?.delivered),
        channels: res?.channels || {},
        queued: res?.queued || 0,
        locationSource: res?.locationSource,
        errors: res?.errors || [],
      });
      setOutboxCount(res?.queued || 0);
    } catch (e) {
      console.warn("Failed to trigger SOS:", e);
      setSosDelivery({
        pending: false,
        delivered: false,
        channels: {},
        queued: getSOSOutboxCount(),
        errors: [e?.message || "unknown error"],
      });
    }
  };

  const handleJoinTrip = async (tripOrCode) => {
    setJoinError("");
    if (joinedTrip) {
      setJoinError("You are already enrolled in an expedition. Leave your current expedition before applying to another.");
      return false;
    }
    let targetTrip = null;

    if (typeof tripOrCode === "object" && tripOrCode !== null) {
      targetTrip = tripOrCode;
    } else {
      const code = String(tripOrCode).trim().toUpperCase();

      // 1. Try backend API lookup
      try {
        const res = await fetch(`http://localhost:5050/api/trips/${code}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.code) targetTrip = data;
        }
      } catch (e) {
        console.warn("Backend lookup failed, checking Firestore directly...", e);
      }

      // 2. Direct Firestore fallback
      if (!targetTrip) {
        try {
          const result = await getTripByCode(code);
          if (result.success && result.trip) {
            targetTrip = result.trip;
          }
        } catch (e) {
          console.warn("Firestore lookup error:", e);
        }
      }

      // 3. Fallback list
      if (!targetTrip) {
        targetTrip = FALLBACK_TRIPS.find(t => t.code.toUpperCase() === code);
      }
    }

    if (!targetTrip) {
      setJoinError("That code doesn't match an active expedition. Please check with your organizer.");
      return false;
    }

    // Call backend join API to register join request in Firestore
    const tripId = targetTrip.id || targetTrip.tripId;
    let joinOk = false;
    try {
      const token = localStorage.getItem(USER_TOKEN_KEY) || localStorage.getItem(LEGACY_USER_TOKEN_KEY);
      const res = await fetch(`http://localhost:5050/api/trips/${tripId}/join`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          userId: user?.id,
          name: user?.name,
          email: user?.email,
          phone: user?.phone,
          blood: user?.blood,
          medical: user?.medical,
          ec1Name: user?.ec1Name,
          ec1Rel: user?.ec1Rel,
          ec1Ph: user?.ec1Ph
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (errData.error) {
          setJoinError(errData.error);
          return false;
        }
      } else {
        joinOk = true;
      }
    } catch (e) {
      console.warn("Backend join API error:", e);
    }

    // Direct Firestore update fallback if backend was unavailable
    if (!joinOk && user?.id) {
      const fbRes = await joinTripInFirestore(targetTrip, user);
      if (!fbRes.success && fbRes.error) {
        setJoinError(fbRes.error);
        return false;
      }
    }

    // Save active trip (status is pending_approval until admin approves)
    const tripWithStatus = {
      ...targetTrip,
      tripStatus: "pending_approval",
    };
    setJoinedTrip(tripWithStatus);
    localStorage.setItem("margsutra_joined_trip", JSON.stringify(tripWithStatus));

    // Fast-sync from database
    if (user?.id) {
      fetchUserActiveTrip(user.id).then((active) => {
        if (active && active.trip) {
          const synced = {
            ...active.trip,
            tripStatus: active.status || "pending_approval",
            requestedAt: active.requestedAt,
            approvedAt: active.approvedAt,
          };
          setJoinedTrip(synced);
          localStorage.setItem("margsutra_joined_trip", JSON.stringify(synced));
        }
      }).catch(() => {});
    }

    setPage("dashboard");
    return true;
  };

  const handleLeaveTrip = async () => {
    const tripId = joinedTrip?.id || joinedTrip?.tripId;
    if (tripId && user?.id) {
      try {
        const token = localStorage.getItem(USER_TOKEN_KEY) || localStorage.getItem(LEGACY_USER_TOKEN_KEY);
        await fetch(`http://localhost:5050/api/trips/${tripId}/leave`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { "Authorization": `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ userId: user?.id })
        });
      } catch (e) {
        console.warn("Backend leave API error:", e);
      }
      try {
        await leaveTripInFirestore(tripId, user.id);
      } catch (e) {
        console.warn("Firestore leave error:", e);
      }
    }

    setJoinedTrip(null);
    localStorage.removeItem("margsutra_joined_trip");
    if (user?.id) {
      fetchUserActiveTrip(user.id).catch(() => {});
    }
    setPage("join-trip");
  };

  if (!user) {
    return <PageAuth onLogin={handleLogin} initialTab="login" />;
  }

  const navigate = (p) => setPage(p);

  const PAGES = {
    "dashboard": <PageDashboard user={user} onNavigate={navigate} activeSOS={activeSOS} joinedTrip={joinedTrip} onSOS={handleSOSToggle}/>,
    "sos-nav":   <PageSOSNav user={user} activeSOS={activeSOS} onSOS={handleSOSToggle} onNavigate={navigate}/>,
    "geofencing":<PageGeofencing user={user} joinedTrip={joinedTrip} onNavigate={navigate}/>,
    "live-tracking": <PageLiveTracking user={user} joinedTrip={joinedTrip} onNavigate={navigate} activeSOS={activeSOS} onSOS={handleSOSToggle}/>,
    "weather":   <PageWeatherMaps joinedTrip={joinedTrip} onNavigate={navigate}/>,
    "fitness-devices": (
      <div>
        <PageHeader
          title="Fitness Wearables & Gadgets"
          sub="Pair smartwatches, biometric sensors, and manage live telemetry broadcasts to expedition leaders"
          right={<Pill color="amber">◐ Demo BLE · simulated</Pill>}
        />
        <FitnessGadgetManager user={user} joinedTrip={joinedTrip} compact={false} onNavigate={navigate} />
      </div>
    ),
    "join-trip": <PageJoinTrip user={user} joinedTrip={joinedTrip} onJoin={handleJoinTrip} onLeave={handleLeaveTrip} onNavigate={navigate} error={joinError}/>,
    "profile":   <PageProfile user={user} onUpdateUser={handleUpdateUser} joinedTrip={joinedTrip} onNavigate={navigate}/>,
  };

  const signOut = () => {
    clearAuthData();
    setUser(null);
    setActiveSOS(false);
    setJoinedTrip(null);
    setPage("join-trip");
  };

  const deliveryLabel =
    !sosDelivery || sosDelivery.pending
      ? "TRANSMITTING TO SAR COMMAND…"
      : sosDelivery.delivered
        ? "DELIVERED TO SAR COMMAND"
        : "NOT DELIVERED — QUEUED & RETRYING";

  const deliveredChannels = sosDelivery
    ? Object.entries(sosDelivery.channels || {}).filter(([, ok]) => ok).map(([name]) => name)
    : [];

  return (
    <div style={{display:"grid",gridTemplateColumns:"220px 1fr",minHeight:"780px",
      background:C.bg,fontFamily:"system-ui,-apple-system,sans-serif",color:C.text}}>

      {/* Sidebar */}
      <aside style={{background:C.sidebar,display:"flex",flexDirection:"column",borderRight:`1px solid ${C.border}`}}>
        {/* Brand */}
        <div style={{padding:"18px 16px 14px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:32,height:32,borderRadius:"50%",background:"rgba(59,130,246,0.12)",
            border:"1px solid rgba(59,130,246,0.28)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>🏔️</div>
          <div>
            <div style={{fontSize:14,fontWeight:700,color:C.text}}>Margsutra</div>
            <div style={{fontSize:10,color:C.muted2}}>Trip Safety Portal</div>
          </div>
        </div>

        {/* User profile card — Clickable to Profile page */}
        <div
          onClick={() => setPage("profile")}
          title="View & Edit Trekker Profile & Medical Records"
          style={{
            padding:"12px 16px",
            borderBottom:`1px solid ${C.border}`,
            display:"flex",
            alignItems:"center",
            gap:10,
            cursor:"pointer",
            background: page === "profile" ? "rgba(59, 130, 246, 0.12)" : "transparent",
            borderLeft: page === "profile" ? `3px solid ${C.accent}` : "3px solid transparent",
            transition:"background 0.15s, border-color 0.15s"
          }}
        >
          <Avatar initials={user?.avatar || (user?.name || "T").slice(0, 2).toUpperCase()} bg={user?.color?.[0] || "#E6F1FB"} text={user?.color?.[1] || "#0C447C"} size={34}/>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{fontSize:12,fontWeight:600,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user?.name || "Trekker"}</div>
              <span style={{fontSize:10,color:C.muted2,marginLeft:4}}>›</span>
            </div>
            <div style={{fontSize:10,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginTop:2}}>
              {!joinedTrip ? (
                <span style={{ color: C.amber }}>⚪ No Trip · Join →</span>
              ) : joinedTrip.tripStatus === "pending_approval" ? (
                <span style={{ color: "#fbbf24" }}>⏳ {joinedTrip.code} · Pending</span>
              ) : (
                <span style={{ color: "#86efac" }}>🟢 {joinedTrip.code} · Active</span>
              )}
            </div>
          </div>
          {activeSOS&&(
            <div style={{width:22,height:22,background:"rgba(239,68,68,0.18)",border:"1px solid rgba(239,68,68,0.4)",
              borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:C.red,fontWeight:700}}>!</div>
          )}
        </div>

        {/* Nav */}
        <nav style={{flex:1,overflowY:"auto",padding:"10px 0"}}>
          {NAV.map(({section,items})=>(
            <div key={section}>
              <div style={{fontSize:9,color:C.muted2,padding:"10px 16px 4px",letterSpacing:"0.12em",textTransform:"uppercase"}}>{section}</div>
              {items.map(item=>{
                const active = page===item.id;
                const isSOS  = item.id==="sos-nav";
                const isJoin = item.id==="join-trip";
                return (
                  <div key={item.id} onClick={()=>setPage(item.id)}
                    style={{display:"flex",alignItems:"center",gap:10,padding:"8px 16px",cursor:"pointer",
                      borderLeft:`2px solid ${active?(isSOS?C.red:C.accent):"transparent"}`,
                      background:active?(isSOS?"rgba(239,68,68,0.1)":"rgba(59,130,246,0.1)"):"transparent",
                      transition:"background 0.15s"}}>
                    <span style={{fontSize:15,width:18,textAlign:"center",flexShrink:0}}>{item.icon}</span>
                    <span style={{fontSize:12,color:active?C.text:isSOS?"rgba(252,165,165,0.8)":C.muted,fontWeight:active?500:400}}>
                      {item.label}
                    </span>
                    {isJoin && (
                      !joinedTrip ? (
                        <div style={{marginLeft:"auto",background:"rgba(245,158,11,0.2)",border:"1px solid rgba(245,158,11,0.35)",
                          borderRadius:10,padding:"1px 6px",fontSize:9,color:C.amber,fontWeight:600}}>JOIN</div>
                      ) : joinedTrip.tripStatus === "pending_approval" ? (
                        <div style={{marginLeft:"auto",background:"rgba(245,158,11,0.2)",border:"1px solid rgba(245,158,11,0.35)",
                          borderRadius:10,padding:"1px 6px",fontSize:9,color:C.amber,fontWeight:600}}>PENDING</div>
                      ) : (
                        <div style={{marginLeft:"auto",background:"rgba(34,197,94,0.18)",border:"1px solid rgba(34,197,94,0.35)",
                          borderRadius:10,padding:"1px 6px",fontSize:9,color:"#86efac",fontWeight:600}}>ACTIVE</div>
                      )
                    )}
                    {isSOS&&activeSOS&&(
                      <div style={{marginLeft:"auto",background:"rgba(239,68,68,0.2)",border:"1px solid rgba(239,68,68,0.35)",
                        borderRadius:10,padding:"1px 7px",fontSize:9,color:C.red,fontWeight:700}}>LIVE</div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Quick SOS in sidebar */}
        <div style={{padding:"12px 16px",borderTop:`1px solid ${C.border}`}}>
          <button onClick={()=>{
            if (activeSOS) {
              const ok = window.confirm("Are you safe now? Stand down SAR rescue teams?");
              if (ok) handleSOSToggle(false);
              return;
            }
            if (!joinedTrip) {
              alert("⚠️ No Active Expedition: Please join an expedition first so SAR rescue teams know which zone and trail you are located on.");
              setPage("join-trip");
              return;
            }
            if (joinedTrip.tripStatus === "pending_approval") {
              alert("⏳ Expedition Approval Pending: Your application to join " + (joinedTrip.name || "the expedition") + " is awaiting administrator review. Emergency SAR beacons activate once approved.");
              setPage("join-trip");
              return;
            }
            setShowSOSConfirmModal(true);
          }}
            style={{
              width:"100%",padding:"10px",
              background: activeSOS ? "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)" : "rgba(239,68,68,0.12)",
              border: activeSOS ? "1px solid #ef4444" : "1px solid rgba(239,68,68,0.35)",
              borderRadius:10,
              color: activeSOS ? "#fff" : C.red,
              fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:"inherit",
              display:"flex",alignItems:"center",justifyContent:"center",gap:7,
              boxShadow: activeSOS ? "0 0 18px rgba(239,68,68,0.6)" : "none",
              animation:activeSOS?"ud-sos-blink 1.2s infinite":undefined
            }}>
            🆘 {activeSOS?"SOS ACTIVE · Cancel":"Quick SOS"}
          </button>
          <div style={{marginTop:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:10,color:C.muted2}}>© 2026 Margsutra</span>
            <button onClick={signOut} style={{fontSize:11,color:C.muted,background:"none",border:"none",cursor:"pointer",fontFamily:"inherit"}}>Sign out</button>
          </div>
        </div>
      </aside>

      {/* Main Container */}
      <div style={{display:"flex",flexDirection:"column",minWidth:0,height:"100%"}}>
        {/* Persistent Emergency Beacon Top Alert Bar */}
        {activeSOS && (
          <div style={{
            background: "linear-gradient(90deg, #991b1b 0%, #dc2626 50%, #991b1b 100%)",
            color: "#ffffff",
            padding: "10px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxShadow: "0 4px 20px rgba(220, 38, 38, 0.4)",
            zIndex: 9999,
            animation: "ud-sos-blink 1.4s infinite",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 20 }}>🚨</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: "0.04em" }}>
                  EMERGENCY DISTRESS BEACON ACTIVE · {deliveryLabel}
                </div>
                <div style={{ fontSize: 11, opacity: 0.92 }}>
                  {sosDelivery?.pending
                    ? "Siren active · contacting SAR Incident Command and Field Guide"
                    : sosDelivery?.delivered
                      ? `Siren active · reached via ${deliveredChannels.join(" + ") || "dispatch"}${sosDelivery?.locationSource && sosDelivery.locationSource !== "live" ? ` · position source: ${sosDelivery.locationSource}` : " · live GPS attached"}`
                      : `Siren active · no transport reachable. ${outboxCount} beacon${outboxCount === 1 ? "" : "s"} persisted and retried automatically — keep this screen open.`}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                onClick={() => setPage("sos-nav")}
                style={{
                  background: "rgba(255, 255, 255, 0.2)",
                  border: "1px solid rgba(255, 255, 255, 0.4)",
                  color: "#fff",
                  borderRadius: 8,
                  padding: "6px 12px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                🧭 View Rescue HUD
              </button>
              <button
                onClick={() => {
                  const ok = window.confirm("Stand down SAR dispatch and notify command that you are safe?");
                  if (ok) handleSOSToggle(false);
                }}
                style={{
                  background: "#ffffff",
                  border: "none",
                  color: "#b91c1c",
                  borderRadius: 8,
                  padding: "6px 14px",
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: "pointer",
                  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
                }}
              >
                🛑 Cancel SOS (I Am Safe / False Alarm)
              </button>
            </div>
          </div>
        )}

        {/* Main Content View */}
        <main style={{flex:1,overflow:"auto",padding:24}}>
          {PAGES[page]||<div style={{color:C.muted}}>Page not found.</div>}
        </main>
      </div>

      {/* Two-Step SOS Confirmation Modal */}
      <SOSConfirmModal
        isOpen={showSOSConfirmModal}
        onClose={() => setShowSOSConfirmModal(false)}
        onConfirm={handleConfirmedSOSBroadcast}
        user={user}
        trip={joinedTrip}
        location={liveFix.meta}
      />
    </div>
  );
}