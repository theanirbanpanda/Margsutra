/**
 * expeditionTeam.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Unified Expedition Team & Leader Mock Data for Rajmachi Fort Monsoon Trek (RAJM26).
 * Common data model and distance calculations shared across User App & Admin App.
 */

// Haversine formula to calculate exact geodesic distance in meters
export function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return 0;
  const R = 6371e3; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function formatDistance(meters) {
  if (meters == null || isNaN(meters)) return "—";
  if (meters < 15) return "Right beside you";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

// Relative direction along Rajmachi trail (Northward ascent to Fort Manoranjan)
export function getRelativeTrailDirection(targetLat, refLat) {
  if (Math.abs(targetLat - refLat) < 0.0003) return "alongside";
  return targetLat > refLat ? "ahead" : "behind";
}

// The Expedition Leader / Admin
export const RAJMACHI_ADMIN = {
  id: "admin-ajay-saini",
  userId: "admin-ajay-saini",
  name: "Ajay Saini",
  role: "admin",
  badge: "Expedition Leader & Field Guide",
  email: "ajay.saini@margsutra.app",
  phone: "+91 98201 11223",
  blood: "O+",
  medical: "Wilderness First Responder (WFR Certified)",
  city: "Lonavala, Maharashtra",
  lat: 18.8312,
  lon: 73.4008,
  altitude: 842,
  battery: 95,
  heartRate: 76,
  status: "Trail Lead",
  trailStatus: "Leading at Manoranjan Ridge",
  lastSeen: "Just now",
  avatar: "AS",
  color: ["#f59e0b", "#78350f"],
  isAdmin: true,
};

// The 5-Member Trekker Team on the Rajmachi Expedition (RAJM26)
export const RAJMACHI_MEMBERS = [
  {
    id: "demo-user",
    userId: "demo-user",
    name: "Anirban Panda",
    role: "trekker",
    badge: "Active Trekker",
    email: "demouser@gmail.com",
    phone: "+91 86375 40813",
    blood: "B+",
    medical: "None reported",
    city: "Pune, Maharashtra",
    ec1Name: "Deepak Panda",
    ec1Rel: "Brother",
    ec1Ph: "+91 91531 91902",
    lat: 18.8286,
    lon: 73.3986,
    altitude: 829,
    battery: 88,
    heartRate: 84,
    status: "active",
    trailStatus: "On Trail (Mid Group)",
    lastSeen: "10s ago",
    avatar: "AP",
    color: ["#3b82f6", "#1e3a8a"],
  },
  {
    id: "trekker-rohan-sharma",
    userId: "trekker-rohan-sharma",
    name: "Rohan Sharma",
    role: "trekker",
    badge: "Active Trekker",
    email: "rohan.sharma@gmail.com",
    phone: "+91 98112 34567",
    blood: "O+",
    medical: "Mild Asthma (Carries Inhaler)",
    city: "Mumbai, Maharashtra",
    ec1Name: "Deepak Sharma",
    ec1Rel: "Brother",
    ec1Ph: "+91 98112 00000",
    lat: 18.8271,
    lon: 73.3971,
    altitude: 818,
    battery: 78,
    heartRate: 92,
    status: "active",
    trailStatus: "Ascending Trail",
    lastSeen: "25s ago",
    avatar: "RS",
    color: ["#10b981", "#064e3b"],
  },
  {
    id: "trekker-pooja-iyer",
    userId: "trekker-pooja-iyer",
    name: "Pooja Iyer",
    role: "trekker",
    badge: "Active Trekker",
    email: "pooja.iyer@gmail.com",
    phone: "+91 97234 56789",
    blood: "A+",
    medical: "None reported",
    city: "Bengaluru, Karnataka",
    ec1Name: "Lakshmi Iyer",
    ec1Rel: "Mother",
    ec1Ph: "+91 97234 00000",
    lat: 18.8256,
    lon: 73.3958,
    altitude: 804,
    battery: 82,
    heartRate: 88,
    status: "active",
    trailStatus: "Mid Trail Canopy",
    lastSeen: "40s ago",
    avatar: "PI",
    color: ["#8b5cf6", "#4c1d95"],
  },
  {
    id: "trekker-tanmay-deshmukh",
    userId: "trekker-tanmay-deshmukh",
    name: "Tanmay Deshmukh",
    role: "trekker",
    badge: "Assistant Guide",
    email: "tanmay.d@gmail.com",
    phone: "+91 98456 78901",
    blood: "B+",
    medical: "None reported",
    city: "Nashik, Maharashtra",
    ec1Name: "Sunita Deshmukh",
    ec1Rel: "Spouse",
    ec1Ph: "+91 98456 00000",
    lat: 18.8242,
    lon: 73.3945,
    altitude: 792,
    battery: 71,
    heartRate: 94,
    status: "active",
    trailStatus: "Stream Crossing",
    lastSeen: "1m ago",
    avatar: "TD",
    color: ["#06b6d4", "#155e75"],
  },
  {
    id: "trekker-kavita-verma",
    userId: "trekker-kavita-verma",
    name: "Kavita Verma",
    role: "trekker",
    badge: "Rear Guard (Sweep)",
    email: "kavita.verma@gmail.com",
    phone: "+91 99345 67890",
    blood: "AB+",
    medical: "None reported",
    city: "Pune, Maharashtra",
    ec1Name: "Rajesh Verma",
    ec1Rel: "Father",
    ec1Ph: "+91 99345 00000",
    lat: 18.8229,
    lon: 73.3932,
    altitude: 781,
    battery: 64,
    heartRate: 81,
    status: "active",
    trailStatus: "Trail Sweep (Rear)",
    lastSeen: "1m ago",
    avatar: "KV",
    color: ["#f97316", "#7c2d12"],
  },
];

