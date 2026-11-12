// One-time seed script for the Margsutra Firebase project.
// Setup: npm install firebase-admin
// Make sure serviceAccountKey.json (downloaded from Firebase console >
// Project settings > Service accounts > Generate new private key) is
// sitting in this same folder, then run: node seed.js
//
// This creates the actual login accounts for you — no need to create
// users manually in the Authentication console first.

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const { getDatabase } = require("firebase-admin/database");
const { getAuth } = require("firebase-admin/auth");
const serviceAccount = require("./serviceAccountKey.json");

const app = initializeApp({
  credential: cert(serviceAccount),
  databaseURL: "https://coordage-416a1-default-rtdb.asia-southeast1.firebasedatabase.app",
});

const db = getFirestore(app);
const rtdb = getDatabase(app);
const auth = getAuth(app);

const ADMIN_EMAIL = "admin@margsutra.app";
const ADMIN_PASSWORD = "Margsutra@123";
const USER_EMAIL = "guide@margsutra.app";
const USER_PASSWORD = "Margsutra@123";

// Creates the auth user if it doesn't exist yet, or reuses it if it does
// (safe to re-run this script without getting "email already exists" errors).
async function getOrCreateAuthUser(email, password, displayName) {
  try {
    return await auth.getUserByEmail(email);
  } catch {
    return await auth.createUser({ email, password, displayName });
  }
}

async function seed() {
  const adminRecord = await getOrCreateAuthUser(ADMIN_EMAIL, ADMIN_PASSWORD, "Demo Admin");
  const adminUid = adminRecord.uid;

  await db.collection("users").doc(adminUid).set({
    uid: adminUid,
    email: ADMIN_EMAIL,
    displayName: "Demo Admin",
    phone: "+91 90000 00000",
    role: "admin",
    bloodGroup: "O+",
    emergencyContacts: [],
    registeredAt: Timestamp.now(),
    lastSeen: Timestamp.now(),
  });

  await rtdb.ref(`admins/${adminUid}`).set(true);

  const userRecord = await getOrCreateAuthUser(USER_EMAIL, USER_PASSWORD, "Anirban Panda");
  const userUid = userRecord.uid;

  await db.collection("users").doc(userUid).set({
    uid: userUid,
    email: USER_EMAIL,
    displayName: "Anirban Panda",
    phone: "+91 90000 00001",
    role: "user",
    bloodGroup: "B+",
    emergencyContacts: [
      { name: "Priya Rao", phone: "+91 90000 00002", relation: "Sister" },
    ],
    registeredAt: Timestamp.now(),
    lastSeen: Timestamp.now(),
  });

  await db.collection("trips").doc("trip-001").set({
    tripId: "trip-001",
    name: "Rajmachi Weekend Trek — Batch 12",
    location: "Rajmachi, Maharashtra",
    organizerId: adminUid,
    date: Timestamp.now(),
    status: "active",
    rosterCount: 18,
  });

  await rtdb.ref("weather_nodes/node-01").set({
    temp: 24.5,
    humidity: 78,
    pressure: 1008,
    altitude: 620,
    heat_index: 26.1,
    rain_mm: 2.4,
    sound_db: 42,
    pm2_5: 18,
    pm10: 30,
    pressure_trend: -1,
    active_sos: false,
    lat: 18.238,
    lon: 73.4906,
    rssi: -68,
    snr: 9.2,
    timestamp: Date.now(),
  });

  await db.collection("sos_logs").add({
    userId: userUid,
    userName: "Anirban Panda",
    bloodGroup: "B+",
    emergencyContacts: [
      { name: "Priya Rao", phone: "+91 90000 00002", relation: "Sister" },
    ],
    lat: 18.238,
    lon: 73.4906,
    nodeId: "node-01",
    triggeredAt: Timestamp.now(),
    resolvedAt: Timestamp.now(),
    resolvedBy: adminUid,
    status: "resolved",
    notes: "False alarm — accidental button press, confirmed safe on radio check.",
  });

  await db.collection("safety_protocols").add({
    title: "Monsoon Trail Crossing Checklist",
    status: "published",
    order: 1,
    body: "Do not cross flowing water above knee height. Turn back if rainfall exceeds 10mm/hr sustained.",
    updatedAt: Timestamp.now(),
  });

  console.log("\nSeed complete. Log into the admin-app with:");
  console.log(`  Email:    ${ADMIN_EMAIL}`);
  console.log(`  Password: ${ADMIN_PASSWORD}`);
  console.log("\n(Note: the dashboard you land on still shows hardcoded mock data for users/devices/bookings — that's a separate, known gap, not this script.)");
}

seed().catch(console.error);
