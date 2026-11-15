import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocationTracking } from "./useLocationTracking";
import { subscribeToFieldTelemetry } from "./services/firebase";
import { calculateDistanceMeters, formatDistance } from "./services/expeditionTeam";
import { getDemoTrackingData, isDemoTrackingAccount, toFreshPosition } from "./services/trackingDemoData";

const API =
  import.meta.env.VITE_AUTH_API_URL ||
  (import.meta.env.DEV ? "http://localhost:5050/api" : "/api");
const palette = { bg: "#080f1a", card: "rgba(255,255,255,.04)", line: "rgba(80,140,220,.16)", text: "#e2e8f0", muted: "#94a3b8", blue: "#60a5fa", green: "#34d399", amber: "#fbbf24" };

function TrackingMap({ center, route, waypoints, people, focusId, tripName }) {
  const element = useRef(null);
  const map = useRef(null);
  const markers = useRef([]);
  const routeLayer = useRef(null);
  const [ready, setReady] = useState(!!window.L);

  useEffect(() => {
    if (window.L) { setReady(true); return undefined; }
    const cssId = "expedition-radar-leaflet-css";
    if (!document.getElementById(cssId)) {
      const css = document.createElement("link"); css.id = cssId; css.rel = "stylesheet";
      css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"; document.head.appendChild(css);
    }
    let poll;
    if (!document.getElementById("expedition-radar-leaflet-js")) {
      const script = document.createElement("script"); script.id = "expedition-radar-leaflet-js";
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.onload = () => setReady(true); document.body.appendChild(script);
    } else poll = setInterval(() => { if (window.L) { clearInterval(poll); setReady(true); } }, 100);
    return () => clearInterval(poll);
  }, []);

  useEffect(() => {
    if (!ready || !element.current || map.current) return undefined;
    const instance = window.L.map(element.current, { zoomControl: true }).setView(center, 14);
    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap contributors", maxZoom: 19 }).addTo(instance);
    map.current = instance;
    return () => { instance.remove(); map.current = null; };
  }, [ready]);

  useEffect(() => {
    if (!ready || !map.current) return;
    const L = window.L;
    const instance = map.current;
    markers.current.forEach((marker) => instance.removeLayer(marker));
    markers.current = [];
    if (routeLayer.current) { instance.removeLayer(routeLayer.current); routeLayer.current = null; }

    if (route?.length > 1) {
      routeLayer.current = L.polyline(route, { color: "#f59e0b", weight: 4, opacity: 0.85, dashArray: "9 7" }).addTo(instance);
      routeLayer.current.bindPopup(`<strong>${tripName || "Expedition"}</strong> · trek route`);
    }
    waypoints.forEach((point) => {
      const icon = L.divIcon({ className: "", html: `<div style="width:10px;height:10px;border-radius:50%;background:#f59e0b;border:2px solid #fff;box-shadow:0 0 8px #f59e0b99"></div>`, iconSize: [10, 10], iconAnchor: [5, 5] });
      const marker = L.marker([point.lat, point.lon], { icon }).addTo(instance).bindPopup(point.name);
      markers.current.push(marker);
    });
    people.forEach((person) => {
      if (!Number.isFinite(Number(person.lat)) || !Number.isFinite(Number(person.lon))) return;
      const hue = person.isGuide ? "#f59e0b" : person.isSelf ? "#3b82f6" : person.status === "sos" ? "#ef4444" : person.color || "#10b981";
      const initials = person.isGuide ? "★" : person.isSelf ? "YOU" : (person.avatar || person.name?.split(/\s+/).map((x) => x[0]).join("").slice(0, 2) || "TR");
      const width = person.isSelf ? 34 : 30;
      const icon = L.divIcon({ className: "", html: `<div style="width:${width}px;height:${width}px;border-radius:50%;display:grid;place-items:center;background:${hue};border:2px solid white;box-shadow:0 2px 10px #0009;color:white;font-size:${person.isSelf ? 8 : 12}px;font-weight:800">${initials}</div>`, iconSize: [width, width], iconAnchor: [width / 2, width / 2] });
      const marker = L.marker([person.lat, person.lon], { icon }).addTo(instance);
      marker.bindPopup(`<strong>${person.name}</strong><br>${person.role || "Trekker"}${person.altitude ? `<br>${Math.round(person.altitude)}m ASL` : ""}`);
      markers.current.push(marker);
      if (focusId && person.id === focusId) marker.openPopup();
    });
    const bounds = [];
    people.forEach((person) => { if (Number.isFinite(Number(person.lat)) && Number.isFinite(Number(person.lon))) bounds.push([Number(person.lat), Number(person.lon)]); });
    const focused = people.find((person) => person.id === focusId && Number.isFinite(Number(person.lat)) && Number.isFinite(Number(person.lon)));
    if (focused) instance.setView([focused.lat, focused.lon], 16);
    if (!focused && !bounds.length) route?.forEach((point) => bounds.push(point));
    if (!focused && bounds.length) instance.fitBounds(bounds, { padding: [38, 38], maxZoom: 15 });
    if (!focused && !bounds.length) instance.setView(center, 12);
  }, [ready, center[0], center[1], JSON.stringify(route), JSON.stringify(waypoints), JSON.stringify(people), focusId, tripName]);

  return <div className="user-tracking-map" style={{ position: "relative", height: 400, borderRadius: 12, overflow: "hidden", border: `1px solid ${palette.line}`, background: "#08101e" }}>
    {!ready && <div style={{ height: "100%", display: "grid", placeItems: "center", color: palette.muted }}>Loading trail map…</div>}
    <div className="user-tracking-map__leaflet" ref={element} style={{ height: "100%", display: ready ? "block" : "none" }} />
    <div style={{ position: "absolute", left: 12, top: 12, zIndex: 500, background: "#0b1422eF", padding: "9px 11px", borderRadius: 9, border: `1px solid ${palette.line}`, fontSize: 11, lineHeight: 1.7, color: palette.muted }}>
      <div><b style={{ color: "#fbbf24" }}>★</b> Expedition guide</div><div><b style={{ color: "#60a5fa" }}>YOU</b> Your location</div><div><b style={{ color: "#34d399" }}>●</b> Team members</div><div><b style={{ color: "#f59e0b" }}>┄</b> Trek route</div>
    </div>
  </div>;
}

