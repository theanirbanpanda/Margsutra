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
  const isSuperAdmin = (data.email || "").toLowerCase() === "admin@coordage.app";
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
  const snapshot = await db.collection("users").where("email", "==", normalized).limit(1).get();
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
      if (email === "admin@coordage.app") return false;
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
    approvedBy: approvedBy || "admin@coordage.app",
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
    rejectedBy: rejectedBy || "admin@coordage.app",
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

async function approveTripUser(tripId, userId, approvedBy = "admin@coordage.app") {
  const tripRef = db.collection("trips").doc(tripId);
  const tripDoc = await tripRef.get();
  if (!tripDoc.exists) return { error: "Expedition not found." };

  const rosterRef = tripRef.collection("roster").doc(userId);
  const rDoc = await rosterRef.get();
  if (!rDoc.exists) return { error: "User is not in the expedition roster." };

  const now = new Date();
  await rosterRef.update({
    status: "approved",
    approvedAt: now,
    approvedBy: approvedBy || "admin@coordage.app",
  });

  const userRef = db.collection("users").doc(userId);
  await userRef.set({
    activeTripId: tripId,
    activeTripCode: tripDoc.data().code || "",
    activeTripName: tripDoc.data().name || "Expedition",
    tripStatus: "approved",
    tripApprovedAt: now,
    tripApprovedBy: approvedBy || "admin@coordage.app",
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

async function removeTripUser(tripId, userId, removedBy = "admin@coordage.app") {
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
  joinTrip,
  leaveTrip,
  getTripRoster,
  listPendingTripRequests,
  approveTripUser,
  removeTripUser,
  getUserActiveTrip,
  listPendingAdmins,
  approveAdminUser,
  rejectAdminUser,
};
