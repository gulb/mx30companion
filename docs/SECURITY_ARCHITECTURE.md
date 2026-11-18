# Security Architecture — Mazda MX-30 Companion

## 1. Multi-Tenant Encrypted Storage
- Each user receives a unique UUID and isolated vault in `EncryptedDatabase` (`backend/src/cryptoStore.js`).
- Payloads are encrypted at rest with **AES-256-GCM** using per-user Authenticated Associated Data (`user:<userId>` and `data:<userId>`).
- Master key is loaded from `ENCRYPTION_MASTER_KEY` or persisted with `0600` permissions inside `/app/data/.master.key`.

## 2. Authentication (Zero Unverified Logins)
- **Web Portal:** Google Identity Services (`id_token` verified against `GOOGLE_CLIENT_ID`) + **WebAuthn Passkeys** (`rpId` bound to your configured domain).
- **Android App (RFC 8252):** Launches **Chrome Custom Tabs** to `https://your-domain.example/?app_callback=mx30companion://auth`. After Google or Passkey sign-in, the backend issues a **single-use, 60-second random exchange code** (`POST /api/auth/app-code`), which the Android app exchanges over HTTPS (`POST /api/auth/app-exchange`) for a device-scoped Bearer token. Raw session tokens never appear in deep-link URIs.

## 3. Network & Transport Security
- **Cloudflare Tunnel + Caddy** terminates public HTTPS/TLS and forwards to `mx30_backend_service:3080` with strict security headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`).
- **CORS:** Restricted to `ALLOWED_ORIGINS` (`https://your-domain.example`).
- **Rate Limiting:** Dedicated IP rate limiters on `/api/auth/*` and `/api/*`.
- **Android Network Security:** `android:usesCleartextTraffic="false"` enforces HTTPS-only traffic in release builds.
