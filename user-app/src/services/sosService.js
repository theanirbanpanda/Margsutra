/**
 * sosService.js — Margsutra Emergency Distress & Audio Signaling Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides:
 *  1. Web Audio API emergency siren & vibration buzzer
 *  2. Dual-channel real-time dispatch (Socket.IO + REST API + Firestore)
 *  3. Live cancellation and sync between User App and Admin Dispatch
 */

import { io } from "socket.io-client";
import { db } from "./firebase";
import { doc, setDoc, onSnapshot, query, collection, where, getDocs } from "firebase/firestore";

const BACKEND_URL = "http://localhost:5050";
const TRACKING_URL = "http://localhost:4000";

// ── 1. Web Audio API Mountain Siren & Haptic Engine ──────────────────────────
class EmergencyAlarmEngine {
  constructor() {
    this.ctx = null;
    this.interval = null;
    this.vibeInterval = null;
    this.isPlaying = false;
  }

  start() {
    if (this.isPlaying) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      if (this.ctx.state === "suspended") {
        this.ctx.resume();
      }
      this.isPlaying = true;

      let highTone = true;
      const beep = () => {
        if (!this.isPlaying || !this.ctx) return;
        try {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = "sawtooth";
          osc.frequency.setValueAtTime(highTone ? 880 : 660, this.ctx.currentTime);
          
          gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.28);
          
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          
          osc.start();
          osc.stop(this.ctx.currentTime + 0.3);
          highTone = !highTone;
        } catch {}
      };

      beep();
      this.interval = setInterval(beep, 350);

      // Mobile physical vibration buzzer
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate([400, 150, 400, 150, 600]);
        this.vibeInterval = setInterval(() => {
          if (this.isPlaying) {
            navigator.vibrate([400, 150, 400, 150, 600]);
          }
        }, 1800);
      }
    } catch (err) {
      console.warn("[SOS Audio] Unable to initialize Web Audio alarm:", err);
    }
  }

  stop() {
    this.isPlaying = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (this.vibeInterval) {
      clearInterval(this.vibeInterval);
      this.vibeInterval = null;
    }
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(0);
    }
    if (this.ctx) {
      try {
        this.ctx.close();
      } catch {}
      this.ctx = null;
    }
  }

  playResolutionChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.15); // E5
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch {}
  }
}

export const alarmEngine = new EmergencyAlarmEngine();

// ── 2. Socket.IO Telemetry Pipe ──────────────────────────────────────────────
let trackingSocket = null;

function getSocket(user) {
  if (trackingSocket && trackingSocket.connected) return trackingSocket;
  const token = localStorage.getItem("margsutra_tracking_token") || localStorage.getItem("margsutra_user_token");
  
  trackingSocket = io(TRACKING_URL, {
    auth: { token, userId: user?.id, name: user?.name },
    query: { userId: user?.id, name: user?.name, token },
    transports: ["websocket", "polling"],
    reconnection: true,
  });

  return trackingSocket;
}

// ── 3. SOS Trigger Dispatch ──────────────────────────────────────────────────
// Safety rule: an SOS is only reported as delivered when at least one transport
// actually accepted it. If every transport fails (the classic 0-signal mountain
// case), the payload is persisted locally and retried on reconnect.
const SOS_OUTBOX_KEY = "margsutra_sos_outbox";
const SOS_TIMEOUT_MS = 8000;

