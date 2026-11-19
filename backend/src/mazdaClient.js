const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  fetchOutdoorWeather,
  resolvePlaceName,
  buildActionItems,
  updateEnergyMetrics,
  detectTripOrCharge,
  computeStatistics,
  seedDemoLogs,
  toCsv
} = require("./features");

const DATA_DIR = process.env.DATA_DIR || "/app/data";
const MAX_HISTORY_ENTRIES = 50;
const OVERNIGHT_START_HOUR = 23;
const OVERNIGHT_END_HOUR = 5;

const MOBILE_REDIRECT_URI =
  "msauth://com.interrait.mymazda/%2FnKMu1%2BlCjy5%2Be7OF9vfp4eFBks%3D";
const OAUTH2_POLICY = "b2c_1a_signin";
const OAUTH2_HOSTS = {
  MNAO: "na.id.mazda.com",
  MCI: "na.id.mazda.com",
  MME: "eu.id.mazda.com",
  MJO: "ap.id.mazda.com",
  MA: "au.id.mazda.com"
};
const OAUTH2_AUTH = {
  MNAO: {
    tenantId: "47801034-62d1-49f6-831b-ffdcf04f13fc",
    clientId: "2daf581c-65c1-4fdb-b46a-efa98c6ba5b7",
    scopes: [
      "https://pduspb2c01.onmicrosoft.com/0728deea-be48-4382-9ef1-d4ff6d679ffa/cv",
      "openid",
      "profile",
      "offline_access"
    ],
    uiLocale: "en-US",
    country: "US",
    phoneMin: "10",
    phoneMax: "10"
  },
  MCI: {
    tenantId: "47801034-62d1-49f6-831b-ffdcf04f13fc",
    clientId: "2daf581c-65c1-4fdb-b46a-efa98c6ba5b7",
    scopes: [
      "https://pduspb2c01.onmicrosoft.com/0728deea-be48-4382-9ef1-d4ff6d679ffa/cv",
      "openid",
      "profile",
      "offline_access"
    ],
    uiLocale: "en-CA",
    country: "CA",
    phoneMin: "10",
    phoneMax: "10"
  },
  MME: {
    tenantId: "432b587f-88ad-40aa-9e5d-e6bcf9429e8d",
    clientId: "cbfe43e1-6949-42fe-996e-1a56f41a891d",
    scopes: [
      "https://pdeupb2c01.onmicrosoft.com/dcd35c5a-b32f-4add-ac6c-ba6e8bbfa11b/cv",
      "openid",
      "profile",
      "offline_access"
    ],
    uiLocale: "en-IE",
    country: "IE",
    phoneMin: "6",
    phoneMax: "15"
  },
  MJO: {
    tenantId: "87c951ae-e146-410a-aa89-0376a7f23c1b",
    clientId: "455191ae-e98e-4748-8bc6-57a5a570f1c2",
    scopes: [
      "https://pdjppb2c01.onmicrosoft.com/1c6d5f69-fea6-4019-93df-899ae820b0f4/cv",
      "openid",
      "profile",
      "offline_access"
    ],
    uiLocale: "ja-JP",
    country: "JP",
    phoneMin: "10",
    phoneMax: "11"
  },
  MA: {
    tenantId: "86d3f546-313e-4ee7-b2aa-10a60dff17ca",
    clientId: "b67a5960-6512-4221-a7ff-166e91f8a584",
    scopes: [
      "https://pdaupb2c01.onmicrosoft.com/9899c693-8a85-4d6d-82a4-edd9ba8308f7/cv",
      "openid",
      "profile",
      "offline_access"
    ],
    uiLocale: "en-AU",
    country: "AU",
    phoneMin: "9",
    phoneMax: "10"
  }
};

function buildOAuth2Url(region, endpoint) {
  const normalized = OAUTH2_AUTH[region] ? region : "MME";
  const host = OAUTH2_HOSTS[normalized];
  const { tenantId } = OAUTH2_AUTH[normalized];
  return `https://${host}/${tenantId}/${OAUTH2_POLICY}/oauth2/v2.0/${endpoint}`;
}

function decodeJwtPayload(token) {
  if (!token || typeof token !== "string") return {};
  const parts = token.split(".");
  if (parts.length < 2) return {};
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch (_err) {
    return {};
  }
}

function toBar(rawValue, fallback = 2.5) {
  if (typeof rawValue !== "number" || Number.isNaN(rawValue) || rawValue <= 0) {
    return fallback;
  }
  return rawValue > 10 ? Number((rawValue * 0.0689476).toFixed(1)) : Number(rawValue.toFixed(1));
}

function createDefaultUserData({ email = "", lang = "hu" } = {}) {
  const cleanLang = lang === "en" ? "en" : "hu";
  const envRegion = (process.env.MAZDA_REGION || "MME").trim() || "MME";
  const pollMinutes = Math.max(5, Number(process.env.POLL_INTERVAL_MINUTES) || 30);

  const places = [];

  const state = {
    lang: cleanLang,
    carColor: "ceramic_metallic",
    carColorCustom: false,
    privacy: {
      pauseLocation: false,
      confirmCommands: false
    },
    mode: "demo",
    region: envRegion,
    vehicleId: "JMZDR1WBJ00123456",
    nickname: "Mazda MX-30 e-SKYACTIV",
    lastUpdated: new Date().toISOString(),
    lastCloudSync: null,
    lastError: null,
    battery: {
      socPercent: 78,
      remainingRangeKm: 164,
      capacityKwh: 30.0,
      storedKwh: 23.4,
      chargingKw: 0,
      pluggedIn: true,
      charging: false,
      chargeTimeRemainingMin: 0,
      quickChargeTimeRemainingMin: 0,
      batteryHeaterOn: false
    },
    hvac: {
      hvacOn: false,
      interiorTempC: 14.5,
      targetTempC: 21.0,
      frontDefroster: true,
      rearDefroster: false
    },
    doors: {
      locked: true,
      driverOpen: false,
      passengerOpen: false,
      rearLeftOpen: false,
      rearRightOpen: false,
      trunkOpen: false,
      hoodOpen: false,
      fuelLidOpen: false
    },
    windows: {
      driverOpen: false,
      passengerOpen: false,
      rearLeftOpen: false,
      rearRightOpen: false
    },
    tires: {
      frontLeftBar: 2.5,
      frontRightBar: 2.5,
      rearLeftBar: 2.5,
      rearRightBar: 2.5
    },
    odometerKm: 24580,
    location: {
      latitude: 47.4979,
      longitude: 19.0402
    },
    places,
    currentPlace: "Otthon",
    weather: {
      tempC: 4.0,
      minTempC: 0.0,
      maxTempC: 7.5,
      windKmh: 9,
      weatherCode: 2,
      condition: cleanLang === "hu" ? "Részben felhős" : "Partly cloudy",
      frostWarning: true,
      heatWarning: false,
      fetchedAt: new Date().toISOString(),
      source: "initial"
    },
    schedules: [],
    trips: [],
    charges: [],
    history: [
      {
        timestamp: new Date().toISOString(),
        event: cleanLang === "hu" ? "Titkosított fiók létrehozva" : "Encrypted account created",
        source: "system"
      }
    ]
  };

  updateEnergyMetrics(state);
  state.actions = buildActionItems(state, cleanLang);
  state.stats = computeStatistics(state.trips, state.charges);

  return {
    config: {
      email,
      region: envRegion,
      mode: "auto",
      webhookUrl: "",
      pollIntervalMinutes: pollMinutes,
      vehicleId: null,
      oauthToken: null,
      deviceSessionId: null,
      pendingOAuth: null
    },
    state
  };
}

