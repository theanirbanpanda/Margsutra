/**
 * reset-demo-data.js — one-command demo reset.
 *
 * Wipes the demo data and leaves exactly two accounts behind:
 *
 *   demoadmin@gmail.com / 123456   (admin console)
 *   demouser@gmail.com  / 123456   (trekker app)
 *
 * Everything else (other users, expedition rosters, SOS history) is removed so
 * the demo always starts from the same clean state.
 *
 * Usage:
 *   node scripts/reset-demo-data.js            # production Firebase
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/reset-demo-data.js   # emulator
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const path = require("path");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const bcrypt = require("bcryptjs");

const DEMO_PASSWORD = "123456";

const ACCOUNTS = [
  {
    id: "demo-admin",
    email: "demoadmin@gmail.com",
    name: "Demo Admin",
    role: "admin",
    phone: "+91 98765 00000",
    blood: "O+",
    medical: "None",
    ec1Name: "",
    ec1Rel: "",
    ec1Ph: "",
    organization: "Margsutra Expedition Command & SAR",
    roleTitle: "Lead Command Dispatcher",
  },
  {
    id: "demo-user",
    email: "demouser@gmail.com",
    name: "Demo User",
    role: "user",
    phone: "+91 90000 12345",
    blood: "B+",
    medical: "None",
    ec1Name: "Demo Emergency Contact",
    ec1Rel: "Family",
    ec1Ph: "+91 90000 12346",
    organization: "",
    roleTitle: "",
  },
];

const TRIPS = [
  {
    id: "trip-rajm26",
    code: "RAJM26",
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
    lat: 18.8286,
    lon: 73.3986,
    geofence: { lat: 18.8286, lon: 73.3986, radius: 2500, zoneName: "Rajmachi Safe Trek Corridor" },
  },
  {
    id: "trip-har26",
    code: "HAR26",
    name: "Harishchandragad Peak & Konkan Kada Trek",
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
    gearList: [
      "Trekking shoes with grip",
      "3L water minimum",
      "Headlamp",
      "Windproof layer",
      "Personal medication + ID",
    ],
    notes: "Confirmation and payment are handled by the Margsutra team over WhatsApp.",
    maxRoster: 20,
    baseRosterCount: 0,
    demoRoster: false,
    lat: 19.3888,
    lon: 73.7761,
    geofence: { lat: 19.3888, lon: 19.3888, lon: 73.7761, radius: 3000, zoneName: "Harishchandragad Safe Corridor" },
  },
];

// Documents left over from earlier demo setups. Used as a fallback when the
// project is over its Firestore read quota and cannot be listed.
const LEGACY_DOC_IDS = {
  users: [
    "7olIIA0QpxevyK610N5g",
    "88nljTLVmmPiXRbaH7B43MLezBs2",
    "9OovuZiHQnQKrLTuPF1J",
    "Ckc4PrEIkCYHzsCNcKCr",
    "IsQrOIkCgwdEYbLker22",
    "Tc9xW0z0gWjthf0eDrSM",
    "aeBc8ZL0Swewcqtzf7WmXvypucs1",
    "demo-admin-001",
    "demo-user-001",
    "demo-guide-001",
    "rpLHLIEpGXzdnQQkXxDF",
    "test-user-123",
  ],
  trips: ["trip-001", "trip-002"],
  sos_events: [
    "sos_demo-user-001_1794506237411",
    "sos_demo-user-001_1794506421232",
    "sos_demo-user-001_1794505341815",
    "sos_demo-user-001_1794506970399",
    "sos_demo-user-001_1794507389861",
    "sos_demo-user-001_1794507840232",
    "sos_demo-user-001_1794507943991",
    "sos_demo-user-001_1794507974364",
    "sos_demo-user-001_1794508136007",
    "sos-drill-1794507593004",
  ],
};

async function main() {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  const app =
    getApps().length === 0
      ? emulatorHost
        ? initializeApp({ projectId: process.env.FIRESTORE_PROJECT_ID || "demo-margsutra" })
        : initializeApp({ credential: cert(require(path.resolve(__dirname, "../../serviceAccountKey.json"))) })
      : getApps()[0];

  const db = getFirestore(app);
  const now = new Date();
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // 1. Remove every user, expedition (with its roster) and SOS event.
  //    Listing a collection needs reads, so when the project is over its read
  //    quota the cleanup falls back to deleting the known legacy documents by
  //    id (a delete does not cost a read).
  for (const collection of ["users", "sos_events", "trips"]) {
    let cleared = false;
    try {
      if (typeof db.recursiveDelete === "function") {
        await db.recursiveDelete(db.collection(collection));
        console.log(`🧹 Cleared collection: ${collection}`);
        cleared = true;
      } else {
        const snap = await db.collection(collection).get();
        for (const doc of snap.docs) await doc.ref.delete();
        console.log(`🧹 Cleared ${snap.size} docs from ${collection}`);
        cleared = true;
      }
    } catch (error) {
      console.warn(`⚠️  Could not list ${collection} (read quota?):`, error?.message || error);
    }

    if (!cleared) {
      for (const id of LEGACY_DOC_IDS[collection] || []) {
        try {
          await db.collection(collection).doc(id).delete();
          console.log(`🧹 Deleted legacy ${collection}/${id}`);
        } catch (err) {
          console.warn(`⚠️  Could not delete ${collection}/${id}:`, err?.message || err);
        }
      }
    }
  }

  // 2. Recreate the two demo accounts.
  for (const account of ACCOUNTS) {
    await db.collection("users").doc(account.id).set({
      id: account.id,
      uid: account.id,
      email: account.email,
      emailLower: account.email,
      name: account.name,
      displayName: account.name,
      role: account.role,
      status: "approved",
      approved: true,
      passwordHash,
      phone: account.phone,
      blood: account.blood,
      medical: account.medical,
      ec1Name: account.ec1Name,
      ec1Rel: account.ec1Rel,
      ec1Ph: account.ec1Ph,
      organization: account.organization,
      roleTitle: account.roleTitle,
      features: {},
      createdAt: now,
      updatedAt: now,
    });
    console.log(`👤 ${account.email} / ${DEMO_PASSWORD}`);
  }

  // 3. Recreate the two expeditions, both owned by the demo admin.
  for (const trip of TRIPS) {
    const { id, code, ...fields } = trip;
    await db.collection("trips").doc(id).set({
      id,
      code,
      ...fields,
      date: `${trip.startDate} · ${trip.startTime} – ${trip.endDate} · ${trip.endTime}`,
      status: "upcoming",
      isManaged: false,
      rosterCount: trip.baseRosterCount,
      admins: [{ id: "demo-admin", name: "Demo Admin", email: "demoadmin@gmail.com" }],
      adminInCharge: "demo-admin",
      adminInChargeName: "Demo Admin",
      createdBy: "demo-admin",
      vhfChannel: "145.500 MHz (VHF Ch 1)",
      leader: "Demo Admin",
      createdAt: now,
      updatedAt: now,
    });
    console.log(`🧭 ${code} — ${trip.name}`);
  }

  // 4. The demo trekker starts enrolled on Rajmachi so the "enrolled → other
  //    expeditions locked" rule is visible straight away.
  await db
    .collection("trips")
    .doc("trip-rajm26")
    .collection("roster")
    .doc("demo-user")
    .set({
      userId: "demo-user",
      name: "Demo User",
      email: "demouser@gmail.com",
      phone: "+91 90000 12345",
      blood: "B+",
      medical: "None",
      ec1Name: "Demo Emergency Contact",
      ec1Rel: "Family",
      ec1Ph: "+91 90000 12346",
      status: "approved",
      approvedBy: "demoadmin@gmail.com",
      approvedAt: now,
      requestedAt: now,
    });

  // 5. The trekker is enrolled on that expedition and the slot count matches.
  await db.collection("users").doc("demo-user").set(
    {
      activeTripId: "trip-rajm26",
      activeTripCode: "RAJM26",
      activeTripName: "Rajmachi Fort Night Trek",
      tripStatus: "approved",
      tripApprovedAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  await db.collection("trips").doc("trip-rajm26").set(
    {
      rosterCount: TRIPS[0].baseRosterCount + 1, // 5 demo members + the trekker
      maxRoster: TRIPS[0].baseRosterCount + 1,
      updatedAt: now,
    },
    { merge: true }
  );

  console.log("\n✅ Demo reset complete.");
  console.log("   Admin console : demoadmin@gmail.com / 123456");
  console.log("   Trekker app   : demouser@gmail.com  / 123456");
}

main().catch((error) => {
  console.error("❌ Demo reset failed:", error?.message || error);
  process.exit(1);
});
