/**
 * UserTrackingWidget.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Live Tracking & Expedition Radar component for User App.
 *
 * Provides:
 *   • Interactive Leaflet Map showing:
 *       - Current user's location ("You" pulsing marker)
 *       - Expedition Leader (Ajay Saini) with crown badge
 *       - All 4 other expedition team members (Rohan, Pooja, Tanmay, Kavita)
 *       - Connecting Rajmachi trail corridor path
 *   • Real-time distance calculations from YOU to the leader and each member
 *   • Proximity Radar List: battery, altitude, heart rate, and focus controls
 *   • GPS tracking start/stop toggle with HTTPS guard
 *   • Emergency SOS trigger wired to dispatch
 */

import React, { useState, useEffect, useRef } from "react";
import { useLocationTracking } from "./useLocationTracking";
import {
  calculateDistanceMeters,
  formatDistance,
  getRelativeTrailDirection,
  RAJMACHI_ADMIN,
  RAJMACHI_MEMBERS,
} from "./services/expeditionTeam";

/* ── Design tokens ───────────────────────────────────────────────────────── */
const C = {
  bg:"#080f1a", sidebar:"#0b1422",
  card:"rgba(255,255,255,0.04)", border:"rgba(80,140,220,0.14)",
  border2:"rgba(80,140,220,0.28)", accent:"#3b82f6",
  green:"#22c55e", amber:"#f59e0b", red:"#ef4444", purple:"#a78bfa",
  teal:"#14b8a6", text:"#e2e8f0", muted:"rgba(180,210,245,0.5)",
  muted2:"rgba(180,210,245,0.28)",
};

/* ── Leaflet singleton loader ─────────────────────────────────────────────── */
const LCSS = "leaflet-css-v194";
const LJS  = "leaflet-js-v194";
const ensureLeaflet = (cb) => {
  if (window.L) { cb(); return; }
  if (!document.getElementById(LCSS)) {
    const css = document.createElement("link");
    css.id = LCSS; css.rel = "stylesheet";
    css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(css);
  }
  if (!document.getElementById(LJS)) {
    const js = document.createElement("script");
    js.id = LJS; js.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    document.head.appendChild(js);
  }
  const poll = setInterval(() => { if (window.L) { clearInterval(poll); cb(); } }, 80);
};

/* ── Inject keyframes once ────────────────────────────────────────────────── */
const injectStyles = (() => {
  let done = false;
  return () => {
    if (done) return; done = true;
    const s = document.createElement("style");
    s.textContent = `
      @keyframes utw-pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
      @keyframes utw-ring  { 0%{transform:translate(-50%,-50%) scale(.3);opacity:.9} 100%{transform:translate(-50%,-50%) scale(2.4);opacity:0} }
      @keyframes utw-spin  { to{transform:rotate(360deg)} }
      .leaflet-container { background:#08101e !important; }
      .leaflet-tile-pane { filter:saturate(.85) brightness(.9); }
      .leaflet-popup-content-wrapper { background:#0b1422;color:#e2e8f0;border:1px solid rgba(80,140,220,0.3);border-radius:10px; }
      .leaflet-popup-tip  { background:#0b1422; }
      .leaflet-control-zoom { border:1px solid rgba(80,140,220,0.25)!important;border-radius:8px!important;overflow:hidden; }
      .leaflet-control-zoom a { background:rgba(11,20,34,0.95)!important;color:#e2e8f0!important;border-bottom:1px solid rgba(80,140,220,0.2)!important; }
      .leaflet-control-attribution { background:rgba(8,15,26,.7)!important;color:#64748b!important;font-size:9px!important; }
    `;
    document.head.appendChild(s);
  };
})();

/* ── Shared UI atoms ─────────────────────────────────────────────────────── */
const Card = ({ children, style, onClick }) => (
  <div onClick={onClick} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"16px 18px",...style}}>
    {children}
  </div>
);

