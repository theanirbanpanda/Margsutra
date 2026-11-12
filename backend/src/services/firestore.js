const path = require("path");
const fs = require("fs");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");

// Locate service account key
const possiblePaths = [
  path.resolve(__dirname, "../../../serviceAccountKey.json"),
  path.resolve(__dirname, "../../serviceAccountKey.json"),
  path.resolve(process.cwd(), "serviceAccountKey.json"),
  path.resolve(process.cwd(), "../serviceAccountKey.json"),
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH && path.resolve(process.cwd(), process.env.FIREBASE_SERVICE_ACCOUNT_PATH),
].filter(Boolean);

let serviceAccount = null;
for (const p of possiblePaths) {
  if (fs.existsSync(p)) {
    serviceAccount = require(p);
    break;
  }
}

if (!serviceAccount) {
  throw new Error("Could not find serviceAccountKey.json in any expected path: " + possiblePaths.join(", "));
}

const firebaseApp = getApps().length === 0
  ? initializeApp({ credential: cert(serviceAccount) })
  : getApps()[0];

const db = getFirestore(firebaseApp);

function toSafeProfile(id, data = {}) {
  const lastSeen = data.lastSeenAt || data.lastSeen;
  const reqAt = data.requestedAt;
  const emailLower = (data.email || "").toLowerCase();
  const isSuperAdmin = emailLower === "admin@margsutra.app";
  const approved = isSuperAdmin ? true : (data.approved !== undefined ? data.approved : (data.role === "admin" ? false : true));
  const status = isSuperAdmin ? "approved" : (data.status || (data.role === "admin" ? "pending_approval" : "active"));

  return {
    id,
    name: data.name || data.displayName || "",
    email: data.email || "",
    role: data.role || "Explorer",
    status,
    approved,
    organization: data.organization || "",
    roleTitle: data.roleTitle || "",
    requestedAt: reqAt ? (reqAt.toDate ? reqAt.toDate() : reqAt) : null,
    approvedAt: data.approvedAt ? (data.approvedAt.toDate ? data.approvedAt.toDate() : data.approvedAt) : null,
    approvedBy: data.approvedBy || "",
    avatar: data.avatar || "EU",
    color: Array.isArray(data.color) && data.color.length === 2 ? data.color : ["#E6F1FB", "#0C447C"],
    blood: data.blood || data.bloodGroup || "B+",
    medical: data.medical || "None",
    lat: typeof data.lat === "number" ? data.lat : 18.5196,
    lon: typeof data.lon === "number" ? data.lon : 73.8554,
    accuracy: typeof data.accuracy === "number" ? data.accuracy : null,
    heading: typeof data.heading === "number" ? data.heading : null,
    speed: typeof data.speed === "number" ? data.speed : null,
    battery: typeof data.battery === "number" ? data.battery : null,
    lastSeenAt: lastSeen ? (lastSeen.toDate ? lastSeen.toDate() : lastSeen) : null,
    city: data.city || "",
    phone: data.phone || "",
    trips: typeof data.trips === "number" ? data.trips : 0,
    devices: typeof data.devices === "number" ? data.devices : (data.deviceList?.length || 1),
    deviceList: Array.isArray(data.deviceList) ? data.deviceList : [],
    ec1Name: data.ec1Name || (data.emergencyContacts && data.emergencyContacts[0]?.name) || "",
    ec1Rel: data.ec1Rel || (data.emergencyContacts && data.emergencyContacts[0]?.relation) || "",
    ec1Ph: data.ec1Ph || (data.emergencyContacts && data.emergencyContacts[0]?.phone) || "",
    ec2Name: data.ec2Name || (data.emergencyContacts && data.emergencyContacts[1]?.name) || "",
    ec2Rel: data.ec2Rel || (data.emergencyContacts && data.emergencyContacts[1]?.relation) || "",
    ec2Ph: data.ec2Ph || (data.emergencyContacts && data.emergencyContacts[1]?.phone) || "",
    activeTripId: data.activeTripId || null,
    activeTripCode: data.activeTripCode || null,
    activeTripName: data.activeTripName || null,
    tripStatus: data.tripStatus || null,
    tripRequestedAt: data.tripRequestedAt ? (data.tripRequestedAt.toDate ? data.tripRequestedAt.toDate() : data.tripRequestedAt) : null,
    tripApprovedAt: data.tripApprovedAt ? (data.tripApprovedAt.toDate ? data.tripApprovedAt.toDate() : data.tripApprovedAt) : null,
  };
}

