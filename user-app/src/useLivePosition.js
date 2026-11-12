/**
 * useLivePosition.js — Real GPS fix provider for safety-critical payloads.
 *
 * Margsutra never invents a location. This hook exposes the browser's real
 * geolocation fix (with a cached last-known fix) and always reports where that
 * fix came from, so the SOS payload and the confirmation modal can be honest:
 *
 *   source: "live"    → fix younger than LIVE_WINDOW_MS
 *           "cached"  → last known fix, older than LIVE_WINDOW_MS
 *           "none"    → no fix available at all
 */
import { useEffect, useRef, useState } from "react";

const CACHE_KEY = "margsutra_last_fix";
const LIVE_WINDOW_MS = 60_000;

// Number(null) === 0 and Number("") === 0, which would silently turn a missing
// coordinate into a valid-looking one at Null Island. Require a real number.
const asCoord = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (Math.abs(n) > 180) return null;
  return n;
};

const isUsableFix = (fix) => {
  const lat = asCoord(fix?.lat);
  const lon = asCoord(fix?.lon);
  if (lat === null || lon === null) return false;
  // 0,0 is the browser's "no fix" placeholder, never a Sahyadri coordinate.
  if (Math.abs(lat) < 1e-6 && Math.abs(lon) < 1e-6) return false;
  return true;
};

const readCachedFix = () => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const fix = JSON.parse(raw);
    if (!isUsableFix(fix)) return null;
    return {
      lat: asCoord(fix.lat),
      lon: asCoord(fix.lon),
      altitude: asCoord(fix.altitude),
      accuracy: asCoord(fix.accuracy),
      timestamp: Number(fix.timestamp) || 0,
    };
  } catch {
    return null;
  }
};

export const describeFix = (fix) => {
  if (!isUsableFix(fix)) {
    return { lat: null, lon: null, altitude: null, accuracy: null, ageSec: null, source: "none" };
  }
  const timestamp = Number(fix.timestamp) || 0;
  const ageSec = timestamp ? Math.max(0, Math.round((Date.now() - timestamp) / 1000)) : null;
  const fresh = ageSec !== null && ageSec * 1000 <= LIVE_WINDOW_MS;
  return {
    lat: asCoord(fix.lat),
    lon: asCoord(fix.lon),
    altitude: asCoord(fix.altitude),
    accuracy: asCoord(fix.accuracy),
    ageSec,
    source: fresh ? "live" : "cached",
  };
};

export const formatFixLabel = (meta) => {
  if (!meta || meta.source === "none") return "No GPS fix — location unknown";
  const coords = `${meta.lat.toFixed(5)}, ${meta.lon.toFixed(5)}`;
  const acc = meta.accuracy ? ` · ±${Math.round(meta.accuracy)} m` : "";
  const age = meta.ageSec === null ? "" : ` · ${meta.ageSec}s old`;
  return `${coords}${acc}${age}${meta.source === "cached" ? " (last known)" : ""}`;
};

export function useLivePosition() {
  const [fix, setFix] = useState(readCachedFix);
  const [status, setStatus] = useState(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return "unavailable";
    return readCachedFix() ? "cached" : "acquiring";
  });
  const [error, setError] = useState(null);
  const fixRef = useRef(fix);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unavailable");
      setError("Geolocation is not available on this device.");
      return undefined;
    }

    let cancelled = false;
    let watchId = null;

    const onSuccess = (pos) => {
      if (cancelled) return;
      const next = {
        lat: asCoord(pos.coords.latitude),
        lon: asCoord(pos.coords.longitude),
        altitude: asCoord(pos.coords.altitude),
        accuracy: asCoord(pos.coords.accuracy),
        timestamp: pos.timestamp || Date.now(),
      };
      // Some browsers report a 0,0 placeholder before the radio settles.
      if (!isUsableFix(next)) {
        setError("Browser returned an invalid (0,0) position — still acquiring.");
        setStatus(fixRef.current ? "cached" : "acquiring");
        return;
      }
      fixRef.current = next;
      setFix(next);
      setStatus("live");
      setError(null);
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(next));
      } catch {
        /* storage disabled — in-memory fix still works */
      }
    };

    const onError = (err) => {
      if (cancelled) return;
      setError(err?.message || "Unable to acquire a GPS fix.");
      setStatus(fixRef.current ? "cached" : "unavailable");
    };

    const options = { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 };
    navigator.geolocation.getCurrentPosition(onSuccess, onError, options);
    watchId = navigator.geolocation.watchPosition(onSuccess, onError, options);

    return () => {
      cancelled = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  return { fix, status, error, meta: describeFix(fix) };
}
