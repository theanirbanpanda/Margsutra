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
export const broadcastSOSBeacon = async (user, trip, location = {}) => {
  if (!user?.id) return { success: false, error: "No user authenticated" };
  
  // 1. Immediately sound alarm & vibration buzzer on phone
  alarmEngine.start();

  const now = new Date().toISOString();
  const eventId = `sos_${user.id}_${Date.now()}`;
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
    lat: Number(location.lat) || user.lat || 18.8286,
    lon: Number(location.lon) || user.lon || 73.3986,
    altitude: Number(location.altitude) || user.altitude || 829,
    tripId: trip?.id || trip?.tripId || "trip-001",
    tripName: trip?.name || "Rajmachi Fort Expedition",
    tripCode: trip?.code || "RAJM26",
    status: "active",
    type: "Manual SOS Beacon",
    priority: "critical",
    message: "Emergency SOS broadcast activated from mobile app",
    timestamp: now,
    createdAt: now,
    updatedAt: now,
  };

  // 2. Emit instantly over Socket.IO to port 4000 (reaches admin in <30ms)
  try {
    const socket = getSocket(user);
    socket.emit("sos-trigger", {
      ...payload,
      meta: { source: "user-app-sos-button" }
    });
  } catch (err) {
    console.warn("[SOS Socket] Emit failed:", err);
  }

  // 3. Post to Core REST API (port 5050)
  try {
    await fetch(`${BACKEND_URL}/api/sos/trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn("[SOS API] Post failed:", err);
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
  } catch (err) {
    console.warn("[SOS Firestore] Direct write backup error:", err);
  }

  return { success: true, eventId, payload };
};

// ── 4. SOS Cancellation & Stand-Down ─────────────────────────────────────────
export const cancelSOSBeacon = async (user, activeSosId = null, reason = "user_cancelled") => {
  const userId = user?.id || user;
  if (!userId) return { success: false };

  // 1. Immediately silence buzzer and play safe chime
  alarmEngine.stop();
  alarmEngine.playResolutionChime();

  const now = new Date().toISOString();

  // 2. Emit cancel event over Socket.IO to port 4000
  try {
    const socket = getSocket(user);
    socket.emit("sos-cancel");
  } catch (err) {
    console.warn("[SOS Socket] Cancel emit failed:", err);
  }

  // 3. Post cancellation to REST API
  try {
    await fetch(`${BACKEND_URL}/api/sos/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, activeSosId, reason }),
    });
  } catch (err) {
    console.warn("[SOS API] Cancel post failed:", err);
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
  } catch (err) {
    console.warn("[SOS Firestore] Cancel write error:", err);
  }

  return { success: true };
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

