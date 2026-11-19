const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.DATA_DIR || "/app/data";
const DB_FILE = process.env.ENCRYPTED_DB_FILE || path.join(DATA_DIR, "encrypted_db.json");
const MASTER_KEY_FILE = process.env.MASTER_KEY_FILE || path.join(DATA_DIR, ".master.key");
const LEGACY_STORE_FILE = path.join(DATA_DIR, "store.json");
const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function hashSha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || typeof storedHash !== "string" || !storedHash.includes(":")) {
    return false;
  }
  const [salt, expectedHex] = storedHash.split(":");
  const derived = crypto.scryptSync(String(password), salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

function loadOrCreateMasterKey() {
  const envKey = (process.env.ENCRYPTION_MASTER_KEY || "").trim();
  if (envKey) {
    if (/^[0-9a-fA-F]{64}$/.test(envKey)) {
      return Buffer.from(envKey, "hex");
    }
    const b64 = Buffer.from(envKey, "base64");
    if (b64.length === 32) {
      return b64;
    }
    return crypto.createHash("sha256").update(envKey).digest();
  }

  fs.mkdirSync(path.dirname(MASTER_KEY_FILE), { recursive: true });
  if (fs.existsSync(MASTER_KEY_FILE)) {
    const raw = fs.readFileSync(MASTER_KEY_FILE, "utf8").trim();
    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
      return Buffer.from(raw, "hex");
    }
  }

  const freshKey = crypto.randomBytes(32);
  fs.writeFileSync(MASTER_KEY_FILE, freshKey.toString("hex"), {
    encoding: "utf8",
    mode: 0o600
  });
  return freshKey;
}

class EncryptedDatabase {
  constructor() {
    this.masterKey = loadOrCreateMasterKey();
    this.index = this.loadDatabase();
    this.cleanupLegacyPlaintext();
  }

  cleanupLegacyPlaintext() {
    try {
      if (fs.existsSync(LEGACY_STORE_FILE)) {
        fs.unlinkSync(LEGACY_STORE_FILE);
      }
    } catch (err) {
      console.warn("Could not remove legacy plaintext store.json:", err.message);
    }
  }

  deriveKey(contextSalt) {
    return Buffer.from(
      crypto.hkdfSync(
        "sha256",
        this.masterKey,
        Buffer.from(String(contextSalt), "utf8"),
        Buffer.from("mx30-companion-v2", "utf8"),
        32
      )
    );
  }