const Pill = ({ color, children }) => {
  const m = {
    green:{bg:"rgba(34,197,94,0.12)",t:"#86efac"},
    red:{bg:"rgba(239,68,68,0.12)",t:"#fca5a5"},
    amber:{bg:"rgba(245,158,11,0.14)",t:"#fbbf24"},
    blue:{bg:"rgba(59,130,246,0.14)",t:"#93c5fd"},
    gray:{bg:"rgba(255,255,255,0.07)",t:"rgba(180,210,245,0.6)"},
    teal:{bg:"rgba(20,184,166,0.14)",t:"#5eead4"},
    purple:{bg:"rgba(167,139,250,0.14)",t:"#c4b5fd"},
  };
  const s = m[color]||m.gray;
  return <span style={{fontSize:11,padding:"2px 9px",borderRadius:20,fontWeight:600,background:s.bg,color:s.t}}>{children}</span>;
};

/* ── Interactive Expedition Radar Map ────────────────────────────────────── */
const MiniMap = ({
  position,
  accuracy,
  height = 360,
  adminLeader = RAJMACHI_ADMIN,
  teamMembers = RAJMACHI_MEMBERS,
  user,
  focusTarget,
}) => {
  const ref = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});
  const trailLineRef = useRef(null);
  const [rdy, setRdy] = useState(!!window.L);

  useEffect(() => {
    injectStyles();
    ensureLeaflet(() => setRdy(true));
  }, []);

  // Compute effective user position
  const effectiveUserPos = {
    lat: position?.lat ?? 18.8286,
    lon: position?.lon ?? 73.3986,
  };

  // Initialize Map
  useEffect(() => {
    if (!rdy || !ref.current || mapRef.current) return;
    const L = window.L;
    const map = L.map(ref.current, {
      center: [effectiveUserPos.lat, effectiveUserPos.lon],
      zoom: 15,
      zoomControl: true,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [rdy]); // eslint-disable-line react-hooks/exhaustive-deps

  // Render & Update all 6 expedition participants on the map
  useEffect(() => {
    if (!rdy || !mapRef.current) return;
    const L = window.L;
    const map = mapRef.current;

    // Clear old participant markers
    Object.values(markersRef.current).forEach((m) => {
      if (m && map.hasLayer(m)) map.removeLayer(m);
    });
    markersRef.current = {};

    const allPoints = [];

    // 1. Trail corridor dashed polyline
    const trailCoords = [
      [18.8229, 73.3932], // Kavita (Rear sweep)
      [18.8242, 73.3945], // Tanmay
      [18.8256, 73.3958], // Pooja
      [18.8271, 73.3971], // Rohan
      [effectiveUserPos.lat, effectiveUserPos.lon], // User (Anirban)
      [adminLeader.lat, adminLeader.lon], // Leader Ajay Saini
    ];

    if (trailLineRef.current && map.hasLayer(trailLineRef.current)) {
      map.removeLayer(trailLineRef.current);
    }
    trailLineRef.current = L.polyline(trailCoords, {
      color: "#f59e0b",
      weight: 3.5,
      opacity: 0.65,
      dashArray: "8 6",
    }).addTo(map).bindPopup("<b>Rajmachi Fort Expedition Corridor</b><br>Monsoon Trail Formation");

    // 2. Leader Marker (Ajay Saini)
    const leaderDist = calculateDistanceMeters(effectiveUserPos.lat, effectiveUserPos.lon, adminLeader.lat, adminLeader.lon);
    const leaderDir = getRelativeTrailDirection(adminLeader.lat, effectiveUserPos.lat);
    const leaderIcon = L.divIcon({
      className: "",
      html: `
        <div style="position:relative;width:38px;height:38px;display:flex;align-items:center;justify-content:center;">
          <div style="position:absolute;inset:0;border-radius:50%;background:#f59e0b;opacity:0.25;animation:utw-ring 2s ease-out infinite;"></div>
          <div style="width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg, #f59e0b, #d97706);border:2px solid #ffffff;box-shadow:0 0 12px rgba(245,158,11,0.7);display:flex;align-items:center;justify-content:center;font-size:15px;color:#fff;cursor:pointer;">
            👑
          </div>
        </div>
      `,
      iconSize: [38, 38],
      iconAnchor: [19, 19],
      popupAnchor: [0, -18],
    });

    const leaderMk = L.marker([adminLeader.lat, adminLeader.lon], { icon: leaderIcon }).addTo(map);
    leaderMk.bindPopup(`
      <div style="min-width:200px">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
          <span style="font-size:14px;font-weight:700;color:#fbbf24;">👑 ${adminLeader.name}</span>
          <span style="font-size:10px;padding:1px 6px;border-radius:8px;background:rgba(245,158,11,0.2);color:#fbbf24;font-weight:700;">LEADER</span>
        </div>
        <div style="font-size:11.5px;color:#cbd5e1;margin-bottom:6px;">${adminLeader.badge}</div>
        <div style="font-size:11px;background:rgba(245,158,11,0.12);padding:4px 8px;border-radius:6px;color:#fef08a;margin-bottom:6px;">
          📍 <strong>${formatDistance(leaderDist)} ${leaderDir}</strong> from you
        </div>
        <div style="font-size:11px;color:#94a3b8;line-height:1.6;">
          🏔️ Altitude: <strong>${adminLeader.altitude}m ASL</strong><br/>
          🔋 Battery: <strong>${adminLeader.battery}%</strong> · ❤️ HR: <strong>${adminLeader.heartRate} bpm</strong><br/>
          📞 <strong>${adminLeader.phone}</strong>
        </div>
      </div>
    `);
    markersRef.current["admin"] = leaderMk;
    allPoints.push([adminLeader.lat, adminLeader.lon]);

    // 3. Current User Marker ("You")
    const userIcon = L.divIcon({
      className: "",
      html: `
        <div style="position:relative;width:36px;height:36px;display:flex;align-items:center;justify-content:center;">
          <div style="position:absolute;inset:0;border-radius:50%;border:2px solid #3b82f6;animation:utw-ring 1.8s ease-out infinite;"></div>
          <div style="width:24px;height:24px;border-radius:50%;background:#3b82f6;border:2px solid #ffffff;box-shadow:0 0 10px rgba(59,130,246,0.6);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#ffffff;cursor:pointer;">
            YOU
          </div>
        </div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      popupAnchor: [0, -18],
    });

    const userMk = L.marker([effectiveUserPos.lat, effectiveUserPos.lon], { icon: userIcon }).addTo(map);
    userMk.bindPopup(`
      <div style="min-width:180px">
        <div style="font-size:13px;font-weight:700;color:#60a5fa;margin-bottom:2px;">📍 You (${user?.name || "Trekker"})</div>
        <div style="font-size:11px;color:#94a3b8;margin-bottom:6px;">Current Elevation: 829m ASL</div>
        <div style="font-size:11px;color:#cbd5e1;line-height:1.5;">
          ${effectiveUserPos.lat.toFixed(5)}°N, ${effectiveUserPos.lon.toFixed(5)}°E<br/>
          ${accuracy ? `GPS Accuracy: ±${accuracy.toFixed(0)}m` : "GPS active"}
        </div>
      </div>
    `);
    markersRef.current["user"] = userMk;
    allPoints.push([effectiveUserPos.lat, effectiveUserPos.lon]);

    // 4. Other Team Members
    const otherMembers = teamMembers.filter((m) => m.id !== user?.id && m.userId !== user?.id);
    otherMembers.forEach((m) => {
      const dist = calculateDistanceMeters(effectiveUserPos.lat, effectiveUserPos.lon, m.lat, m.lon);
      const dir = getRelativeTrailDirection(m.lat, effectiveUserPos.lat);
      const color = m.color ? m.color[0] : "#10b981";

      const memberIcon = L.divIcon({
        className: "",
        html: `
          <div style="width:28px;height:28px;border-radius:50%;background:${color};border:2px solid #ffffff;box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-size:10.5px;font-weight:700;color:#ffffff;cursor:pointer;">
            ${m.avatar || "TR"}
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popupAnchor: [0, -14],
      });

      const mk = L.marker([m.lat, m.lon], { icon: memberIcon }).addTo(map);
      mk.bindPopup(`
        <div style="min-width:190px">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
            <strong style="font-size:13px;color:#ffffff">${m.name}</strong>
            <span style="font-size:9.5px;padding:1px 6px;border-radius:6px;background:rgba(255,255,255,0.1);color:#cbd5e1">${m.badge}</span>
          </div>
          <div style="font-size:11px;background:rgba(59,130,246,0.12);padding:3px 7px;border-radius:6px;color:#93c5fd;margin-bottom:6px;">
            📍 <strong>${formatDistance(dist)} ${dir}</strong>
          </div>
          <div style="font-size:11px;color:#94a3b8;line-height:1.6;">
            Trail: <span style="color:#e2e8f0">${m.trailStatus}</span><br/>
            Altitude: <strong>${m.altitude}m</strong> · 🔋 <strong>${m.battery}%</strong> · ❤️ <strong>${m.heartRate} bpm</strong><br/>
            🩸 Blood: <strong>${m.blood}</strong> · Medical: ${m.medical}<br/>
            📞 <strong>${m.phone}</strong>
          </div>
        </div>
      `);
      markersRef.current[m.id] = mk;
      allPoints.push([m.lat, m.lon]);
    });

    // Fit map bounds on initial mount so all 6 are in view
    if (allPoints.length > 0 && !focusTarget) {
      map.fitBounds(allPoints, { padding: [40, 40], maxZoom: 16 });
    }
  }, [rdy, position?.lat, position?.lon, accuracy, user?.id, adminLeader, teamMembers]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pan to focus target when selected from list
  useEffect(() => {
    if (!rdy || !mapRef.current || !focusTarget) return;
    const map = mapRef.current;
    const { lat, lon, id } = focusTarget;
    if (lat && lon) {
      map.flyTo([lat, lon], 16, { duration: 0.8 });
      const mk = markersRef.current[id] || markersRef.current[id === "admin" ? "admin" : "user"];
      if (mk) {
        setTimeout(() => mk.openPopup(), 400);
      }
    }
  }, [rdy, focusTarget]);

  return (
    <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", border: `1px solid ${C.border}` }}>
      {!rdy && (
        <div style={{ height, background: "#08101e", display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: 13, gap: 8 }}>
          <span style={{ animation: "utw-spin 1s linear infinite", display: "inline-block" }}>⟳</span>
          Loading map engine…
        </div>
      )}
      <div ref={ref} style={{ height, display: rdy ? "block" : "none" }} />

      {/* Floating Map Legend Overlay */}
      <div
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          zIndex: 900,
          background: "rgba(11, 20, 34, 0.92)",
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          padding: "8px 12px",
          pointerEvents: "none",
          backdropFilter: "blur(4px)",
          fontSize: 10.5,
          color: C.muted,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span>👑</span> <strong style={{ color: "#fbbf24" }}>Leader Ajay Saini</strong>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#3b82f6", border: "1px solid #fff" }} />
          <strong style={{ color: "#60a5fa" }}>You (Current Position)</strong>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", border: "1px solid #fff" }} />
          <span>Team Members (4 nearby)</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 14, borderTop: "2px dashed #f59e0b" }} />
          <span>Rajmachi Trail Corridor</span>
        </div>
      </div>
    </div>
  );
};