const readOutbox = () => {
  try {
    const raw = localStorage.getItem(SOS_OUTBOX_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeOutbox = (items) => {
  try {
    localStorage.setItem(SOS_OUTBOX_KEY, JSON.stringify(items));
  } catch {
    /* storage unavailable — delivery state is still surfaced to the UI */
  }
};

const queueForRetry = (payload) => {
  const outbox = readOutbox().filter((item) => item?.id !== payload.id);
  outbox.push({ ...payload, queuedAt: new Date().toISOString() });
  writeOutbox(outbox);
  return outbox.length;
};

const postWithTimeout = async (url, body) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SOS_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
};

export const getSOSOutboxCount = () => readOutbox().length;

export const flushSOSOutbox = async () => {
  const outbox = readOutbox();
  if (!outbox.length) return { flushed: 0, remaining: 0 };
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { flushed: 0, remaining: outbox.length };
  }

  const remaining = [];
  let flushed = 0;
  for (const item of outbox) {
    try {
      const res = await postWithTimeout(`${BACKEND_URL}/api/sos/trigger`, item);
      if (res.ok) flushed += 1;
      else remaining.push(item);
    } catch {
      remaining.push(item);
    }
  }
  writeOutbox(remaining);
  return { flushed, remaining: remaining.length };
};

export const broadcastSOSBeacon = async (user, trip, location = {}) => {
  if (!user?.id) return { success: false, delivered: false, error: "No user authenticated" };

  // 1. Immediately sound alarm & vibration buzzer on phone
  alarmEngine.start();

  const now = new Date().toISOString();
  const eventId = `sos_${user.id}_${Date.now()}`;

  // Location provenance — never present a fallback as a live GPS fix.
  const asNum = (v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const usableCoord = (la, lo) =>
    la !== null && lo !== null && !(Math.abs(la) < 1e-6 && Math.abs(lo) < 1e-6);

  const lat = asNum(location?.lat);
  const lon = asNum(location?.lon);
  const hasFix = usableCoord(lat, lon) && (location?.source || "live") !== "none";
  const profileLat = asNum(user?.lat);
  const profileLon = asNum(user?.lon);
  const hasProfile = usableCoord(profileLat, profileLon);
  const locationSource = hasFix
    ? location?.source || "live"
    : hasProfile
      ? "profile"
      : "unknown";
  const resolvedLat = hasFix ? lat : hasProfile ? profileLat : null;
  const resolvedLon = hasFix ? lon : hasProfile ? profileLon : null;
  const resolvedAlt = asNum(location?.altitude) ?? asNum(user?.altitude);

  const payload = {
    id: eventId,
    userId: user.id,
    name: user.name || "Trekker",
    email: user.email || "",
    phone: user.phone || "",
    blood: user.blood || "B+",
    medical: user.medical || "None",
    ec1Name: user.ec1Name || "",
    ec1Rel: user.ec1Rel || "Family",
    ec1Ph: user.ec1Ph || "",
    lat: resolvedLat,
    lon: resolvedLon,
    altitude: resolvedAlt,
    locationSource,
    locationAgeSec: asNum(location?.ageSec),
    accuracy: asNum(location?.accuracy),
    tripId: trip?.id || trip?.tripId || null,
    tripName: trip?.name || "Rajmachi Fort Expedition",
    tripCode: trip?.code || null,
    status: "active",
    type: "Manual SOS Beacon",
    priority: "critical",
    message: "Emergency SOS broadcast activated from mobile app",
    timestamp: now,
    createdAt: now,
    updatedAt: now,
  };

  const channels = { socket: false, api: false, firestore: false };
  const errors = [];

  // 2. Emit over Socket.IO to port 4000 (buffered by the client if reconnecting)
  try {
    const socket = getSocket(user);
    socket.emit("sos-trigger", {
      ...payload,
      meta: { source: "user-app-sos-button", locationSource },
    });
    channels.socket = Boolean(socket?.connected);
    if (!channels.socket) errors.push("socket offline (event buffered)");
  } catch (err) {
    errors.push(`socket: ${err?.message || "emit failed"}`);
  }

  // 3. Post to Core REST API (port 5050)
  try {
    const res = await postWithTimeout(`${BACKEND_URL}/api/sos/trigger`, payload);
    channels.api = res.ok;
    if (!res.ok) errors.push(`api: HTTP ${res.status}`);
  } catch (err) {
    errors.push(`api: ${err?.name === "AbortError" ? "timeout" : err?.message || "failed"}`);
  }

  // 4. Update Firestore directly as backup
  try {
    await setDoc(doc(db, "sos_events", eventId), payload, { merge: true });
    await setDoc(doc(db, "users", user.id), {
      status: "sos",
      activeSosId: eventId,
      lastSosAt: now,
      updatedAt: now,
    }, { merge: true });
    channels.firestore = true;
  } catch (err) {
    errors.push(`firestore: ${err?.message || "write failed"}`);
  }

  const delivered = channels.api || channels.firestore || channels.socket;
  let queued = 0;
  if (!delivered) {
    queued = queueForRetry(payload);
    console.warn("[SOS] All transports failed — queued for retry:", payload.id);
  }

  return {
    success: delivered,
    delivered,
    eventId,
    payload,
    channels,
    queued,
    errors,
    locationSource,
  };
};

// ── 4. SOS Cancellation & Stand-Down ─────────────────────────────────────────
export const cancelSOSBeacon = async (user, activeSosId = null, reason = "user_cancelled") => {
  const userId = user?.id || user;
  if (!userId) return { success: false };

  // 1. Immediately silence buzzer and play safe chime
  alarmEngine.stop();
  alarmEngine.playResolutionChime();

  const now = new Date().toISOString();

  const channels = { socket: false, api: false, firestore: false };

  // 2. Emit cancel event over Socket.IO to port 4000
  try {
    const socket = getSocket(user);
    socket.emit("sos-cancel");
    channels.socket = Boolean(socket?.connected);
  } catch (err) {
    console.warn("[SOS Socket] Cancel emit failed:", err);
  }

  // 3. Post cancellation to REST API
  try {
    const res = await postWithTimeout(`${BACKEND_URL}/api/sos/cancel`, {
      userId,
      activeSosId,
      reason,
    });
    channels.api = res.ok;
  } catch (err) {
    console.warn("[SOS API] Cancel post failed:", err);
  }

  // Remove any queued beacon for this incident so a stand-down is never
  // resurrected by the retry loop.
  if (activeSosId) {
    writeOutbox(readOutbox().filter((item) => item?.id !== activeSosId));
  }

  // 4. Update Firestore directly as backup
  try {
    if (activeSosId) {
      await setDoc(doc(db, "sos_events", activeSosId), {
        status: "resolved",
        resolution: reason,
        resolutionNotes: "Trekker cancelled SOS beacon (Self-Resolved / False Alarm)",
        resolvedAt: now,
        updatedAt: now,
      }, { merge: true });
    } else {
      const q = query(
        collection(db, "sos_events"),
        where("userId", "==", userId),
        where("status", "==", "active")
      );
      const snap = await getDocs(q);
      for (const d of snap.docs) {
        await setDoc(d.ref, {
          status: "resolved",
          resolution: reason,
          resolutionNotes: "Trekker cancelled SOS beacon (Self-Resolved / False Alarm)",
          resolvedAt: now,
          updatedAt: now,
        }, { merge: true });
      }
    }

    await setDoc(doc(db, "users", userId), {
      status: "active",
      activeSosId: null,
      updatedAt: now,
    }, { merge: true });
    channels.firestore = true;
  } catch (err) {
    console.warn("[SOS Firestore] Cancel write error:", err);
  }

  const confirmed = channels.api || channels.firestore || channels.socket;
  return { success: confirmed, confirmed, channels };
};

// ── 5. Real-Time Remote Stand-Down Listener ──────────────────────────────────
export const subscribeToSOSResolution = (userId, onRemoteResolved) => {
  if (!userId) return () => {};
  return onSnapshot(doc(db, "users", userId), (snapshot) => {
    const data = snapshot.data();
    if (data && data.status === "active" && !data.activeSosId) {
      // Remote Admin stood down or resolved the SOS
      alarmEngine.stop();
      if (onRemoteResolved) onRemoteResolved();
    }
  }, (err) => {
    console.warn("[SOS Listener] User status listener error:", err);
  });
};

