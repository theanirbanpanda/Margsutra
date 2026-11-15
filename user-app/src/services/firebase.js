import { initializeApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator, collection, doc, setDoc, query, where, getDocs, getDoc, deleteDoc, onSnapshot } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
};

// Where the backend lives: env override, localhost in dev, same origin in prod.
const API_BASE =
  import.meta.env.VITE_AUTH_API_URL ||
  (import.meta.env.DEV ? "http://localhost:5050/api" : "/api");

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const subscribeToFieldTelemetry = (callback) => {
  let active = true;
  const databaseUrl = firebaseConfig.databaseURL?.replace(/\/$/, "");
  const pull = async () => {
    if (!active || !databaseUrl) return;
    try {
      const response = await fetch(`${databaseUrl}/weather_nodes.json`);
      if (!response.ok) throw new Error(`RTDB HTTP ${response.status}`);
      const data = await response.json();
      if (active) callback(Object.entries(data || {}).map(([id, node]) => ({ id, ...node })));
    } catch (error) {
      console.warn("Field telemetry read failed:", error?.message || error);
      if (active) callback(null);
    }
  };
  pull();
  const interval = setInterval(pull, 5000);
  return () => { active = false; clearInterval(interval); };
};
if (import.meta.env.VITE_USE_FIRESTORE_EMULATOR === "true") {
  try {
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
  } catch (e) {
    console.warn("Firestore emulator already connected:", e?.message || e);
  }
}

export const updateUserProfileInFirestore = async (userId, updates) => {
  if (!userId) return false;
  try {
    const userDocRef = doc(db, "users", userId);
    await setDoc(userDocRef, { ...updates, updatedAt: new Date().toISOString() }, { merge: true });
    return true;
  } catch (error) {
    console.warn("Direct Firestore profile update error:", error);
    return false;
  }
};

export const getTripByCode = async (code) => {
  try {
    const q = query(collection(db, "trips"), where("code", "==", code.trim().toUpperCase()));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return { success: false, error: "not_found" };
    return { success: true, trip: { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } };
  } catch (error) {
    return { success: false, error: "unreachable" };
  }
};

export const subscribeToSafetyProtocols = (callback) => {
  const q = query(collection(db, "safety_protocols"));
  return onSnapshot(q, (snapshot) => {
    const protocols = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    callback(protocols);
  });
};

export const subscribeToTrips = (callback) => {
  const q = query(collection(db, "trips"));
  return onSnapshot(
    q,
    (snapshot) => {
      const trips = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      callback(trips);
    },
    (err) => {
      console.warn("Trips subscription error:", err);
      callback(null); // signal a read failure instead of wiping the list
    }
  );
};

export const fetchUserActiveTrip = async (userId) => {
  if (!userId) return null;
  try {
    const res = await fetch(`${API_BASE}/users/${userId}/active-trip`);
    if (!res.ok) return undefined; // transient failure — don't clear local state
    const data = await res.json();
    if (data && data.success) return data.activeTrip || null;
    return undefined;
  } catch (err) {
    console.warn("fetchUserActiveTrip error:", err);
    return undefined;
  }
};

export const subscribeToUserActiveTrip = (userId, callback) => {
  if (!userId) {
    callback(null);
    return () => {};
  }

  let isMounted = true;
  let failures = 0;

  const pullActiveTrip = async () => {
    if (!isMounted) return;
    try {
      const activeData = await fetchUserActiveTrip(userId);
      if (isMounted) {
        if (activeData !== undefined) failures = 0; // undefined === transient failure
        callback(activeData);
      }
    } catch (e) {
      failures += 1;
      console.warn("Active trip poll error:", e);
    }
  };

  // Immediate pull
  pullActiveTrip();

  // Poll every 20s (plus on tab focus) so admin approval/removal reflects
  // quickly without burning through the Firestore read quota.
  const pollTimer = setInterval(pullActiveTrip, 20000);

  // Also listen for browser tab focus/visibility
  const onFocus = () => pullActiveTrip();
  if (typeof window !== "undefined") {
    window.addEventListener("focus", onFocus);
    window.addEventListener("visibilitychange", onFocus);
  }

  return () => {
    isMounted = false;
    clearInterval(pollTimer);
    if (typeof window !== "undefined") {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("visibilitychange", onFocus);
    }
  };
};

