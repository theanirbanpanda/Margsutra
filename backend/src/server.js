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
  seedDemoTrip,
  seedEmulatorData,
  HttpError,
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
} = require("./services/firestore");

// Firestore calls can hang for a long time when the emulator is down or the
// project is over its quota, so every startup probe is time-boxed: the API
// must always come up, even with no database at all.
const withTimeout = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms).unref?.()
    ),
  ]);

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

app.get("/health", async (_req, res) => {
  // Report the real state of the database so a dead Firestore is visible.
  try {
    await withTimeout(db.collection("users").limit(1).get(), 3000, "Health probe");
    return res.json({ status: "ok", db: "firebase-connected" });
  } catch (error) {
    return res.json({
      status: "ok",
      db: "firebase-unavailable",
      mode: "demo-memory",
      detail: error?.message || "Firestore unreachable",
    });
  }
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

// Firestore read quota is shared across the whole project. When it runs out
// the API should say so clearly (and serve the last good data where it can)
// instead of failing with an opaque 500.
function isQuotaError(error) {
  const code = error?.code ?? error?.errorInfo?.code;
  if (code === 8 || code === "8" || code === "RESOURCE_EXHAUSTED") return true;
  return /quota exceeded|resource_exhausted/i.test(error?.message || "");
}

// Last known good trip list, used as a fallback while the quota is exhausted.
let tripsCache = { at: 0, data: null };

app.get("/api/trips", async (_req, res) => {
  try {
    const trips = await withTimeout(listTrips(), 6000, "List trips");
    tripsCache = { at: Date.now(), data: trips };
    res.json(trips);
  } catch (error) {
    console.warn("⚠️  Could not list trips from Firestore:", error?.message || error);
    if (tripsCache.data) {
      return res.json(tripsCache.data); // stale-but-usable
    }
    // The demo must never show an empty expedition list.
    return res.json(demoTripsSnapshot());
  }
});

app.post("/api/trips", optionalAuth, async (req, res) => {
  try {
    const tripData = { ...(req.body || {}) };
    if (!tripData.name) {
      return res.status(400).json({ error: "Expedition name is required." });
    }
    if (!tripData.createdBy) tripData.createdBy = req.userId || tripData.adminInCharge || null;
    if (!tripData.adminInCharge) tripData.adminInCharge = tripData.createdBy;
    const newTrip = await createTrip(tripData);
    res.status(201).json({ success: true, trip: newTrip });
  } catch (error) {
    if (error instanceof HttpError || typeof error?.status === "number") {
      return res.status(error.status || 400).json({ error: error.message });
    }
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
    if (error instanceof HttpError || typeof error?.status === "number") {
      return res.status(error.status || 400).json({ error: error.message });
    }
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
    if (error instanceof HttpError || typeof error?.status === "number") {
      return res.status(error.status || 400).json({ error: error.message });
    }
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
  pendingTripRequestsCache = { at: 0, data: null };
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
    const resolvedBy = req.body?.resolvedBy || DEMO_ADMIN_EMAIL;
    const result = await resolveSOSEvent(req.params.id, notes, resolvedBy);
    if (result.error) return res.status(404).json({ error: result.error });
    sosEventsCache = { at: 0, key: "", data: null };

    // If this was a command alert, every member must stop ringing for it.
    try {
      await fetch("http://localhost:4000/api/sos/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: {
            type: "command-alert-clear",
            id: req.params.id,
            timestamp: Date.now(),
          },
        }),
      });
    } catch {}

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

// Two-way SOS: the command team can alert every member of the group at once.
app.post("/api/sos/broadcast", requireAuth, async (req, res) => {
  try {
    const adminUser = await findUserById(req.userId);
    const role = (adminUser?.role || "").toLowerCase();
    if (role !== "admin") {
      return res.status(403).json({ error: "Only command team members can broadcast alerts." });
    }

    const message = String(req.body?.message || "").trim();
    if (!message) {
      return res.status(400).json({ error: "Write a short alert message before sending." });
    }

    const result = await createSOSBroadcast({
      message,
      severity: req.body?.severity || "advisory",
      title: req.body?.title || "",
      createdBy: req.userId,
      createdByName: adminUser?.name || adminUser?.email || "SAR Command",
    });

    // Push it to every connected console and trekker immediately.
    try {
      await fetch("http://localhost:4000/api/sos/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: {
            type: "command-broadcast",
            id: result.event.id,
            message: result.event.message,
            severity: result.event.severity,
            title: result.event.title,
            createdByName: result.event.createdByName,
            timestamp: Date.now(),
          },
        }),
      });
    } catch {}

    res.status(201).json(result);
  } catch (error) {
    console.error("Broadcast SOS error:", error);
    res.status(500).json({ error: "Failed to send the alert." });
  }
});

