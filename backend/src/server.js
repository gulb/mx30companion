require("dotenv").config();

const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const path = require("path");
const { EncryptedDatabase } = require("./cryptoStore");
const { MazdaCompanionManager } = require("./mazdaClient");
const { startScheduler } = require("./scheduler");
const {
  consumeChallenge,
  resolveRpIdAndOrigin,
  verifyGoogleAccountPayload,
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} = require("./passkeyAuth");

const PORT = Number(process.env.PORT) || 3080;
const app = express();
const db = new EncryptedDatabase();
const manager = new MazdaCompanionManager(db);

const ALLOWED_ORIGINS = new Set(
  (
    process.env.ALLOWED_ORIGINS ||
    "http://localhost:3080"
  )
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean)
);

app.set("trust proxy", true);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || ALLOWED_ORIGINS.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin not allowed by CORS"));
    }
  })
);
app.use(express.json({ limit: "1mb" }));

// Internet-ready security headers
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  res.setHeader("Permissions-Policy", "geolocation=()");
  next();
});

app.use(express.static(path.join(__dirname, "../public")));

// Sliding-window IP rate limiter
function createRateLimiter(maxRequests, windowMs, message) {
  const hits = new Map();
  return (req, res, next) => {
    const ip = req.headers["cf-connecting-ip"] || req.ip || req.socket?.remoteAddress || "unknown";
    const now = Date.now();
    const recent = (hits.get(ip) || []).filter((ts) => now - ts < windowMs);
    if (recent.length >= maxRequests) {
      res.status(429).json({ ok: false, error: message });
      return;
    }
    recent.push(now);
    hits.set(ip, recent);
    next();
  };
}

const authRateLimit = createRateLimiter(
  25,
  15 * 60 * 1000,
  "Too many authentication attempts. Please wait 15 minutes and try again."
);
const apiRateLimit = createRateLimiter(
  120,
  60 * 1000,
  "Rate limit exceeded. Please slow down."
);
app.use("/api/", apiRateLimit);

function wrapAsync(handler) {
  return (req, res) => {
    Promise.resolve(handler(req, res)).catch((err) => {
      console.error(`${req.method} ${req.path} failed:`, err.message);
      const statusCode = err.statusCode || 400;
      res.status(statusCode).json({ ok: false, error: err.message });
    });
  };
}

function extractBearerToken(req) {
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) {
    return auth.slice(7).trim();
  }
  if (typeof req.query.token === "string" && req.query.token.trim()) {
    return req.query.token.trim();
  }
  return "";
}

function requireAuth(req, res, next) {
  const rawToken = extractBearerToken(req);
  const resolved = db.getUserByToken(rawToken);
  if (!resolved) {
    res.status(401).json({ ok: false, error: "Unauthorized — please sign in" });
    return;
  }
  req.user = resolved.user;
  req.session = resolved.session;
  req.authToken = rawToken;
  req.client = manager.getClient(resolved.user.id);
  next();
}

// Public health endpoint (no user data exposed)
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    encryption: "aes-256-gcm",
    multiUser: true,
    uptimeSec: Math.round(process.uptime())
  });
});

// Auth endpoints
app.post(
  "/api/auth/register",
  authRateLimit,
  wrapAsync(async (req, res) => {
    const { email, password, name, lang, deviceName } = req.body || {};
    const user = manager.createUser({ email, password, name, lang });
    const token = db.createSession(
      user.id,
      deviceName || req.headers["user-agent"] || "Browser / App"
    );
    res.status(201).json({ ok: true, token, user });
  })
);

app.post(
  "/api/auth/login",
  authRateLimit,
  wrapAsync(async (req, res) => {
    const { email, password, deviceName } = req.body || {};
    const user = db.authenticateUser({ email, password });
    const token = db.createSession(
      user.id,
      deviceName || req.headers["user-agent"] || "Browser / App"
    );
    res.json({ ok: true, token, user });
  })
);

app.get("/api/auth/providers", (req, res) => {
  res.json({
    ok: true,
    googleClientId: db.getGoogleClientId(),
    passkeySupported: true
  });
});

