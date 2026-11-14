const path = require("path");
const fs = require("fs");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const { randomUUID } = require("crypto");

// Set FIRESTORE_EMULATOR_HOST to run against the local Firestore emulator
// (no credentials or production quota needed). Otherwise use the service
// account key.
const usingEmulator = !!(process.env.FIRESTORE_EMULATOR_HOST || "").trim();
const emulatorProjectId = process.env.FIRESTORE_PROJECT_ID || "demo-margsutra";

let serviceAccount = null;
if (!usingEmulator) {
  // Locate service account key
  const possiblePaths = [
    path.resolve(__dirname, "../../../serviceAccountKey.json"),
    path.resolve(__dirname, "../../serviceAccountKey.json"),
    path.resolve(process.cwd(), "serviceAccountKey.json"),
    path.resolve(process.cwd(), "../serviceAccountKey.json"),
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH && path.resolve(process.cwd(), process.env.FIREBASE_SERVICE_ACCOUNT_PATH),
  ].filter(Boolean);

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      serviceAccount = require(p);
      break;
    }
  }

  if (!serviceAccount) {
    throw new Error("Could not find serviceAccountKey.json in any expected path: " + possiblePaths.join(", "));
  }
}

const firebaseApp = getApps().length === 0
  ? initializeApp(
      usingEmulator
        ? { projectId: emulatorProjectId }
        : { credential: cert(serviceAccount) }
    )
  : getApps()[0];

const db = getFirestore(firebaseApp);
if (usingEmulator && !process.env.STORAGE_EMULATOR_HOST) {
  process.env.STORAGE_EMULATOR_HOST = "127.0.0.1:9199";
}
const storageBucketName =
  process.env.FIREBASE_STORAGE_BUCKET ||
  process.env.VITE_FIREBASE_STORAGE_BUCKET ||
  (usingEmulator ? `${emulatorProjectId}.firebasestorage.app` : "") ||
  (serviceAccount?.project_id ? `${serviceAccount.project_id}.firebasestorage.app` : "");

if (usingEmulator) {
  console.log(`🔥 Firestore emulator mode → ${process.env.FIRESTORE_EMULATOR_HOST} (project ${emulatorProjectId})`);
}