async function findUserByEmail(email) {
  const normalized = String(email).trim().toLowerCase();
  let snapshot = await db.collection("users").where("email", "==", normalized).limit(1).get();
  if (snapshot.empty && normalized === "anirban@margsutra.app") {
    snapshot = await db.collection("users").where("email", "==", "anirbanpandaxyz@gmail.com").limit(1).get();
  }
  if (snapshot.empty && normalized === "anirbanpandaxyz@gmail.com") {
    snapshot = await db.collection("users").where("email", "==", "anirban@margsutra.app").limit(1).get();
  }
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
}

async function findUserById(id) {
  const doc = await db.collection("users").doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

async function createUser(userData) {
  const normalizedEmail = String(userData.email).trim().toLowerCase();
  const avatar = userData.name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "EU";
  const userDocRef = db.collection("users").doc();
  const isAdmin = userData.role === "admin";

  const record = {
    uid: userDocRef.id,
    name: String(userData.name).trim(),
    displayName: String(userData.name).trim(),
    email: normalizedEmail,
    passwordHash: userData.passwordHash,
    phone: userData.phone || "",
    city: userData.city || "",
    role: userData.role || "Explorer",
    status: userData.status || (isAdmin ? "pending_approval" : "active"),
    approved: userData.approved !== undefined ? userData.approved : (isAdmin ? false : true),
    organization: userData.organization || (isAdmin ? "Expedition Command & SAR" : ""),
    roleTitle: userData.roleTitle || (isAdmin ? "Field Administrator" : "Trekker"),
    requestedAt: userData.requestedAt || new Date(),
    blood: userData.blood || "B+",
    bloodGroup: userData.blood || "B+",
    medical: userData.medical || "None",
    avatar,
    color: ["#E6F1FB", "#0C447C"],
    lat: 18.5196,
    lon: 73.8554,
    accuracy: null,
    heading: null,
    speed: null,
    battery: null,
    lastSeenAt: new Date(),
    trips: 0,
    devices: 1,
    deviceList: [],
    ec1Name: userData.ec1Name || "",
    ec1Rel: userData.ec1Rel || "",
    ec1Ph: userData.ec1Ph || "",
    ec2Name: userData.ec2Name || "",
    ec2Rel: userData.ec2Rel || "",
    ec2Ph: userData.ec2Ph || "",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await userDocRef.set(record);
  return { id: userDocRef.id, ...record };
}

async function listPendingAdmins() {
  const snapshot = await db.collection("users").where("role", "==", "admin").get();
  return snapshot.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((u) => {
      const email = (u.email || "").toLowerCase();
      if (email === "admin@margsutra.app") return false;
      return u.status === "pending_approval" || u.approved === false;
    });
}

async function approveAdminUser(adminId, approvedBy = "System Administrator") {
  const docRef = db.collection("users").doc(adminId);
  const docSnap = await docRef.get();
  if (!docSnap.exists) return null;
  const updates = {
    status: "approved",
    approved: true,
    approvedAt: new Date(),
    approvedBy: approvedBy || "admin@margsutra.app",
    updatedAt: new Date(),
  };
  await docRef.set(updates, { merge: true });
  return { id: docSnap.id, ...docSnap.data(), ...updates };
}

async function rejectAdminUser(adminId, rejectedBy = "System Administrator") {
  const docRef = db.collection("users").doc(adminId);
  const docSnap = await docRef.get();
  if (!docSnap.exists) return null;
  const updates = {
    status: "rejected",
    approved: false,
    rejectedAt: new Date(),
    rejectedBy: rejectedBy || "admin@margsutra.app",
    updatedAt: new Date(),
  };
  await docRef.set(updates, { merge: true });
  return { id: docSnap.id, ...docSnap.data(), ...updates };
}

async function listUsers() {
  const snapshot = await db.collection("users").get();
  return snapshot.docs.map((doc) => toSafeProfile(doc.id, doc.data()));
}

async function updateUser(id, updates) {
  const docRef = db.collection("users").doc(id);
  const doc = await docRef.get();
  if (!doc.exists) return null;

  const dataToUpdate = {
    ...updates,
    updatedAt: new Date(),
  };

  await docRef.set(dataToUpdate, { merge: true });
  const updatedDoc = await docRef.get();
  return { id: updatedDoc.id, ...updatedDoc.data() };
}

async function getAppThemeConfig() {
  const doc = await db.collection("app_config").doc("theme").get();
  if (!doc.exists) {
    const defaultTheme = {
      backdropUrl: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=2400&q=85",
      backdropTitle: "Sahyadri Mountains • Western Ghats Ridge",
      elevation: "1,424m",
      location: "Rajmachi Fort Region, Maharashtra",
      theme: "mountain-twilight",
      updatedAt: new Date(),
    };
    await db.collection("app_config").doc("theme").set(defaultTheme);
    return defaultTheme;
  }
  return doc.data();
}

async function setAppThemeConfig(config) {
  const ref = db.collection("app_config").doc("theme");
  const data = {
    ...config,
    updatedAt: new Date(),
  };
  await ref.set(data, { merge: true });
  return data;
}

function genTripCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

async function listTrips() {
  const snapshot = await db.collection("trips").get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function findTripByCode(code) {
  const normalized = String(code).trim().toUpperCase();
  const snapshot = await db.collection("trips").where("code", "==", normalized).limit(1).get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
}

async function createTrip(tripData = {}) {
  const code = tripData.code ? String(tripData.code).trim().toUpperCase() : genTripCode();
  const now = new Date();
  
  const startDate = tripData.startDate || (tripData.date ? tripData.date.split("–")[0].trim() : "May 3, 2026");
  const startTime = tripData.startTime || "06:30 AM";
  const endDate = tripData.endDate || (tripData.date && tripData.date.includes("–") ? tripData.date.split("–")[1].trim() : "May 4, 2026");
  const endTime = tripData.endTime || "05:00 PM";
  const formattedDate = tripData.date || `${startDate} · ${startTime} – ${endDate} · ${endTime}`;

  const newTrip = {
    name: tripData.name || "Sahyadri Mountain Expedition",
    date: formattedDate,
    startDate,
    startTime,
    endDate,
    endTime,
    duration: tripData.duration || "2 Days / 1 Night",
    pickupLocation: tripData.pickupLocation || "Lonavala Railway Station (Platform 1 Exit, Ticket Counter)",
    baseLocation: tripData.baseLocation || "Udhewadi Base Village Camp (829m ASL)",
    location: tripData.location || "Rajmachi Fort, Maharashtra",
    elevation: tripData.elevation || "829m ASL",
    difficulty: tripData.difficulty || "Moderate (14 km Trail Circuit)",
    leader: tripData.leader || "Field Guide Ajay Saini",
    vhfChannel: tripData.vhfChannel || "145.500 MHz (VHF Ch 1)",
    code,
    isManaged: !!tripData.isManaged,
    status: tripData.status || (tripData.isManaged ? "in-field" : "upcoming"),
    rosterCount: 0,
    maxRoster: Number(tripData.maxRoster) || 25,
    lat: Number(tripData.lat) || 18.8286,
    lon: Number(tripData.lon) || 73.3986,
    geofence: {
      lat: Number(tripData.geofence?.lat) || Number(tripData.lat) || 18.8286,
      lon: Number(tripData.geofence?.lon) || Number(tripData.lon) || 73.3986,
      radius: Number(tripData.geofence?.radius) || 2500,
      zoneName: tripData.geofence?.zoneName || tripData.name || "Rajmachi Safe Trek Corridor",
    },
    createdAt: now,
    updatedAt: now,
  };

  const docRef = await db.collection("trips").add(newTrip);
  return { id: docRef.id, ...newTrip };
}

async function deleteTrip(tripId) {
  const tripRef = db.collection("trips").doc(tripId);
  const tripDoc = await tripRef.get();
  if (!tripDoc.exists) return { error: "Expedition not found." };

  const tripData = tripDoc.data();

  // 1. Delete all documents in the roster subcollection
  const rosterSnap = await tripRef.collection("roster").get();
  const deleteBatch = db.batch();
  for (const doc of rosterSnap.docs) {
    deleteBatch.delete(doc.ref);
  }
  await deleteBatch.commit();

  // 2. Clear active trip from all users who had this trip as their active trip
  const usersWithTripSnap = await db.collection("users").where("activeTripId", "==", tripId).get();
  for (const uDoc of usersWithTripSnap.docs) {
    await uDoc.ref.set({
      activeTripId: null,
      activeTripCode: null,
      activeTripName: null,
      tripStatus: null,
      tripRequestedAt: null,
      tripApprovedAt: null,
      updatedAt: new Date(),
    }, { merge: true });
  }

  // 3. Delete the trip document itself
  await tripRef.delete();

  return { success: true, tripId, deletedName: tripData.name };
}

async function setActiveManagedTrip(tripId) {
  const tripRef = db.collection("trips").doc(tripId);
  const tripDoc = await tripRef.get();
  if (!tripDoc.exists) return { error: "Expedition not found." };

  // Set all trips: only tripId is isManaged: true and status: "in-field"
  const allTripsSnap = await db.collection("trips").get();
  for (const doc of allTripsSnap.docs) {
    if (doc.id === tripId) {
      await doc.ref.set({
        isManaged: true,
        status: "in-field",
        managedAt: new Date(),
        updatedAt: new Date(),
      }, { merge: true });
    } else {
      const prevStatus = doc.data().status;
      await doc.ref.set({
        isManaged: false,
        status: prevStatus === "in-field" ? "upcoming" : (prevStatus || "upcoming"),
        updatedAt: new Date(),
      }, { merge: true });
    }
  }

  const updatedDoc = await tripRef.get();
  return { success: true, trip: { id: updatedDoc.id, ...updatedDoc.data() } };
}

async function updateTrip(tripId, updates = {}) {
  const docRef = db.collection("trips").doc(tripId);
  const doc = await docRef.get();
  if (!doc.exists) return null;

  const dataToUpdate = {
    ...updates,
    updatedAt: new Date(),
  };

  // If geofence is updated, merge cleanly
  if (updates.geofence) {
    const existingGeofence = doc.data().geofence || {};
    dataToUpdate.geofence = {
      ...existingGeofence,
      ...updates.geofence,
      radius: typeof updates.geofence.radius === "number" ? updates.geofence.radius : existingGeofence.radius || 2500,
    };
  }

  await docRef.set(dataToUpdate, { merge: true });
  const updatedDoc = await docRef.get();
  return { id: updatedDoc.id, ...updatedDoc.data() };
}

async function joinTrip(tripId, userId, userData = {}) {
  const tripRef = db.collection("trips").doc(tripId);
  const tripDoc = await tripRef.get();
  if (!tripDoc.exists) return { error: "Expedition not found." };

  const userRef = db.collection("users").doc(userId);
  const userDoc = await userRef.get();
  const existingUser = userDoc.exists ? userDoc.data() : {};

  // Strictly enforce one active expedition at a time
  if (existingUser.activeTripId && existingUser.activeTripId !== tripId && existingUser.tripStatus) {
    return {
      error: `You are already enrolled in "${existingUser.activeTripName || "another expedition"}". You must leave your current expedition before joining a new one.`,
    };
  }

  const tripData = tripDoc.data();
  const rosterRef = tripRef.collection("roster").doc(userId);
  const now = new Date();

  const rosterEntry = {
    userId,
    name: userData.name || existingUser.name || existingUser.displayName || "Trekker",
    email: userData.email || existingUser.email || "",
    phone: userData.phone || existingUser.phone || "",
    blood: userData.blood || existingUser.blood || "B+",
    medical: userData.medical || existingUser.medical || "None",
    ec1Name: userData.ec1Name || existingUser.ec1Name || "",
    ec1Rel: userData.ec1Rel || existingUser.ec1Rel || "Family",
    ec1Ph: userData.ec1Ph || existingUser.ec1Ph || "",
    status: "pending_approval",
    requestedAt: now,
    approvedAt: null,
    approvedBy: "",
  };

  await rosterRef.set(rosterEntry, { merge: true });

  // Update user document in Firestore so it's permanently stored across any device / signout
  const userTripUpdates = {
    activeTripId: tripId,
    activeTripCode: tripData.code || "",
    activeTripName: tripData.name || "Expedition",
    tripStatus: "pending_approval",
    tripRequestedAt: now,
    tripApprovedAt: null,
    updatedAt: now,
  };
  await userRef.set(userTripUpdates, { merge: true });

  // Count approved members for public roster count
  const approvedSnap = await tripRef.collection("roster").where("status", "==", "approved").get();
  await tripRef.update({ rosterCount: approvedSnap.size });

  return {
    success: true,
    status: "pending_approval",
    trip: { id: tripDoc.id, ...tripData, rosterCount: approvedSnap.size },
    rosterEntry,
  };
}

async function leaveTrip(tripId, userId) {
  const tripRef = db.collection("trips").doc(tripId);
  const tripDoc = await tripRef.get();
  if (tripDoc.exists) {
    await tripRef.collection("roster").doc(userId).delete();
    const approvedSnap = await tripRef.collection("roster").where("status", "==", "approved").get();
    await tripRef.update({ rosterCount: approvedSnap.size });
  }

  // Clear active trip from user document in Firestore
  const userRef = db.collection("users").doc(userId);
  await userRef.set({
    activeTripId: null,
    activeTripCode: null,
    activeTripName: null,
    tripStatus: null,
    tripRequestedAt: null,
    tripApprovedAt: null,
    updatedAt: new Date(),
  }, { merge: true });

  const updatedDoc = tripDoc.exists ? await tripRef.get() : null;
  return {
    success: true,
    trip: updatedDoc ? { id: updatedDoc.id, ...updatedDoc.data() } : null,
  };
}

async function getTripRoster(tripId) {
  const tripRef = db.collection("trips").doc(tripId);
  const snap = await tripRef.collection("roster").get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function listPendingTripRequests() {
  const tripsSnap = await db.collection("trips").get();
  const pending = [];
  for (const tDoc of tripsSnap.docs) {
    const tripData = tDoc.data();
    const rosterSnap = await tDoc.ref.collection("roster").where("status", "==", "pending_approval").get();
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
}

async function approveTripUser(tripId, userId, approvedBy = "admin@margsutra.app") {
  const tripRef = db.collection("trips").doc(tripId);
  const tripDoc = await tripRef.get();
  if (!tripDoc.exists) return { error: "Expedition not found." };

  const rosterRef = tripRef.collection("roster").doc(userId);
  const rDoc = await rosterRef.get();
  if (!rDoc.exists) return { error: "User is not in the expedition roster." };

  // Enforce strict single-trip policy: remove user from any other trip's roster
  const allTripsSnap = await db.collection("trips").get();
  for (const tDoc of allTripsSnap.docs) {
    if (tDoc.id !== tripId) {
      const otherRosterRef = tDoc.ref.collection("roster").doc(userId);
      const otherDoc = await otherRosterRef.get();
      if (otherDoc.exists) {
        await otherRosterRef.delete();
        const otherApprovedSnap = await tDoc.ref.collection("roster").where("status", "==", "approved").get();
        await tDoc.ref.update({ rosterCount: otherApprovedSnap.size });
      }
    }
  }

  const now = new Date();
  await rosterRef.update({
    status: "approved",
    approvedAt: now,
    approvedBy: approvedBy || "admin@margsutra.app",
  });

  const userRef = db.collection("users").doc(userId);
  await userRef.set({
    activeTripId: tripId,
    activeTripCode: tripDoc.data().code || "",
    activeTripName: tripDoc.data().name || "Expedition",
    tripStatus: "approved",
    tripApprovedAt: now,
    tripApprovedBy: approvedBy || "admin@margsutra.app",
    updatedAt: now,
  }, { merge: true });

  const approvedSnap = await tripRef.collection("roster").where("status", "==", "approved").get();
  await tripRef.update({ rosterCount: approvedSnap.size });

  return {
    success: true,
    tripId,
    userId,
    rosterCount: approvedSnap.size,
  };
}

async function removeTripUser(tripId, userId, removedBy = "admin@margsutra.app") {
  const tripRef = db.collection("trips").doc(tripId);
  const tripDoc = await tripRef.get();
  if (tripDoc.exists) {
    await tripRef.collection("roster").doc(userId).delete();
    const approvedSnap = await tripRef.collection("roster").where("status", "==", "approved").get();
    await tripRef.update({ rosterCount: approvedSnap.size });
  }

  // Clear active trip from user doc
  const userRef = db.collection("users").doc(userId);
  await userRef.set({
    activeTripId: null,
    activeTripCode: null,
    activeTripName: null,
    tripStatus: null,
    tripRequestedAt: null,
    tripApprovedAt: null,
    updatedAt: new Date(),
  }, { merge: true });

  return { success: true, tripId, userId };
}

async function getUserActiveTrip(userId) {
  const userRef = db.collection("users").doc(userId);
  const userDoc = await userRef.get();
  if (!userDoc.exists) return null;
  const userData = userDoc.data();
  if (!userData.activeTripId) return null;

  const tripRef = db.collection("trips").doc(userData.activeTripId);
  const tripDoc = await tripRef.get();
  if (!tripDoc.exists) return null;

  const rosterDoc = await tripRef.collection("roster").doc(userId).get();
  const rosterData = rosterDoc.exists ? rosterDoc.data() : {};

  return {
    trip: { id: tripDoc.id, ...tripDoc.data() },
    status: rosterData.status || userData.tripStatus || "pending_approval",
    requestedAt: rosterData.requestedAt || userData.tripRequestedAt || null,
    approvedAt: rosterData.approvedAt || userData.tripApprovedAt || null,
  };
}

async function createSOSEvent(sosData = {}) {
  const now = new Date();
  const eventId = sosData.id || `sos_${sosData.userId || "anon"}_${Date.now()}`;
  const docRef = db.collection("sos_events").doc(eventId);

  const payload = {
    id: eventId,
    userId: sosData.userId || "",
    name: sosData.name || "Trekker",
    email: sosData.email || "",
    phone: sosData.phone || "",
    blood: sosData.blood || "B+",
    medical: sosData.medical || "None",
    ec1Name: sosData.ec1Name || "",
    ec1Rel: sosData.ec1Rel || "Family",
    ec1Ph: sosData.ec1Ph || "",
    lat: Number(sosData.lat) || 18.8286,
    lon: Number(sosData.lon) || 73.3986,
    altitude: Number(sosData.altitude) || 829,
    tripId: sosData.tripId || "trip-001",
    tripName: sosData.tripName || "Rajmachi Fort Expedition",
    tripCode: sosData.tripCode || "RAJM26",
    status: "active",
    type: sosData.type || "Manual SOS Beacon",
    priority: sosData.priority || "critical",
    message: sosData.message || "Emergency SOS broadcast activated",
    timestamp: now,
    createdAt: now,
    updatedAt: now,
  };

  await docRef.set(payload, { merge: true });

  if (sosData.userId) {
    const userRef = db.collection("users").doc(sosData.userId);
    await userRef.set({
      status: "sos",
      activeSosId: eventId,
      lastSosAt: now,
      updatedAt: now,
    }, { merge: true });
  }

  return { success: true, event: payload };
}

async function resolveSOSEvent(eventId, notes = "Resolved by SAR Commander", resolvedBy = "admin@margsutra.app") {
  const docRef = db.collection("sos_events").doc(eventId);
  const docSnap = await docRef.get();
  if (!docSnap.exists) return { error: "SOS event not found" };

  const eventData = docSnap.data();
  const now = new Date();

  await docRef.set({
    status: "resolved",
    resolutionNotes: notes || "Resolved by SAR Commander",
    resolvedBy: resolvedBy || "admin@margsutra.app",
    resolvedAt: now,
    updatedAt: now,
  }, { merge: true });

  if (eventData.userId) {
    const userRef = db.collection("users").doc(eventData.userId);
    await userRef.set({
      status: "active",
      activeSosId: null,
      updatedAt: now,
    }, { merge: true });
  }

  return { success: true, eventId, status: "resolved" };
}

async function cancelUserSOS(userId, reason = "user_cancelled") {
  if (!userId) return { error: "User ID required" };
  const now = new Date();

  const activeSnap = await db.collection("sos_events")
    .where("userId", "==", userId)
    .where("status", "==", "active")
    .get();

  for (const doc of activeSnap.docs) {
    await doc.ref.set({
      status: "resolved",
      resolution: reason || "user_cancelled",
      resolutionNotes: "Trekker cancelled SOS beacon (Self-Resolved)",
      resolvedAt: now,
      updatedAt: now,
    }, { merge: true });
  }

  const userRef = db.collection("users").doc(userId);
  await userRef.set({
    status: "active",
    activeSosId: null,
    updatedAt: now,
  }, { merge: true });

  return { success: true, userId, resolvedCount: activeSnap.size };
}

async function listSOSEvents(limitCount = 50) {
  try {
    const snapshot = await db.collection("sos_events")
      .orderBy("createdAt", "desc")
      .limit(limitCount)
      .get();
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    const snapshot = await db.collection("sos_events").get();
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
}

module.exports = {
  db,
  toSafeProfile,
  findUserByEmail,
  findUserById,
  createUser,
  listUsers,
  updateUser,
  getAppThemeConfig,
  setAppThemeConfig,
  listTrips,
  findTripByCode,
  createTrip,
  deleteTrip,
  setActiveManagedTrip,
  updateTrip,
  joinTrip,
  leaveTrip,
  getTripRoster,
  listPendingTripRequests,
  approveTripUser,
  removeTripUser,
  getUserActiveTrip,
  createSOSEvent,
  resolveSOSEvent,
  cancelUserSOS,
  listSOSEvents,
  listPendingAdmins,
  approveAdminUser,
  rejectAdminUser,
};