app.post(
  "/api/auth/providers",
  wrapAsync(async (req, res) => {
    const rawToken = extractBearerToken(req);
    const resolved = rawToken ? db.getUserByToken(rawToken) : null;
    if (db.listUserIds().length > 0 && !resolved) {
      res.status(401).json({ ok: false, error: "Sign in to update Google Client ID" });
      return;
    }
    const clientId = db.setGoogleClientId(req.body?.googleClientId || "");
    res.json({ ok: true, googleClientId: clientId });
  })
);

app.post(
  "/api/auth/google",
  authRateLimit,
  wrapAsync(async (req, res) => {
    const configuredClientId = db.getGoogleClientId();
    const verified = await verifyGoogleAccountPayload(req.body || {}, configuredClientId);
    const { user, isNewUser } = manager.findOrCreateGoogleUser({
      ...verified,
      lang: req.body?.lang || "hu"
    });
    const token = db.createSession(
      user.id,
      req.body?.deviceName || req.headers["user-agent"] || "Google Web / App"
    );
    res.status(isNewUser ? 201 : 200).json({
      ok: true,
      token,
      user,
      isNewUser,
      needsPasskeySetup: !user.hasPasskey
    });
  })
);

const pendingAppCodes = new Map();

app.post(
  "/api/auth/app-code",
  requireAuth,
  wrapAsync(async (req, res) => {
    const now = Date.now();
    for (const [k, v] of pendingAppCodes.entries()) {
      if (now - v.createdAt > 60_000) pendingAppCodes.delete(k);
    }
    const code = crypto.randomBytes(32).toString("base64url");
    pendingAppCodes.set(code, { userId: req.user.id, createdAt: now });
    res.json({ ok: true, code });
  })
);

app.post(
  "/api/auth/app-exchange",
  authRateLimit,
  wrapAsync(async (req, res) => {
    const code = String(req.body?.code || "").trim();
    const entry = code ? pendingAppCodes.get(code) : null;
    if (code) pendingAppCodes.delete(code);
    if (!entry || Date.now() - entry.createdAt > 60_000) {
      res.status(401).json({ ok: false, error: "Invalid or expired app login code" });
      return;
    }
    const profile = db.getProfile(entry.userId);
    if (!profile) {
      res.status(401).json({ ok: false, error: "User not found" });
      return;
    }
    const token = db.createSession(
      entry.userId,
      req.body?.deviceName || "MX-30 Android App"
    );
    res.json({ ok: true, token, user: db.toPublicUser(profile) });
  })
);

app.post(
  "/api/auth/passkey/register/options",
  requireAuth,
  wrapAsync(async (req, res) => {
    const { rpId } = resolveRpIdAndOrigin(req);
    const existing = db.listPasskeys(req.user.id);
    const options = generateRegistrationOptions(req.user, existing, rpId);
    res.json({ ok: true, ...options });
  })
);

app.post(
  "/api/auth/passkey/register/verify",
  requireAuth,
  wrapAsync(async (req, res) => {
    const { challengeId } = req.body || {};
    const pending = consumeChallenge(challengeId, "register");
    if (pending.userId !== req.user.id) {
      throw new Error("Passkey registration challenge belongs to another user");
    }
    const verified = verifyRegistrationResponse(req.body || {}, pending.challenge);
    const updatedUser = db.addPasskey(req.user.id, verified);
    res.json({
      ok: true,
      user: updatedUser,
      passkeys: db.listPasskeys(req.user.id)
    });
  })
);

app.get("/api/auth/passkeys", requireAuth, (req, res) => {
  res.json({
    ok: true,
    passkeys: db.listPasskeys(req.user.id)
  });
});

app.delete(
  "/api/auth/passkeys/:id",
  requireAuth,
  wrapAsync(async (req, res) => {
    const updatedUser = db.removePasskey(req.user.id, req.params.id);
    res.json({
      ok: true,
      user: updatedUser,
      passkeys: db.listPasskeys(req.user.id)
    });
  })
);

