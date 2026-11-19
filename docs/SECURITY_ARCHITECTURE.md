# Security Architecture — Mazda MX-30 Companion

## 1. Multi-Tenant Encrypted Storage
- Each user receives a unique UUID and isolated vault in `EncryptedDatabase` (`backend/src/cryptoStore.js`).
- Payloads are encrypted at rest with **AES-256-GCM** using per-user Authenticated Associated Data (`user:<userId>` and `data:<userId>`).
- Master key is loaded from `ENCRYPTION_MASTER_KEY` or persisted with `0600` permissions inside `/app/data/.master.key`.
- VINs are redacted (`[VIN]`) in server error logs.

## 2. Authentication, Sessions & Device Control
- **Passwordless by Default:** Legacy password routes (`/api/auth/register`, `/api/auth/login`) return `410` unless explicitly enabled for local debugging (`ALLOW_PASSWORD_AUTH=true`).
- **Web Portal:** Google Identity Services (`id_token` verified against `GOOGLE_CLIENT_ID`) + **WebAuthn Passkeys** (`rpId` bound to your configured domain, 5-minute single-use challenges).
- **Android App (RFC 8252):** Launches **Chrome Custom Tabs** to `https://your-domain.example/?app_callback=mx30companion://auth`. After Google or Passkey sign-in, the backend issues a **single-use, 60-second random exchange code** (`POST /api/auth/app-code`), exchanged over HTTPS (`POST /api/auth/app-exchange`) for a device-scoped Bearer token.
- **90-Day Session Expiry & Remote Revocation:** Sessions are stored as SHA-256 hashes, expire automatically after 90 days, can be inspected (`GET /api/auth/sessions`), revoked individually (`DELETE /api/auth/sessions/:id`), or signed out across all other devices (`POST /api/auth/logout-all`).
- **Header-Only Auth on APIs:** Bearer tokens are accepted only in the `Authorization` header (query `?token=` is restricted strictly to file exports under `/api/export/`).
- **Command Confirmation & Device Audit:** Users can require confirmation before remote commands (`confirmCommands`) and see which device triggered each command in the Timeline without storing IP addresses.

## 3. Privacy & Network Security
- **Privacy Controls:** Users can pause location recording (`pauseLocation`), and weather lookups round coordinates to `~1.1 km` (2 decimal places) with zero user identity sent to Open-Meteo.
- **Headers & TLS:** `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and `app.disable("x-powered-by")`.
- **CORS & Rate Limiting:** Restricted to `ALLOWED_ORIGINS` with dedicated sliding-window IP rate limiters on `/api/auth/*` and `/api/*`.
- **Android Release Hardening:** `android:usesCleartextTraffic="false"` enforces HTTPS-only transport in APK/AAB builds.
- **12V Battery Safety:** Zero background vehicle polling; home screen widgets read cached status on periodic `onUpdate` and only wake the vehicle when the user taps Sync/Refresh.