class MazdaCompanionClient {
  constructor(userId, db) {
    this.userId = userId;
    this.db = db;
    this.store = this.loadAndMigrateUserData();
    this.liveClient = null;
    this.liveClientKey = null;
    this.liveVehicle = null;
    this.syncInFlight = null;
  }

  loadAndMigrateUserData() {
    const raw = this.db.getUserData(this.userId);
    const defaults = createDefaultUserData();
    return {
      config: { ...defaults.config, ...(raw.config || {}) },
      state: {
        ...defaults.state,
        ...(raw.state || {}),
        battery: { ...defaults.state.battery, ...(raw.state?.battery || {}) },
        hvac: { ...defaults.state.hvac, ...(raw.state?.hvac || {}) },
        doors: { ...defaults.state.doors, ...(raw.state?.doors || {}) },
        windows: { ...defaults.state.windows, ...(raw.state?.windows || {}) },
        tires: { ...defaults.state.tires, ...(raw.state?.tires || {}) },
        location: { ...defaults.state.location, ...(raw.state?.location || {}) },
        weather: { ...defaults.state.weather, ...(raw.state?.weather || {}) },
        places: Array.isArray(raw.state?.places) ? raw.state.places : defaults.state.places,
        schedules: Array.isArray(raw.state?.schedules)
          ? raw.state.schedules
          : defaults.state.schedules,
        trips: Array.isArray(raw.state?.trips) ? raw.state.trips : defaults.state.trips,
        charges: Array.isArray(raw.state?.charges) ? raw.state.charges : defaults.state.charges,
        history: Array.isArray(raw.state?.history) ? raw.state.history : defaults.state.history
      }
    };
  }

  persistStore() {
    this.db.saveUserData(this.userId, this.store);
  }

  isLiveConfigured() {
    const { oauthToken, mode } = this.store.config;
    if (mode === "demo") return false;
    return Boolean(oauthToken?.refreshToken && oauthToken?.userSub);
  }

  hasWebhook() {
    const { webhookUrl, mode } = this.store.config;
    if (mode === "demo") return false;
    return Boolean(webhookUrl);
  }

  getActiveMode() {
    return this.isLiveConfigured() || this.hasWebhook() ? "live" : "demo";
  }

  recordHistory(event, source = "user", deviceName = "") {
    const entry = {
      timestamp: new Date().toISOString(),
      event,
      source
    };
    const cleanDevice = String(deviceName || "").trim().slice(0, 60);
    if (cleanDevice) {
      entry.deviceName = cleanDevice;
    }
    this.store.state.history.unshift(entry);
    if (this.store.state.history.length > MAX_HISTORY_ENTRIES) {
      this.store.state.history = this.store.state.history.slice(0, MAX_HISTORY_ENTRIES);
    }
  }

  snapshotForLogs() {
    return {
      socPercent: this.store.state.battery.socPercent,
      odometerKm: this.store.state.odometerKm,
      place: this.store.state.currentPlace,
      timestamp: new Date().toISOString()
    };
  }

  async finalizeState({ refreshWeather = false } = {}) {
    const state = this.store.state;
    const lang = state.lang === "en" ? "en" : "hu";
    state.mode = this.getActiveMode();
    state.region = this.store.config.region || "MME";
    state.privacy = {
      pauseLocation: Boolean(state.privacy?.pauseLocation),
      confirmCommands: Boolean(state.privacy?.confirmCommands)
    };
    state.capabilities = {
      remoteUnlock: state.region !== "MME",
      remoteLock: true,
      hvac: true,
      charging: true,
      sendPoi: true,
      flashLights: true
    };
    if (state.privacy.pauseLocation) {
      state.location = null;
      state.currentPlace = lang === "hu" ? "Helyrögzítés szüneteltetve" : "Location paused";
    } else {
      state.currentPlace = resolvePlaceName(
        state.location?.latitude,
        state.location?.longitude,
        state.places,
        lang
      );
    }
    updateEnergyMetrics(state);

    if (refreshWeather) {
      const weatherLat = state.location?.latitude ?? state.places?.[0]?.latitude;
      const weatherLon = state.location?.longitude ?? state.places?.[0]?.longitude;
      state.weather = await fetchOutdoorWeather(
        weatherLat,
        weatherLon,
        lang,
        state.weather
      );
    }

    state.actions = buildActionItems(state, lang);
    state.stats = computeStatistics(state.trips, state.charges);
    this.persistStore();
  }

  applySimulationTick() {
    if (this.getActiveMode() !== "demo") return;

    const { hvac, battery } = this.store.state;
    let changed = false;

    if (hvac.hvacOn) {
      const diff = hvac.targetTempC - hvac.interiorTempC;
      if (Math.abs(diff) >= 0.2) {
        const step = Math.sign(diff) * Math.min(0.4, Math.abs(diff));
        hvac.interiorTempC = Number((hvac.interiorTempC + step).toFixed(1));
        changed = true;
      }
    }

    if (battery.charging && battery.pluggedIn && battery.socPercent < 100) {
      const prev = this.snapshotForLogs();
      battery.socPercent = Math.min(100, battery.socPercent + 1);
      battery.remainingRangeKm = Math.round(battery.socPercent * 2.1);
      battery.chargeTimeRemainingMin = Math.max(0, (100 - battery.socPercent) * 4);
      detectTripOrCharge(prev, this.store.state);
      if (battery.socPercent >= 100) {
        battery.charging = false;
        this.recordHistory("Charging reached 100% and stopped", "system");
      }
      changed = true;
    }

    if (changed) {
      this.store.state.lastUpdated = new Date().toISOString();
      this.finalizeState({ refreshWeather: false });
    }
  }