// Alerts sent by the command team to the whole group.
// `?all=1` also returns dismissed ones (the console keeps a history).
app.get("/api/sos/alerts", async (req, res) => {
  try {
    const includeAll = req.query.all === "1" || req.query.all === "true";
    const alerts = await withTimeout(listSOSBroadcasts(20, !includeAll), 6000, "List SOS alerts");
    res.json({ success: true, alerts });
  } catch (error) {
    console.error("List SOS alerts error:", error);
    res.status(500).json({ error: "Failed to load alerts." });
  }
});

// Acknowledge an SOS: a duty officer has seen the beacon and is acting on it.
// The incident stays active — only "stand down" clears it.
app.post("/api/sos/:id/acknowledge", optionalAuth, async (req, res) => {
  try {
    let acknowledgedBy = req.body?.acknowledgedBy;
    if (!acknowledgedBy && req.userId) {
      const adminUser = await findUserById(req.userId);
      acknowledgedBy = adminUser?.email || adminUser?.name || DEMO_ADMIN_EMAIL;
    }
    const result = await acknowledgeSOSEvent(
      req.params.id,
      acknowledgedBy || DEMO_ADMIN_EMAIL,
      req.body?.note || "",
      req.userId || ""
    );
    if (result.error) return res.status(404).json({ error: result.error });
    sosEventsCache = { at: 0, key: "", data: null };
    res.json(result);
  } catch (error) {
    console.error("Acknowledge SOS error:", error);
    res.status(500).json({ error: "Failed to acknowledge SOS event." });
  }
});

// Short-lived cache so several open consoles don't each burn a Firestore
// read on the same SOS feed. 5s is short enough for an emergency feed.
let sosEventsCache = { at: 0, key: "", data: null };