app.post(
  "/api/auth/passkey/login/options",
  authRateLimit,
  wrapAsync(async (req, res) => {
    const { rpId } = resolveRpIdAndOrigin(req);
    const email = String(req.body?.email || "").trim();
    const allowed = email ? db.getPasskeysByEmail(email) : [];
    const options = generateAuthenticationOptions(allowed, rpId);
    res.json({ ok: true, ...options });
  })
);

app.post(
  "/api/auth/passkey/login/verify",
  authRateLimit,
  wrapAsync(async (req, res) => {
    const { challengeId } = req.body || {};
    const pending = consumeChallenge(challengeId, "login");
    const credentialId = String(req.body?.id || req.body?.rawId || "").trim();
    const match = db.getPasskeyForLogin(credentialId);
    if (!match) {
      throw new Error("Unknown passkey credential — register with Google first");
    }
    const result = verifyAuthenticationResponse(req.body || {}, pending.challenge, match.passkey);
    db.updatePasskeySignCount(match.userId, credentialId, result.newSignCount);
    const token = db.createSession(
      match.userId,
      req.body?.deviceName || req.headers["user-agent"] || "Passkey Device"
    );
    const freshUser = db.toPublicUser(db.getProfile(match.userId));
    res.json({ ok: true, token, user: freshUser });
  })
);

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({
    ok: true,
    user: req.user,
    passkeys: db.listPasskeys(req.user.id),
    devices: db.listUserSessions(req.user.id)
  });
});

app.post("/api/auth/logout", requireAuth, (req, res) => {
  db.revokeSession(req.authToken);
  res.json({ ok: true });
});

app.delete(
  "/api/account",
  requireAuth,
  wrapAsync(async (req, res) => {
    manager.deleteUser(req.user.id);
    res.json({ ok: true });
  })
);

// Protected per-user vehicle & Carmeo routes
app.get(
  "/api/status",
  requireAuth,
  wrapAsync(async (req, res) => {
    const forceRefresh = req.query.refresh === "true" || req.query.refresh === "1";
    const status = await req.client.getStatus({ forceRefresh });
    res.json({ ...status, user: req.user });
  })
);

app.post(
  "/api/refresh",
  requireAuth,
  wrapAsync(async (req, res) => {
    const status = await req.client.getStatus({ forceRefresh: true });
    res.json({ ...status, user: req.user });
  })
);

app.post(
  "/api/hvac/toggle",
  requireAuth,
  wrapAsync(async (req, res) => {
    const status = await req.client.toggleHvac("user");
    res.json(status);
  })
);

app.post(
  "/api/hvac/on",
  requireAuth,
  wrapAsync(async (req, res) => {
    const { targetTempC, frontDefroster, rearDefroster } = req.body || {};
    const status = await req.client.setHvacPower(
      true,
      { targetTempC, frontDefroster, rearDefroster },
      "user"
    );
    res.json(status);
  })
);

app.post(
  "/api/hvac/off",
  requireAuth,
  wrapAsync(async (req, res) => {
    const status = await req.client.setHvacPower(false, {}, "user");
    res.json(status);
  })
);

app.post(
  "/api/hvac/settings",
  requireAuth,
  wrapAsync(async (req, res) => {
    const { targetTempC, frontDefroster, rearDefroster } = req.body || {};
    const status = await req.client.setHvacSettings(
      { targetTempC, frontDefroster, rearDefroster },
      "user"
    );
    res.json(status);
  })
);

app.post(
  "/api/charge/start",
  requireAuth,
  wrapAsync(async (req, res) => {
    const status = await req.client.setCharging(true, "user");
    res.json(status);
  })
);

app.post(
  "/api/charge/stop",
  requireAuth,
  wrapAsync(async (req, res) => {
    const status = await req.client.setCharging(false, "user");
    res.json(status);
  })
);

app.post(
  "/api/doors/lock",
  requireAuth,
  wrapAsync(async (req, res) => {
    const status = await req.client.setDoorsLocked(true, "user");
    res.json(status);
  })
);

app.post(
  "/api/doors/unlock",
  requireAuth,
  wrapAsync(async (req, res) => {
    const status = await req.client.setDoorsLocked(false, "user");
    res.json(status);
  })
);