  getPublicConfig() {
    const {
      email,
      region,
      mode,
      webhookUrl,
      pollIntervalMinutes,
      vehicleId,
      oauthToken,
      pendingOAuth
    } = this.store.config;
    return {
      email,
      hasOAuthToken: Boolean(oauthToken?.refreshToken && oauthToken?.userSub),
      userSub: oauthToken?.userSub || null,
      hasPendingOAuth: Boolean(pendingOAuth?.codeVerifier),
      region,
      mode,
      webhookUrl,
      activeMode: this.getActiveMode(),
      pollIntervalMinutes,
      vehicleId
    };
  }

  async updateConfig({ region, mode, webhookUrl, pollIntervalMinutes }) {
    const cfg = this.store.config;
    if (typeof region === "string" && region.trim()) cfg.region = region.trim().toUpperCase();
    if (typeof mode === "string" && ["auto", "live", "demo"].includes(mode)) cfg.mode = mode;
    if (typeof webhookUrl === "string") cfg.webhookUrl = webhookUrl.trim();
    if (pollIntervalMinutes !== undefined) {
      cfg.pollIntervalMinutes = Math.max(5, Math.min(240, Number(pollIntervalMinutes) || 30));
    }

    this.liveClient = null;
    this.liveClientKey = null;
    this.liveVehicle = null;
    this.store.state.lastError = null;
    this.recordHistory(
      `Configuration updated (mode=${this.getActiveMode()}, region=${cfg.region})`,
      "config"
    );
    await this.finalizeState({ refreshWeather: false });

    if (this.isLiveConfigured()) {
      await this.refreshFromCloud(false).catch((err) => {
        this.store.state.lastError = err.message;
        this.persistStore();
      });
    }

    return this.getStatus({ forceRefresh: false });
  }

  async setPreferences({ lang, capacityKwh, carColor, pauseLocation, confirmCommands }) {
    if (lang === "hu" || lang === "en") {
      this.store.state.lang = lang;
      this.db.updateUserProfile(this.userId, { lang });
    }
    if (capacityKwh !== undefined) {
      const cap = Number(capacityKwh);
      if (!Number.isNaN(cap) && cap >= 10 && cap <= 120) {
        this.store.state.battery.capacityKwh = Number(cap.toFixed(1));
      }
    }
    const validColors = new Set(["ceramic_metallic", "soul_red", "polymetal_grey", "arctic_white"]);
    if (validColors.has(String(carColor || "").trim())) {
      this.store.state.carColor = String(carColor).trim();
      this.store.state.carColorCustom = true;
    }
    this.store.state.privacy = {
      pauseLocation: Boolean(this.store.state.privacy?.pauseLocation),
      confirmCommands: Boolean(this.store.state.privacy?.confirmCommands)
    };
    if (typeof pauseLocation === "boolean") {
      this.store.state.privacy.pauseLocation = pauseLocation;
      if (pauseLocation) {
        this.store.state.location = null;
      }
    }
    if (typeof confirmCommands === "boolean") {
      this.store.state.privacy.confirmCommands = confirmCommands;
    }
    this.recordHistory(
      `Preferences updated (lang=${this.store.state.lang}, capacity=${this.store.state.battery.capacityKwh} kWh, color=${this.store.state.carColor || "ceramic_metallic"})`,
      "user"
    );
    await this.finalizeState({ refreshWeather: true });
    return this.getStatus({ forceRefresh: false });
  }

  startOAuthFlow(regionInput) {
    const region = OAUTH2_AUTH[String(regionInput || "").toUpperCase()]
      ? String(regionInput).toUpperCase()
      : this.store.config.region && OAUTH2_AUTH[this.store.config.region]
        ? this.store.config.region
        : "MME";

    const authCfg = OAUTH2_AUTH[region];
    const codeVerifier = crypto.randomBytes(32).toString("base64url");
    const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
    const state = crypto.randomBytes(24).toString("base64url");

    const params = new URLSearchParams({
      client_id: authCfg.clientId,
      response_type: "code",
      redirect_uri: MOBILE_REDIRECT_URI,
      code_challenge_method: "S256",
      code_challenge: codeChallenge,
      state,
      scope: authCfg.scopes.join(" "),
      ui_locales: authCfg.uiLocale,
      country: authCfg.country,
      default_international_phone_code: authCfg.country,
      email_domain_restrict: region === "MCI" ? "mci" : "none",
      international_phone_code_list: region.toLowerCase(),
      phone_number_min_length: authCfg.phoneMin,
      phone_number_max_length: authCfg.phoneMax,
      email_verify_flg: "true",
      login_user_restrict: "true",
      "x-app-name": "MyMazda",
      "x-app-ver": "10.0.1",
      "x-client-SKU": "MSAL.Android",
      "x-client-Ver": "5.4.0",
      "x-client-OS": "34",
      "x-client-DM": "Pixel 9",
      "x-client-CPU": "arm64-v8a",
      haschrome: "1",
      "return-client-request-id": "true",
      client_info: "1"
    });

    const authorizeUrl = `${buildOAuth2Url(region, "authorize")}?${params.toString()}`;
    this.store.config.region = region;
    this.store.config.pendingOAuth = {
      region,
      codeVerifier,
      state,
      authorizeUrl,
      createdAt: new Date().toISOString()
    };
    this.persistStore();

    return { authorizeUrl, state, region };
  }

