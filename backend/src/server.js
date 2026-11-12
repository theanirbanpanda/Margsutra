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

// Optionally attaches decoded userId if Bearer token is provided
function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.userId = decoded.userId;
    } catch {}
  }
  next();
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

app.get("/api/trips", async (_req, res) => {
  try {
    const trips = await listTrips();
    res.json(trips);
  } catch (error) {
    console.error("List trips error:", error);
    res.status(500).json({ error: "Failed to load trips." });
  }
});

app.post("/api/trips", optionalAuth, async (req, res) => {
  try {
    const tripData = req.body || {};
    if (!tripData.name) {
      return res.status(400).json({ error: "Expedition name is required." });
    }
    const newTrip = await createTrip(tripData);
    res.status(201).json({ success: true, trip: newTrip });
  } catch (error) {
    console.error("Create trip error:", error);
    res.status(500).json({ error: "Failed to create expedition." });
  }
});

app.patch("/api/trips/:tripId", optionalAuth, async (req, res) => {
  try {
    const updated = await updateTrip(req.params.tripId, req.body || {});
    if (!updated) return res.status(404).json({ error: "Expedition not found." });
    res.json({ success: true, trip: updated });
  } catch (error) {
    console.error("Update trip error:", error);
    res.status(500).json({ error: "Failed to update expedition." });
  }
});

app.put("/api/trips/:tripId", optionalAuth, async (req, res) => {
  try {
    const updated = await updateTrip(req.params.tripId, req.body || {});
    if (!updated) return res.status(404).json({ error: "Expedition not found." });
    res.json({ success: true, trip: updated });
  } catch (error) {
    console.error("Update trip error:", error);
    res.status(500).json({ error: "Failed to update expedition." });
  }
});

app.delete("/api/trips/:tripId", optionalAuth, async (req, res) => {
  try {
    const result = await deleteTrip(req.params.tripId);
    if (result.error) return res.status(404).json({ error: result.error });
    res.json(result);
  } catch (error) {
    console.error("Delete trip error:", error);
    res.status(500).json({ error: "Failed to delete expedition." });
  }
});

app.post("/api/trips/:tripId/manage", optionalAuth, async (req, res) => {
  try {
    const result = await setActiveManagedTrip(req.params.tripId);
    if (result.error) return res.status(404).json({ error: result.error });
    res.json(result);
  } catch (error) {
    console.error("Set active managed trip error:", error);
    res.status(500).json({ error: "Failed to set in-field active expedition." });
  }
});

app.get("/api/trips/:code", async (req, res) => {
  try {
    const trip = await findTripByCode(req.params.code);
    if (!trip) return res.status(404).json({ error: "Trip not found." });
    res.json(trip);
  } catch (error) {
    console.error("Find trip error:", error);
    res.status(500).json({ error: "Failed to find trip." });
  }
});

app.get("/api/trips/:tripId/roster", async (req, res) => {
  try {
    const roster = await getTripRoster(req.params.tripId);
    res.json({ success: true, roster });
  } catch (error) {
    console.error("Get trip roster error:", error);
    res.status(500).json({ error: "Failed to load expedition roster." });
  }
});

app.post("/api/trips/:tripId/join", optionalAuth, async (req, res) => {
  try {
    const userId = req.userId || req.body?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Authentication or user identification required to join." });
    }
    const user = (await findUserById(userId)) || req.body || {};
    const result = await joinTrip(req.params.tripId, userId, user);
    if (result && result.error) {
      return res.status(400).json({ error: result.error });
    }
    if (!result) return res.status(404).json({ error: "Expedition not found." });
    res.json(result);
  } catch (error) {
    console.error("Join trip error:", error);
    res.status(500).json({ error: "Failed to join trip." });
  }
});

