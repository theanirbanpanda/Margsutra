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
  return {
    id,
    name: data.name || data.displayName || "",
    email: data.email || "",
    role: data.role || "Explorer",
    status: data.status || "active",
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

  const record = {
    uid: userDocRef.id,
    name: String(userData.name).trim(),
    displayName: String(userData.name).trim(),
    email: normalizedEmail,
    passwordHash: userData.passwordHash,
    phone: userData.phone || "",
    city: userData.city || "",
    role: userData.role || "Explorer",
    blood: userData.blood || "B+",
    bloodGroup: userData.blood || "B+",
    medical: userData.medical || "None",
    avatar,
    color: ["#E6F1FB", "#0C447C"],
    status: "active",
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
};
