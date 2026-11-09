const express = require("express");
const cors = require("cors");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config();

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const {
  db,
  toSafeProfile,
  findUserByEmail,
  findUserById,
  createUser,
  listUsers,
  updateUser,
  getAppThemeConfig,
  setAppThemeConfig,
} = require("./services/firestore");

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("JWT_SECRET is not set in backend/.env — refusing to start without it.");
  process.exit(1);
}

// Requires a valid Bearer token; attaches the decoded userId to req.userId.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing or invalid Authorization header." });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}

// Like requireAuth, but also checks the token's own user matches the :id in the URL —
// prevents one logged-in user from reading or modifying another user's record.
function requireSelf(req, res, next) {
  requireAuth(req, res, () => {
    if (req.userId !== req.params.id) {
      return res.status(403).json({ error: "You can only access your own account." });
    }
    next();
  });
}

const PORT = process.env.PORT || 5050;
const CORS_ORIGIN = (process.env.CORS_ORIGIN || "http://localhost:5173,http://localhost:5174,http://localhost:5175")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const app = express();
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", db: "firebase-connected" });
});

app.get("/api/config/theme", async (_req, res) => {
  try {
    const theme = await getAppThemeConfig();
    res.json(theme);
  } catch (error) {
    console.error("Theme config error:", error);
    res.status(500).json({ error: "Failed to fetch theme configuration." });
  }
});

app.post("/api/config/theme", requireAuth, async (req, res) => {
  try {
    const updated = await setAppThemeConfig(req.body);
    res.json(updated);
  } catch (error) {
    console.error("Theme config update error:", error);
    res.status(500).json({ error: "Failed to update theme configuration." });
  }
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      phone,
      city,
      role,
      blood,
      medical,
      ec1Name,
      ec1Rel,
      ec1Ph,
      ec2Name,
      ec2Rel,
      ec2Ph,
    } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email and password are required." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await findUserByEmail(normalizedEmail);
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await createUser({
      name,
      email: normalizedEmail,
      passwordHash,
      phone,
      city,
      role,
      blood,
      medical,
      ec1Name,
      ec1Rel,
      ec1Ph,
      ec2Name,
      ec2Rel,
      ec2Ph,
    });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "30d" });
    return res.status(201).json({ user: toSafeProfile(user.id, user), token });
  } catch (error) {
    console.error("Register error", error);
    return res.status(500).json({ error: "Unable to create account right now." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await findUserByEmail(normalizedEmail);
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    let isValid = false;
    if (user.passwordHash) {
      isValid = await bcrypt.compare(password, user.passwordHash);
    } else {
      // Handle initial seeded accounts without passwordHash
      if (password === "Coordage@123" || password === "user123" || password === "admin123") {
        isValid = true;
        const newHash = await bcrypt.hash(password, 10);
        await updateUser(user.id, { passwordHash: newHash });
      }
    }

    if (!isValid) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "30d" });
    return res.json({ user: toSafeProfile(user.id, user), token });
  } catch (error) {
    console.error("Login error", error);
    return res.status(500).json({ error: "Unable to sign in right now." });
  }
});

app.get("/api/users", requireAuth, async (_req, res) => {
  try {
    const users = await listUsers();
    return res.json({ users });
  } catch (error) {
    console.error("List users error", error);
    return res.status(500).json({ error: "Unable to load users right now." });
  }
});

app.get("/api/users/:id", requireSelf, async (req, res) => {
  try {
    const user = await findUserById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }
    return res.json({ user: toSafeProfile(user.id, user) });
  } catch (error) {
    console.error("Get user error", error);
    return res.status(500).json({ error: "Unable to load user right now." });
  }
});

app.post("/api/location-batch", requireAuth, async (req, res) => {
  try {
    const locations = Array.isArray(req.body?.locations) ? req.body.locations : [];
    if (!locations.length) {
      return res.status(400).json({ error: "LOCATIONS_REQUIRED", message: "locations array required" });
    }

    let accepted = 0;

    for (const payload of locations) {
      const userId = String(payload?.userId || "").trim();
      if (!userId || userId !== req.userId) continue;

      const update = {};
      if (typeof payload.lat === "number") update.lat = payload.lat;
      if (typeof payload.lon === "number") update.lon = payload.lon;
      if (typeof payload.accuracy === "number") update.accuracy = payload.accuracy;
      if (typeof payload.heading === "number") update.heading = payload.heading;
      if (typeof payload.speed === "number") update.speed = payload.speed;
      if (typeof payload.battery === "number") update.battery = payload.battery;
      if (typeof payload.status === "string" && payload.status.trim()) update.status = payload.status.trim();
      update.lastSeenAt = new Date();

      if (!Object.keys(update).length) continue;

      const updated = await updateUser(userId, update);
      if (updated) accepted += 1;
    }

    if (!accepted) {
      return res.status(400).json({ error: "NO_VALID_LOCATIONS", message: "No valid positions were accepted" });
    }

    return res.json({ ok: true, accepted });
  } catch (error) {
    console.error("Location batch error", error);
    return res.status(500).json({ error: "Unable to store locations right now." });
  }
});