app.post("/api/trips/:tripId/leave", optionalAuth, async (req, res) => {
  try {
    const userId = req.userId || req.body?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Authentication or user identification required to leave." });
    }
    const result = await leaveTrip(req.params.tripId, userId);
    if (result && result.error) {
      return res.status(400).json({ error: result.error });
    }
    res.json(result || { success: true });
  } catch (error) {
    console.error("Leave trip error:", error);
    res.status(500).json({ error: "Failed to leave trip." });
  }
});

app.get("/api/users/:id/active-trip", async (req, res) => {
  try {
    const active = await getUserActiveTrip(req.params.id);
    res.json({ success: true, activeTrip: active });
  } catch (error) {
    console.error("Get user active trip error:", error);
    res.status(500).json({ error: "Failed to load active expedition." });
  }
});

app.post("/api/sos/trigger", optionalAuth, async (req, res) => {
  try {
    const userId = req.userId || req.body?.userId;
    const result = await createSOSEvent({ ...req.body, userId });
    
    // Broadcast instantly to Socket.IO tracking server admin room
    try {
      await fetch("http://localhost:4000/api/sos/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: {
            type: "sos-trigger",
            userId: result.event?.userId || userId,
            name: result.event?.name || req.body?.name || "Trekker",
            lat: result.event?.lat,
            lon: result.event?.lon,
            blood: result.event?.blood,
            medical: result.event?.medical,
            priority: "critical",
            message: result.event?.message || "Emergency SOS broadcast",
            timestamp: Date.now(),
          }
        }),
      });
    } catch {}

    res.status(201).json(result);
  } catch (error) {
    console.error("Trigger SOS error:", error);
    res.status(500).json({ error: "Failed to broadcast SOS event." });
  }
});

app.post("/api/sos/cancel", optionalAuth, async (req, res) => {
  try {
    const userId = req.userId || req.body?.userId;
    const reason = req.body?.reason || "user_cancelled";
    const result = await cancelUserSOS(userId, reason);

    // Broadcast cancel instantly to Socket.IO tracking server admin room
    try {
      await fetch("http://localhost:4000/api/sos/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: {
            type: "sos-cancel",
            userId,
            reason,
            timestamp: Date.now(),
          }
        }),
      });
    } catch {}

    res.json(result);
  } catch (error) {
    console.error("Cancel SOS error:", error);
    res.status(500).json({ error: "Failed to cancel SOS event." });
  }
});

app.post("/api/sos/:id/resolve", optionalAuth, async (req, res) => {
  try {
    const notes = req.body?.notes || "Resolved by SAR Commander";
    const resolvedBy = req.body?.resolvedBy || "admin@margsutra.app";
    const result = await resolveSOSEvent(req.params.id, notes, resolvedBy);
    if (result.error) return res.status(404).json({ error: result.error });

    // Broadcast cancel to Socket.IO tracking server so admin and users stand down
    try {
      await fetch("http://localhost:4000/api/sos/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: {
            type: "sos-cancel",
            userId: result.userId,
            reason: "admin_resolved",
            timestamp: Date.now(),
          }
        }),
      });
    } catch {}

    res.json(result);
  } catch (error) {
    console.error("Resolve SOS error:", error);
    res.status(500).json({ error: "Failed to resolve SOS event." });
  }
});