/* ── Connection status dot ───────────────────────────────────────────────── */
const ConnectionDot = ({ state }) => {
  const cfg = {
    connected:    { color:C.green,  label:"Connected"   },
    connecting:   { color:C.amber,  label:"Connecting…" },
    error:        { color:C.red,    label:"Error"       },
    disconnected: { color:C.muted,  label:"Offline"     },
  };
  const { color, label } = cfg[state] || cfg.disconnected;
  return (
    <div style={{display:"flex",alignItems:"center",gap:6,fontSize:11}}>
      <div style={{width:7,height:7,borderRadius:"50%",background:color,
        animation:state==="connected"?"utw-pulse 2s infinite":undefined}}/>
      <span style={{color}}>{label}</span>
    </div>
  );
};

/* ── Main UserTrackingWidget Component ───────────────────────────────────── */
export default function UserTrackingWidget({
  user,
  joinedTrip,
  serverUrl = "http://localhost:4000",
  token     = "REPLACE_WITH_JWT",
  activeSOS = false,
  onSOS,
  onTokenExpired,
}) {
  const [showPrivacyNote, setShowPrivacyNote] = useState(false);
  const [sosConfirm,      setSosConfirm]      = useState(false);
  const [focusTarget,     setFocusTarget]     = useState(null);

  const tracking = useLocationTracking({
    userId:    user?.id    || "U001",
    name:      user?.name  || "Explorer",
    token,
    serverUrl,
    onSOSAck:  (d) => console.log("[SOS ack]", d),
    onTokenExpired,
  });

  const {
    isTracking, permissionState, position, accuracy, error,
    connectionState, sosActive, lastUpdateTs, isHttps, swRegistered,
    startTracking, stopTracking, triggerSOS, cancelSOS,
  } = tracking;

  const handleToggle = () => {
    if (isTracking) stopTracking();
    else            startTracking();
  };

  const handleSOS = () => {
    // Single SOS path: the root safety modal (2 steps + 3s hold) owns dispatch.
    setSosConfirm(false);
    onSOS?.(true);
  };

  const handleCancelSOS = () => {
    cancelSOS();
    setSosConfirm(false);
    onSOS?.(false);
  };

  const fmtTs = (ts) => ts ? new Date(ts).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",second:"2-digit"}) : "Never";

  // Real position only — never place the trekker on the map at a guess.
  const userLat = position?.lat != null && Number.isFinite(Number(position.lat)) ? position.lat : null;
  const userLon = position?.lon != null && Number.isFinite(Number(position.lon)) ? position.lon : null;
  const hasUserFix =
    userLat !== null &&
    userLon !== null &&
    !(Math.abs(userLat) < 1e-6 && Math.abs(userLon) < 1e-6);

  // Calculate distance from user to leader Ajay Saini
  const distToLeader = hasUserFix
    ? calculateDistanceMeters(userLat, userLon, RAJMACHI_ADMIN.lat, RAJMACHI_ADMIN.lon)
    : null;
  const dirToLeader = hasUserFix ? getRelativeTrailDirection(RAJMACHI_ADMIN.lat, userLat) : "";

  return (
    <div style={{fontFamily:"system-ui,sans-serif",color:C.text}}>

      {/* ── HTTPS warning ──────────────────────────────────────────────────── */}
      {!isHttps && (
        <div style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.35)",
          borderRadius:12,padding:"12px 16px",marginBottom:16,fontSize:12,color:"#fca5a5",
          display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:18}}>⚠️</span>
          <span>
            <strong>HTTPS required for hardware GPS:</strong> Geolocation API is restricted on insecure origins. Currently displaying calibrated trail positions.
          </span>
        </div>
      )}

      {/* ── Group Safety Proximity Banner ─────────────────────────────────── */}
      <div
        style={{
          background: "linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(11, 20, 34, 0.95))",
          border: "1px solid rgba(16, 185, 129, 0.35)",
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
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "rgba(16, 185, 129, 0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
            }}
          >
            🧭
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                Rajmachi Team Formation · sample roster
              </span>
              <Pill color="amber">◐ Demo formation</Pill>
            </div>
            <div style={{ fontSize: 12, color: C.muted }}>
              {hasUserFix ? (
                <>
                  Expedition Leader <strong style={{ color: "#fbbf24" }}>Ajay Saini</strong> is <strong>{formatDistance(distToLeader)} {dirToLeader}</strong> · 4 other trekkers within <strong>870m</strong>{" "}
                </>
              ) : (
                <>Your own GPS fix is pending, so distances are unknown. </>
              )}
              <span style={{ color: "#fcd34d" }}>(sample data — only your own marker is live)</span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            onClick={() => setFocusTarget({ lat: RAJMACHI_ADMIN.lat, lon: RAJMACHI_ADMIN.lon, id: "admin" })}
            style={{
              background: "rgba(245, 158, 11, 0.15)",
              border: "1px solid rgba(245, 158, 11, 0.4)",
              borderRadius: 8,
              color: "#fbbf24",
              fontSize: 12,
              fontWeight: 600,
              padding: "7px 12px",
              cursor: "pointer",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            👑 Locate Leader Ajay Saini
          </button>
          <button
            type="button"
            onClick={() => hasUserFix && setFocusTarget({ lat: userLat, lon: userLon, id: "user" })}
            disabled={!hasUserFix}
            title={hasUserFix ? "Centre the map on your live position" : "Waiting for a GPS fix"}
            style={{
              background: "rgba(59, 130, 246, 0.15)",
              border: "1px solid rgba(59, 130, 246, 0.4)",
              borderRadius: 8,
              color: "#60a5fa",
              fontSize: 12,
              fontWeight: 600,
              padding: "7px 12px",
              cursor: "pointer",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            📍 Center on You
          </button>
        </div>
      </div>

      {/* ── Main Tracking Grid ────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 310px", gap: 14, marginBottom: 20 }}>
        {/* Left: Map */}
        <div>
          <MiniMap
            position={position}
            accuracy={accuracy}
            height={380}
            adminLeader={RAJMACHI_ADMIN}
            teamMembers={RAJMACHI_MEMBERS}
            user={user}
            focusTarget={focusTarget}
          />
          {/* Coordinates and timestamp strip */}
          <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 11, color: C.muted2, flexWrap: "wrap", alignItems: "center" }}>
            <span>
              Your Coords:{" "}
              <strong style={{ color: hasUserFix ? C.text : "#fca5a5", fontFamily: "monospace" }}>
                {hasUserFix ? `${userLat.toFixed(5)}°N, ${userLon.toFixed(5)}°E` : "No GPS fix yet"}
              </strong>
            </span>
            {accuracy && <span>Accuracy: ±<strong style={{ color: C.amber }}>{accuracy.toFixed(0)}m</strong></span>}
            <span>Elevation: <strong style={{ color: "#34d399" }}>{Number.isFinite(Number(position?.altitude)) ? `${Math.round(position.altitude)}m ASL` : "—"}</strong></span>
            <span style={{ marginLeft: "auto" }}>Last sync: <strong style={{ color: C.text }}>{fmtTs(lastUpdateTs)}</strong></span>
          </div>
        </div>

        {/* Right: Quick Controls & Status */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Tracking toggle */}
          <Card style={{ borderColor: isTracking ? "rgba(34,197,94,0.35)" : C.border }}>
            <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>
              Live GPS Broadcast
            </div>

            <button
              onClick={handleToggle}
              disabled={!isHttps || permissionState === "unsupported"}
              style={{
                width: "100%",
                padding: "11px",
                background: isTracking ? "rgba(239,68,68,0.12)" : `linear-gradient(135deg,${C.accent},#1d4ed8)`,
                border: isTracking ? "1px solid rgba(239,68,68,0.35)" : "none",
                borderRadius: 10,
                color: isTracking ? "#fca5a5" : "#fff",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              {isTracking ? "⏹ Stop Live GPS Sharing" : "▶ Start Live GPS Broadcast"}
            </button>

            {isTracking ? (
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.green }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: C.green, animation: "utw-pulse 1.2s infinite" }} />
                Broadcasting coordinates to leader & team
              </div>
            ) : (
              <div style={{ marginTop: 8, fontSize: 11, color: C.muted2 }}>
                Tapping start streams high-accuracy GPS coordinates to Guide Ajay Saini and fellow trekkers.
              </div>
            )}
          </Card>

          {/* Leader Telemetry Snapshot */}
          <Card style={{ borderColor: "rgba(245, 158, 11, 0.35)", background: "rgba(245, 158, 11, 0.04)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ fontSize: 11, color: "#fbbf24", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700 }}>
                Expedition Leader
              </div>
              <span style={{ fontSize: 10, color: "#fcd34d", fontWeight: 600 }}>◐ Sample</span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 2 }}>
              Ajay Saini
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>
              {RAJMACHI_ADMIN.badge}
            </div>
            <div style={{ fontSize: 12, color: "#fbbf24", fontWeight: 600, marginBottom: 8 }}>
              📍 {formatDistance(distToLeader)} {dirToLeader} (Ridge Lead)
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 11, color: C.muted }}>
              <div>Alt: <strong style={{ color: C.text }}>842m</strong></div>
              <div>Battery: <strong style={{ color: "#34d399" }}>95%</strong></div>
              <div>HR: <strong style={{ color: C.text }}>76 bpm</strong></div>
              <div>VHF: <strong style={{ color: C.text }}>145.500</strong></div>
            </div>
            <div style={{ fontSize: 10, color: "#fcd34d", marginTop: 6 }}>
              ◐ Sample leader telemetry — no live link to the guide device.
            </div>
          </Card>

          {/* Emergency SOS button */}
          <Card style={{ borderColor: "rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.04)" }}>
            <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
              Emergency SAR SOS
            </div>
            {sosConfirm && (
              <div style={{ marginBottom: 8, background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 6, padding: "6px 8px", fontSize: 11, color: "#fcd34d" }}>
                ⚠️ Opens the safety confirmation and 3-second hold before anything is transmitted.
              </div>
            )}
            <button
              onClick={handleSOS}
              style={{
                width: "100%",
                padding: "9px",
                background: (sosActive || activeSOS) ? "rgba(239,68,68,0.2)" : sosConfirm ? "linear-gradient(135deg,#f59e0b,#d97706)" : "linear-gradient(135deg,#ef4444,#b91c1c)",
                border: "none",
                borderRadius: 8,
                color: "#ffffff",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {(sosActive || activeSOS) ? "🚨 SOS Broadcast Active" : "🆘 Emergency SOS Beacon"}
            </button>
          </Card>
        </div>
      </div>

      {/* ── EXPEDITION TEAM MEMBERS & LEADER LIVE RADAR ────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>👥</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
              Expedition Group Live Radar (5 Members + 1 Guide)
            </span>
            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, background: "rgba(59,130,246,0.15)", color: "#60a5fa", fontWeight: 600 }}>
              Batch 12 · Rajmachi
            </span>
          </div>
          <span style={{ fontSize: 12, color: C.muted }}>
            Distances calculated relative to <strong>your current position</strong>
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
          {/* Card 1: Leader Ajay Saini */}
          <Card
            style={{
              background: "linear-gradient(135deg, rgba(245, 158, 11, 0.08), rgba(11, 20, 34, 0.95))",
              borderColor: "rgba(245, 158, 11, 0.4)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: "rgba(245, 158, 11, 0.2)",
                    border: "1px solid rgba(245, 158, 11, 0.4)",
                    color: "#fbbf24",
                    fontSize: 16,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                  }}
                >
                  👑
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                    {RAJMACHI_ADMIN.name}
                  </div>
                  <div style={{ fontSize: 11, color: "#fbbf24", fontWeight: 600 }}>
                    {RAJMACHI_ADMIN.badge}
                  </div>
                </div>
              </div>
              <Pill color="amber">{formatDistance(distToLeader)} {dirToLeader}</Pill>
            </div>

            <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 8, lineHeight: 1.5 }}>
              Status: <strong style={{ color: "#fef08a" }}>{RAJMACHI_ADMIN.trailStatus}</strong><br/>
              Alt: <strong>{RAJMACHI_ADMIN.altitude}m</strong> · 🔋 <strong>{RAJMACHI_ADMIN.battery}%</strong> · ❤️ <strong>{RAJMACHI_ADMIN.heartRate} bpm</strong>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
              <span style={{ fontSize: 11, color: C.muted2 }}>📞 {RAJMACHI_ADMIN.phone}</span>
              <button
                type="button"
                onClick={() => setFocusTarget({ lat: RAJMACHI_ADMIN.lat, lon: RAJMACHI_ADMIN.lon, id: "admin" })}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#60a5fa",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                🎯 Show on Map →
              </button>
            </div>
          </Card>

          {/* Card 2: Current User (You) */}
          <Card
            style={{
              background: "linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(11, 20, 34, 0.95))",
              borderColor: "rgba(59, 130, 246, 0.4)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: "rgba(59, 130, 246, 0.2)",
                    border: "1px solid rgba(59, 130, 246, 0.4)",
                    color: "#60a5fa",
                    fontSize: 12,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                  }}
                >
                  YOU
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                    {user?.name || "Anirban Panda"}
                  </div>
                  <div style={{ fontSize: 11, color: "#60a5fa", fontWeight: 600 }}>
                    Active Trekker (Your Position)
                  </div>
                </div>
              </div>
              <Pill color={hasUserFix ? "blue" : "amber"}>{hasUserFix ? "● You are Here" : "◐ GPS fix pending"}</Pill>
            </div>

            <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 8, lineHeight: 1.5 }}>
              Status: <strong style={{ color: "#93c5fd" }}>{isTracking ? "Tracking on (location sharing)" : "Tracking paused"}</strong><br/>
              Alt: <strong>{Number.isFinite(Number(position?.altitude)) ? `${Math.round(position.altitude)}m` : "—"}</strong> · 🔋 <strong>—</strong> · ❤️ <strong>—</strong>{" "}
              <span style={{ color: "#fcd34d" }}>(no device linked)</span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
              <span style={{ fontSize: 11, color: C.muted2 }}>🩸 Blood: {user?.blood || "B+"}</span>
              <button
                type="button"
                onClick={() => hasUserFix && setFocusTarget({ lat: userLat, lon: userLon, id: "user" })}
                disabled={!hasUserFix}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#60a5fa",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: hasUserFix ? "pointer" : "not-allowed",
                  opacity: hasUserFix ? 1 : 0.5,
                }}
              >
                🎯 Show on Map →
              </button>
            </div>
          </Card>

          {/* Cards 3 to 6: The 4 other expedition members */}
          {RAJMACHI_MEMBERS.filter((m) => m.id !== user?.id && m.userId !== user?.id).map((member) => {
            const dist = hasUserFix ? calculateDistanceMeters(userLat, userLon, member.lat, member.lon) : null;
            const dir = hasUserFix ? getRelativeTrailDirection(member.lat, userLat) : "";
            const color = member.color ? member.color[0] : "#10b981";

            return (
              <Card key={member.id} style={{ borderColor: C.border }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        background: `${color}20`,
                        border: `1px solid ${color}60`,
                        color: color,
                        fontSize: 12,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                      }}
                    >
                      {member.avatar}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                        {member.name}
                      </div>
                      <div style={{ fontSize: 11, color: C.muted }}>
                        {member.badge}
                      </div>
                    </div>
                  </div>
                  <Pill color="teal">{formatDistance(dist)} {dir}</Pill>
                </div>

                <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 8, lineHeight: 1.5 }}>
                  Status: <strong style={{ color: C.text }}>{member.trailStatus}</strong><br/>
                  Alt: <strong>{member.altitude}m</strong> · 🔋 <strong>{member.battery}%</strong> · ❤️ <strong>{member.heartRate} bpm</strong>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
                  <span style={{ fontSize: 11, color: C.muted2 }}>📞 {member.phone}</span>
                  <button
                    type="button"
                    onClick={() => setFocusTarget({ lat: member.lat, lon: member.lon, id: member.id })}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#60a5fa",
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    🎯 Show on Map →
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