  encryptPayload(dataObj, contextSalt) {
    const key = this.deriveKey(contextSalt);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const plaintext = Buffer.from(JSON.stringify(dataObj), "utf8");
    const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      v: 2,
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
      ct: ct.toString("base64")
    };
  }

  decryptPayload(envelope, contextSalt) {
    if (!envelope || typeof envelope !== "object" || !envelope.iv || !envelope.tag || !envelope.ct) {
      throw new Error("Corrupted encrypted envelope");
    }
    const key = this.deriveKey(contextSalt);
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(envelope.iv, "base64")
    );
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(envelope.ct, "base64")),
      decipher.final()
    ]);
    return JSON.parse(decrypted.toString("utf8"));
  }

  loadDatabase() {
    const defaultGoogleClientId = (process.env.GOOGLE_CLIENT_ID || "").trim();
    const empty = {
      users: {},
      emailIndex: {},
      googleIndex: {},
      passkeyIndex: {},
      sessions: {},
      oauthSettings: { googleClientId: defaultGoogleClientId }
    };
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
        if (raw && raw.envelope) {
          const parsed = this.decryptPayload(raw.envelope, "db-index");
          return {
            users: parsed.users || {},
            emailIndex: parsed.emailIndex || {},
            googleIndex: parsed.googleIndex || {},
            passkeyIndex: parsed.passkeyIndex || {},
            sessions: parsed.sessions || {},
            oauthSettings: {
              googleClientId:
                defaultGoogleClientId || parsed.oauthSettings?.googleClientId || ""
            }
          };
        }
      }
    } catch (err) {
      console.error("Failed to decrypt database:", err.message);
      throw err;
    }

    this.persistDatabase(empty);
    return empty;
  }

  getGoogleClientId() {
    return (process.env.GOOGLE_CLIENT_ID || "").trim() || this.index.oauthSettings?.googleClientId || "";
  }

  setGoogleClientId(clientId) {
    this.index.oauthSettings = {
      ...(this.index.oauthSettings || {}),
      googleClientId: String(clientId || "").trim()
    };
    this.persistDatabase();
    return this.getGoogleClientId();
  }

  persistDatabase(db = this.index) {
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
    const serialized = JSON.stringify({
      v: 2,
      alg: "aes-256-gcm",
      envelope: this.encryptPayload(db, "db-index")
    });
    const tmpFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmpFile, serialized, { encoding: "utf8", mode: 0o600 });
    fs.renameSync(tmpFile, DB_FILE);
  }

  createUser({ email, password, name = "", lang = "hu" }, initialUserData) {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw new Error("Invalid email address");
    }
    if (!password || String(password).length < 6) {
      throw new Error("Password must be at least 6 characters");
    }

    const emailKey = hashSha256(normalizedEmail);
    if (this.index.emailIndex[emailKey]) {
      throw new Error("An account with this email already exists");
    }

    const userId = crypto.randomUUID();
    const cleanLang = lang === "en" ? "en" : "hu";
    const profile = {
      id: userId,
      email: normalizedEmail,
      name: String(name || normalizedEmail.split("@")[0]).trim().slice(0, 60),
      lang: cleanLang,
      authProvider: "password",
      googleSub: null,
      picture: "",
      passkeys: [],
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString()
    };

    this.index.emailIndex[emailKey] = userId;
    this.index.users[userId] = {
      id: userId,
      emailHash: emailKey,
      googleSubHash: null,
      createdAt: profile.createdAt,
      encryptedProfile: this.encryptPayload(profile, `user:${userId}`),
      encryptedData: this.encryptPayload(initialUserData, `data:${userId}`)
    };
    this.persistDatabase();

    return this.toPublicUser(profile);
  }

  findOrCreateGoogleUser({ googleSub, email, name = "", picture = "", lang = "hu" }, initialUserDataFactory) {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw new Error("Invalid Google account email");
    }

    const emailKey = hashSha256(normalizedEmail);
    const subKey = googleSub ? hashSha256(String(googleSub)) : null;

    let userId =
      (subKey && this.index.googleIndex[subKey]) ||
      this.index.emailIndex[emailKey] ||
      null;

    if (userId && this.index.users[userId]) {
      const entry = this.index.users[userId];
      const profile = this.getProfile(userId);
      profile.authProvider = "google";
      if (googleSub && !profile.googleSub) {
        profile.googleSub = String(googleSub);
      }
      if (picture) profile.picture = String(picture);
      if (name && (!profile.name || profile.name === normalizedEmail.split("@")[0])) {
        profile.name = String(name).trim().slice(0, 60);
      }
      if (subKey) {
        this.index.googleIndex[subKey] = userId;
        entry.googleSubHash = subKey;
      }
      entry.encryptedProfile = this.encryptPayload(profile, `user:${userId}`);
      this.persistDatabase();

      return {
        user: this.toPublicUser(profile),
        isNewUser: false,
        passkeysCount: (profile.passkeys || []).length
      };
    }

    userId = crypto.randomUUID();
    const cleanLang = lang === "en" ? "en" : "hu";
    const profile = {
      id: userId,
      email: normalizedEmail,
      name: String(name || normalizedEmail.split("@")[0]).trim().slice(0, 60),
      lang: cleanLang,
      authProvider: "google",
      googleSub: googleSub ? String(googleSub) : null,
      picture: String(picture || ""),
      passkeys: [],
      passwordHash: null,
      createdAt: new Date().toISOString()
    };

    const initialUserData = initialUserDataFactory({ email: normalizedEmail, lang: cleanLang });
    this.index.emailIndex[emailKey] = userId;
    if (subKey) {
      this.index.googleIndex[subKey] = userId;
    }
    this.index.users[userId] = {
      id: userId,
      emailHash: emailKey,
      googleSubHash: subKey,
      createdAt: profile.createdAt,
      encryptedProfile: this.encryptPayload(profile, `user:${userId}`),
      encryptedData: this.encryptPayload(initialUserData, `data:${userId}`)
    };
    this.persistDatabase();

    return {
      user: this.toPublicUser(profile),
      isNewUser: true,
      passkeysCount: 0
    };
  }

  getProfile(userId) {
    const entry = this.index.users[userId];
    if (!entry) return null;
    return this.decryptPayload(entry.encryptedProfile, `user:${userId}`);
  }

  toPublicUser(profile) {
    const passkeys = Array.isArray(profile.passkeys) ? profile.passkeys : [];
    return {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      lang: profile.lang,
      authProvider: profile.authProvider || "password",
      picture: profile.picture || "",
      hasPasskey: passkeys.length > 0,
      passkeysCount: passkeys.length,
      createdAt: profile.createdAt
    };
  }

  addPasskey(userId, { credentialId, publicKeyPem, alg = -7, signCount = 0, transports = [], deviceName = "Passkey" }) {
    const entry = this.index.users[userId];
    if (!entry) throw new Error("User not found");
    if (!credentialId || !publicKeyPem) {
      throw new Error("Invalid passkey credential");
    }

    const profile = this.getProfile(userId);
    const passkeys = Array.isArray(profile.passkeys) ? profile.passkeys : [];
    const existingIdx = passkeys.findIndex((p) => p.credentialId === credentialId);
    const record = {
      credentialId: String(credentialId),
      publicKeyPem: String(publicKeyPem),
      alg: Number(alg) || -7,
      signCount: Number(signCount) || 0,
      transports: Array.isArray(transports) ? transports : [],
      deviceName: String(deviceName || "Passkey").slice(0, 60),
      createdAt: new Date().toISOString(),
      lastUsedAt: null
    };

    if (existingIdx >= 0) {
      passkeys[existingIdx] = record;
    } else {
      passkeys.push(record);
    }

    profile.passkeys = passkeys;
    this.index.passkeyIndex[record.credentialId] = userId;
    entry.encryptedProfile = this.encryptPayload(profile, `user:${userId}`);
    this.persistDatabase();
    return this.toPublicUser(profile);
  }

  listPasskeys(userId) {
    const profile = this.getProfile(userId);
    if (!profile) return [];
    return (profile.passkeys || []).map(({ credentialId, deviceName, createdAt, lastUsedAt, transports }) => ({
      credentialId,
      deviceName,
      createdAt,
      lastUsedAt,
      transports: transports || []
    }));
  }

  getPasskeysByEmail(email) {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const userId = this.index.emailIndex[hashSha256(normalizedEmail)];
    if (!userId) return [];
    const profile = this.getProfile(userId);
    return profile?.passkeys || [];
  }

  removePasskey(userId, credentialId) {
    const entry = this.index.users[userId];
    if (!entry) throw new Error("User not found");
    const profile = this.getProfile(userId);
    profile.passkeys = (profile.passkeys || []).filter((p) => p.credentialId !== credentialId);
    if (this.index.passkeyIndex[credentialId] === userId) {
      delete this.index.passkeyIndex[credentialId];
    }
    entry.encryptedProfile = this.encryptPayload(profile, `user:${userId}`);
    this.persistDatabase();
    return this.toPublicUser(profile);
  }

  getPasskeyForLogin(credentialId) {
    const userId = this.index.passkeyIndex[String(credentialId || "")];
    if (!userId || !this.index.users[userId]) return null;
    const profile = this.getProfile(userId);
    const passkey = (profile?.passkeys || []).find((p) => p.credentialId === credentialId);
    if (!passkey) return null;
    return {
      userId,
      user: this.toPublicUser(profile),
      passkey
    };
  }

  updatePasskeySignCount(userId, credentialId, newSignCount) {
    const entry = this.index.users[userId];
    if (!entry) return;
    const profile = this.getProfile(userId);
    const target = (profile.passkeys || []).find((p) => p.credentialId === credentialId);
    if (!target) return;
    target.signCount = Number(newSignCount) || target.signCount || 0;
    target.lastUsedAt = new Date().toISOString();
    entry.encryptedProfile = this.encryptPayload(profile, `user:${userId}`);
    this.persistDatabase();
  }

  authenticateUser({ email, password }) {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const userId = this.index.emailIndex[hashSha256(normalizedEmail)];
    if (!userId || !this.index.users[userId]) {
      throw new Error("Invalid email or password");
    }

    const profile = this.getProfile(userId);
    if (!verifyPassword(String(password || ""), profile.passwordHash)) {
      throw new Error("Invalid email or password");
    }
    return this.toPublicUser(profile);
  }

  createSession(userId, deviceName = "Browser / App") {
    if (!this.index.users[userId]) {
      throw new Error("User not found");
    }
    const rawToken = crypto.randomBytes(32).toString("base64url");
    const tokenHash = hashSha256(rawToken);
    const now = new Date().toISOString();
    this.index.sessions[tokenHash] = {
      id: tokenHash.slice(0, 12),
      userId,
      deviceName: String(deviceName || "Device").slice(0, 80),
      createdAt: now,
      lastSeenAt: now
    };
    this.persistDatabase();
    return rawToken;
  }

  getUserByToken(rawToken) {
    if (!rawToken || typeof rawToken !== "string") return null;
    const tokenHash = hashSha256(rawToken);
    const session = this.index.sessions[tokenHash];
    if (!session || !this.index.users[session.userId]) return null;

    const nowMs = Date.now();
    const createdMs = new Date(session.createdAt || 0).getTime();
    if (!createdMs || nowMs - createdMs > SESSION_TTL_MS) {
      delete this.index.sessions[tokenHash];
      this.persistDatabase();
      return null;
    }

    const lastMs = new Date(session.lastSeenAt || 0).getTime();
    if (nowMs - lastMs > 5 * 60 * 1000) {
      session.lastSeenAt = new Date(nowMs).toISOString();
      this.persistDatabase();
    }

    const profile = this.getProfile(session.userId);
    return {
      user: this.toPublicUser(profile),
      session
    };
  }

  listUserSessions(userId, currentRawToken = "") {
    const nowMs = Date.now();
    const currentHash = currentRawToken ? hashSha256(currentRawToken) : "";
    let pruned = false;
    const list = [];

    for (const [tokenHash, s] of Object.entries(this.index.sessions)) {
      if (s.userId !== userId) continue;
      const createdMs = new Date(s.createdAt || 0).getTime();
      if (!createdMs || nowMs - createdMs > SESSION_TTL_MS) {
        delete this.index.sessions[tokenHash];
        pruned = true;
        continue;
      }
      list.push({
        id: s.id,
        deviceName: s.deviceName,
        createdAt: s.createdAt,
        lastSeenAt: s.lastSeenAt,
        isCurrent: Boolean(currentHash && tokenHash === currentHash)
      });
    }

    if (pruned) {
      this.persistDatabase();
    }

    return list.sort((a, b) => new Date(b.lastSeenAt || 0) - new Date(a.lastSeenAt || 0));
  }

  revokeSessionById(userId, sessionId) {
    const targetId = String(sessionId || "").trim();
    if (!targetId) return false;
    for (const [tokenHash, s] of Object.entries(this.index.sessions)) {
      if (s.userId === userId && s.id === targetId) {
        delete this.index.sessions[tokenHash];
        this.persistDatabase();
        return true;
      }
    }
    return false;
  }

  revokeOtherSessions(userId, keepRawToken = "") {
    const keepHash = keepRawToken ? hashSha256(keepRawToken) : "";
    let removed = 0;
    for (const [tokenHash, s] of Object.entries(this.index.sessions)) {
      if (s.userId === userId && tokenHash !== keepHash) {
        delete this.index.sessions[tokenHash];
        removed += 1;
      }
    }
    if (removed > 0) {
      this.persistDatabase();
    }
    return removed;
  }

  revokeSession(rawToken) {
    if (!rawToken) return;
    const tokenHash = hashSha256(rawToken);
    if (this.index.sessions[tokenHash]) {
      delete this.index.sessions[tokenHash];
      this.persistDatabase();
    }
  }

  updateUserProfile(userId, patch) {
    const entry = this.index.users[userId];
    if (!entry) throw new Error("User not found");
    const profile = this.getProfile(userId);
    if (typeof patch.name === "string" && patch.name.trim()) {
      profile.name = patch.name.trim().slice(0, 60);
    }
    if (patch.lang === "hu" || patch.lang === "en") {
      profile.lang = patch.lang;
    }
    entry.encryptedProfile = this.encryptPayload(profile, `user:${userId}`);
    this.persistDatabase();
    return this.toPublicUser(profile);
  }

  getUserData(userId) {
    const entry = this.index.users[userId];
    if (!entry) throw new Error("User not found");
    return this.decryptPayload(entry.encryptedData, `data:${userId}`);
  }

  saveUserData(userId, data) {
    const entry = this.index.users[userId];
    if (!entry) throw new Error("User not found");
    entry.encryptedData = this.encryptPayload(data, `data:${userId}`);
    this.persistDatabase();
  }

  deleteUser(userId) {
    const entry = this.index.users[userId];
    if (!entry) return;
    if (entry.emailHash && this.index.emailIndex[entry.emailHash]) {
      delete this.index.emailIndex[entry.emailHash];
    }
    if (entry.googleSubHash && this.index.googleIndex[entry.googleSubHash]) {
      delete this.index.googleIndex[entry.googleSubHash];
    }
    for (const [credId, uid] of Object.entries(this.index.passkeyIndex || {})) {
      if (uid === userId) {
        delete this.index.passkeyIndex[credId];
      }
    }
    for (const [tokenHash, session] of Object.entries(this.index.sessions)) {
      if (session.userId === userId) {
        delete this.index.sessions[tokenHash];
      }
    }
    delete this.index.users[userId];
    this.persistDatabase();
  }

  listUserIds() {
    return Object.keys(this.index.users);
  }
}

module.exports = {
  EncryptedDatabase,
  hashSha256,
  hashPassword,
  verifyPassword
};