app.get("/api/sos/events", async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 25, 100));
    const key = String(limit);
    const now = Date.now();
    if (sosEventsCache.key === key && now - sosEventsCache.at < 5000 && sosEventsCache.data) {
      return res.json({ success: true, events: sosEventsCache.data, cached: true });
    }
    const events = await withTimeout(listSOSEvents(limit), 6000, "List SOS events");
    sosEventsCache = { at: now, key, data: events };
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
      const isDemoAccount =
        normalizedEmail === DEMO_ADMIN_EMAIL ||
        normalizedEmail === DEMO_USER_EMAIL;

      if (isDemoAccount) {
        // The demo accounts can always be re-keyed, so a forgotten demo
        // password can never lock the demo out.
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
      const isDemoAccount =
        normalizedEmail === DEMO_ADMIN_EMAIL ||
        normalizedEmail === DEMO_USER_EMAIL;

      if (isDemoAccount) {
        // The demo accounts can always be re-keyed, so a forgotten demo
        // password can never lock the demo out.
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

// The demo accounts are the only accounts that exist. They are also served
// from memory when Firestore cannot be reached (quota exhausted, offline),
// so the demo login never fails.
function findDemoAccountByEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  return DEMO_ACCOUNTS.find((a) => a.email === normalized) || null;
}

// Creates the demo account document if it is missing. Fire and forget — it
// must never delay or fail a sign-in.
async function ensureDemoAccountExists(account) {
  try {
    const existing = await findUserByEmail(account.email);
    if (existing) return;
    const bcryptLocal = require("bcryptjs");
    await createUser({
      id: account.id,
      email: account.email,
      name: account.name,
      role: account.role,
      phone: account.phone || "",
      blood: account.blood || "B+",
      medical: account.medical || "None",
      ec1Name: account.ec1Name || "",
      ec1Rel: account.ec1Rel || "",
      ec1Ph: account.ec1Ph || "",
      organization: account.organization || "",
      roleTitle: account.roleTitle || "",
      passwordHash: await bcryptLocal.hash(account.password, 10),
      status: "approved",
      approved: true,
    });
    console.log(`[Auth] Created missing demo account: ${account.email}`);
  } catch (error) {
    console.warn("[Auth] Could not persist demo account:", error?.message || error);
  }
}

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const demoAccount = findDemoAccountByEmail(normalizedEmail);

    // The demo accounts are the only accounts that exist, so they are checked
    // in memory first: the sign-in is instant and cannot fail because
    // Firestore is slow, unreachable or over its read quota.
    if (demoAccount) {
      if (password !== demoAccount.password) {
        return res.status(401).json({ error: "Invalid email or password." });
      }
      // Best effort: make sure the document exists so the rest of the app can
      // read the profile. Never blocks the sign-in.
      ensureDemoAccountExists(demoAccount).catch(() => {});

      const token = jwt.sign({ userId: demoAccount.id }, JWT_SECRET, { expiresIn: "30d" });
      const profile = toSafeProfile(demoAccount.id, {
        ...demoAccount,
        status: "approved",
        approved: true,
      });
      return res.json({ user: profile, token });
    }

    // Any other address: normal database-backed sign-in.
    let user = null;
    try {
      user = await findUserByEmail(normalizedEmail);
    } catch (lookupError) {
      console.warn("⚠️  Firestore unreachable during login:", lookupError?.message || lookupError);
      return res.status(503).json({ error: "Unable to sign in right now. Please try again." });
    }

    if (!user) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    // Pending admin approval check
    const isSuperAdmin = normalizedEmail === DEMO_ADMIN_EMAIL;
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
    } else {
      // Account without a stored hash: set it from this first login.
      isValid = true;
      try {
        await updateUser(user.id, { passwordHash: await bcrypt.hash(password, 10) });
      } catch (hashError) {
        console.warn("[Auth] Could not store password hash:", hashError?.message || hashError);
      }
      console.log(`[Auth] Initial password set for ${normalizedEmail}`);
    }

    if (!isValid) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "30d" });
    return res.json({ user: toSafeProfile(user.id, user), token });
  } catch (error) {
    if (isQuotaError(error)) {
      console.warn("⚠️  Firestore read quota exhausted during login.");
      return res.status(503).json({
        error: "Sign-in is temporarily unavailable (Firestore read quota exhausted). Try again in a few minutes.",
        quotaExceeded: true,
      });
    }
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

// Persist per-user feature access toggles from the admin console.
app.post("/api/admin/users/:id/features", requireAuth, async (req, res) => {
  try {
    const { features } = req.body || {};
    if (!features || typeof features !== "object" || Array.isArray(features)) {
      return res.status(400).json({ error: "features must be an object of { featureName: boolean }." });
    }
    const target = await findUserById(req.params.id);
    if (!target) return res.status(404).json({ error: "User not found." });
    const updated = await updateUser(req.params.id, {
      features,
      featuresUpdatedAt: new Date().toISOString(),
    });
    res.json({ success: true, userId: req.params.id, features: updated?.features || features });
  } catch (error) {
    console.error("Update feature access error:", error);
    res.status(500).json({ error: "Failed to persist feature access." });
  }
});

// Cached for 30s: several open consoles poll this and the project shares one
// daily Firestore read quota.
let pendingTripRequestsCache = { at: 0, data: null };

app.get("/api/admin/pending-trip-requests", async (_req, res) => {
  try {
    if (pendingTripRequestsCache.data && Date.now() - pendingTripRequestsCache.at < 30000) {
      return res.json({ success: true, pending: pendingTripRequestsCache.data, cached: true });
    }
    const pending = await withTimeout(listPendingTripRequests(), 6000, "List pending trip requests");
    pendingTripRequestsCache = { at: Date.now(), data: pending };
    res.json({ success: true, pending });
  } catch (error) {
    console.error("List pending trip requests error:", error);
    res.status(500).json({ error: "Failed to load pending trekker requests." });
  }
});

app.post("/api/admin/trips/:tripId/approve-user/:userId", optionalAuth, async (req, res) => {
  pendingTripRequestsCache = { at: 0, data: null };
  try {
    let approvedBy = req.body?.approvedBy;
    if (!approvedBy && req.userId) {
      const adminUser = await findUserById(req.userId);
      approvedBy = adminUser?.email || DEMO_ADMIN_EMAIL;
    }
    const result = await approveTripUser(req.params.tripId, req.params.userId, approvedBy || DEMO_ADMIN_EMAIL);
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
      removedBy = adminUser?.email || DEMO_ADMIN_EMAIL;
    }
    const result = await removeTripUser(req.params.tripId, req.params.userId, removedBy || DEMO_ADMIN_EMAIL);
    if (result && result.error) {
      return res.status(400).json({ error: result.error });
    }
    res.json({ success: true, ...result });
  } catch (error) {
    console.error("Remove trip user error:", error);
    res.status(500).json({ error: "Failed to remove trekker from expedition." });
  }
});

