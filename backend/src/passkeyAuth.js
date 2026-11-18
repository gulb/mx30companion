const crypto = require("crypto");

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const CHALLENGES = new Map();

function pruneExpiredChallenges() {
  const now = Date.now();
  for (const [id, entry] of CHALLENGES.entries()) {
    if (entry.expiresAt <= now) {
      CHALLENGES.delete(id);
    }
  }
}

function createChallenge(meta) {
  pruneExpiredChallenges();
  const challenge = crypto.randomBytes(32).toString("base64url");
  const challengeId = crypto.randomUUID();
  CHALLENGES.set(challengeId, {
    challenge,
    ...meta,
    expiresAt: Date.now() + CHALLENGE_TTL_MS
  });
  return { challengeId, challenge };
}

function consumeChallenge(challengeId, expectedType) {
  pruneExpiredChallenges();
  const entry = CHALLENGES.get(String(challengeId || ""));
  if (!entry) {
    throw new Error("Passkey challenge expired or invalid — please retry");
  }
  if (expectedType && entry.type !== expectedType) {
    throw new Error("Passkey challenge type mismatch");
  }
  CHALLENGES.delete(challengeId);
  return entry;
}

function resolveRpIdAndOrigin(req) {
  const headerOrigin = req.headers.origin;
  const forwardedHost = req.headers["x-forwarded-host"] || req.get("host") || "localhost:3080";
  const forwardedProto = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const fallbackOrigin = `${forwardedProto}://${forwardedHost}`;
  const origin = headerOrigin || fallbackOrigin;
  let rpId = req.hostname || "localhost";
  try {
    rpId = new URL(origin).hostname;
  } catch (_err) {
    rpId = req.hostname || "localhost";
  }
  return { rpId, origin };
}

async function verifyGoogleAccountPayload(payload = {}, configuredClientId = "") {
  const idToken = String(payload.idToken || payload.credential || "").trim();
  const accessToken = String(payload.accessToken || "").trim();

  if (idToken) {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
      { signal: AbortSignal.timeout(10000) }
    );
    const data = await res.json();
    if (!res.ok || data.error_description || !data.email || !data.sub) {
      throw new Error(data.error_description || "Invalid Google ID token");
    }
    if (configuredClientId && data.aud !== configuredClientId) {
      throw new Error("Google token audience does not match GOOGLE_CLIENT_ID");
    }
    return {
      googleSub: String(data.sub),
      email: String(data.email).toLowerCase(),
      name: String(data.name || data.email.split("@")[0]),
      picture: String(data.picture || ""),
      verifiedMode: "google-oidc"
    };
  }

  if (accessToken) {
    const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10000)
    });
    const data = await res.json();
    if (!res.ok || !data.email || !data.sub) {
      throw new Error("Invalid Google OAuth access token");
    }
    return {
      googleSub: String(data.sub),
      email: String(data.email).toLowerCase(),
      name: String(data.name || data.email.split("@")[0]),
      picture: String(data.picture || ""),
      verifiedMode: "google-oauth2"
    };
  }

  throw new Error(
    configuredClientId
      ? "Google sign-in token (idToken or accessToken) is required."
      : "Google OAuth Client ID is not configured yet. Set GOOGLE_CLIENT_ID first."
  );
}

function generateRegistrationOptions(user, existingPasskeys = [], rpId = "localhost") {
  const { challengeId, challenge } = createChallenge({
    userId: user.id,
    type: "register",
    rpId
  });

  return {
    challengeId,
    publicKey: {
      challenge,
      rp: {
        name: "Mazda MX-30 Companion",
        id: rpId
      },
      user: {
        id: Buffer.from(user.id, "utf8").toString("base64url"),
        name: user.email,
        displayName: user.name || user.email
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 }
      ],
      timeout: 60000,
      attestation: "none",
      authenticatorSelection: {
        residentKey: "preferred",
        requireResidentKey: false,
        userVerification: "preferred"
      },
      excludeCredentials: existingPasskeys.map((p) => ({
        id: p.credentialId,
        type: "public-key",
        transports: p.transports || ["internal"]
      }))
    }
  };
}