app.post(
  "/api/lights/hazard",
  requireAuth,
  wrapAsync(async (req, res) => {
    const status = await req.client.flashHazardLights("user");
    res.json(status);
  })
);

app.post(
  "/api/poi/send",
  requireAuth,
  wrapAsync(async (req, res) => {
    const { latitude, longitude, name } = req.body || {};
    const status = await req.client.sendPoi({ latitude, longitude, name });
    res.json(status);
  })
);

app.post(
  "/api/places",
  requireAuth,
  wrapAsync(async (req, res) => {
    const places = req.body?.places ?? req.body;
    const status = await req.client.savePlaces(places);
    res.json(status);
  })
);

app.get("/api/schedules", requireAuth, (req, res) => {
  res.json({ schedules: req.client.getSchedules() });
});

app.post(
  "/api/schedules",
  requireAuth,
  wrapAsync(async (req, res) => {
    const schedules = await req.client.saveSchedules(req.body?.schedules ?? req.body);
    res.json({ ok: true, schedules });
  })
);

app.post(
  "/api/schedules/:id/skip-next",
  requireAuth,
  wrapAsync(async (req, res) => {
    const status = await req.client.toggleSkipNextSchedule(req.params.id);
    res.json(status);
  })
);

app.post(
  "/api/preferences",
  requireAuth,
  wrapAsync(async (req, res) => {
    const { lang, capacityKwh, carColor } = req.body || {};
    const status = await req.client.setPreferences({ lang, capacityKwh, carColor });
    res.json({ ...status, user: db.getProfile(req.user.id) && { ...req.user, lang: status.lang } });
  })
);

app.post(
  "/api/demo/simulate",
  requireAuth,
  wrapAsync(async (req, res) => {
    const status = await req.client.simulateTripOrCharge(req.body?.type || "trip");
    res.json(status);
  })
);

app.get("/api/export/:type", requireAuth, (req, res) => {
  const type = req.params.type;
  if (type === "trips.csv" || type === "charges.csv") {
    const csv = req.client.exportCsv(type === "charges.csv" ? "charges" : "trips");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="mx30-${type}"`);
    res.send(csv);
    return;
  }
  if (type === "data.json") {
    const payload = {
      exportedAt: new Date().toISOString(),
      user: req.user,
      state: req.client.store.state
    };
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="mx30-export.json"');
    res.send(JSON.stringify(payload, null, 2));
    return;
  }
  res.status(404).json({ ok: false, error: "Unsupported export format" });
});

app.get("/api/config", requireAuth, (req, res) => {
  res.json(req.client.getPublicConfig());
});

app.post(
  "/api/config",
  requireAuth,
  wrapAsync(async (req, res) => {
    const status = await req.client.updateConfig(req.body || {});
    res.json(status);
  })
);

app.post(
  "/api/oauth/start",
  requireAuth,
  wrapAsync(async (req, res) => {
    const result = req.client.startOAuthFlow(req.body?.region);
    res.json({ ok: true, ...result });
  })
);

app.post(
  "/api/oauth/callback",
  requireAuth,
  wrapAsync(async (req, res) => {
    const status = await req.client.completeOAuthFlow(req.body?.callbackUrl || req.body?.code || "");
    res.json(status);
  })
);

app.post(
  "/api/oauth/disconnect",
  requireAuth,
  wrapAsync(async (req, res) => {
    const status = await req.client.disconnectOAuth();
    res.json(status);
  })
);

app.post(
  "/api/telemetry",
  requireAuth,
  wrapAsync(async (req, res) => {
    const source =
      typeof req.query.source === "string" && req.query.source.trim()
        ? req.query.source.trim()
        : "telemetry";
    const status = await req.client.ingestTelemetry(req.body, source);
    res.json(status);
  })
);

const stopScheduler = startScheduler(manager);

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `MX-30 Companion multi-user encrypted backend listening on port ${PORT} (users=${db.listUserIds().length})`
  );
});

process.on("SIGTERM", () => {
  stopScheduler();
  server.close(() => process.exit(0));
});