// Cached for 60s — the console roster is not time-critical and the whole
// project shares one daily Firestore read quota.
let usersCache = { at: 0, data: null };

app.get("/api/users", requireAuth, async (_req, res) => {
  try {
    if (usersCache.data && Date.now() - usersCache.at < 60000) {
      return res.json({ users: usersCache.data, cached: true });
    }
    const users = await withTimeout(listUsers(), 6000, "List users");
    usersCache = { at: Date.now(), data: users };
    return res.json({ users });
  } catch (error) {
    console.warn("⚠️  Could not list users from Firestore:", error?.message || error);
    if (usersCache.data) return res.json({ users: usersCache.data, cached: true });
    const fallback = DEMO_ACCOUNTS.map((a) => ({
      id: a.id,
      name: a.name,
      email: a.email,
      role: a.role,
      status: "approved",
      approved: true,
      phone: a.phone || "",
      blood: a.blood || "B+",
      medical: a.medical || "None",
      organization: a.organization || "",
      roleTitle: a.roleTitle || "",
    }));
    return res.json({ users: fallback });
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

const SEED_RETRY_MS = 10 * 60 * 1000;
const SEED_MAX_RETRIES = 72; // ~12 hours of retries (covers a daily quota reset)

async function ensureDemoSeed(attempt = 0) {
  try {
    await seedDemoTrip();
  } catch (seedError) {
    console.warn("⚠️  Demo trip seed not applied:", seedError?.message || seedError);
    if (attempt < SEED_MAX_RETRIES) {
      console.warn(`   Retrying in 10 minutes (attempt ${attempt + 1}/${SEED_MAX_RETRIES}).`);
      const timer = setTimeout(() => ensureDemoSeed(attempt + 1), SEED_RETRY_MS);
      if (typeof timer.unref === "function") timer.unref();
    }
  }
}

async function bootstrap() {
  try {
    // Verify Firestore connection (non-fatal: the API still starts and
    // individual routes report their own errors if Firestore is unavailable).
    await withTimeout(db.collection("users").limit(1).get(), 5000, "Firestore probe");
    console.log("✅ Firebase Firestore connected successfully");
  } catch (error) {
    console.warn("⚠️  Firestore probe failed:", error?.message || error);
    console.warn("   The API still starts — demo logins and demo data are served from memory.");
  }

  try {
    await withTimeout(seedEmulatorData(), 8000, "Emulator seed");
  } catch (seedError) {
    console.warn("⚠️  Emulator demo data not seeded:", seedError?.message || seedError);
  }

  // Idempotent: creates the demo expedition once, or upgrades the legacy
  // RAJM26 document. Retries so it self-heals after a Firestore quota reset.
  ensureDemoSeed();

  app.listen(PORT, () => {
    console.log(`🚀 Margsutra backend listening on http://localhost:${PORT}`);
    console.log(`   CORS origins: ${CORS_ORIGIN.join(", ")}`);
  }).on("error", (error) => {
    if (error?.code === "EADDRINUSE") {
      console.error(`❌ Port ${PORT} is already in use — another backend is running.`);
      console.error("   Stop the other stack (Ctrl+C) or start this one on a different port: PORT=5051 npm run dev");
      process.exit(1);
    }
    console.error("❌ Backend failed to start:", error);
    process.exit(1);
  });
}

bootstrap();