function verifyRegistrationResponse(body, expectedChallenge) {
  const credentialId = String(body.id || body.rawId || "").trim();
  if (!credentialId) {
    throw new Error("Missing passkey credential id");
  }

  if (!body.clientDataJSON) {
    throw new Error("Missing WebAuthn clientDataJSON");
  }

  const clientDataBuf = Buffer.from(body.clientDataJSON, "base64url");
  let clientData;
  try {
    clientData = JSON.parse(clientDataBuf.toString("utf8"));
  } catch (_err) {
    throw new Error("Malformed WebAuthn clientDataJSON");
  }

  if (clientData.type !== "webauthn.create") {
    throw new Error("Invalid WebAuthn registration ceremony type");
  }
  if (clientData.challenge !== expectedChallenge) {
    throw new Error("Passkey registration challenge mismatch");
  }

  let publicKeyPem = "";
  if (body.publicKeySpki) {
    const spkiDer = Buffer.from(body.publicKeySpki, "base64url");
    const keyObj = crypto.createPublicKey({ key: spkiDer, format: "der", type: "spki" });
    publicKeyPem = keyObj.export({ type: "spki", format: "pem" });
  } else if (body.simulatedPasskeyPublicKeyPem) {
    const keyObj = crypto.createPublicKey(String(body.simulatedPasskeyPublicKeyPem));
    publicKeyPem = keyObj.export({ type: "spki", format: "pem" });
  } else {
    throw new Error("Missing passkey SPKI public key from authenticator");
  }

  return {
    credentialId,
    publicKeyPem,
    alg: Number(body.publicKeyAlg) || -7,
    signCount: 0,
    transports: Array.isArray(body.transports) ? body.transports : ["internal"],
    deviceName: String(body.deviceName || "Passkey").trim().slice(0, 60)
  };
}

function generateAuthenticationOptions(allowedPasskeys = [], rpId = "localhost") {
  const { challengeId, challenge } = createChallenge({
    type: "login",
    rpId
  });

  return {
    challengeId,
    publicKey: {
      challenge,
      rpId,
      timeout: 60000,
      userVerification: "preferred",
      allowCredentials: allowedPasskeys.map((p) => ({
        id: p.credentialId,
        type: "public-key",
        transports: p.transports || ["internal"]
      }))
    }
  };
}

function verifyAuthenticationResponse(body, expectedChallenge, storedPasskey) {
  if (!body.clientDataJSON || !body.authenticatorData || !body.signature) {
    throw new Error("Missing WebAuthn assertion fields");
  }

  const clientDataBuf = Buffer.from(body.clientDataJSON, "base64url");
  let clientData;
  try {
    clientData = JSON.parse(clientDataBuf.toString("utf8"));
  } catch (_err) {
    throw new Error("Malformed WebAuthn clientDataJSON");
  }

  if (clientData.type !== "webauthn.get") {
    throw new Error("Invalid WebAuthn authentication ceremony type");
  }
  if (clientData.challenge !== expectedChallenge) {
    throw new Error("Passkey login challenge mismatch");
  }

  const authDataBuf = Buffer.from(body.authenticatorData, "base64url");
  if (authDataBuf.length < 37) {
    throw new Error("Invalid authenticatorData length");
  }

  const flags = authDataBuf[32];
  const userPresent = (flags & 0x01) !== 0;
  if (!userPresent) {
    throw new Error("Authenticator did not verify user presence");
  }

  const newSignCount = authDataBuf.readUInt32BE(33);
  if (storedPasskey.signCount > 0 && newSignCount > 0 && newSignCount <= storedPasskey.signCount) {
    throw new Error("Passkey signCount did not advance — possible cloned credential");
  }

  const clientDataHash = crypto.createHash("sha256").update(clientDataBuf).digest();
  const signedPayload = Buffer.concat([authDataBuf, clientDataHash]);
  const signatureBuf = Buffer.from(body.signature, "base64url");

  const verified = crypto.verify("sha256", signedPayload, storedPasskey.publicKeyPem, signatureBuf);
  if (!verified) {
    throw new Error("Passkey cryptographic signature verification failed");
  }

  return { verified: true, newSignCount };
}

module.exports = {
  consumeChallenge,
  resolveRpIdAndOrigin,
  verifyGoogleAccountPayload,
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
};
