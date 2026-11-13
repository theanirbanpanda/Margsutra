import { DEMO_EXPEDITION_MEMBERS } from "../../../shared/demoExpeditionRoster";

const RAJMACHI = {
  route: [
    [18.825799, 73.395527], // Udhewadi village
    [18.82612, 73.39475],  // Udhewadi–Manaranjan trail (OSM path bounds)
    [18.82687, 73.39542],
    [18.8275, 73.39565],
    [18.8283, 73.3956],
    [18.8293, 73.3955],
    [18.829824, 73.395469], // Manaranjan Fort
  ],
  waypoints: [
    { name: "Udhewadi", lat: 18.825799, lon: 73.395527 },
    { name: "Manaranjan Fort", lat: 18.829824, lon: 73.395469 },
    { name: "Shrivardhan Fort", lat: 18.826763, lon: 73.3999 },
  ],
  elevation: 829,
};

const HARISHCHANDRAGAD = {
  route: [
    [19.41337, 73.78164],  // Pachnai village
    [19.4098, 73.7812],
    [19.405, 73.781],
    [19.400, 73.7804],
    [19.395, 73.7798],
    [19.39151, 73.77956], // Harishchandreshwar Temple
    [19.39146, 73.79377], // Fort / Balekilla
    [19.39537, 73.80334], // Konkan Kada
    [19.38685, 73.77917], // Taramati peak
  ],
  waypoints: [
    { name: "Pachnai village", lat: 19.41337, lon: 73.78164 },
    { name: "Harishchandreshwar Temple", lat: 19.39151, lon: 73.77956 },
    { name: "Harishchandragad Fort", lat: 19.39146, lon: 73.79377 },
    { name: "Konkan Kada", lat: 19.39537, lon: 73.80334 },
    { name: "Taramati Peak", lat: 19.38685, lon: 73.77917 },
  ],
  elevation: 1424,
};

const MEMBERS = DEMO_EXPEDITION_MEMBERS;

const isHarishchandragad = (trip = {}) =>
  /^HAR/i.test(String(trip.code || "")) || /harishchandragad/i.test(String(trip.name || ""));

export function getDemoTrackingData(trip, signedInUser, signedInAdmin) {
  const expedition = isHarishchandragad(trip) ? HARISHCHANDRAGAD : RAJMACHI;
  const leaderName = signedInAdmin?.name || trip?.adminInChargeName || trip?.leader || "Expedition Guide";
  const userName = signedInUser?.name || "Demo User";
  const route = expedition.route;
  const participants = [
    ...MEMBERS.map((member, index) => ({
      ...member,
      role: "Trekker",
      status: "active",
      lat: route[Math.min(index + 1, route.length - 2)][0],
      lon: route[Math.min(index + 1, route.length - 2)][1],
      altitude: expedition.elevation - (MEMBERS.length - index) * 18,
      battery: 72 + index * 5,
      heartRate: 82 + index * 3,
    })),
    {
      id: signedInUser?.id || "demo-user",
      name: userName,
      role: "You",
      status: "active",
      lat: route[Math.min(5, route.length - 2)][0],
      lon: route[Math.min(5, route.length - 2)][1],
      altitude: expedition.elevation - 35,
      battery: 88,
      heartRate: 84,
      avatar: userName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
      color: "#3b82f6",
      isSelf: true,
    },
  ];
  return {
    route,
    waypoints: expedition.waypoints,
    elevation: expedition.elevation,
    participants,
    leader: {
      id: signedInAdmin?.id || "demo-admin",
      name: leaderName,
      role: "Expedition Guide",
      lat: isHarishchandragad(trip) ? 19.39146 : route[route.length - 1][0],
      lon: isHarishchandragad(trip) ? 73.79377 : route[route.length - 1][1],
      altitude: expedition.elevation,
      battery: 95,
      heartRate: 76,
      status: "active",
      color: "#f59e0b",
      isGuide: true,
    },
  };
}

export function isDemoTrackingAccount(user) {
  const email = String(user?.email || "").toLowerCase();
  return email === "demouser@gmail.com" || user?.id === "demo-user" || user?.id === "demo-user-001";
}

export function toFreshPosition(record, now = Date.now()) {
  const lat = Number(record?.lat);
  const lon = Number(record?.lon);
  const timestamp = Number(record?.received_at ?? record?.timestamp ?? record?.lastSeen ?? 0);
  if (!record || record.gps_fix !== true || !Number.isFinite(lat) || !Number.isFinite(lon) || (!lat && !lon)) return null;
  if (!Number.isFinite(timestamp) || now - timestamp > 90_000 || timestamp > now + 30_000) return null;
  return { lat, lon, timestamp, accuracy: Number(record.accuracy) || null, altitude: Number(record.altitude) || null, rssi: Number(record.rssi) || null, snr: Number(record.snr) || null };
}
