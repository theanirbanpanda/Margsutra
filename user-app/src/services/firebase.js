import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, setDoc, query, where, getDocs, getDoc, deleteDoc, onSnapshot } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);

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
      callback([]);
    }
  );
};

export const fetchUserActiveTrip = async (userId) => {
  if (!userId) return null;
  try {
    const res = await fetch(`http://localhost:5050/api/users/${userId}/active-trip`);
    if (res.ok) {
      const data = await res.json();
      return data.activeTrip || null;
    }
  } catch (err) {
    console.warn("fetchUserActiveTrip error:", err);
  }
  return null;
};

export const subscribeToUserActiveTrip = (userId, callback) => {
  if (!userId) {
    callback(null);
    return () => {};
  }

  let isMounted = true;

  const pullActiveTrip = async () => {
    if (!isMounted) return;
    try {
      const activeData = await fetchUserActiveTrip(userId);
      if (isMounted) {
        callback(activeData);
      }
    } catch (e) {
      console.warn("Active trip poll error:", e);
    }
  };

  // Immediate pull
  pullActiveTrip();

  // Fast polling every 2 seconds so admin approval/removal reflects in real time!
  const pollTimer = setInterval(pullActiveTrip, 2000);

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