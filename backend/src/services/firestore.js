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

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// One admin can be in charge of at most one expedition at a time.
async function findInChargeConflict(adminId, exceptTripId = null) {
  if (!adminId) return null;
  const snap = await db.collection("trips").where("adminInCharge", "==", adminId).limit(5).get();
  for (const d of snap.docs) {
    if (d.id === exceptTripId) continue;
    const t = d.data();
    return { id: d.id, name: t.name || "another expedition" };
  }
  return null;
}

async function assertAdminUser(adminId) {
  if (!adminId) throw new HttpError(400, "An admin in charge is required — an expedition can never have zero admins.");
  const doc = await db.collection("users").doc(adminId).get();
  if (!doc.exists) throw new HttpError(400, "Selected admin account was not found.");
  const data = doc.data();
  if ((data.role || "").toLowerCase() !== "admin") {
    throw new HttpError(400, `${data.name || "That account"} is not an admin and cannot be in charge of an expedition.`);
  }
  return { id: doc.id, name: data.name || data.email || "Admin", email: data.email || "" };
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

function normalizeGearList(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  return String(value)
    .split(/\r?\n|,/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function normalizeAdminIds(values, fallback = null) {
  const list = Array.isArray(values) ? values : values ? [values] : [];
  const out = [];
  for (const v of [...list, fallback]) {
    const id = typeof v === "object" && v ? v.id || v.uid : v;
    if (id && !out.includes(String(id))) out.push(String(id));
  }
  return out;
}

async function createTrip(tripData = {}) {
  const code = tripData.code ? String(tripData.code).trim().toUpperCase() : genTripCode();
  const now = new Date();

  const startDate = tripData.startDate || (tripData.date ? tripData.date.split("–")[0].trim() : "May 3, 2026");
  const startTime = tripData.startTime || "06:30 AM";
  const endDate = tripData.endDate || (tripData.date && tripData.date.includes("–") ? tripData.date.split("–")[1].trim() : "May 4, 2026");
  const endTime = tripData.endTime || "05:00 PM";
  const formattedDate = tripData.date || `${startDate} · ${startTime} – ${endDate} · ${endTime}`;

  // An expedition can never have zero admins. The creator is admin-in-charge
  // by default; an admin can only be in charge of one expedition at a time.
  const createdBy = tripData.createdBy || tripData.creatorId || null;
  const adminInCharge = tripData.adminInCharge || tripData.inChargeId || createdBy;
  const inChargeProfile = await assertAdminUser(adminInCharge);

  const conflict = await findInChargeConflict(adminInCharge);
  if (conflict) {
    throw new HttpError(
      409,
      `${inChargeProfile.name} is already in charge of "${conflict.name}". An admin can only be in charge of one expedition at a time.`
    );
  }

  const adminIds = normalizeAdminIds(tripData.admins, adminInCharge);
  const admins = [];
  for (const id of adminIds) {
    const profile = id === inChargeProfile.id ? inChargeProfile : await assertAdminUser(id);
    admins.push({ id: profile.id, name: profile.name, email: profile.email });
  }

  const maxRoster = Number(tripData.maxRoster);
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
    leader: tripData.leader || inChargeProfile.name,
    vhfChannel: tripData.vhfChannel || "145.500 MHz (VHF Ch 1)",
    instructions: String(tripData.instructions || "").trim(),
    gearList: normalizeGearList(tripData.gearList || tripData.gear),
    notes: String(tripData.notes || "").trim(),
    code,
    isManaged: !!tripData.isManaged,
    status: tripData.status || (tripData.isManaged ? "in-field" : "upcoming"),
    rosterCount: Number(tripData.baseRosterCount) || 0,
    baseRosterCount: Number(tripData.baseRosterCount) || 0,
    demoRoster: !!tripData.demoRoster,
    maxRoster: maxRoster > 0 ? maxRoster : 25,
    admins,
    adminInCharge: inChargeProfile.id,
    adminInChargeName: inChargeProfile.name,
    createdBy: createdBy || inChargeProfile.id,
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
  const existing = doc.data();

  const dataToUpdate = {
    ...updates,
    updatedAt: new Date(),
  };

  // Never let the roster count be written directly by a client.
  delete dataToUpdate.rosterCount;

  if (updates.maxRoster !== undefined || updates.slots !== undefined) {
    const slots = Number(updates.maxRoster ?? updates.slots);
    if (!Number.isFinite(slots) || slots < 1) {
      throw new HttpError(400, "Expedition slots must be at least 1.");
    }
    dataToUpdate.maxRoster = slots;
    delete dataToUpdate.slots;
  }

  if (updates.gearList !== undefined || updates.gear !== undefined) {
    dataToUpdate.gearList = normalizeGearList(updates.gearList ?? updates.gear);
    delete dataToUpdate.gear;
  }

  if (updates.instructions !== undefined) {
    dataToUpdate.instructions = String(updates.instructions || "").trim();
  }
  if (updates.notes !== undefined) {
    dataToUpdate.notes = String(updates.notes || "").trim();
  }

  const adminsTouched = updates.admins !== undefined || updates.adminInCharge !== undefined
    || updates.inChargeId !== undefined;

  if (adminsTouched) {
    const currentInCharge = existing.adminInCharge || null;
    const requestedInCharge = updates.adminInCharge || updates.inChargeId || null;
    const targetInCharge = requestedInCharge || currentInCharge;

    let adminIds = updates.admins !== undefined
      ? normalizeAdminIds(updates.admins, targetInCharge)
      : normalizeAdminIds((existing.admins || []).map((a) => a.id || a), targetInCharge);

    if (targetInCharge) adminIds = normalizeAdminIds(adminIds, targetInCharge);

    if (adminIds.length === 0) {
      throw new HttpError(400, "An expedition must always have at least one admin.");
    }

    const inChargeId = targetInCharge || adminIds[0];
    if (!adminIds.includes(inChargeId)) adminIds.push(inChargeId);

    const inChargeProfile = await assertAdminUser(inChargeId);
    if (inChargeId !== currentInCharge) {
      const conflict = await findInChargeConflict(inChargeId, tripId);
      if (conflict) {
        throw new HttpError(
          409,
          `${inChargeProfile.name} is already in charge of "${conflict.name}". An admin can only be in charge of one expedition at a time.`
        );
      }
    }

    const admins = [];
    for (const id of adminIds) {
      const profile = id === inChargeProfile.id ? inChargeProfile : await assertAdminUser(id);
      admins.push({ id: profile.id, name: profile.name, email: profile.email });
    }

    dataToUpdate.admins = admins;
    dataToUpdate.adminInCharge = inChargeProfile.id;
    dataToUpdate.adminInChargeName = inChargeProfile.name;
    if (!existing.leader && !updates.leader) dataToUpdate.leader = inChargeProfile.name;

    delete dataToUpdate.inChargeId;
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
  const baseCount = Number(tripData.baseRosterCount) || 0;
  const maxRoster = Number(tripData.maxRoster) || 25;

  // Capacity check (base roster counts mocked/demo members for demo trips).
  const existingApproved = await tripRef.collection("roster").where("status", "==", "approved").get();
  if (baseCount + existingApproved.size >= maxRoster) {
    return { error: "This expedition is full — all slots have been taken." };
  }

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
  await tripRef.update({ rosterCount: (Number(tripDoc.data()?.baseRosterCount) || 0) + approvedSnap.size });

  return {
    success: true,
    status: "pending_approval",
    trip: { id: tripDoc.id, ...tripData, rosterCount: baseCount + existingApproved.size },
    rosterEntry,
  };
}

async function leaveTrip(tripId, userId) {
  const tripRef = db.collection("trips").doc(tripId);
  const tripDoc = await tripRef.get();
  if (tripDoc.exists) {
    await tripRef.collection("roster").doc(userId).delete();
    const approvedSnap = await tripRef.collection("roster").where("status", "==", "approved").get();
    await tripRef.update({ rosterCount: (Number(tripDoc.data()?.baseRosterCount) || 0) + approvedSnap.size });
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

  const tripData = tripDoc.data();
  const baseCount = Number(tripData.baseRosterCount) || 0;
  const maxRoster = Number(tripData.maxRoster) || 25;

  // Never approve past capacity, even if several pending requests exist.
  if ((rDoc.data()?.status || "") !== "approved") {
    const approvedSnap = await tripRef.collection("roster").where("status", "==", "approved").get();
    if (baseCount + approvedSnap.size >= maxRoster) {
      return { error: "This expedition is full — raise the slots or remove a trekker before approving." };
    }
  }

  // Enforce strict single-trip policy: remove user from any other trip's roster
  const allTripsSnap = await db.collection("trips").get();
  for (const tDoc of allTripsSnap.docs) {
    if (tDoc.id !== tripId) {
      const otherRosterRef = tDoc.ref.collection("roster").doc(userId);
      const otherDoc = await otherRosterRef.get();
      if (otherDoc.exists) {
        await otherRosterRef.delete();
        const otherApprovedSnap = await tDoc.ref.collection("roster").where("status", "==", "approved").get();
        await tDoc.ref.update({ rosterCount: (Number(tDoc.data()?.baseRosterCount) || 0) + otherApprovedSnap.size });
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
    activeTripCode: tripData.code || "",
    activeTripName: tripData.name || "Expedition",
    tripStatus: "approved",
    tripApprovedAt: now,
    tripApprovedBy: approvedBy || "admin@margsutra.app",
    updatedAt: now,
  }, { merge: true });

  const approvedSnap = await tripRef.collection("roster").where("status", "==", "approved").get();
  await tripRef.update({ rosterCount: baseCount + approvedSnap.size });

  return {
    success: true,
    tripId,
    userId,
    rosterCount: baseCount + approvedSnap.size,
  };
}

async function removeTripUser(tripId, userId, removedBy = "admin@margsutra.app") {
  const tripRef = db.collection("trips").doc(tripId);
  const tripDoc = await tripRef.get();
  if (tripDoc.exists) {
    await tripRef.collection("roster").doc(userId).delete();
    const approvedSnap = await tripRef.collection("roster").where("status", "==", "approved").get();
    await tripRef.update({ rosterCount: (Number(tripDoc.data()?.baseRosterCount) || 0) + approvedSnap.size });
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

  return { success: true, eventId, userId: eventData.userId || null, status: "resolved" };
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

const DEMO_TRIP_CODE = "RAJM26";
const DEMO_TRIP_FIELDS = {
  name: "Rajmachi Fort Night Trek",
  startDate: "Dec 12, 2026",
  startTime: "06:30 AM",
  endDate: "Dec 13, 2026",
  endTime: "05:00 PM",
  duration: "2 Days / 1 Night",
  location: "Rajmachi Fort, Lonavala",
  elevation: "826m ASL",
  difficulty: "Moderate · 14 km trail circuit",
  pickupLocation: "Lonavala Railway Station, Platform 1 exit",
  baseLocation: "Udhewadi Base Village Camp",
  instructions:
    "Report at Lonavala station by 06:00 AM. Carry a valid photo ID for the forest checkpoint. " +
    "Follow the trek lead at all times and stay within the marked corridor. Night navigation " +
    "sections require a headlamp — no phone flashlights. Camp is dry: no alcohol or open fires.",
  gearList: [
    "Trekking shoes with grip",
    "2L water minimum",
    "Headlamp + spare batteries",
    "Rain shell / poncho",
    "Warm layer for the night",
    "Personal medication + ID",
  ],
  notes: "1 slot left. Confirmation and payment are handled by the Margsutra team over WhatsApp.",
  maxRoster: 6,
  baseRosterCount: 5,
  demoRoster: true,
};

async function seedDemoTrip() {
  const existing = await db.collection("trips").where("code", "==", DEMO_TRIP_CODE).limit(1).get();

  const adminSnap = await db.collection("users").where("email", "==", "admin@margsutra.app").limit(1).get();
  if (adminSnap.empty) {
    console.warn("⚠️  Skipping demo trip seed — no admin@margsutra.app account found.");
    return { created: false, skipped: true };
  }
  const adminDoc = adminSnap.docs[0];
  const adminProfile = { id: adminDoc.id, name: adminDoc.data().name || "Super Admin", email: adminDoc.data().email || "" };

  if (!existing.empty) {
    const doc = existing.docs[0];
    const data = doc.data();
    // Already upgraded (or created by this seed): never overwrite live edits.
    if (data.demoRoster === true) return { created: false, id: doc.id };

    const approvedSnap = await doc.ref.collection("roster").where("status", "==", "approved").get();
    const admins = Array.isArray(data.admins) && data.admins.length ? data.admins : [adminProfile];

    // Keep exactly one open slot while never evicting real approved trekkers.
    await doc.ref.set({
      demoRoster: true,
      baseRosterCount: 5,
      maxRoster: 5 + approvedSnap.size + 1,
      rosterCount: 5 + approvedSnap.size,
      adminInCharge: data.adminInCharge || adminProfile.id,
      adminInChargeName: data.adminInChargeName || adminProfile.name,
      admins,
      createdBy: data.createdBy || adminProfile.id,
      instructions: data.instructions || DEMO_TRIP_FIELDS.instructions,
      gearList: Array.isArray(data.gearList) && data.gearList.length ? data.gearList : DEMO_TRIP_FIELDS.gearList,
      notes: data.notes || DEMO_TRIP_FIELDS.notes,
      updatedAt: new Date(),
    }, { merge: true });

    console.log(`🌱 Upgraded existing ${DEMO_TRIP_CODE} to the Rajmachi demo expedition`);
    return { created: false, upgraded: true, id: doc.id };
  }

  let trip;
  try {
    trip = await createTrip({
      ...DEMO_TRIP_FIELDS,
      code: DEMO_TRIP_CODE,
      createdBy: adminProfile.id,
      adminInCharge: adminProfile.id,
      status: "upcoming",
      lat: 18.8286,
      lon: 73.3986,
      geofence: { lat: 18.8286, lon: 73.3986, radius: 2500, zoneName: "Rajmachi Safe Trek Corridor" },
    });
  } catch (error) {
    if (error instanceof HttpError && error.status === 409) {
      console.warn("⚠️  Demo trip not seeded — the demo admin is already in charge of another expedition.");
      return { created: false, skipped: true };
    }
    throw error;
  }

  console.log(`🌱 Seeded demo expedition "${trip.name}" (${trip.code})`);
  return { created: true, id: trip.id };
}

module.exports = {
  db,
  toSafeProfile,
  HttpError,
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
  seedDemoTrip,
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