  async postOAuthTokenRequest(region, formParams) {
    const tokenUrl = buildOAuth2Url(region, "token");
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(formParams).toString(),
      signal: AbortSignal.timeout(30000)
    });

    const contentType = response.headers.get("content-type") || "";
    const bodyText = await response.text();
    if (contentType.includes("text/html")) {
      throw new Error("Mazda login server returned HTML instead of JSON (transient error — retry)");
    }

    let parsed;
    try {
      parsed = JSON.parse(bodyText);
    } catch (_err) {
      throw new Error(`Unexpected response from Mazda token endpoint (HTTP ${response.status})`);
    }

    if (!response.ok || parsed.error) {
      throw new Error(parsed.error_description || parsed.error || `Token request failed (${response.status})`);
    }
    return parsed;
  }

  extractCallbackCodeAndState(rawInput) {
    const trimmed = String(rawInput || "").trim();
    if (!trimmed) {
      throw new Error("Paste the msauth:// URL from your browser console first.");
    }

    const msauthMatch = trimmed.match(/msauth:\/\/[^\s'"<>]+/i);
    if (msauthMatch) {
      const parsedUrl = new URL(msauthMatch[0]);
      const err = parsedUrl.searchParams.get("error");
      if (err) {
        throw new Error(parsedUrl.searchParams.get("error_description") || err);
      }
      const code = parsedUrl.searchParams.get("code");
      if (!code) {
        throw new Error("The pasted msauth:// URL has no authorization code.");
      }
      return { code, state: parsedUrl.searchParams.get("state") };
    }

    if (trimmed.includes("code=")) {
      const qs = new URLSearchParams(trimmed.replace(/^\?/, ""));
      const code = qs.get("code");
      if (code) return { code, state: qs.get("state") };
    }

    return { code: trimmed, state: null };
  }

  async completeOAuthFlow(callbackInput) {
    const pending = this.store.config.pendingOAuth;
    if (!pending?.codeVerifier) {
      throw new Error("No pending Mazda login session. Click 'Open Mazda Login Page' first.");
    }

    const { code, state } = this.extractCallbackCodeAndState(callbackInput);
    if (state && pending.state && state !== pending.state) {
      throw new Error("This callback URL belongs to an older login attempt. Open a fresh login link.");
    }

    const region = pending.region || this.store.config.region || "MME";
    const authCfg = OAUTH2_AUTH[region] || OAUTH2_AUTH.MME;

    const tokenResp = await this.postOAuthTokenRequest(region, {
      client_id: authCfg.clientId,
      grant_type: "authorization_code",
      code,
      redirect_uri: MOBILE_REDIRECT_URI,
      code_verifier: pending.codeVerifier,
      scope: authCfg.scopes.join(" ")
    });

    const accessToken = tokenResp.access_token;
    const refreshToken = tokenResp.refresh_token;
    if (!accessToken || !refreshToken) {
      throw new Error("Mazda did not return an access token and refresh token.");
    }

    const accessClaims = decodeJwtPayload(accessToken);
    const idClaims = decodeJwtPayload(tokenResp.id_token);
    const userSub = accessClaims.sub || idClaims.sub;
    if (!userSub) {
      throw new Error("Access token did not contain a user identity (sub claim).");
    }

    const detectedEmail =
      (Array.isArray(accessClaims.emails) && accessClaims.emails[0]) ||
      (Array.isArray(idClaims.emails) && idClaims.emails[0]) ||
      accessClaims.email ||
      idClaims.email ||
      "";
    if (detectedEmail) {
      this.store.config.email = detectedEmail;
    }

    const expiresIn = Number(tokenResp.expires_in) || 3600;
    this.store.config.region = region;
    this.store.config.mode = "auto";
    this.store.config.oauthToken = {
      accessToken,
      refreshToken,
      expiresAt: Math.floor(Date.now() / 1000) + expiresIn,
      userSub
    };
    this.store.config.deviceSessionId = null;
    this.store.config.pendingOAuth = null;

    this.liveClient = null;
    this.liveClientKey = null;
    this.liveVehicle = null;
    this.store.state.lastError = null;
    this.recordHistory(`Mazda OAuth2 connected (${region})`, "auth");
    await this.finalizeState({ refreshWeather: false });

    await this.refreshFromCloud(false).catch((err) => {
      this.store.state.lastError = err.message;
      this.persistStore();
    });

    return this.getStatus({ forceRefresh: false });
  }

  async ensureValidAccessToken() {
    const token = this.store.config.oauthToken;
    if (!token?.refreshToken || !token?.userSub) {
      throw new Error("MyMazda OAuth sign-in is required.");
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (token.accessToken && nowSec < (token.expiresAt || 0) - 120) {
      return token.accessToken;
    }

    const region = this.store.config.region || "MME";
    const authCfg = OAUTH2_AUTH[region] || OAUTH2_AUTH.MME;
    const refreshed = await this.postOAuthTokenRequest(region, {
      client_id: authCfg.clientId,
      grant_type: "refresh_token",
      refresh_token: token.refreshToken,
      scope: authCfg.scopes.join(" ")
    });

    const nextToken = {
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token || token.refreshToken,
      expiresAt: Math.floor(Date.now() / 1000) + (Number(refreshed.expires_in) || 3600),
      userSub: token.userSub
    };
    this.store.config.oauthToken = nextToken;
    this.persistStore();
    return nextToken.accessToken;
  }

  async disconnectOAuth() {
    this.store.config.oauthToken = null;
    this.store.config.deviceSessionId = null;
    this.store.config.pendingOAuth = null;
    this.liveClient = null;
    this.liveClientKey = null;
    this.liveVehicle = null;
    this.store.state.lastError = null;
    this.recordHistory("Disconnected Mazda OAuth2 session", "auth");
    await this.finalizeState({ refreshWeather: false });
    return this.getStatus({ forceRefresh: false });
  }

  loadLiveClientConstructor() {
    const customClientPath = path.join(DATA_DIR, "mymazda-client.js");
    const pkg = fs.existsSync(customClientPath)
      ? require(customClientPath)
      : require("./pymazdaClient");

    const MyMazdaClient = pkg.default || pkg.MyMazdaClient || pkg.PyMazdaClient || pkg;
    if (typeof MyMazdaClient !== "function") {
      throw new Error("Unsupported MyMazda client export shape");
    }
    return MyMazdaClient;
  }

  async ensureLiveClient({ resolveVehicle = true } = {}) {
    if (!this.isLiveConfigured()) {
      throw new Error("MyMazda OAuth sign-in is not configured");
    }

    const accessToken = await this.ensureValidAccessToken();
    const { userSub } = this.store.config.oauthToken;
    const region = this.store.config.region || "MME";
    const key = `${userSub}:${region}`;

    if (this.liveClient && this.liveClientKey === key) {
      if (typeof this.liveClient.setAccessToken === "function") {
        this.liveClient.setAccessToken(accessToken);
      }
      if (!resolveVehicle || this.liveVehicle) {
        return { client: this.liveClient, vehicle: this.liveVehicle };
      }
    }

    const MyMazdaClient = this.loadLiveClientConstructor();
    const client =
      this.liveClient && this.liveClientKey === key
        ? this.liveClient
        : new MyMazdaClient({
            userSub,
            accessToken,
            sessionId: this.store.config.deviceSessionId || null,
            region,
            onSessionId: (sid) => {
              this.store.config.deviceSessionId = sid;
              this.persistStore();
            }
          });

    this.liveClient = client;
    this.liveClientKey = key;

    if (!resolveVehicle) {
      return { client, vehicle: this.liveVehicle };
    }

    const vehicles = await client.getVehicles();
    if (!Array.isArray(vehicles) || vehicles.length === 0) {
      throw new Error("No vehicles found in this MyMazda account");
    }

    const vehicle =
      vehicles.find((v) => v.id === this.store.config.vehicleId) ||
      vehicles.find((v) => v.isElectric) ||
      vehicles[0];

    this.liveVehicle = vehicle;
    this.store.config.vehicleId = vehicle.id;

    return { client, vehicle };
  }

  async invokeFirstAvailable(client, methodNames, ...args) {
    for (const name of methodNames) {
      if (typeof client[name] === "function") {
        return client[name](...args);
      }
    }
    throw new Error(`None of [${methodNames.join(", ")}] are supported by client`);
  }

  shouldAutoPollCloud() {
    // Automatic periodic polling is disabled to protect the MX-30 12V battery.
    // Cloud sync runs only when the user opens the app/web view or clicks Sync.
    return false;
  }

  async refreshFromCloud(forceRefresh = false) {
    if (!this.isLiveConfigured()) {
      this.store.state.lastUpdated = new Date().toISOString();
      await this.finalizeState({ refreshWeather: true });
      return this.store.state;
    }

    if (this.syncInFlight) {
      return this.syncInFlight;
    }

    this.syncInFlight = (async () => {
      try {
        const prevSnapshot = this.snapshotForLogs();
        const { client } = await this.ensureLiveClient({ resolveVehicle: false });
        let vehicle;
        let baseStatus;
        let evStatus;
        let hvacSetting;

        if (typeof client.syncAll === "function") {
          const synced = await client.syncAll(this.store.config.vehicleId, forceRefresh);
          vehicle = synced.vehicle;
          baseStatus = synced.baseStatus;
          evStatus = synced.evStatus;
          hvacSetting = synced.hvacSetting;
          this.liveVehicle = vehicle;
          this.store.config.vehicleId = vehicle.id;
        } else {
          const resolved = await this.ensureLiveClient({ resolveVehicle: true });
          vehicle = resolved.vehicle;
          const vehicleId = vehicle.id;
          if (forceRefresh && typeof client.refreshVehicleStatus === "function") {
            await client.refreshVehicleStatus(vehicleId).catch(() => {});
          }
          [baseStatus, evStatus, hvacSetting] = await Promise.all([
            client.getVehicleStatus(vehicleId).catch(() => null),
            (vehicle.isElectric || vehicle.isPHEV) && typeof client.getEVVehicleStatus === "function"
              ? client.getEVVehicleStatus(vehicleId).catch(() => null)
              : Promise.resolve(null),
            typeof client.getHVACSetting === "function"
              ? client.getHVACSetting(vehicleId).catch(() => null)
              : Promise.resolve(null)
          ]);
        }

        const state = this.store.state;
        const wasLiveSynced = Boolean(state.lastCloudSync && state.mode === "live");
        state.mode = "live";
        state.region = this.store.config.region;
        state.vehicleId = String(vehicle.vin || vehicle.id || state.vehicleId);
        state.nickname = vehicle.nickname || vehicle.modelName || "Mazda MX-30 e-SKYACTIV";
        if (!state.carColorCustom && vehicle.exteriorColorCode) {
          const colorMap = {
            "47A": "ceramic_metallic",
            "46V": "soul_red",
            "47C": "polymetal_grey",
            "A4D": "arctic_white"
          };
          const detectedColor = colorMap[String(vehicle.exteriorColorCode).trim().toUpperCase()];
          if (detectedColor) {
            state.carColor = detectedColor;
          }
        }

        if (baseStatus) {
          const doors = baseStatus.doors || {};
          const locks = baseStatus.doorLocks || {};
          const wins = baseStatus.windows || {};
          const tires = baseStatus.tirePressure || {};
          const loc = baseStatus.latitude !== undefined ? baseStatus : baseStatus.location || {};

          state.doors = {
            locked:
              typeof locks.driverDoorUnlocked === "boolean"
                ? !locks.driverDoorUnlocked && !locks.passengerDoorUnlocked
                : state.doors.locked,
            driverOpen: Boolean(doors.driverDoorOpen),
            passengerOpen: Boolean(doors.passengerDoorOpen),
            rearLeftOpen: Boolean(doors.rearLeftDoorOpen),
            rearRightOpen: Boolean(doors.rearRightDoorOpen),
            trunkOpen: Boolean(doors.trunkOpen),
            hoodOpen: Boolean(doors.hoodOpen),
            fuelLidOpen: Boolean(doors.fuelLidOpen)
          };

          state.windows = {
            driverOpen: Boolean(wins.driverWindowOpen),
            passengerOpen: Boolean(wins.passengerWindowOpen),
            rearLeftOpen: Boolean(wins.rearLeftWindowOpen),
            rearRightOpen: Boolean(wins.rearRightWindowOpen)
          };

          state.tires = {
            frontLeftBar: toBar(tires.frontLeftTirePressurePsi, state.tires.frontLeftBar),
            frontRightBar: toBar(tires.frontRightTirePressurePsi, state.tires.frontRightBar),
            rearLeftBar: toBar(tires.rearLeftTirePressurePsi, state.tires.rearLeftBar),
            rearRightBar: toBar(tires.rearRightTirePressurePsi, state.tires.rearRightBar)
          };

          if (typeof baseStatus.odometerKm === "number") {
            state.odometerKm = Math.round(baseStatus.odometerKm);
          }
          if (state.privacy?.pauseLocation) {
            state.location = null;
          } else if (typeof loc.latitude === "number" && typeof loc.longitude === "number") {
            state.location = { latitude: loc.latitude, longitude: loc.longitude };
          }
        }

        if (evStatus) {
          const charge = evStatus.chargeInfo || evStatus;
          const hvac = evStatus.hvacInfo || {};

          if (typeof charge.batteryLevelPercentage === "number") {
            state.battery.socPercent = Math.round(charge.batteryLevelPercentage);
          }
          if (typeof charge.drivingRangeKm === "number") {
            state.battery.remainingRangeKm = Math.round(charge.drivingRangeKm);
          }
          if (typeof charge.pluggedIn === "boolean") {
            state.battery.pluggedIn = charge.pluggedIn;
          }
          if (typeof charge.charging === "boolean") {
            state.battery.charging = charge.charging;
          }
          if (typeof charge.basicChargeTimeMinutes === "number") {
            state.battery.chargeTimeRemainingMin = charge.basicChargeTimeMinutes;
          }
          if (typeof charge.quickChargeTimeMinutes === "number") {
            state.battery.quickChargeTimeRemainingMin = charge.quickChargeTimeMinutes;
          }
          if (typeof charge.batteryHeaterOn === "boolean") {
            state.battery.batteryHeaterOn = charge.batteryHeaterOn;
          }

          if (typeof hvac.hvacOn === "boolean") {
            state.hvac.hvacOn = hvac.hvacOn;
          }
          if (typeof hvac.interiorTemperatureCelsius === "number") {
            state.hvac.interiorTempC = Number(hvac.interiorTemperatureCelsius.toFixed(1));
          }
          if (typeof hvac.frontDefroster === "boolean") {
            state.hvac.frontDefroster = hvac.frontDefroster;
          }
          if (typeof hvac.rearDefroster === "boolean") {
            state.hvac.rearDefroster = hvac.rearDefroster;
          }
        }

        if (hvacSetting) {
          if (typeof hvacSetting.temperature === "number") {
            state.hvac.targetTempC =
              hvacSetting.temperatureUnit === "F"
                ? Number((((hvacSetting.temperature - 32) * 5) / 9).toFixed(1))
                : Number(hvacSetting.temperature.toFixed(1));
          }
          if (typeof hvacSetting.frontDefroster === "boolean") {
            state.hvac.frontDefroster = hvacSetting.frontDefroster;
          }
          if (typeof hvacSetting.rearDefroster === "boolean") {
            state.hvac.rearDefroster = hvacSetting.rearDefroster;
          }
        }

        const now = new Date().toISOString();
        state.lastUpdated = now;
        state.lastCloudSync = now;
        state.lastError = null;
        if (state.privacy?.pauseLocation) {
          state.location = null;
          state.currentPlace = state.lang === "hu" ? "Helyrögzítés szüneteltetve" : "Location paused";
        } else {
          state.currentPlace = resolvePlaceName(
            state.location?.latitude,
            state.location?.longitude,
            state.places,
            state.lang
          );
        }
        if (wasLiveSynced) {
          detectTripOrCharge(prevSnapshot, state);
        }
        this.recordHistory("Synced telemetry from Mazda Connected Services", "cloud");
        await this.finalizeState({ refreshWeather: true });
        return state;
      } catch (err) {
        this.store.state.lastError = err.message;
        this.recordHistory(`Cloud sync error: ${err.message}`, "error");
        this.persistStore();
        throw err;
      } finally {
        this.syncInFlight = null;
      }
    })();

    return this.syncInFlight;
  }

  stripDemoLogs() {
    const state = this.store.state;
    const isDemoSeedId = (id) => /^(trip|chg|charge)-demo-/i.test(String(id || ""));
    const isBogusInitialJumpTrip = (t) => Number(t.distanceKm) > 1000;
    const origTrips = state.trips?.length || 0;
    const origCharges = state.charges?.length || 0;
    state.trips = (state.trips || []).filter((t) => !isDemoSeedId(t.id) && !isBogusInitialJumpTrip(t));
    state.charges = (state.charges || []).filter((c) => !isDemoSeedId(c.id));
    if (state.trips.length !== origTrips || state.charges.length !== origCharges) {
      state.stats = computeStatistics(state.trips, state.charges);
      this.persistStore();
    }
  }

  async getStatus({ forceRefresh = false } = {}) {
    this.stripDemoLogs();
    if (this.isLiveConfigured() && (forceRefresh || this.shouldAutoPollCloud())) {
      try {
        await this.refreshFromCloud(forceRefresh);
      } catch (err) {
        console.warn("Returning cached state after cloud refresh error:", err.message);
      }
    } else if (forceRefresh) {
      if (this.hasWebhook()) {
        await this.sendWebhook("refresh", {}).catch((err) => {
          this.store.state.lastError = err.message;
        });
      }
      this.store.state.lastUpdated = new Date().toISOString();
      this.recordHistory("Manual status refresh", "user");
      await this.finalizeState({ refreshWeather: true });
    } else {
      const weatherAge = Date.now() - new Date(this.store.state.weather?.fetchedAt || 0).getTime();
      await this.finalizeState({ refreshWeather: weatherAge > 15 * 60 * 1000 });
    }

    return {
      ...this.store.state,
      config: this.getPublicConfig()
    };
  }

  async sendWebhook(action, params = {}) {
    const webhookUrl = this.store.config.webhookUrl;
    if (!webhookUrl) return;

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        params,
        vehicleId: this.store.state.vehicleId,
        timestamp: new Date().toISOString()
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      throw new Error(`Webhook ${action} failed with HTTP ${response.status}`);
    }
  }

  async dispatchRemoteCommand(action, params, methodNames, buildLiveArgs) {
    if (this.hasWebhook()) {
      await this.sendWebhook(action, params);
    }

    if (this.isLiveConfigured()) {
      const { client, vehicle } = await this.ensureLiveClient();
      await this.invokeFirstAvailable(client, methodNames, ...buildLiveArgs(vehicle));
    }
  }

  async ingestTelemetry(payload, source = "telemetry") {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("Telemetry payload must be a JSON object");
    }

    const prevSnapshot = this.snapshotForLogs();
    const state = this.store.state;
    const sections = ["battery", "hvac", "doors", "windows", "tires", "location"];
    for (const key of sections) {
      if (payload[key] && typeof payload[key] === "object" && !Array.isArray(payload[key])) {
        state[key] = { ...state[key], ...payload[key] };
      }
    }

    if (typeof payload.odometerKm === "number" && !Number.isNaN(payload.odometerKm)) {
      state.odometerKm = Math.round(payload.odometerKm);
    }
    if (typeof payload.nickname === "string" && payload.nickname.trim()) {
      state.nickname = payload.nickname.trim();
    }
    if (typeof payload.vehicleId === "string" && payload.vehicleId.trim()) {
      state.vehicleId = payload.vehicleId.trim();
    }

    const now = new Date().toISOString();
    state.lastUpdated = now;
    state.lastCloudSync = now;
    state.lastError = null;
    state.currentPlace = resolvePlaceName(
      state.location?.latitude,
      state.location?.longitude,
      state.places,
      state.lang
    );
    detectTripOrCharge(prevSnapshot, state);
    this.recordHistory(`Telemetry ingested from ${source}`, source);
    await this.finalizeState({ refreshWeather: true });

    return this.getStatus({ forceRefresh: false });
  }

  async setHvacSettings({ targetTempC, frontDefroster, rearDefroster }, source = "user", deviceName = "") {
    const hvac = this.store.state.hvac;
    if (typeof targetTempC === "number" && !Number.isNaN(targetTempC)) {
      hvac.targetTempC = Math.max(15, Math.min(29, Number(targetTempC.toFixed(1))));
    }
    if (typeof frontDefroster === "boolean") hvac.frontDefroster = frontDefroster;
    if (typeof rearDefroster === "boolean") hvac.rearDefroster = rearDefroster;

    await this.dispatchRemoteCommand(
      "setHvacSettings",
      {
        targetTempC: hvac.targetTempC,
        frontDefroster: hvac.frontDefroster,
        rearDefroster: hvac.rearDefroster
      },
      ["setHVACSetting", "setHvacSetting"],
      (vehicle) => [vehicle.id, hvac.targetTempC, "C", hvac.frontDefroster, hvac.rearDefroster]
    );

    this.store.state.lastUpdated = new Date().toISOString();
    this.recordHistory(
      `HVAC target set to ${hvac.targetTempC}°C (frontDefrost=${hvac.frontDefroster}, rearDefrost=${hvac.rearDefroster})`,
      source,
      deviceName
    );
    await this.finalizeState({ refreshWeather: false });
    return this.getStatus();
  }

  async setHvacPower(turnOn, options = {}, source = "user", deviceName = "") {
    if (
      options.targetTempC !== undefined ||
      options.frontDefroster !== undefined ||
      options.rearDefroster !== undefined
    ) {
      await this.setHvacSettings(options, source, deviceName);
    }

    await this.dispatchRemoteCommand(
      turnOn ? "turnOnHvac" : "turnOffHvac",
      {
        hvacOn: Boolean(turnOn),
        targetTempC: this.store.state.hvac.targetTempC,
        frontDefroster: this.store.state.hvac.frontDefroster,
        rearDefroster: this.store.state.hvac.rearDefroster
      },
      turnOn ? ["turnOnHVAC", "turnOnHvac"] : ["turnOffHVAC", "turnOffHvac"],
      (vehicle) => [vehicle.id]
    );

    this.store.state.hvac.hvacOn = Boolean(turnOn);
    this.store.state.lastUpdated = new Date().toISOString();
    this.recordHistory(
      turnOn
        ? `Climate ON (target ${this.store.state.hvac.targetTempC}°C)`
        : "Climate OFF",
      source,
      deviceName
    );
    await this.finalizeState({ refreshWeather: false });
    return this.getStatus();
  }

  async toggleHvac(source = "user", deviceName = "") {
    return this.setHvacPower(!this.store.state.hvac.hvacOn, {}, source, deviceName);
  }

  async setCharging(start, source = "user", deviceName = "") {
    const battery = this.store.state.battery;
    if (start && !battery.pluggedIn && this.getActiveMode() === "demo") {
      throw new Error("Cannot start charging while MX-30 is unplugged");
    }

    await this.dispatchRemoteCommand(
      start ? "startCharging" : "stopCharging",
      { charging: Boolean(start) },
      start ? ["startCharging", "chargeStart"] : ["stopCharging", "chargeStop"],
      (vehicle) => [vehicle.id]
    );

    battery.charging = Boolean(start);
    battery.chargeTimeRemainingMin = start ? Math.max(0, (100 - battery.socPercent) * 4) : 0;
    this.store.state.lastUpdated = new Date().toISOString();
    this.recordHistory(start ? "EV charging started" : "EV charging stopped", source, deviceName);
    await this.finalizeState({ refreshWeather: false });
    return this.getStatus();
  }

  async setDoorsLocked(lock, source = "user", deviceName = "") {
    const region = this.store.config.region || "MME";
    const isHu = this.store.state.lang !== "en";
    if (!lock && this.getActiveMode() === "live" && region === "MME") {
      const err = new Error(
        isHu
          ? "A távoli ajtónyitást a Mazda Europe (MME) letiltja az EU/UK MX-30 modelleken — csak a távoli zárás támogatott."
          : "Remote door unlock is disabled by Mazda Europe (MME) for UK/EU MX-30 vehicles — only Remote Lock is supported."
      );
      err.statusCode = 400;
      throw err;
    }

    try {
      await this.dispatchRemoteCommand(
        lock ? "lockDoors" : "unlockDoors",
        { locked: Boolean(lock) },
        lock ? ["lockDoors"] : ["unlockDoors"],
        (vehicle) => [vehicle.id]
      );
    } catch (err) {
      if (!lock) {
        const msg = isHu
          ? `A Mazda szerver elutasította a távoli nyitást (${err.message}). EU/UK modelleken gyakran csak a zárás engedélyezett.`
          : `Mazda server rejected remote unlock (${err.message}). On EU/UK vehicles only Remote Lock may be permitted.`;
        const wrapped = new Error(msg);
        wrapped.statusCode = 400;
        throw wrapped;
      }
      throw err;
    }

    this.store.state.doors.locked = Boolean(lock);
    this.store.state.lastUpdated = new Date().toISOString();
    this.recordHistory(lock ? "Doors locked" : "Doors unlocked", source, deviceName);
    await this.finalizeState({ refreshWeather: false });
    return this.getStatus();
  }

  async flashHazardLights(source = "user", deviceName = "") {
    await this.dispatchRemoteCommand(
      "flashHazardLights",
      {},
      ["turnOnHazardLights"],
      (vehicle) => [vehicle.id]
    );

    this.store.state.lastUpdated = new Date().toISOString();
    this.recordHistory("Hazard lights flashed", source, deviceName);
    await this.finalizeState({ refreshWeather: false });
    return this.getStatus();
  }

  async sendPoi({ latitude, longitude, name }, deviceName = "") {
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (Number.isNaN(lat) || Number.isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      throw new Error("Valid latitude and longitude are required");
    }
    const cleanName = String(name || "Destination").trim().slice(0, 60);

    await this.dispatchRemoteCommand(
      "sendPoi",
      { latitude: lat, longitude: lon, name: cleanName },
      ["sendPoi", "sendPOI"],
      (vehicle) => [vehicle.id, lat, lon, cleanName]
    );

    this.recordHistory(
      `Sent POI "${cleanName}" (${lat.toFixed(4)}, ${lon.toFixed(4)}) to car nav`,
      "user",
      deviceName
    );
    await this.finalizeState({ refreshWeather: false });
    return this.getStatus();
  }

  async savePlaces(places) {
    if (!Array.isArray(places)) {
      throw new Error("Places must be an array");
    }
    this.store.state.places = places.slice(0, 20).map((p, idx) => ({
      id: String(p.id || `place-${Date.now()}-${idx}`),
      name: String(p.name || "Saved Place").trim().slice(0, 40),
      latitude: Number(p.latitude) || 47.4979,
      longitude: Number(p.longitude) || 19.0402,
      radiusMeters: Math.max(30, Math.min(5000, Number(p.radiusMeters) || 150))
    }));
    this.recordHistory(`Updated ${this.store.state.places.length} saved place(s)`, "user");
    await this.finalizeState({ refreshWeather: false });
    return this.getStatus();
  }

  getSchedules() {
    return this.store.state.schedules;
  }

  async saveSchedules(schedules) {
    if (!Array.isArray(schedules)) {
      throw new Error("Schedules must be an array");
    }
    this.store.state.schedules = schedules.map((item, idx) => {
      const type = item.type === "charge" ? "charge" : "preheat";
      const endTime = /^\d{2}:\d{2}$/.test(String(item.endTime || "")) ? item.endTime : "";
      return {
        id: String(item.id || `schedule-${Date.now()}-${idx}`),
        type,
        name: String(item.name || (type === "charge" ? "Charge Schedule" : "Pre-Heat")).slice(0, 60),
        time: /^\d{2}:\d{2}$/.test(String(item.time || "")) ? item.time : "07:30",
        endTime,
        repeatWeekly: item.repeatWeekly !== false,
        days: Array.isArray(item.days)
          ? item.days.map(Number).filter((d) => d >= 0 && d <= 6)
          : [1, 2, 3, 4, 5],
        locationId: String(item.locationId || "").slice(0, 40),
        locationName: String(item.locationName || "").slice(0, 40),
        enabled: Boolean(item.enabled),
        targetTempC: Math.max(15, Math.min(29, Number(item.targetTempC) || 21)),
        frontDefroster: item.frontDefroster !== false,
        rearDefroster: Boolean(item.rearDefroster),
        targetSocPercent: Math.max(50, Math.min(100, Number(item.targetSocPercent) || 80)),
        requirePluggedIn: Boolean(item.requirePluggedIn),
        skipHolidays: item.skipHolidays !== false,
        weatherAware: item.weatherAware !== false,
        skipNext: Boolean(item.skipNext),
        lastTriggeredDate: item.lastTriggeredDate || null,
        lastStopTriggeredDate: item.lastStopTriggeredDate || null
      };
    });

    this.recordHistory(`Updated ${this.store.state.schedules.length} schedule(s)`, "user");
    await this.finalizeState({ refreshWeather: false });
    return this.store.state.schedules;
  }

  async toggleSkipNextSchedule(scheduleId) {
    const target = this.store.state.schedules.find((s) => s.id === scheduleId);
    if (!target) {
      throw new Error("Schedule not found");
    }
    target.skipNext = !target.skipNext;
    this.recordHistory(
      target.skipNext
        ? `Skip-next enabled for "${target.name}"`
        : `Skip-next cleared for "${target.name}"`,
      "user"
    );
    await this.finalizeState({ refreshWeather: false });
    return this.getStatus();
  }

  async simulateTripOrCharge(type) {
    const prev = this.snapshotForLogs();
    const state = this.store.state;

    if (type === "charge") {
      state.battery.pluggedIn = true;
      const beforeSoc = state.battery.socPercent;
      const nextSoc = Math.min(100, beforeSoc < 88 ? beforeSoc + 10 : 95);
      if (nextSoc <= beforeSoc) {
        state.battery.socPercent = 65;
        prev.socPercent = 52;
      } else {
        state.battery.socPercent = nextSoc;
      }
      state.battery.remainingRangeKm = Math.round(state.battery.socPercent * 2.1);
      state.battery.chargingKw = 6.6;
      detectTripOrCharge(prev, state);
      state.battery.charging = false;
      this.recordHistory("Simulated EV charge session logged", "demo");
    } else {
      const destinations = state.places.length > 0 ? state.places : [{ name: "Belváros", latitude: 47.4925, longitude: 19.0513 }];
      const nextPlace = destinations.find((p) => p.name !== state.currentPlace) || destinations[0];
      state.location = { latitude: nextPlace.latitude, longitude: nextPlace.longitude };
      state.currentPlace = nextPlace.name;
      state.odometerKm += 16;
      state.battery.socPercent = Math.max(15, state.battery.socPercent - 8);
      state.battery.remainingRangeKm = Math.round(state.battery.socPercent * 2.1);
      detectTripOrCharge(prev, state);
      this.recordHistory(`Simulated trip to ${nextPlace.name} (+16 km)`, "demo");
    }

    state.lastUpdated = new Date().toISOString();
    await this.finalizeState({ refreshWeather: true });
    return this.getStatus();
  }

  exportCsv(type) {
    if (type === "charges") {
      return toCsv(this.store.state.charges || [], [
        { key: "timestamp", label: "Timestamp" },
        { key: "place", label: "Location" },
        { key: "startSoc", label: "Start SoC (%)" },
        { key: "endSoc", label: "End SoC (%)" },
        { key: "kwhAdded", label: "Energy Added (kWh)" },
        { key: "durationMin", label: "Duration (min)" },
        { key: "avgKw", label: "Power (kW)" }
      ]);
    }
    return toCsv(this.store.state.trips || [], [
      { key: "startTime", label: "Start" },
      { key: "endTime", label: "End" },
      { key: "fromPlace", label: "From" },
      { key: "toPlace", label: "To" },
      { key: "distanceKm", label: "Distance (km)" },
      { key: "socUsedPercent", label: "Battery Used (%)" },
      { key: "kwhUsed", label: "Energy Used (kWh)" },
      { key: "efficiencyKwhPer100Km", label: "Efficiency (kWh/100km)" }
    ]);
  }
}

class MazdaCompanionManager {
  constructor(db) {
    this.db = db;
    this.clients = new Map();
  }

  getClient(userId) {
    if (!this.clients.has(userId)) {
      this.clients.set(userId, new MazdaCompanionClient(userId, this.db));
    }
    return this.clients.get(userId);
  }

  createUser({ email, password, name, lang }) {
    const initialData = createDefaultUserData({ email, lang });
    const user = this.db.createUser({ email, password, name, lang }, initialData);
    return user;
  }

  findOrCreateGoogleUser({ googleSub, email, name, picture, lang }) {
    return this.db.findOrCreateGoogleUser(
      { googleSub, email, name, picture, lang },
      (opts) => createDefaultUserData(opts)
    );
  }

  deleteUser(userId) {
    this.clients.delete(userId);
    this.db.deleteUser(userId);
  }

  forEachClient(callback) {
    const userIds = this.db.listUserIds();
    return Promise.all(userIds.map((uid) => callback(this.getClient(uid))));
  }
}

module.exports = {
  MazdaCompanionClient,
  MazdaCompanionManager,
  createDefaultUserData
};