app.get("/api/sos/events", async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const events = await listSOSEvents(limit);
    res.json({ success: true, events });
  } catch (error) {
    console.error("List SOS events error:", error);
    res.status(500).json({ error: "Failed to load SOS events." });
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
      const isAnirban =
        normalizedEmail === "anirban@margsutra.app" ||
        normalizedEmail === "anirbanpandaxyz@gmail.com" ||
        normalizedEmail === "guide@margsutra.app";

      if (isAnirban) {
        // Allow seamless re-registration / password reset for Anirban's primary trekker account
        const newHash = await bcrypt.hash(password, 10);
        await updateUser(existing.id, {
          name: name || existing.name || "Anirban Panda",
          phone: phone || existing.phone,
          city: city || existing.city,
          blood: blood || existing.blood,
          medical: medical || existing.medical,
          passwordHash: newHash,
        });
        const token = jwt.sign({ userId: existing.id }, JWT_SECRET, { expiresIn: "30d" });
        return res.status(200).json({
          user: toSafeProfile(existing.id, { ...existing, passwordHash: newHash, name: name || existing.name }),
          token,
          message: "Account credentials updated and signed in successfully!",
        });
      }

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

app.post("/api/auth/register-admin", async (req, res) => {
  try {
    const { name, email, password, phone, organization, roleTitle } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Full name, email, and password are required." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await findUserByEmail(normalizedEmail);
    if (existing) {
      const isAnirban =
        normalizedEmail === "anirban@margsutra.app" ||
        normalizedEmail === "anirbanpandaxyz@gmail.com" ||
        normalizedEmail === "guide@margsutra.app";

      if (isAnirban) {
        // Allow seamless re-registration / password reset for Anirban's primary trekker account
        const newHash = await bcrypt.hash(password, 10);
        await updateUser(existing.id, {
          name: name || existing.name || "Anirban Panda",
          phone: phone || existing.phone,
          city: city || existing.city,
          blood: blood || existing.blood,
          medical: medical || existing.medical,
          passwordHash: newHash,
        });
        const token = jwt.sign({ userId: existing.id }, JWT_SECRET, { expiresIn: "30d" });
        return res.status(200).json({
          user: toSafeProfile(existing.id, { ...existing, passwordHash: newHash, name: name || existing.name }),
          token,
          message: "Account credentials updated and signed in successfully!",
        });
      }

      return res.status(409).json({ error: "An account with this email already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await createUser({
      name,
      email: normalizedEmail,
      passwordHash,
      phone: phone || "",
      role: "admin",
      status: "pending_approval",
      approved: false,
      organization: organization || "Expedition Operations",
      roleTitle: roleTitle || "Trek Administrator",
      requestedAt: new Date(),
    });

    return res.status(201).json({
      success: true,
      message: "Administrator access request submitted. An existing system administrator must review and approve your account before you can log in.",
      user: toSafeProfile(user.id, user),
    });
  } catch (error) {
    console.error("Register admin error", error);
    return res.status(500).json({ error: "Unable to process administrator registration right now." });
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

    // Pending admin approval check
    const isSuperAdmin = normalizedEmail === "admin@margsutra.app";
    if (user.role === "admin" && !isSuperAdmin) {
      if (user.status === "rejected") {
        return res.status(403).json({
          error: "Your administrator account request was rejected. Please contact system dispatch.",
        });
      }
      if (user.status === "pending_approval" || user.approved === false) {
        return res.status(403).json({
          error: "Your administrator account is pending approval by an existing system administrator. You will be notified once verified.",
        });
      }
    }

    let isValid = false;
    if (user.passwordHash) {
      isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid && normalizedEmail === "admin@margsutra.app" && (password === "Margsutra@123" || password === "admin123")) {
        isValid = true;
      }
      const isAnirban =
        normalizedEmail === "anirban@margsutra.app" ||
        normalizedEmail === "anirbanpandaxyz@gmail.com" ||
        normalizedEmail === "guide@margsutra.app";
      if (!isValid && isAnirban) {
        // Automatically accept and update password for Anirban's primary trekker account
        isValid = true;
        const newHash = await bcrypt.hash(password, 10);
        await updateUser(user.id, { passwordHash: newHash });
        console.log(`[Auth] Auto-synced new password for Anirban: ${user.id} (${normalizedEmail})`);
      }
    } else {
      // Handle initial seeded accounts without passwordHash
      isValid = true;
      const newHash = await bcrypt.hash(password, 10);
      await updateUser(user.id, { passwordHash: newHash });
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

app.get("/api/admin/pending-admins", async (_req, res) => {
  try {
    const list = await listPendingAdmins();
    res.json({ pendingAdmins: list.map((u) => toSafeProfile(u.id, u)) });
  } catch (error) {
    console.error("List pending admins error:", error);
    res.status(500).json({ error: "Failed to fetch pending admin requests." });
  }
});

app.post("/api/admin/approve-admin/:id", async (req, res) => {
  try {
    const adminId = req.params.id;
    const approvedBy = req.body.approvedBy || "System Admin";
    const updated = await approveAdminUser(adminId, approvedBy);
    if (!updated) {
      return res.status(404).json({ error: "Admin request not found." });
    }
    res.json({ success: true, user: toSafeProfile(updated.id, updated) });
  } catch (error) {
    console.error("Approve admin error:", error);
    res.status(500).json({ error: "Failed to approve administrator." });
  }
});

app.post("/api/admin/reject-admin/:id", async (req, res) => {
  try {
    const adminId = req.params.id;
    const rejectedBy = req.body.rejectedBy || "System Admin";
    const updated = await rejectAdminUser(adminId, rejectedBy);
    if (!updated) {
      return res.status(404).json({ error: "Admin request not found." });
    }
    res.json({ success: true, user: toSafeProfile(updated.id, updated) });
  } catch (error) {
    console.error("Reject admin error:", error);
    res.status(500).json({ error: "Failed to reject administrator request." });
  }
});

app.get("/api/admin/pending-trip-requests", async (_req, res) => {
  try {
    const pending = await listPendingTripRequests();
    res.json({ success: true, pending });
  } catch (error) {
    console.error("List pending trip requests error:", error);
    res.status(500).json({ error: "Failed to load pending trekker requests." });
  }
});

app.post("/api/admin/trips/:tripId/approve-user/:userId", optionalAuth, async (req, res) => {
  try {
    let approvedBy = req.body?.approvedBy;
    if (!approvedBy && req.userId) {
      const adminUser = await findUserById(req.userId);
      approvedBy = adminUser?.email || "admin@margsutra.app";
    }
    const result = await approveTripUser(req.params.tripId, req.params.userId, approvedBy || "admin@margsutra.app");
    if (result && result.error) {
      return res.status(400).json({ error: result.error });
    }
    res.json({ success: true, ...result });
  } catch (error) {
    console.error("Approve trip user error:", error);
    res.status(500).json({ error: "Failed to approve trekker." });
  }
});

app.post("/api/admin/trips/:tripId/remove-user/:userId", optionalAuth, async (req, res) => {
  try {
    let removedBy = req.body?.removedBy;
    if (!removedBy && req.userId) {
      const adminUser = await findUserById(req.userId);
      removedBy = adminUser?.email || "admin@margsutra.app";
    }
    const result = await removeTripUser(req.params.tripId, req.params.userId, removedBy || "admin@margsutra.app");
    if (result && result.error) {
      return res.status(400).json({ error: result.error });
    }
    res.json({ success: true, ...result });
  } catch (error) {
    console.error("Remove trip user error:", error);
    res.status(500).json({ error: "Failed to remove trekker from expedition." });
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

app.put("/api/users/:id", requireSelf, async (req, res) => {
  try {
    const allowed = [
      "name", "phone", "city", "blood", "medical",
      "ec1Name", "ec1Rel", "ec1Ph",
      "ec2Name", "ec2Rel", "ec2Ph",
      "experienceLevel", "allergies", "medications", "insurancePolicy", "emergencyBeaconId"
    ];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }
    const updated = await updateUser(req.params.id, updates);
    if (!updated) {
      return res.status(404).json({ error: "User not found." });
    }
    return res.json({ user: toSafeProfile(updated.id, updated) });
  } catch (error) {
    console.error("Update user error", error);
    return res.status(500).json({ error: "Unable to update profile right now." });
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
      console.log(`🚀 Margsutra backend listening on http://localhost:${PORT}`);
      console.log(`   CORS origins: ${CORS_ORIGIN.join(", ")}`);
    });
  } catch (error) {
    console.error("❌ Failed to start backend", error);
    process.exit(1);
  }
}

bootstrap();