function toSafeProfile(id, data = {}) {
  const lastSeen = data.lastSeenAt || data.lastSeen;
  const reqAt = data.requestedAt;
  const emailLower = (data.email || "").toLowerCase();
  const isSuperAdmin = emailLower === DEMO_ADMIN_EMAIL;
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
    bloodGroup: data.bloodGroup || data.blood || "B+",
    medical: data.medical || "None",
    allergies: data.allergies || "None",
    medications: data.medications || "None",
    insurancePolicy: data.insurancePolicy || "",
    emergencyBeaconId: data.emergencyBeaconId || "",
    age: data.age ?? "",
    sex: data.sex || data.gender || "",
    occupation: data.occupation || "",
    experienceLevel: data.experienceLevel || data.trekkingCapability || "",
    trekkingCapability: data.trekkingCapability || data.experienceLevel || "",
    lat: typeof data.lat === "number" ? data.lat : 18.5196,
    lon: typeof data.lon === "number" ? data.lon : 73.8554,
    accuracy: typeof data.accuracy === "number" ? data.accuracy : null,
    heading: typeof data.heading === "number" ? data.heading : null,
    speed: typeof data.speed === "number" ? data.speed : null,
    battery: typeof data.battery === "number" ? data.battery : null,
    lastSeenAt: lastSeen ? (lastSeen.toDate ? lastSeen.toDate() : lastSeen) : null,
    // The console needs the live incident id to tie a trekker's "sos" status
    // back to the beacon in the dispatch feed.
    activeSosId: data.activeSosId || null,
    lastSosAt: data.lastSosAt ? (data.lastSosAt.toDate ? data.lastSosAt.toDate() : data.lastSosAt) : null,
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
  const userDocRef = userData.id ? db.collection("users").doc(String(userData.id)) : db.collection("users").doc();
  const isAdmin = userData.role === "admin";

  const record = {
    uid: userDocRef.id,
    name: String(userData.name).trim(),
    displayName: String(userData.name).trim(),
    email: normalizedEmail,
    passwordHash: userData.passwordHash,
    phone: userData.phone || "",
    city: userData.city || "",
    age: userData.age ?? "",
    sex: userData.sex || "",
    occupation: userData.occupation || "",
    experienceLevel: userData.experienceLevel || userData.trekkingCapability || "",
    trekkingCapability: userData.trekkingCapability || userData.experienceLevel || "",
    role: userData.role || "Explorer",
    status: userData.status || (isAdmin ? "pending_approval" : "active"),
    approved: userData.approved !== undefined ? userData.approved : (isAdmin ? false : true),
    organization: userData.organization || (isAdmin ? "Expedition Command & SAR" : ""),
    roleTitle: userData.roleTitle || (isAdmin ? "Field Administrator" : "Trekker"),
    requestedAt: userData.requestedAt || new Date(),
    blood: userData.blood || "B+",
    bloodGroup: userData.blood || "B+",
    medical: userData.medical || "None",
    allergies: userData.allergies || "None",
    medications: userData.medications || "None",
    insurancePolicy: userData.insurancePolicy || "",
    emergencyBeaconId: userData.emergencyBeaconId || "",
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
      if (email === DEMO_ADMIN_EMAIL) return false;
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
    approvedBy: approvedBy || DEMO_ADMIN_EMAIL,
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
    rejectedBy: rejectedBy || DEMO_ADMIN_EMAIL,
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

  if (updates.price !== undefined) {
    const price = Number(updates.price);
    if (!Number.isFinite(price) || price <= 0) throw new HttpError(400, "A trip must have a price greater than zero.");
    dataToUpdate.price = price;
  }
  if (updates.currency !== undefined) {
    const currency = String(updates.currency).trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new HttpError(400, "Currency must be a three-letter ISO code.");
    dataToUpdate.currency = currency;
  }
  if (updates.paymentInstructions !== undefined) {
    dataToUpdate.paymentInstructions = String(updates.paymentInstructions).trim().slice(0, 4000);
  }
  if (updates.coverImageUrl !== undefined) {
    dataToUpdate.coverImageUrl = String(updates.coverImageUrl).trim().slice(0, 2048);
  }

  await docRef.set(dataToUpdate, { merge: true });
  const updatedDoc = await docRef.get();
  return { id: updatedDoc.id, ...updatedDoc.data() };
}

async function saveTripCoverPhoto(imageBuffer, contentType) {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
    throw new HttpError(400, "A cover photo is required.");
  }
  const extensions = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/avif": "avif",
  };
  const extension = extensions[String(contentType || "").toLowerCase()];
  if (!extension) throw new HttpError(415, "Use a JPEG, PNG, WebP, or AVIF image.");
  if (imageBuffer.length > 8 * 1024 * 1024) throw new HttpError(413, "Cover photos must be 8 MB or smaller.");
  if (!storageBucketName) throw new Error("FIREBASE_STORAGE_BUCKET is not configured.");

  const objectPath = `trip-covers/${randomUUID()}.${extension}`;
  const downloadToken = randomUUID();
  const bucket = getStorage(firebaseApp).bucket(storageBucketName);
  const file = bucket.file(objectPath);
  await file.save(imageBuffer, {
    resumable: false,
    metadata: {
      contentType,
      metadata: { firebaseStorageDownloadTokens: downloadToken },
    },
  });
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket.name)}/o/${encodeURIComponent(objectPath)}?alt=media&token=${downloadToken}`;
}

async function deleteRegisteredUser(id) {
  const userRef = db.collection("users").doc(String(id));
  const userSnap = await userRef.get();
  if (!userSnap.exists) return false;
  const userEmail = String(userSnap.data()?.email || "").trim().toLowerCase();
  if (userEmail === DEMO_ADMIN_EMAIL || userEmail === DEMO_USER_EMAIL) {
    const error = new Error("Demo accounts are protected and cannot be deleted.");
    error.code = "PROTECTED_DEMO";
    throw error;
  }

  const sosSnap = await db.collection("sos_events").where("userId", "==", String(id)).get();
  if (sosSnap.docs.some((event) => event.data()?.status === "active")) {
    const error = new Error("Resolve this user's active SOS before deleting their profile.");
    error.code = "ACTIVE_SOS";
    throw error;
  }

  // Remove roster entries everywhere and keep each expedition's count in sync.
  const tripsSnap = await db.collection("trips").get();
  for (const tripDoc of tripsSnap.docs) {
    const tripRef = tripDoc.ref;
    const rosterSnap = await tripRef.collection("roster").get();
    const memberDocs = rosterSnap.docs.filter((rosterDoc) => {
      const rosterUserId = String(rosterDoc.data()?.userId || "");
      return rosterDoc.id === String(id) || rosterUserId === String(id);
    });
    if (!memberDocs.length) continue;
    for (const rosterDoc of memberDocs) await rosterDoc.ref.delete();
    const remainingApproved = await tripRef.collection("roster").where("status", "==", "approved").get();
    await tripRef.update({
      rosterCount: (Number(tripDoc.data()?.baseRosterCount) || 0) + remainingApproved.size,
    });
  }

  await userRef.delete();
  return true;
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
  const price = Number(tripData.price) || 0;
  const currency = String(tripData.currency || "INR").trim().toUpperCase();
  if (!Number.isFinite(price) || price <= 0) throw new HttpError(400, "A trip must have a price greater than zero.");
  if (!/^[A-Z]{3}$/.test(currency)) throw new HttpError(400, "Currency must be a three-letter ISO code.");
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
    price,
    currency,
    paymentInstructions: String(tripData.paymentInstructions || "").trim().slice(0, 4000),
    coverImageUrl: String(tripData.coverImageUrl || "").trim().slice(0, 2048),
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

async function joinTrip(tripId, userId, userData = {}, paymentData = {}) {
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
  const price = Math.max(0, Number(tripData.price) || 0);
  const paymentConfirmed = paymentData.paymentConfirmed === true;
  const paymentMethod = String(paymentData.paymentMethod || "").trim().slice(0, 40);
  const paymentReference = String(paymentData.paymentReference || "").trim().slice(0, 120);
  const paymentNote = String(paymentData.paymentNote || "").trim().slice(0, 500);
  if (price > 0 && !paymentConfirmed) {
    return { error: "Confirm that you have completed payment before reserving this slot." };
  }
  const rosterRef = tripRef.collection("roster").doc(userId);
  const now = new Date();
  const baseCount = Number(tripData.baseRosterCount) || 0;
  const maxRoster = Number(tripData.maxRoster) || 25;

  // Capacity check (base roster counts mocked/demo members for demo trips).
  const existingBookings = await tripRef.collection("roster")
    .where("status", "in", ["pending_approval", "payment_submitted", "payment_verified", "approved"]).get();
  if (baseCount + existingBookings.size >= maxRoster) {
    return { error: "This expedition is full — all slots have been taken." };
  }

  const rosterEntry = {
    userId,
    name: userData.name || existingUser.name || existingUser.displayName || "Trekker",
    email: userData.email || existingUser.email || "",
    phone: userData.phone || existingUser.phone || "",
    age: userData.age ?? existingUser.age ?? "",
    sex: userData.sex || existingUser.sex || "",
    occupation: userData.occupation || existingUser.occupation || "",
    experienceLevel: userData.experienceLevel || existingUser.experienceLevel || "",
    trekkingCapability: userData.trekkingCapability || existingUser.trekkingCapability || userData.experienceLevel || existingUser.experienceLevel || "",
    blood: userData.blood || existingUser.blood || "B+",
    medical: userData.medical || existingUser.medical || "None",
    allergies: userData.allergies || existingUser.allergies || "None",
    medications: userData.medications || existingUser.medications || "None",
    insurancePolicy: userData.insurancePolicy || existingUser.insurancePolicy || "",
    emergencyBeaconId: userData.emergencyBeaconId || existingUser.emergencyBeaconId || "",
    ec1Name: userData.ec1Name || existingUser.ec1Name || "",
    ec1Rel: userData.ec1Rel || existingUser.ec1Rel || "Family",
    ec1Ph: userData.ec1Ph || existingUser.ec1Ph || "",
    status: price > 0 ? "payment_submitted" : "pending_approval",
    bookingPrice: price,
    currency: String(tripData.currency || "INR"),
    paymentReference: paymentReference || "",
    paymentNote,
    paymentMethod: price > 0 ? (paymentMethod || "upi_qr") : "",
    paymentClaimed: price > 0,
    paymentClaimedAt: price > 0 ? now : null,
    paymentSubmittedAt: price > 0 ? now : null,
    paymentStatus: price > 0 ? "submitted" : "not_required",
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
    tripStatus: price > 0 ? "payment_submitted" : "pending_approval",
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
    status: rosterEntry.status,
    trip: { id: tripDoc.id, ...tripData, rosterCount: baseCount + existingBookings.size },
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
      const rosterSnap = await tDoc.ref.collection("roster")
        .where("status", "in", ["pending_approval", "payment_submitted", "payment_verified"]).get();
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

async function approveTripUser(tripId, userId, approvedBy = DEMO_ADMIN_EMAIL) {
  const tripRef = db.collection("trips").doc(tripId);
  const tripDoc = await tripRef.get();
  if (!tripDoc.exists) return { error: "Expedition not found." };

  const rosterRef = tripRef.collection("roster").doc(userId);
  const rDoc = await rosterRef.get();
  if (!rDoc.exists) return { error: "User is not in the expedition roster." };

  const tripData = tripDoc.data();
  const rosterData = rDoc.data();
  if (
    Number(tripData.price) > 0 &&
    rosterData.paymentStatus !== "verified" &&
    rosterData.paymentClaimed !== true &&
    !rosterData.paymentReference
  ) {
    return { error: "The trekker has not marked payment as complete." };
  }
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
    approvedBy: approvedBy || DEMO_ADMIN_EMAIL,
    ...(Number(tripData.price) > 0
      ? {
          paymentStatus: "verified",
          paymentVerifiedAt: now,
          paymentVerifiedBy: approvedBy || DEMO_ADMIN_EMAIL,
        }
      : {}),
  });

  const userRef = db.collection("users").doc(userId);
  await userRef.set({
    activeTripId: tripId,
    activeTripCode: tripData.code || "",
    activeTripName: tripData.name || "Expedition",
    tripStatus: "approved",
    tripApprovedAt: now,
    tripApprovedBy: approvedBy || DEMO_ADMIN_EMAIL,
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

async function verifyTripPayment(tripId, userId, verifiedBy = DEMO_ADMIN_EMAIL) {
  const tripRef = db.collection("trips").doc(tripId);
  const tripDoc = await tripRef.get();
  if (!tripDoc.exists) return { error: "Expedition not found." };
  const rosterRef = tripRef.collection("roster").doc(userId);
  const rosterDoc = await rosterRef.get();
  if (!rosterDoc.exists) return { error: "Booking not found." };
  const roster = rosterDoc.data();
  if (roster.status !== "payment_submitted" || (!roster.paymentReference && roster.paymentClaimed !== true)) {
    return { error: "This booking has no payment confirmation awaiting verification." };
  }
  const now = new Date();
  await rosterRef.update({
    status: "payment_verified",
    paymentStatus: "verified",
    paymentVerifiedAt: now,
    paymentVerifiedBy: verifiedBy || DEMO_ADMIN_EMAIL,
  });
  return { success: true, tripId, userId, paymentVerifiedAt: now };
}

async function removeTripUser(tripId, userId, removedBy = DEMO_ADMIN_EMAIL) {
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
  const tripData = tripDoc.data();
  let adminInCharge = null;
  if (tripData.adminInCharge) {
    const adminDoc = await db.collection("users").doc(String(tripData.adminInCharge)).get();
    if (adminDoc.exists) {
      const admin = adminDoc.data();
      adminInCharge = {
        id: adminDoc.id,
        name: admin.name || admin.displayName || "Expedition Guide",
        email: admin.email || "",
        phone: admin.phone || "",
        occupation: admin.occupation || "",
        organization: admin.organization || "",
        roleTitle: admin.roleTitle || "Expedition Guide",
      };
    }
  }

  return {
    trip: {
      id: tripDoc.id,
      ...tripData,
      ...(adminInCharge ? {
        adminInChargeName: adminInCharge.name,
        adminInChargePhone: adminInCharge.phone,
        adminInChargeOrganization: adminInCharge.organization,
        adminInChargeRoleTitle: adminInCharge.roleTitle,
        adminInChargeProfile: adminInCharge,
      } : {}),
    },
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
    kind: "beacon",
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
    reason: sosData.reason || (sosData.message || ""),
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

async function acknowledgeSOSEvent(eventId, acknowledgedBy = DEMO_ADMIN_EMAIL, note = "") {
  const docRef = db.collection("sos_events").doc(eventId);
  const docSnap = await docRef.get();
  if (!docSnap.exists) return { error: "SOS event not found" };

  const eventData = docSnap.data();
  const now = new Date();

  // Acknowledging does NOT clear the incident — it only tells the console
  // (and the trekker) that a human has seen it and is acting on it.
  await docRef.set({
    acknowledged: true,
    acknowledgedBy: acknowledgedBy || DEMO_ADMIN_EMAIL,
    acknowledgedAt: now,
    acknowledgedNote: note || "",
    updatedAt: now,
  }, { merge: true });

  if (eventData.userId) {
    const userRef = db.collection("users").doc(eventData.userId);
    await userRef.set({
      sosAcknowledged: true,
      sosAcknowledgedBy: acknowledgedBy || DEMO_ADMIN_EMAIL,
      sosAcknowledgedAt: now,
      updatedAt: now,
    }, { merge: true });
  }

  return {
    success: true,
    eventId,
    userId: eventData.userId || null,
    acknowledged: true,
    acknowledgedBy: acknowledgedBy || DEMO_ADMIN_EMAIL,
    acknowledgedAt: now,
  };
}

/**
 * An alert sent by the command team to every member of the expedition.
 * Two-way SOS: the admin can call the whole team in one action.
 */
async function createSOSBroadcast({ message = "", severity = "advisory", title = "", createdBy = "", createdByName = "" } = {}) {
  const now = new Date();
  const eventId = `broadcast_${Date.now()}`;
  const docRef = db.collection("sos_events").doc(eventId);

  const payload = {
    id: eventId,
    kind: "broadcast",
    userId: "",
    name: createdByName || "SAR Command",
    title: title || (severity === "critical" ? "Critical alert from SAR Command" : "Alert from SAR Command"),
    message: String(message || "").trim(),
    severity: ["advisory", "urgent", "critical"].includes(severity) ? severity : "advisory",
    audience: "all",
    status: "active",
    type: "Command Broadcast",
    priority: severity === "critical" ? "critical" : "high",
    createdBy,
    createdByName: createdByName || "",
    timestamp: now,
    createdAt: now,
    updatedAt: now,
  };

  await docRef.set(payload, { merge: true });
  return { success: true, event: payload };
}

// Broadcast alerts only (never beacons) — what the trekker app shows.
async function listSOSBroadcasts(limitCount = 20, onlyActive = true) {
  const limit = Math.max(1, Math.min(Number(limitCount) || 20, 50));
  try {
    const snapshot = await db.collection("sos_events")
      .where("kind", "==", "broadcast")
      .limit(limit)
      .get();
    const all = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    const list = onlyActive ? all.filter((e) => e.status !== "resolved") : all;
    return list.sort((a, b) => {
      const ta = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : new Date(a.timestamp || 0).getTime();
      const tb = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : new Date(b.timestamp || 0).getTime();
      return tb - ta;
    });
  } catch (error) {
    console.warn("listSOSBroadcasts failed:", error?.message || error);
    return [];
  }
}

async function resolveSOSEvent(eventId, notes = "Resolved by SAR Commander", resolvedBy = DEMO_ADMIN_EMAIL) {
  const docRef = db.collection("sos_events").doc(eventId);
  const docSnap = await docRef.get();
  if (!docSnap.exists) return { error: "SOS event not found" };

  const eventData = docSnap.data();
  const now = new Date();

  await docRef.set({
    status: "resolved",
    resolutionNotes: notes || "Resolved by SAR Commander",
    resolvedBy: resolvedBy || DEMO_ADMIN_EMAIL,
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

async function listSOSEvents(limitCount = 25) {
  const limit = Math.max(1, Math.min(Number(limitCount) || 25, 100));
  try {
    const snapshot = await db.collection("sos_events")
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (error) {
    // Never fall back to an unbounded collection read here — reading the
    // whole sos_events collection on every poll is what used to drain the
    // project's daily Firestore read quota.
    console.warn("listSOSEvents ordered query failed:", error?.message || error);
    try {
      const snapshot = await db.collection("sos_events").limit(limit).get();
      return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (fallbackError) {
      console.warn("listSOSEvents fallback failed:", fallbackError?.message || fallbackError);
      return [];
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DEMO ACCOUNTS — the only two accounts that exist.
// Both use the same password so the demo can never fail on a typo.
// ─────────────────────────────────────────────────────────────────────────────
const DEMO_PASSWORD = "123456";
const DEMO_ADMIN_EMAIL = "demoadmin@gmail.com";
const DEMO_USER_EMAIL = "demouser@gmail.com";

const DEMO_ACCOUNTS = [
  {
    id: "demo-admin",
    email: DEMO_ADMIN_EMAIL,
    password: DEMO_PASSWORD,
    name: "Demo Admin",
    role: "admin",
    phone: "+91 98765 00000",
    age: 36,
    sex: "Female",
    city: "Pune, Maharashtra",
    occupation: "Mountain operations coordinator",
    experienceLevel: "Advanced · 8 years",
    trekkingCapability: "Advanced · 8 years",
    blood: "O+",
    medical: "None",
    allergies: "None",
    medications: "None",
    insurancePolicy: "Margsutra Demo Duty Cover · MDC-26017",
    emergencyBeaconId: "MS-ADM-017",
    ec1Name: "Arjun Sharma",
    ec1Rel: "Spouse",
    ec1Ph: "+91 98200 00117",
    ec2Name: "Kavita Sharma",
    ec2Rel: "Sister",
    ec2Ph: "+91 98200 00118",
    organization: "Margsutra Expedition Command & SAR",
    roleTitle: "Lead Command Dispatcher",
  },
  {
    id: "demo-user",
    email: DEMO_USER_EMAIL,
    password: DEMO_PASSWORD,
    name: "Demo User",
    role: "user",
    phone: "+91 90000 12345",
    age: 29,
    sex: "Male",
    city: "Mulshi, Maharashtra",
    occupation: "Product designer",
    experienceLevel: "Intermediate Trekker (Western Ghats / Sahyadri)",
    trekkingCapability: "Intermediate Trekker (Western Ghats / Sahyadri)",
    blood: "B+",
    medical: "None",
    allergies: "None",
    medications: "None",
    insurancePolicy: "Demo Trek Cover · DTC-26020",
    emergencyBeaconId: "MS-DU-020",
    ec1Name: "Meera Rao",
    ec1Rel: "Sister",
    ec1Ph: "+91 99887 76655",
    ec2Name: "Sunil Rao",
    ec2Rel: "Father",
    ec2Ph: "+91 98001 23456",
  },
];

const LEGACY_DEMO_USER_IDS = ["demo-admin-001", "demo-guide-001", "demo-user-001"];

// Local-only demo data for the Firestore emulator. Safe to run on every boot:
// it only creates documents that don't exist yet.
async function seedEmulatorData() {
  if (!usingEmulator) return { skipped: true };
  const bcrypt = require("bcryptjs");
  const now = new Date();

  // Remove the legacy demo accounts so only the two current ones exist.
  for (const legacyId of LEGACY_DEMO_USER_IDS) {
    try {
      const legacyRef = db.collection("users").doc(legacyId);
      const legacySnap = await legacyRef.get();
      if (legacySnap.exists) {
        await legacyRef.delete();
        console.log(`🧹 Removed legacy demo account: ${legacyId}`);
      }
    } catch (error) {
      console.warn("Could not remove legacy demo account", legacyId, error?.message || error);
    }
  }

  for (const u of DEMO_ACCOUNTS) {
    const ref = db.collection("users").doc(u.id);
    const snap = await ref.get();
    const defaults = {
      id: u.id,
      uid: u.id,
      email: u.email,
      emailLower: u.email,
      name: u.name,
      displayName: u.name,
      role: u.role,
      status: "approved",
      approved: true,
      passwordHash: await bcrypt.hash(u.password, 10),
      phone: u.phone || "",
      age: u.age ?? "",
      sex: u.sex || "",
      city: u.city || "",
      occupation: u.occupation || "",
      experienceLevel: u.experienceLevel || "",
      trekkingCapability: u.trekkingCapability || u.experienceLevel || "",
      blood: u.blood || "B+",
      bloodGroup: u.blood || "B+",
      medical: u.medical || "None",
      allergies: u.allergies || "None",
      medications: u.medications || "None",
      insurancePolicy: u.insurancePolicy || "",
      emergencyBeaconId: u.emergencyBeaconId || "",
      ec1Name: u.ec1Name || "",
      ec1Rel: u.ec1Rel || "",
      ec1Ph: u.ec1Ph || "",
      ec2Name: u.ec2Name || "",
      ec2Rel: u.ec2Rel || "",
      ec2Ph: u.ec2Ph || "",
      organization: u.organization || "",
      roleTitle: u.roleTitle || "",
      features: {},
      updatedAt: now,
    };
    if (snap.exists) {
      const current = snap.data() || {};
      const missing = Object.fromEntries(Object.entries(defaults).filter(([key, value]) =>
        !["id", "uid", "email", "emailLower", "name", "displayName", "role", "status", "approved", "passwordHash", "features", "updatedAt"].includes(key) &&
        (current[key] === undefined || current[key] === null || current[key] === "") && value !== ""
      ));
      if (Object.keys(missing).length) await ref.set({ ...missing, updatedAt: now }, { merge: true });
      continue;
    }
    await ref.set({ ...defaults, createdAt: now }, { merge: true });
    console.log(`👤 Demo account ready: ${u.email} / ${u.password}`);
  }

  // A second expedition so the "enrolled → other trips locked" flow is visible.
  const harExists = await db.collection("trips").where("code", "==", "HAR26").limit(1).get();
  if (harExists.empty) {
    await createTrip({
      name: "Harishchandragad Peak & Konkan Kada Trek",
      price: 1199,
      currency: "INR",
      code: "HAR26",
      startDate: "Dec 19, 2026",
      startTime: "05:30 AM",
      endDate: "Dec 20, 2026",
      endTime: "06:00 PM",
      duration: "2 Days / 1 Night",
      location: "Harishchandragad, Ahmednagar",
      elevation: "1,424m ASL",
      difficulty: "Challenging · 22 km trail",
      pickupLocation: "Kalyan Railway Station, Platform 1",
      baseLocation: "Pachnai Village Base Camp",
      instructions:
        "Report at Kalyan station by 05:00 AM. The Konkan Kada descent is exposed — follow the rope line " +
        "and the guide at all times. Carry 3L of water; there is no refill after Pachnai.",
      gearList: ["Trekking shoes with grip", "3L water minimum", "Headlamp", "Windproof layer", "Personal medication + ID"],
      notes: "",
      paymentInstructions: "Pay the trip fee using the payment details shared by the Margsutra team. Enter your UTR / transaction reference when submitting your booking. Payment is verified manually.",
      maxRoster: 20,
      baseRosterCount: 0,
      createdBy: "demo-admin",
      adminInCharge: "demo-admin",
      status: "upcoming",
      lat: 19.3888,
      lon: 73.7761,
      geofence: { lat: 19.3888, lon: 73.7761, radius: 3000, zoneName: "Harishchandragad Safe Corridor" },
    });
    console.log("🌱 Seeded secondary demo expedition HAR26");
  } else {
    const harDoc = harExists.docs[0];
    if (!(Number(harDoc.data()?.price) > 0)) {
      await harDoc.ref.set({ price: 1199, currency: "INR" }, { merge: true });
    }
    if (/confirmation and payment are handled.*whatsapp/i.test(String(harDoc.data()?.notes || ""))) {
      await harDoc.ref.set({ notes: "", updatedAt: new Date() }, { merge: true });
    }
  }
}

const DEMO_TRIP_CODE = "RAJM26";
const DEMO_TRIP_FIELDS = {
  name: "Rajmachi Fort Night Trek",
  price: 999,
  currency: "INR",
  paymentInstructions: "Pay the trip fee using the payment details shared by the Margsutra team. Enter your UTR / transaction reference when submitting your booking. Payment is verified manually.",
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
  notes: "",
  maxRoster: 6,
  baseRosterCount: 5,
  demoRoster: true,
};

// A static snapshot of the two demo expeditions. It is served by /api/trips
// when Firestore cannot be reached (quota exhausted / offline) so the demo
// never shows an empty or broken list.
function demoTripsSnapshot() {
  const base = {
    status: "upcoming",
    isManaged: false,
    rosterCount: 0,
    demoRoster: false,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    admins: [{ id: "demo-admin", name: "Demo Admin", email: DEMO_ADMIN_EMAIL }],
    adminInCharge: "demo-admin",
    adminInChargeName: "Demo Admin",
    createdBy: "demo-admin",
  };

  return [
    {
      ...base,
      id: "demo-rajm26",
      code: "RAJM26",
      name: DEMO_TRIP_FIELDS.name,
      price: DEMO_TRIP_FIELDS.price,
      currency: DEMO_TRIP_FIELDS.currency,
      paymentInstructions: DEMO_TRIP_FIELDS.paymentInstructions,
      date: `${DEMO_TRIP_FIELDS.startDate} · ${DEMO_TRIP_FIELDS.startTime} – ${DEMO_TRIP_FIELDS.endDate} · ${DEMO_TRIP_FIELDS.endTime}`,
      startDate: DEMO_TRIP_FIELDS.startDate,
      startTime: DEMO_TRIP_FIELDS.startTime,
      endDate: DEMO_TRIP_FIELDS.endDate,
      endTime: DEMO_TRIP_FIELDS.endTime,
      duration: DEMO_TRIP_FIELDS.duration,
      location: DEMO_TRIP_FIELDS.location,
      elevation: DEMO_TRIP_FIELDS.elevation,
      difficulty: DEMO_TRIP_FIELDS.difficulty,
      pickupLocation: DEMO_TRIP_FIELDS.pickupLocation,
      baseLocation: DEMO_TRIP_FIELDS.baseLocation,
      instructions: DEMO_TRIP_FIELDS.instructions,
      gearList: DEMO_TRIP_FIELDS.gearList,
      notes: DEMO_TRIP_FIELDS.notes,
      maxRoster: DEMO_TRIP_FIELDS.maxRoster,
      baseRosterCount: DEMO_TRIP_FIELDS.baseRosterCount,
      demoRoster: true,
      leader: "Demo Admin",
      vhfChannel: "145.500 MHz (VHF Ch 1)",
      lat: 18.8296834,
      lon: 73.3974108,
      geofence: { lat: 18.8296834, lon: 73.3974108, radius: 2500, zoneName: "Rajmachi Safe Trek Corridor" },
    },
    {
      ...base,
      id: "demo-har26",
      code: "HAR26",
      name: "Harishchandragad Peak & Konkan Kada Trek",
      price: 1199,
      currency: "INR",
      date: "Dec 19, 2026 · 05:30 AM – Dec 20, 2026 · 06:00 PM",
      startDate: "Dec 19, 2026",
      startTime: "05:30 AM",
      endDate: "Dec 20, 2026",
      endTime: "06:00 PM",
      duration: "2 Days / 1 Night",
      location: "Harishchandragad, Ahmednagar",
      elevation: "1,424m ASL",
      difficulty: "Challenging · 22 km trail",
      pickupLocation: "Kalyan Railway Station, Platform 1",
      baseLocation: "Pachnai Village Base Camp",
      instructions:
        "Report at Kalyan station by 05:00 AM. The Konkan Kada descent is exposed — follow the rope line " +
        "and the guide at all times. Carry 3L of water; there is no refill after Pachnai.",
      paymentInstructions: "Pay the trip fee using the payment details shared by the Margsutra team. Enter your UTR / transaction reference when submitting your booking. Payment is verified manually.",
      gearList: ["Trekking shoes with grip", "3L water minimum", "Headlamp", "Windproof layer", "Personal medication + ID"],
      notes: "",
      maxRoster: 20,
      baseRosterCount: 0,
      leader: "Demo Admin",
      lat: 19.391453,
      lon: 73.793874,
      geofence: { lat: 19.391453, lon: 73.793874, radius: 3000, zoneName: "Harishchandragad Safe Corridor" },
    },
  ];
}

async function seedDemoTrip() {
  const existing = await db.collection("trips").where("code", "==", DEMO_TRIP_CODE).limit(1).get();

  const adminSnap = await db.collection("users").where("email", "==", DEMO_ADMIN_EMAIL).limit(1).get();
  if (adminSnap.empty) {
    console.warn(`⚠️  Skipping demo trip seed — no ${DEMO_ADMIN_EMAIL} account found.`);
    return { created: false, skipped: true };
  }
  const adminDoc = adminSnap.docs[0];
  const adminProfile = { id: adminDoc.id, name: adminDoc.data().name || "Super Admin", email: adminDoc.data().email || "" };

  if (!existing.empty) {
    const doc = existing.docs[0];
    const data = doc.data();
    // Already upgraded (or created by this seed): never overwrite live edits.
    if (data.demoRoster === true) {
      const missingDemoPricing = {};
      if (!(Number(data.price) > 0)) missingDemoPricing.price = DEMO_TRIP_FIELDS.price;
      if (!data.currency) missingDemoPricing.currency = DEMO_TRIP_FIELDS.currency;
      if (!data.paymentInstructions) missingDemoPricing.paymentInstructions = DEMO_TRIP_FIELDS.paymentInstructions;
      if (/confirmation and payment are handled.*whatsapp/i.test(String(data.notes || ""))) missingDemoPricing.notes = "";
      if (Object.keys(missingDemoPricing).length) await doc.ref.set({ ...missingDemoPricing, updatedAt: new Date() }, { merge: true });
      return { created: false, id: doc.id, upgraded: Object.keys(missingDemoPricing).length > 0 };
    }

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
      price: Number(data.price) > 0 ? Number(data.price) : DEMO_TRIP_FIELDS.price,
      currency: data.currency || DEMO_TRIP_FIELDS.currency,
      paymentInstructions: data.paymentInstructions || DEMO_TRIP_FIELDS.paymentInstructions,
      gearList: Array.isArray(data.gearList) && data.gearList.length ? data.gearList : DEMO_TRIP_FIELDS.gearList,
      notes: /confirmation and payment are handled.*whatsapp/i.test(String(data.notes || "")) ? "" : (data.notes || DEMO_TRIP_FIELDS.notes),
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
       lat: 18.8296834,
       lon: 73.3974108,
       geofence: { lat: 18.8296834, lon: 73.3974108, radius: 2500, zoneName: "Rajmachi Safe Trek Corridor" },
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
  saveTripCoverPhoto,
  deleteRegisteredUser,
  getAppThemeConfig,
  setAppThemeConfig,
  listTrips,
  findTripByCode,
  createTrip,
  seedDemoTrip,
  seedEmulatorData,
  deleteTrip,
  setActiveManagedTrip,
  updateTrip,
  joinTrip,
  leaveTrip,
  getTripRoster,
  listPendingTripRequests,
  approveTripUser,
  verifyTripPayment,
  removeTripUser,
  getUserActiveTrip,
  createSOSEvent,
  createSOSBroadcast,
  listSOSBroadcasts,
  resolveSOSEvent,
  acknowledgeSOSEvent,
  DEMO_ACCOUNTS,
  DEMO_ADMIN_EMAIL,
  DEMO_USER_EMAIL,
  DEMO_PASSWORD,
  demoTripsSnapshot,
  cancelUserSOS,
  listSOSEvents,
  listPendingAdmins,
  approveAdminUser,
  rejectAdminUser,
};
