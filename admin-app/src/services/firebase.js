// src/services/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import {
  getFirestore,
  connectFirestoreEmulator,
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  onSnapshot,
  orderBy,
  limit,
} from "firebase/firestore";
import {
  getDatabase,
  ref,
  onValue,
  set,
  get,
  child,
} from "firebase/database";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
if (import.meta.env.VITE_USE_FIRESTORE_EMULATOR === "true") {
  try {
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
  } catch (e) {
    console.warn("Firestore emulator already connected:", e?.message || e);
  }
}
export const rtdb = getDatabase(app);
export const uploadTripCoverPhoto = async (file) => {
  if (!file) return { success: true, url: "" };
  if (!file.type?.startsWith("image/")) return { success: false, error: "Choose an image file." };
  if (file.size > 8 * 1024 * 1024) return { success: false, error: "Cover photos must be 8 MB or smaller." };
  try {
    const response = await api("/admin/trip-covers", {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { success: false, error: data.error || `Cover upload failed (${response.status}).` };
    return { success: true, url: data.imageUrl };
  } catch (error) {
    console.error("Trip cover upload failed:", error);
    return { success: false, error: error?.message || "Could not upload this cover photo." };
  }
};

export const AUTH_API_URL = import.meta.env.VITE_AUTH_API_URL || "http://localhost:5050/api";

// The two demo accounts. These are the only accounts that exist.
export const DEMO_ADMIN_EMAIL = "demoadmin@gmail.com";
export const DEMO_USER_EMAIL = "demouser@gmail.com";
export const DEMO_PASSWORD = "123456";
export const DEMO_ADMIN_ID = "demo-admin";
export const DEMO_USER_ID = "demo-user";

// Admin API token issued by POST /api/auth/login. Without it every protected
// backend route (including GET /api/users) answers 401.
export const getAdminToken = () => {
  try {
    return localStorage.getItem("margsutra_admin_token") || "";
  } catch {
    return "";
  }
};

export const setAdminToken = (token) => {
  try {
    if (token) localStorage.setItem("margsutra_admin_token", token);
    else localStorage.removeItem("margsutra_admin_token");
  } catch {
    /* storage unavailable */
  }
};

export const authHeaders = (extra = {}) => {
  const token = getAdminToken();
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra };
};

export const updateAdminProfile = async (adminId, updates) => {
  if (!adminId) return { success: false, error: "Administrator account ID is missing." };
  try {
    const response = await api(`/users/${encodeURIComponent(adminId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { success: false, error: data.error || `Profile update failed (${response.status}).` };
    return { success: true, user: data.user };
  } catch (error) {
    return { success: false, error: error?.message || "Unable to save administrator profile." };
  }
};

const api = (path, options = {}) =>
  fetch(`${AUTH_API_URL}${path}`, {
    ...options,
    headers: authHeaders(options.headers || {}),
  });

export const deleteRegisteredUser = async (userId) => {
  if (!userId) return { success: false, error: "User ID is missing." };
  try {
    const response = await api(`/admin/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { success: false, error: data.error || `Delete failed (${response.status}).` };
    return { success: true };
  } catch (error) {
    return { success: false, error: error?.message || "Unable to delete this profile." };
  }
};

// ===== AUTHENTICATION =====
export const adminLogin = async (email, password) => {
  const normalizedEmail = (email || "").trim().toLowerCase();

  // 1. Try Backend API first (validates Firestore credentials and checks pending approval)
  try {
    const res = await api(`/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: normalizedEmail, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 403) {
      return {
        success: false,
        error: data.error || "Your administrator account is pending approval by an existing system administrator.",
      };
    }
    if (res.ok && data?.user) {
      if (data.user.role !== "admin") {
        return { success: false, error: "Unauthorized: Administrator privileges required for this console." };
      }
      return {
        success: true,
        user: { email: data.user.email, uid: data.user.id },
        userData: data.user,
        token: data.token,
      };
    }
  } catch (backendErr) {
    console.warn("Backend auth failed, falling back to Firebase Auth client:", backendErr);
  }

  // 2. Try Firebase Auth client
  try {
    const userCredential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
    const userDoc = await getDoc(doc(db, "users", userCredential.user.uid));

    if (userDoc.exists() && userDoc.data().role === "admin") {
      const data = userDoc.data();
      const isSuper = normalizedEmail === DEMO_ADMIN_EMAIL;
      if (!isSuper && (data.status === "pending_approval" || data.approved === false)) {
        await signOut(auth);
        return {
          success: false,
          error: "Your administrator account is pending approval by an existing system administrator. You will be notified once verified.",
        };
      }
      return {
        success: true,
        user: userCredential.user,
        userData: { id: userDoc.id, ...data },
      };
    } else {
      await signOut(auth);
      return { success: false, error: "Unauthorized: Admin access required" };
    }
  } catch (error) {
    // Demo fallback for offline / mock testing: the demo admin account always
    // works so the console can never be locked out of a demo.
    if (normalizedEmail === DEMO_ADMIN_EMAIL && password === DEMO_PASSWORD) {
      return {
        success: true,
        user: { email: DEMO_ADMIN_EMAIL, uid: DEMO_ADMIN_ID },
        userData: {
          id: DEMO_ADMIN_ID,
          name: "Demo Admin",
          email: DEMO_ADMIN_EMAIL,
          role: "admin",
          status: "approved",
          approved: true,
          organization: "Margsutra Expedition Command & SAR",
          roleTitle: "Lead Command Dispatcher",
        },
      };
    }
    return { success: false, error: error.message };
  }
};

export const registerAdminAccount = async ({ name, email, password, phone, organization, roleTitle }) => {
  const normalizedEmail = (email || "").trim().toLowerCase();

  // 1. Try Backend Registration API
  try {
    const res = await api(`/auth/register-admin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        email: normalizedEmail,
        password,
        phone: phone ? phone.trim() : "",
        organization: organization ? organization.trim() : "Expedition Command & SAR",
        roleTitle: roleTitle ? roleTitle.trim() : "Trek Administrator",
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      return {
        success: true,
        message: data.message || "Administrator access request submitted. An existing administrator must approve your account.",
        user: data.user,
      };
    }
    if (data?.error) {
      return { success: false, error: data.error };
    }
  } catch (apiErr) {
    console.warn("Backend admin register failed, attempting direct Firebase save:", apiErr);
  }

  // 2. Direct Firebase Auth & Firestore fallback
  try {
    const cred = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
    const adminRecord = {
      uid: cred.user.uid,
      name: name.trim(),
      email: normalizedEmail,
      phone: phone ? phone.trim() : "",
      role: "admin",
      status: "pending_approval",
      approved: false,
      organization: organization || "Expedition Command & SAR",
      roleTitle: roleTitle || "Trek Administrator",
      requestedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    await setDoc(doc(db, "users", cred.user.uid), adminRecord);
    await signOut(auth); // Sign out so pending admin cannot enter console before approval
    return {
      success: true,
      message: "Administrator access request submitted. An existing administrator must approve your account.",
      user: adminRecord,
    };
  } catch (fbErr) {
    return { success: false, error: fbErr.message };
  }
};

export const fetchPendingAdmins = async () => {
  try {
    const res = await api(`/admin/pending-admins`);
    if (res.ok) {
      const data = await res.json();
      return data.pendingAdmins || [];
    }
  } catch {}
  try {
    const q = query(collection(db, "users"), where("role", "==", "admin"));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((u) => {
        const email = (u.email || "").toLowerCase();
        return email !== DEMO_ADMIN_EMAIL && (u.status === "pending_approval" || u.approved === false);
      });
  } catch {
    return [];
  }
};

export const approveAdmin = async (adminId, approvedBy = DEMO_ADMIN_EMAIL) => {
  try {
    const res = await api(`/admin/approve-admin/${adminId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvedBy }),
    });
    if (res.ok) return { success: true };
  } catch {}
  try {
    await updateDoc(doc(db, "users", adminId), {
      status: "approved",
      approved: true,
      approvedAt: new Date().toISOString(),
      approvedBy,
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

export const rejectAdmin = async (adminId, rejectedBy = DEMO_ADMIN_EMAIL) => {
  try {
    const res = await api(`/admin/reject-admin/${adminId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rejectedBy }),
    });
    if (res.ok) return { success: true };
  } catch {}
  try {
    await updateDoc(doc(db, "users", adminId), {
      status: "rejected",
      approved: false,
      rejectedAt: new Date().toISOString(),
      rejectedBy,
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

export const adminLogout = async () => {
  try {
    await signOut(auth);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ===== USERS =====
export const getAllUsers = async () => {
  try {
    const snapshot = await getDocs(collection(db, "users"));
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error fetching users:", error);
    return [];
  }
};

export const getUserById = async (userId) => {
  try {
    const userDoc = await getDoc(doc(db, "users", userId));
    return userDoc.exists() ? { id: userDoc.id, ...userDoc.data() } : null;
  } catch (error) {
    console.error("Error fetching user:", error);
    return null;
  }
};

export const updateUserFeatureAccess = async (userId, features) => {
  try {
    const res = await api(`/admin/users/${userId}/features`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ features }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { success: false, error: data.error || `HTTP ${res.status}` };
    return { success: true, features: data.features || features };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const subscribeToUsers = (callback) => {
  const q = collection(db, "users");
  return onSnapshot(
    q,
    (snapshot) => {
      const users = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      callback(users);
    },
    (error) => {
      console.warn("Firestore subscribeToUsers warning:", error.message);
      callback(null);
    }
  );
};

// ===== BOOKINGS =====
export const getAllBookings = async () => {
  try {
    const q = query(
      collection(db, "bookings"),
      orderBy("date", "desc")
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error fetching bookings:", error);
    return [];
  }
};

export const updateBookingStatus = async (bookingId, status) => {
  try {
    await updateDoc(doc(db, "bookings", bookingId), {
      status: status,
      updatedAt: new Date().toISOString(),
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const subscribeToBookings = (callback) => {
  const q = query(
    collection(db, "bookings"),
    orderBy("date", "desc")
  );
  return onSnapshot(q, (snapshot) => {
    const bookings = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    callback(bookings);
  });
};

// ===== TRIPS (join-code feature) =====
const genTripCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
};

export const createTrip = async (nameOrData, dateArg, locationArg) => {
  const isObj = typeof nameOrData === "object" && nameOrData !== null;
  const name = isObj ? nameOrData.name : nameOrData;
  const date = isObj ? nameOrData.date : dateArg;
  const location = isObj ? nameOrData.location : locationArg;
  const code = (isObj && nameOrData.code) ? String(nameOrData.code).trim().toUpperCase() : genTripCode();

  const startDate = (isObj && nameOrData.startDate) || (date ? date.split("–")[0].trim() : "May 3, 2026");
  const startTime = (isObj && nameOrData.startTime) || "06:30 AM";
  const endDate = (isObj && nameOrData.endDate) || (date && date.includes("–") ? date.split("–")[1].trim() : "May 4, 2026");
  const endTime = (isObj && nameOrData.endTime) || "05:00 PM";
  const formattedDate = date || `${startDate} · ${startTime} – ${endDate} · ${endTime}`;

  const payload = {
    name: name || "Sahyadri Mountain Expedition",
    date: formattedDate,
    startDate,
    startTime,
    endDate,
    endTime,
    duration: (isObj && nameOrData.duration) || "2 Days / 1 Night",
    pickupLocation: (isObj && nameOrData.pickupLocation) || "Lonavala Railway Station (Platform 1 Exit, Ticket Counter)",
    baseLocation: (isObj && nameOrData.baseLocation) || "Udhewadi Base Village Camp (829m ASL)",
    location: location || "Rajmachi Fort, Maharashtra",
    elevation: (isObj && nameOrData.elevation) || "829m ASL",
    difficulty: (isObj && nameOrData.difficulty) || "Moderate",
    leader: (isObj && nameOrData.leader) || "Field Guide Ajay Saini",
    vhfChannel: (isObj && nameOrData.vhfChannel) || "145.500 MHz (VHF Ch 1)",
    code,
    isManaged: (isObj && !!nameOrData.isManaged) || false,
    status: (isObj && nameOrData.status) || "upcoming",
    rosterCount: (isObj && Number(nameOrData.rosterCount)) || 0,
    maxRoster: (isObj && Number(nameOrData.maxRoster)) || 25,
    instructions: (isObj && nameOrData.instructions) || "",
    price: Math.max(0, Number(isObj && nameOrData.price) || 0),
    currency: String((isObj && nameOrData.currency) || "INR").toUpperCase(),
    paymentInstructions: (isObj && nameOrData.paymentInstructions) || "",
    coverImageUrl: (isObj && nameOrData.coverImageUrl) || "",
    gearList: (isObj && nameOrData.gearList) || [],
    notes: (isObj && nameOrData.notes) || "",
    admins: (isObj && nameOrData.admins) || [],
    adminInCharge: (isObj && nameOrData.adminInCharge) || null,
    createdBy: (isObj && nameOrData.createdBy) || null,
    lat: (isObj && Number(nameOrData.lat)) || 18.8286,
    lon: (isObj && Number(nameOrData.lon)) || 73.3986,
    geofence: {
      lat: (isObj && Number(nameOrData.geofence?.lat)) || (isObj && Number(nameOrData.lat)) || 18.8286,
      lon: (isObj && Number(nameOrData.geofence?.lon)) || (isObj && Number(nameOrData.lon)) || 73.3986,
      radius: (isObj && Number(nameOrData.geofence?.radius)) || 2500,
      zoneName: (isObj && nameOrData.geofence?.zoneName) || name || "Rajmachi Safe Trek Corridor",
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // 1. Try Backend API first
  try {
    const res = await api(`/trips`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const data = await res.json();
      return { success: true, id: data.trip?.id, code: data.trip?.code || code, trip: data.trip };
    }
    // A validation / invariant rejection (4xx) must surface to the admin.
    if (res.status >= 400 && res.status < 500) {
      const data = await res.json().catch(() => ({}));
      return { success: false, error: data.error || `Request rejected (${res.status}).` };
    }
  } catch {}

  // 2. Direct Firestore fallback
  try {
    const docRef = await addDoc(collection(db, "trips"), payload);
    return { success: true, id: docRef.id, code, trip: { id: docRef.id, ...payload } };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const updateTrip = async (tripId, updates = {}) => {
  // 1. Try Backend API first
  try {
    const res = await api(`/trips/${tripId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      const data = await res.json();
      return { success: true, trip: data.trip };
    }
    if (res.status >= 400 && res.status < 500) {
      const data = await res.json().catch(() => ({}));
      return { success: false, error: data.error || `Request rejected (${res.status}).` };
    }
  } catch {}

  // 2. Direct Firestore fallback
  try {
    const docRef = doc(db, "trips", tripId);
    await updateDoc(docRef, {
      ...updates,
      updatedAt: new Date().toISOString(),
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const updateTripGeofence = async (tripId, geofenceUpdates = {}) => {
  const updates = {
    geofence: {
      radius: Number(geofenceUpdates.radius) || 2500,
      zoneName: geofenceUpdates.zoneName || "Rajmachi Safe Trek Corridor",
      lat: Number(geofenceUpdates.lat) || 18.8286,
      lon: Number(geofenceUpdates.lon) || 73.3986,
    },
  };
  return updateTrip(tripId, updates);
};

export const deleteTrip = async (tripId) => {
  // 1. Try Backend API
  try {
    const res = await api(`/trips/${tripId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });
    if (res.ok) {
      return { success: true };
    }
  } catch {}

  // 2. Direct Firestore fallback
  try {
    const tripRef = doc(db, "trips", tripId);
    const rosterSnap = await getDocs(collection(db, "trips", tripId, "roster"));
    for (const rDoc of rosterSnap.docs) {
      await deleteDoc(rDoc.ref);
    }
    const usersSnap = await getDocs(query(collection(db, "users"), where("activeTripId", "==", tripId)));
    for (const uDoc of usersSnap.docs) {
      await updateDoc(uDoc.ref, {
        activeTripId: null,
        activeTripCode: null,
        activeTripName: null,
        tripStatus: null,
        tripRequestedAt: null,
        tripApprovedAt: null,
        updatedAt: new Date().toISOString(),
      });
    }
    await deleteDoc(tripRef);
    return { success: true };
  } catch (err) {
    console.error("Direct Firestore deleteTrip error:", err);
    return { success: false, error: err.message };
  }
};

export const setActiveManagedTrip = async (tripId) => {
  // 1. Try Backend API
  try {
    const res = await api(`/trips/${tripId}/manage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (res.ok) {
      const data = await res.json();
      return { success: true, trip: data.trip };
    }
  } catch {}

  // 2. Direct Firestore fallback
  try {
    const tripsSnap = await getDocs(collection(db, "trips"));
    for (const tDoc of tripsSnap.docs) {
      if (tDoc.id === tripId) {
        await updateDoc(tDoc.ref, {
          isManaged: true,
          status: "in-field",
          managedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      } else {
        const prev = tDoc.data().status;
        await updateDoc(tDoc.ref, {
          isManaged: false,
          status: prev === "in-field" ? "upcoming" : (prev || "upcoming"),
          updatedAt: new Date().toISOString(),
        });
      }
    }
    return { success: true };
  } catch (err) {
    console.error("Direct Firestore setActiveManagedTrip error:", err);
    return { success: false, error: err.message };
  }
};

export const subscribeToTrips = (callback) => {
  const q = query(collection(db, "trips"), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, (error) => {
    console.error("Error subscribing to trips:", error);
    callback(null); // signal to caller: fall back to demo data
  });
};

export const getTripByCode = async (code) => {
  try {
    const q = query(collection(db, "trips"), where("code", "==", code.trim().toUpperCase()));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return { success: false, error: "No trip found for that code." };
    const trip = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
    return { success: true, trip };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const fetchPendingTripRequests = async () => {
  // 1. Try Backend API
  try {
    const res = await api(`/admin/pending-trip-requests`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.pending)) return data.pending;
    }
  } catch {}

  // 2. Direct Firestore fallback
  try {
    const tripsSnap = await getDocs(collection(db, "trips"));
    const pending = [];
    for (const tDoc of tripsSnap.docs) {
      const tripData = tDoc.data();
      const rosterSnap = await getDocs(
        query(collection(db, "trips", tDoc.id, "roster"), where("status", "in", ["pending_approval", "payment_submitted", "payment_verified"]))
      );
      for (const rDoc of rosterSnap.docs) {
        pending.push({
          tripId: tDoc.id,
          tripName: tripData.name || "Expedition",
          tripCode: tripData.code || "",
          id: rDoc.id,
          ...rDoc.data(),
        });
      }
    }
    return pending;
  } catch (err) {
    console.warn("fetchPendingTripRequests error:", err);
    return [];
  }
};

export const approveTrekker = async (tripId, userId, approvedBy = DEMO_ADMIN_EMAIL) => {
  // 1. Try Backend API
  try {
    const res = await api(`/admin/trips/${tripId}/approve-user/${userId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvedBy }),
    });
    if (res.ok) return { success: true };
  } catch {}

  // 2. Direct Firestore fallback
  try {
    const now = new Date().toISOString();
    const rosterRef = doc(db, "trips", tripId, "roster", userId);
    await updateDoc(rosterRef, {
      status: "approved",
      approvedAt: now,
      approvedBy,
    });

    const userRef = doc(db, "users", userId);
    await updateDoc(userRef, {
      tripStatus: "approved",
      tripApprovedAt: now,
      tripApprovedBy: approvedBy,
      updatedAt: now,
    });

    // Update roster count
    const approvedSnap = await getDocs(
      query(collection(db, "trips", tripId, "roster"), where("status", "==", "approved"))
    );
    await updateDoc(doc(db, "trips", tripId), {
      rosterCount: approvedSnap.size,
    });

    return { success: true };
  } catch (err) {
    console.warn("Direct Firestore approve error:", err);
    return { success: false, error: err.message };
  }
};

export const verifyTrekkerPayment = async (tripId, userId) => {
  try {
    const res = await api(`/admin/trips/${encodeURIComponent(tripId)}/verify-payment/${encodeURIComponent(userId)}`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { success: true };
    return { success: false, error: data.error || `Payment verification failed (${res.status}).` };
  } catch (error) {
    return { success: false, error: error?.message || "Payment verification unavailable." };
  }
};

export const removeTrekker = async (tripId, userId, removedBy = DEMO_ADMIN_EMAIL) => {
  // 1. Try Backend API
  try {
    const res = await api(`/admin/trips/${tripId}/remove-user/${userId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ removedBy }),
    });
    if (res.ok) return { success: true };
  } catch {}

  // 2. Direct Firestore fallback
  try {
    if (tripId && userId) {
      await deleteDoc(doc(db, "trips", tripId, "roster", userId));
      const approvedSnap = await getDocs(
        query(collection(db, "trips", tripId, "roster"), where("status", "==", "approved"))
      );
      await updateDoc(doc(db, "trips", tripId), {
        rosterCount: approvedSnap.size,
      });
    }

    if (userId) {
      await updateDoc(doc(db, "users", userId), {
        activeTripId: null,
        activeTripCode: null,
        activeTripName: null,
        tripStatus: null,
        tripRequestedAt: null,
        tripApprovedAt: null,
        updatedAt: new Date().toISOString(),
      });
    }

    return { success: true };
  } catch (err) {
    console.warn("Direct Firestore remove error:", err);
    return { success: false, error: err.message };
  }
};

export const fetchTripRoster = async (tripId) => {
  // 1. Try Backend API
  try {
    const res = await api(`/trips/${tripId}/roster`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.roster)) return data.roster;
    }
  } catch {}

  // 2. Direct Firestore fallback
  try {
    const snap = await getDocs(collection(db, "trips", tripId, "roster"));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn("Direct Firestore fetchTripRoster error:", err);
    return [];
  }
};

// ===== WEATHER DATA =====
export const subscribeToWeatherData = (callback) => {
  const weatherRef = ref(rtdb, "weather_data/nodes");
  return onValue(weatherRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      const weatherArray = Object.values(data);
      callback(weatherArray);
    }
  });
};

export const subscribeToFieldTelemetry = (callback) => onValue(
  ref(rtdb, "weather_nodes"),
  (snapshot) => callback(Object.entries(snapshot.val() || {}).map(([id, data]) => ({ id, ...data }))),
  (error) => { console.warn("Field telemetry subscription failed:", error?.message || error); callback(null); }
);

export const getWeatherHistory = async (nodeId, days = 7) => {
  try {
    const q = query(
      collection(db, "weather_history"),
      where("nodeId", "==", nodeId),
      orderBy("timestamp", "desc"),
      limit(days * 24) // Approximately hourly data
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => doc.data());
  } catch (error) {
    console.error("Error fetching weather history:", error);
    return [];
  }
};

// ===== SOS EVENTS =====
export const getAllSOSEvents = async () => {
  try {
    const q = query(
      collection(db, "sos_events"),
      orderBy("timestamp", "desc"),
      limit(50)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error fetching SOS events:", error);
    return [];
  }
};

export const updateSOSEventStatus = async (eventId, status, notes = "") => {
  try {
    await updateDoc(doc(db, "sos_events", eventId), {
      status: status,
      notes: notes,
      updatedAt: new Date().toISOString(),
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const resolveSOSEvent = async (eventId, userId = null, notes = "Incident resolved and standing down SAR", resolvedBy = "Lead Command Admin") => {
  const now = new Date().toISOString();
  const channels = { firestore: false, api: false };
  const errors = [];

  try {
    if (eventId) {
      await updateDoc(doc(db, "sos_events", eventId), {
        status: "resolved",
        resolution: "admin_resolved",
        resolutionNotes: notes,
        resolvedBy: resolvedBy,
        resolvedAt: now,
        updatedAt: now,
      });
    }
    if (userId) {
      await updateDoc(doc(db, "users", userId), {
        status: "active",
        activeSosId: null,
        updatedAt: now,
      });
    }
    channels.firestore = true;
  } catch (err) {
    errors.push(`firestore: ${err?.message || "write failed"}`);
  }

  // Stand-down must also reach the tracking server (live map + trekker app).
  if (eventId) {
    try {
      const res = await api(`/sos/${eventId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes, resolvedBy, userId }),
      });
      channels.api = res.ok;
      if (!res.ok) errors.push(`api: HTTP ${res.status}`);
    } catch (err) {
      errors.push(`api: ${err?.message || "failed"}`);
    }
  }

  const success = channels.api || channels.firestore;
  return { success, channels, errors };
};

/**
 * Two-way SOS: the command team sends one alert to every member of the group.
 */
export const broadcastSOSAlert = async ({ message = "", severity = "advisory", title = "" } = {}) => {
  try {
    const res = await api(`/sos/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, severity, title }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { success: false, error: data.error || `HTTP ${res.status}` };
    return { success: true, event: data.event };
  } catch (err) {
    return { success: false, error: err?.message || "Could not send the alert" };
  }
};

/**
 * Acknowledge a distress beacon: a duty officer has seen it and is acting.
 * The incident stays active — only a stand-down clears it — but the console
 * stops the alarm and the trekker sees that command is on it.
 */
export const acknowledgeSOSEvent = async (eventId, acknowledgedBy = "Lead Command Admin", note = "") => {
  if (!eventId) return { success: false, errors: ["Missing incident id"] };
  const errors = [];
  let apiOk = false;

  try {
    const res = await api(`/sos/${eventId}/acknowledge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acknowledgedBy, note }),
    });
    apiOk = res.ok;
    if (!res.ok) errors.push(`api: HTTP ${res.status}`);
  } catch (err) {
    errors.push(`api: ${err?.message || "failed"}`);
  }

  return { success: apiOk, channels: { api: apiOk }, errors };
};

export const triggerDemoSOSEvent = async ({
  name = "Anirban Panda",
  userId = "9OovuZiHQnQKrLTuPF1J",
  tripName = "Rajmachi Fort Expedition",
  tripId = "trip-001",
  lat = 18.8286,
  lon = 73.3986,
  altitude = 829,
  blood = "B+",
  medical = "None reported",
  phone = "+91 86375 40813",
  ec = "Deepak Panda (Brother) · +91 91531 91902",
  type = "Field SAR Drill / Test SOS",
  priority = "critical",
} = {}) => {
  const eventId = `sos-drill-${Date.now()}`;
  const now = new Date().toISOString();
  const payload = {
    id: eventId,
    eventId,
    userId,
    userName: name,
    name,
    tripId,
    tripName,
    tripCode: "RAJM26",
    lat,
    lon,
    altitude,
    blood,
    medical,
    phone,
    ec,
    type,
    priority,
    isDrill: true,
    status: "active",
    message: "Field SAR operational drill triggered from Admin Dispatch Console",
    timestamp: now,
    createdAt: now,
    updatedAt: now,
  };

  try {
    // Drills are recorded as drill events only: they must never flip a real
    // trekker's duty-of-care status to "sos" or look like a live incident.
    await setDoc(doc(db, "sos_events", eventId), payload);
  } catch (err) {
    console.warn("triggerDemoSOSEvent error:", err);
    return { success: false, error: err?.message || "Could not record drill event" };
  }

  return { success: true, eventId, payload, isDrill: true };
};

export const subscribeToSOSEvents = (callback) => {
  try {
    const q = query(
      collection(db, "sos_events"),
      limit(25)
    );
    return onSnapshot(q, (snapshot) => {
      const events = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      events.sort((a, b) => {
        const timeA = new Date(a.timestamp || a.createdAt || 0).getTime();
        const timeB = new Date(b.timestamp || b.createdAt || 0).getTime();
        return timeB - timeA;
      });
      callback(events);
    }, (err) => {
      console.warn("subscribeToSOSEvents listener error:", err);
      callback([]);
    });
  } catch (err) {
    console.warn("subscribeToSOSEvents init error:", err);
    return () => {};
  }
};

// ===== TEAM TRACKING =====
export const subscribeToTeamLocations = (teamId, callback) => {
  const teamRef = ref(rtdb, `team_locations/${teamId}`);
  return onValue(teamRef, (snapshot) => {
    const data = snapshot.val();
    callback(data);
  });
};

export const updateTeamLocation = async (teamId, latitude, longitude) => {
  try {
    const teamRef = ref(rtdb, `team_locations/${teamId}`);
    await set(teamRef, {
      latitude,
      longitude,
      timestamp: Date.now(),
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ===== SAFETY PROTOCOLS =====
export const getAllSafetyProtocols = async () => {
  try {
    const q = query(collection(db, "safety_protocols"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error fetching protocols:", error);
    return [];
  }
};

export const subscribeToSafetyProtocols = (callback) => {
  const q = query(collection(db, "safety_protocols"));
  return onSnapshot(q, (snapshot) => {
    const protocols = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    callback(protocols);
  });
};

export const updateSafetyProtocol = async (protocolId, data) => {
  try {
    await updateDoc(doc(db, "safety_protocols", protocolId), {
      ...data,
      updatedAt: new Date().toISOString(),
      updated: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const createSafetyProtocol = async (data) => {
  try {
    const docRef = await addDoc(collection(db, "safety_protocols"), {
      ...data,
      status: data.status ?? "draft",
      order: data.order ?? Date.now(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updated: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    });
    return { success: true, id: docRef.id };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const deleteSafetyProtocol = async (protocolId) => {
  try {
    await deleteDoc(doc(db, "safety_protocols", protocolId));
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ===== BLUETOOTH DEVICES =====
export const getAllBluetoothDevices = async () => {
  try {
    const snapshot = await getDocs(collection(db, "bluetooth_devices"));
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error fetching BLE devices:", error);
    return [];
  }
};

export const addBluetoothDevice = async (deviceData) => {
  try {
    const docRef = await addDoc(collection(db, "bluetooth_devices"), {
      ...deviceData,
      createdAt: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
    });
    return { success: true, id: docRef.id };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const deleteBluetoothDevice = async (deviceId) => {
  try {
    await deleteDoc(doc(db, "bluetooth_devices", deviceId));
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ===== USER DEVICES (GPS, Beacons) =====
export const getUserDevices = async (userId) => {
  try {
    const snapshot = await getDocs(
      collection(db, `user_devices/${userId}`)
    );
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error fetching user devices:", error);
    return [];
  }
};

export const subscribeToUserDevice = (userId, deviceId, callback) => {
  const deviceRef = ref(rtdb, `user_devices/${userId}/${deviceId}`);
  return onValue(deviceRef, (snapshot) => {
    const data = snapshot.val();
    callback(data);
  });
};

// ===== ADMIN LOGS =====
export const createAdminLog = async (action, details) => {
  try {
    await addDoc(collection(db, "admin_logs"), {
      action: action,
      details: details,
      adminId: auth.currentUser?.uid,
      timestamp: new Date().toISOString(),
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ===== WEATHER FORECASTS =====
export const getWeatherForecast = async (nodeId) => {
  try {
    const forecastDoc = await getDoc(doc(db, "weather_forecasts", nodeId));
    return forecastDoc.exists() ? forecastDoc.data() : null;
  } catch (error) {
    console.error("Error fetching forecast:", error);
    return null;
  }
};
