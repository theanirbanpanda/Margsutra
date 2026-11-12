import { useState, useEffect, useRef } from "react";
import io from "socket.io-client";

/**
 * useAdminTracking
 * 
 * Admin-side custom hook to receive real-time user location updates
 * and SOS events from the Margsutra tracking server.
 * 
 * Returns: {
 *   liveUsers: Map<userId, { id, name, lat, lon, accuracy, timestamp, ... }>,
 *   liveDevices: Map<deviceId, { userId, lat, lon, battery, signal, ... }>,
 *   sosEvents: Array<{ userId, lat, lon, status, ... }>,
 *   connectionState: "connected" | "connecting" | "disconnected" | "error",
 *   error: string | null,
 * }
 */
export function useAdminTracking({ serverUrl = "http://localhost:4000" } = {}) {
  const [liveUsers, setLiveUsers] = useState(new Map());
  const [sosEvents, setSosEvents] = useState(new Map());
  const [connectionState, setConnectionState] = useState("disconnected");
  const [error, setError] = useState(null);
  const socketRef = useRef(null);
  const heartbeatRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 5;
    const RECONNECT_DELAY_MS = 2000;

    const connect = async () => {
      if (!mounted) return;

      // The tracking server requires a real token: the admin's API token is
      // exchanged for a tracking token whose role is resolved server-side.
      // (The old `?isAdmin=true` shortcut let anyone join the admin room.)
      let trackingToken = "";
      try {
        const apiToken = localStorage.getItem("margsutra_admin_token") || "";
        const res = await fetch(`${serverUrl}/auth/token`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(apiToken ? { Authorization: `Bearer ${apiToken}` } : {}),
          },
        });
        if (res.ok) {
          const data = await res.json();
          trackingToken = data?.token || "";
        }
      } catch (err) {
        console.warn("[Admin] Could not obtain tracking token:", err?.message || err);
      }

      if (!mounted) return;
      if (!trackingToken) {
        setConnectionState("error");
        setError("Not authorised for the live tracking feed.");
        return;
      }

      const socket = io(`${serverUrl}`, {
        auth: { token: trackingToken },
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionDelay: RECONNECT_DELAY_MS,
        reconnectionDelayMax: 10000,
        reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
      });

      socketRef.current = socket;

      socket.on("connect", () => {
        if (!mounted) return;
        console.log("[Admin] ✅ Connected to tracking server");
        setConnectionState("connected");
        setError(null);
        reconnectAttempts = 0;

        // Server auto-joins admin clients to admin-room.
      });

      socket.on("connect_error", (err) => {
        if (!mounted) return;
        console.error("[Admin] ❌ Connection error:", err);
        setConnectionState("error");
        setError(err.message);
        reconnectAttempts++;
      });

      socket.on("disconnect", (reason) => {
        if (!mounted) return;
        console.log("[Admin] 🔌 Disconnected from tracking server:", reason);
        setConnectionState("disconnected");
        
        if (reason === "io server disconnect") {
          // Server disconnected admin, reconnect
          socket.connect();
        }
      });

        // Auto-request geolocation permission for admin
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            () => console.log("[Admin] 📍 Location permission granted"),
            (err) => {
              if (err.code === 1) console.warn("[Admin] Location permission denied");
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 5050 }
          );
        }

      // Initial snapshot so map can render immediately on admin open/reload.
      socket.on("state-snapshot", (snapshot) => {
        if (!mounted || !Array.isArray(snapshot)) return;
        setLiveUsers(() => {
          const updated = new Map();
          snapshot.forEach((user) => {
            if (typeof user?.lat !== "number" || typeof user?.lon !== "number") return;
            updated.set(user.userId, {
              id: user.userId,
              name: user.name,
              lat: user.lat,
              lon: user.lon,
              accuracy: user.accuracy,
              timestamp: user.lastSeen ? new Date(user.lastSeen) : new Date(),
              blood: user.blood,
              medical: user.medical,
              status: user.sosActive ? "sos" : user.isTracking ? "active" : "inactive",
              lastUpdate: Date.now(),
            });
          });
          return updated;
        });
      });

      // Live location updates from connected users.
      socket.on("location-update", (data) => {
        if (!mounted) return;
        const { userId, name, lat, lon, accuracy, timestamp, blood, medical, status } = data;
        if (typeof lat !== "number" || typeof lon !== "number") return;

        setLiveUsers((prev) => {
          const updated = new Map(prev);
          updated.set(userId, {
            id: userId,
            name,
            lat,
            lon,
            accuracy,
            timestamp: new Date(timestamp),
            blood,
            medical,
            status: status || "active",
            lastUpdate: Date.now(),
          });
          return updated;
        });
      });

      // Tracking state changes can arrive before the next GPS position.
      socket.on("tracking-status", (data) => {
        if (!mounted || !data?.userId) return;

        setLiveUsers((prev) => {
          const updated = new Map(prev);
          const user = updated.get(data.userId);
          if (user) {
            updated.set(data.userId, {
              ...user,
              status: data.isTracking ? "active" : "inactive",
              lastUpdate: Date.now(),
            });
          }
          return updated;
        });
      });

      // Listen for SOS trigger events
      socket.on("sos-event", (data) => {
        if (!mounted) return;
        if (data?.type === "sos-cancel") {
          const { userId } = data;
          setSosEvents((prev) => {
            const updated = new Map(prev);
            updated.forEach((sos) => {
              if (sos.userId === userId && sos.status === "active") {
                sos.status = "resolved";
              }
            });
            return updated;
          });

          setLiveUsers((prev) => {
            const updated = new Map(prev);
            const user = updated.get(userId);
            if (user) {
              updated.set(userId, { ...user, status: "active" });
            }
            return updated;
          });
          return;
        }

        const { userId, name, lat, lon, blood, medical, timestamp } = data;

        setSosEvents((prev) => {
          const updated = new Map(prev);
          const sosId = `sos-${userId}-${timestamp}`;
          updated.set(sosId, {
            id: sosId,
            userId,
            name,
            lat,
            lon,
            blood,
            medical,
            status: "active",
            timestamp: new Date(timestamp),
            type: "Manual trigger",
          });
          return updated;
        });

        setLiveUsers((prev) => {
          const updated = new Map(prev);
          const current = updated.get(userId);
          if (current) {
            updated.set(userId, { ...current, status: "sos" });
          }
          return updated;
        });

        console.log(`[Admin] 🚨 SOS triggered by ${name} at ${lat},${lon}`);
      });

      // User disconnected/removed from active tracking.
      socket.on("user-disconnected", (data) => {
        if (!mounted) return;
        const { userId } = data;

        setLiveUsers((prev) => {
          const updated = new Map(prev);
          const user = updated.get(userId);
          if (user) {
            updated.set(userId, { ...user, status: "inactive" });
          }
          return updated;
        });
      });

      socket.on("user-removed", (data) => {
        if (!mounted) return;
        const { userId } = data;

        setLiveUsers((prev) => {
          const updated = new Map(prev);
          updated.delete(userId);
          return updated;
        });
      });

      // Heartbeat: emit ping every 30s to keep connection alive
      heartbeatRef.current = setInterval(() => {
        if (socketRef.current?.connected) {
          socketRef.current.emit("ping");
        }
      }, 30000);
    };

    connect();

    return () => {
      mounted = false;
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      if (socketRef.current) {
        socketRef.current.off("connect");
        socketRef.current.off("connect_error");
        socketRef.current.off("disconnect");
        socketRef.current.off("state-snapshot");
        socketRef.current.off("location-update");
        socketRef.current.off("tracking-status");
        socketRef.current.off("sos-event");
        socketRef.current.off("user-disconnected");
        socketRef.current.off("user-removed");
        socketRef.current.disconnect();
      }
    };
  }, [serverUrl]);

  return {
    liveUsers,
    sosEvents,
    connectionState,
    error,
  };
}