// ─── Bluetooth Device Management ──────────────────────────────────────────────
app.get("/api/users/:id/devices", requireSelf, async (req, res) => {
  try {
    const user = await findUserById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }
    return res.json({ devices: user.deviceList || [] });
  } catch (error) {
    console.error("Get devices error", error);
    return res.status(500).json({ error: "Unable to load devices right now." });
  }
});

app.post("/api/users/:id/devices", requireSelf, async (req, res) => {
  try {
    const user = await findUserById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const { id, name, type, mac, battery, signal, gps, sos, connected, lat, lon } = req.body;
    if (!id || !name) {
      return res.status(400).json({ error: "Device id and name are required." });
    }

    const deviceList = Array.isArray(user.deviceList) ? [...user.deviceList] : [];
    if (deviceList.some((d) => d.id === id)) {
      return res.status(409).json({ error: "Device already exists." });
    }

    const device = {
      id,
      name,
      type: type || "tracker",
      mac: mac || "",
      battery: battery ?? 0,
      signal: signal || "unknown",
      gps: gps ?? false,
      sos: sos ?? false,
      connected: connected ?? false,
      lat: lat ?? null,
      lon: lon ?? null,
      pairedAt: new Date().toISOString(),
    };

    deviceList.push(device);
    await updateUser(req.params.id, { deviceList, devices: deviceList.length });

    return res.status(201).json({ device, devices: deviceList });
  } catch (error) {
    console.error("Add device error", error);
    return res.status(500).json({ error: "Unable to add device right now." });
  }
});

app.patch("/api/users/:id/devices/:deviceId", async (req, res) => {
  try {
    const user = await findUserById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const deviceList = Array.isArray(user.deviceList) ? [...user.deviceList] : [];
    const deviceIndex = deviceList.findIndex((d) => d.id === req.params.deviceId);
    if (deviceIndex === -1) {
      return res.status(404).json({ error: "Device not found." });
    }

    const { battery, signal, connected, lat, lon } = req.body;
    const device = { ...deviceList[deviceIndex] };

    if (battery !== undefined) device.battery = battery;
    if (signal !== undefined) device.signal = signal;
    if (connected !== undefined) device.connected = connected;
    if (lat !== undefined) device.lat = lat;
    if (lon !== undefined) device.lon = lon;

    deviceList[deviceIndex] = device;
    await updateUser(req.params.id, { deviceList });

    return res.json({ device, devices: deviceList });
  } catch (error) {
    console.error("Update device error", error);
    return res.status(500).json({ error: "Unable to update device right now." });
  }
});

app.delete("/api/users/:id/devices/:deviceId", requireSelf, async (req, res) => {
  try {
    const user = await findUserById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    let deviceList = Array.isArray(user.deviceList) ? [...user.deviceList] : [];
    const deviceIndex = deviceList.findIndex((d) => d.id === req.params.deviceId);
    if (deviceIndex === -1) {
      return res.status(404).json({ error: "Device not found." });
    }

    deviceList.splice(deviceIndex, 1);
    await updateUser(req.params.id, { deviceList, devices: deviceList.length });

    return res.json({ devices: deviceList });
  } catch (error) {
    console.error("Remove device error", error);
    return res.status(500).json({ error: "Unable to remove device right now." });
  }
});

async function bootstrap() {
  try {
    // Verify Firestore connection
    await db.collection("users").limit(1).get();
    console.log("✅ Firebase Firestore connected successfully");

    app.listen(PORT, () => {
      console.log(`🚀 Coordage backend listening on http://localhost:${PORT}`);
      console.log(`   CORS origins: ${CORS_ORIGIN.join(", ")}`);
    });
  } catch (error) {
    console.error("❌ Failed to start backend", error);
    process.exit(1);
  }
}

bootstrap();