export default function UserTrackingWidget({ user, joinedTrip, serverUrl, token, onTokenExpired }) {
  const [roster, setRoster] = useState([]);
  const [fieldNodes, setFieldNodes] = useState([]);
  const [clock, setClock] = useState(Date.now());
  const [focusId, setFocusId] = useState(null);
  const tracking = useLocationTracking({ userId: user?.id, name: user?.name, token, serverUrl, onTokenExpired });
  const { isTracking, permissionState, position, accuracy, isHttps, startTracking, lastUpdateTs } = tracking;
  const demo = isDemoTrackingAccount(user);
  const demoData = useMemo(() => demo ? getDemoTrackingData(joinedTrip, user) : null, [demo, joinedTrip?.code, joinedTrip?.id, user?.id, user?.name]);

  useEffect(() => {
    if (isHttps && token && permissionState !== "denied" && permissionState !== "unsupported" && !isTracking) startTracking();
  }, [isHttps, token, permissionState, isTracking, startTracking]);

  useEffect(() => {
    let cancelled = false;
    const tripId = joinedTrip?.id || joinedTrip?.tripId;
    setRoster([]);
    if (!tripId || demo) return undefined;
    fetch(`${API}/trips/${encodeURIComponent(tripId)}/roster`)
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (!cancelled) setRoster((data?.roster || []).filter((member) => member.status === "approved")); })
      .catch(() => { if (!cancelled) setRoster([]); });
    return () => { cancelled = true; };
  }, [joinedTrip?.id, joinedTrip?.tripId, demo]);

  useEffect(() => {
    const unsubscribe = subscribeToFieldTelemetry((nodes) => setFieldNodes(Array.isArray(nodes) ? nodes : []));
    const timer = setInterval(() => setClock(Date.now()), 5000);
    return () => { unsubscribe(); clearInterval(timer); };
  }, []);

  const lat = Number(position?.lat);
  const lon = Number(position?.lon);
  const phoneFix = Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0) && lastUpdateTs && clock - lastUpdateTs < 30000
    ? { lat, lon, timestamp: lastUpdateTs, accuracy, altitude: position?.altitude }
    : null;
  const ownNode = fieldNodes.find((node) => [node.userId, node.user_id, node.memberId, node.member_id, node.ownerId].some((value) => value && String(value) === String(user?.id)) || (node.email && String(node.email).toLowerCase() === String(user?.email || "").toLowerCase()));
  const loraFix = toFreshPosition(ownNode, clock);
  const activePosition = demo ? null : phoneFix || loraFix;
  const tripLat = Number(joinedTrip?.lat ?? joinedTrip?.geofence?.lat);
  const tripLon = Number(joinedTrip?.lon ?? joinedTrip?.geofence?.lon);
  const center = [Number.isFinite(tripLat) ? tripLat : 20.5937, Number.isFinite(tripLon) ? tripLon : 78.9629];

  const people = useMemo(() => {
    if (demoData) return [demoData.leader, ...demoData.participants];
    const at = (member) => fieldNodes.find((node) => [node.userId, node.user_id, node.memberId, node.member_id, node.ownerId].some((value) => value && String(value) === String(member.userId || member.id)) || (node.email && member.email && String(node.email).toLowerCase() === String(member.email).toLowerCase()));
    const group = roster.map((member) => {
      const fix = toFreshPosition(at(member), clock);
      const self = String(member.userId || member.id) === String(user?.id);
      return { ...member, id: member.userId || member.id, name: member.name || member.displayName || "Trekker", role: "Trekker", isSelf: self, ...(fix || (self ? activePosition : null) || {}) };
    });
    if (!group.some((member) => member.isSelf) && user?.id) group.unshift({ id: user.id, name: user.name || "You", role: "You", isSelf: true, ...(activePosition || {}) });
    const guideNode = fieldNodes.find((node) => /guide|admin/i.test(`${node.role || ""} ${node.node_id || node.nodeId || ""}`));
    const guideFix = toFreshPosition(guideNode, clock);
    const leader = guideFix ? { id: guideNode.node_id || "guide", name: joinedTrip?.leader || joinedTrip?.adminInChargeName || "Expedition Guide", role: "Expedition Guide", isGuide: true, ...guideFix } : null;
    return leader ? [leader, ...group] : group;
  }, [demoData, roster, fieldNodes, clock, activePosition, user?.id, user?.name, joinedTrip?.leader, joinedTrip?.adminInChargeName]);

  const own = people.find((person) => person.isSelf);
  const located = people.filter((person) => Number.isFinite(Number(person.lat)) && Number.isFinite(Number(person.lon)));
  const sourceLabel = demo ? "Expedition radar" : phoneFix ? "Phone GPS · live" : loraFix ? `ESP32 / LoRa · ${loraFix.rssi ?? "radio link"}` : "Signal strength insufficient — please move to a different area";
  const sourceColor = demo || phoneFix || loraFix ? palette.green : palette.amber;
  const route = demoData?.route || [];
  const waypoints = demoData?.waypoints || [];
  const focusPerson = (person) => setFocusId(person.id);

  return <div style={{ display: "grid", gap: 14, color: palette.text, fontFamily: "inherit" }}>
    <section style={{ padding: 16, borderRadius: 14, border: `1px solid ${palette.line}`, background: palette.card }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <div><div style={{ fontSize: 16, fontWeight: 750 }}>{joinedTrip?.name || "Expedition Live Tracking"}</div><div style={{ color: palette.muted, fontSize: 12, marginTop: 3 }}>{joinedTrip?.location || "Assigned expedition"} · {joinedTrip?.code || ""}</div></div>
        <div style={{ color: sourceColor, fontSize: 12, fontWeight: 700 }}>{sourceLabel}</div>
      </div>
      {!demo && !phoneFix && !loraFix && <div style={{ marginBottom: 12, fontSize: 12, color: palette.muted }}>Your location and team positions appear here as GPS or linked beacon fixes arrive.</div>}
      <TrackingMap center={center} route={route} waypoints={waypoints} people={people} focusId={focusId} tripName={joinedTrip?.name} />
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", paddingTop: 10, color: palette.muted, fontSize: 11.5 }}>
        {own && Number.isFinite(Number(own.lat)) && <span>You · {Number(own.lat).toFixed(5)}, {Number(own.lon).toFixed(5)}</span>}
        {phoneFix && <span>GPS accuracy ±{Math.round(phoneFix.accuracy || 0)}m</span>}
        {activePosition?.altitude != null && <span>{Math.round(activePosition.altitude)}m ASL</span>}
        {demo && <span>{located.length} team locations</span>}
      </div>
    </section>

    <section style={{ padding: 16, borderRadius: 14, border: `1px solid ${palette.line}`, background: palette.card }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 10 }}><div style={{ fontWeight: 750 }}>Expedition team</div><div style={{ color: palette.muted, fontSize: 11 }}>{located.length} with position · {people.filter((p) => !p.isGuide).length} trekkers</div></div>
      {people.length ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 9 }}>
        {people.map((person) => {
          const hasPosition = Number.isFinite(Number(person.lat)) && Number.isFinite(Number(person.lon));
          const distance = hasPosition && own && Number.isFinite(Number(own.lat)) ? formatDistance(calculateDistanceMeters(Number(own.lat), Number(own.lon), Number(person.lat), Number(person.lon))) : null;
          return <button key={person.id} type="button" onClick={() => hasPosition && focusPerson(person)} style={{ textAlign: "left", cursor: hasPosition ? "pointer" : "default", padding: "11px 12px", borderRadius: 10, border: `1px solid ${person.isSelf ? "rgba(59,130,246,.42)" : palette.line}`, background: person.isSelf ? "rgba(59,130,246,.07)" : "rgba(255,255,255,.02)", color: palette.text, font: "inherit" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}><span style={{ fontSize: 12.5, fontWeight: 700 }}>{person.isGuide ? "★ " : ""}{person.name}{person.isSelf ? " · You" : ""}</span><span style={{ fontSize: 10, color: person.status === "sos" ? "#fca5a5" : hasPosition ? palette.green : palette.muted }}>{person.status === "sos" ? "SOS" : hasPosition ? "● Located" : "No live fix"}</span></div>
            <div style={{ color: palette.muted, fontSize: 11, marginTop: 5 }}>{person.role || "Trekker"}{distance ? ` · ${distance} away` : ""}{hasPosition ? ` · ${Number(person.altitude || 0)}m` : ""}</div>
          </button>;
        })}
      </div> : <div style={{ color: palette.muted, fontSize: 12 }}>The approved roster will appear here when available.</div>}
    </section>
  </div>;
}