export const joinTripInFirestore = async (trip, user) => {
  if (!user?.id || !trip?.id) return { success: false, error: "Missing user or expedition ID" };
  try {
    const userRef = doc(db, "users", user.id);
    const now = new Date().toISOString();
    await setDoc(userRef, {
      activeTripId: trip.id,
      activeTripCode: trip.code || "",
      activeTripName: trip.name || "Expedition",
      tripStatus: "pending_approval",
      tripRequestedAt: now,
      tripApprovedAt: null,
      updatedAt: now,
    }, { merge: true });

    const rosterRef = doc(db, "trips", trip.id, "roster", user.id);
    await setDoc(rosterRef, {
      userId: user.id,
      name: user.name || "Trekker",
      email: user.email || "",
      phone: user.phone || "",
      blood: user.blood || "B+",
      medical: user.medical || "None",
      ec1Name: user.ec1Name || "",
      ec1Rel: user.ec1Rel || "Family",
      ec1Ph: user.ec1Ph || "",
      status: "pending_approval",
      requestedAt: now,
      approvedAt: null,
      approvedBy: "",
    }, { merge: true });

    return { success: true };
  } catch (err) {
    console.warn("Direct Firestore join error:", err);
    return { success: false, error: err.message };
  }
};

export const leaveTripInFirestore = async (tripId, userId) => {
  if (!userId) return { success: false };
  try {
    const userRef = doc(db, "users", userId);
    await setDoc(userRef, {
      activeTripId: null,
      activeTripCode: null,
      activeTripName: null,
      tripStatus: null,
      tripRequestedAt: null,
      tripApprovedAt: null,
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    if (tripId) {
      const rosterRef = doc(db, "trips", tripId, "roster", userId);
      try {
        await deleteDoc(rosterRef);
      } catch {}
    }
    return { success: true };
  } catch (err) {
    console.warn("Direct Firestore leave error:", err);
    return { success: false, error: err.message };
  }
};

export const triggerSOSEvent = async (user, trip, location = {}) => {
  if (!user?.id) return { success: false };
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

  // 1. Write to sos_events in Firestore
  try {
    await setDoc(doc(db, "sos_events", eventId), payload);
  } catch (err) {
    console.warn("Firestore SOS create error:", err);
  }

  // 2. Update user document to status: "sos" in Firestore
  try {
    await setDoc(doc(db, "users", user.id), {
      status: "sos",
      activeSosId: eventId,
      lastSosAt: now,
      updatedAt: now,
    }, { merge: true });
  } catch (err) {
    console.warn("Firestore user SOS status error:", err);
  }

  // 3. Post to backend API
  try {
    await fetch(`${API_BASE}/sos/trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {}

  return { success: true, eventId, payload };
};

export const cancelSOSEvent = async (userId, activeSosId = null, reason = "user_cancelled") => {
  if (!userId) return { success: false };
  const now = new Date().toISOString();

  // 1. Mark SOS event as resolved / cancelled in Firestore
  try {
    if (activeSosId) {
      await setDoc(doc(db, "sos_events", activeSosId), {
        status: "resolved",
        resolution: reason,
        resolutionNotes: "Trekker cancelled SOS beacon (Self-Resolved)",
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
          resolutionNotes: "Trekker cancelled SOS beacon (Self-Resolved)",
          resolvedAt: now,
          updatedAt: now,
        }, { merge: true });
      }
    }
  } catch (err) {
    console.warn("Firestore SOS cancel error:", err);
  }

  // 2. Set user status back to "active" in Firestore
  try {
    await setDoc(doc(db, "users", userId), {
      status: "active",
      activeSosId: null,
      updatedAt: now,
    }, { merge: true });
  } catch (err) {
    console.warn("Firestore user active status error:", err);
  }

  // 3. Post to backend API
  try {
    await fetch(`${API_BASE}/sos/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, activeSosId, reason }),
    });
  } catch {}

  return { success: true };
};
