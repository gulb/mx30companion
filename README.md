# Mazda MX-30 Companion (Docker Backend + Native Android App)

An independent, multi-user companion ecosystem for the **Mazda MX-30 e-SKYACTIV**, built to deliver fast telemetry, 12V-battery-safe on-demand syncing, Tesla-style Precondition & Charge schedules, and native Android widgets.

> **Disclaimer:** This is an unofficial community project and is not affiliated with Mazda Motor Corporation.

---

## Key Features

- **Multi-User Encrypted Vault (`AES-256-GCM`):** Each user has isolated encrypted storage for profile, MyMazda OAuth2 tokens, Passkeys, saved places, schedules, and logs.
- **Modern Authentication:**
  - **Web Portal:** Google Sign-In (`id_token` verified) + WebAuthn Passkeys (`Touch ID` / `Face ID` / hardware keys).
  - **Android App:** RFC 8252 **Chrome Custom Tabs** + single-use 60-second code exchange (`mx30companion://auth`).
- **MyMazda OAuth2 (`MME` / `MNAO` / `MCI` / `MJO` / `MA`):** Official PKCE OAuth2 connection with `pymazda` bridge.
- **12V Battery Protection:** Zero automatic background polling — telemetry refreshes only when you explicitly tap **Sync** or send a command.
- **Tesla-Style Schedules (Precondition & Charge):**
  - Separate **Precondition** (target temp, front/rear defrost) and **Charge** (start/stop time window) automation.
  - Repeat Weekly or Single Day, location-filtered (*Home*, *Work*, *Anywhere*), with automatic **location-based Public/Bank Holiday skipping** (UK & Hungary).
- **Android App (Jetpack Compose — Apple iOS Light Bento Design):**
  - Home Screen Widget (`MX30WidgetProvider`) & Quick Settings Tile (`MX30ClimateTileService`).
  - Selectable Mazda MX-30 studio photos (**Ceramic Metallic**, **Soul Red Crystal**, **Polymetal Grey**, **Arctic White**) synced between Web and Android.
- **Bilingual (`EN` / `HU`):** Consistent single-language UI across Web and Android.

---

## Quick Start (Self-Hosted Docker)

1. **Clone & configure:**
   ```bash
   git clone https://github.com/gulb/mx30companion.git
   cd mx30companion
   cp .env.example .env
   ```
   Edit `.env` and set `GOOGLE_CLIENT_ID`, `ENCRYPTION_MASTER_KEY`, and `ALLOWED_ORIGINS` (for example `https://your-domain.example`).

2. **Start the backend:**
   ```bash
   docker compose up -d --build mx30-backend
   ```
   Open `http://localhost:3080` (or your HTTPS reverse-proxy domain).

3. **Build the Android APK / Release Bundle (no Android Studio required):**
   ```bash
   docker compose --profile build run --rm android-builder
   ```
   - Debug APK: `android-app/app/build/outputs/apk/debug/app-debug.apk`
   - Signed Release AAB (with `keystore.properties`): `docker compose --profile build run --rm android-builder gradle bundleRelease --no-daemon`

---

## Documentation & Compliance

- [Privacy Policy & GDPR Notice](docs/PRIVACY_POLICY.md)
- [Terms of Service](docs/TERMS_OF_SERVICE.md)
- [Google Play Data Safety Guide](docs/DATA_SAFETY_GOOGLE_PLAY.md)
- [Security Architecture](docs/SECURITY_ARCHITECTURE.md)
