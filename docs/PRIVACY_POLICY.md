# Privacy Policy & GDPR Notice — Mazda MX-30 Companion

**Effective Date:** November 18, 2026  
**Service URL:** https://your-domain.example  
**Repository:** https://github.com/gulb/mx30companion  

---

## 1. Overview
Mazda MX-30 Companion ("the App" and "Web Portal") is an unofficial companion application for Mazda MX-30 owners. We are committed to protecting your privacy in accordance with the UK GDPR and EU GDPR.

## 2. Data We Collect & Process
We process only the minimum data strictly required to provide vehicle telemetry, remote controls, and scheduling:

1. **Account & Authentication Data**
   - Email address, display name, and Google Subject ID (`sub`) from Google Sign-In.
   - WebAuthn Passkey public keys and credential IDs for passwordless authentication.
   - Active session tokens and device names (for session management and remote logout).

2. **Vehicle & Telemetry Data (MyMazda Connected Services)**
   - MyMazda OAuth2 access and refresh tokens (used solely to communicate with Mazda's official API on your behalf).
   - Vehicle identifier (VIN / vehicle ID), battery state of charge (SoC), range, charging state, odometer, door/window/trunk/hood lock status, tire pressures, and climate/HVAC state.
   - Recorded real trip summaries and charging sessions (computed from telemetry changes).

3. **Location & Automation Data**
   - Vehicle GPS coordinates (used to display parked location on the map, fetch local outdoor weather, determine regional public/bank holidays such as UK or Hungary, and match user-defined geofenced places such as *Home* or *Work*).
   - User-configured Precondition and Charging schedules.

## 3. Legal Basis for Processing (GDPR Art. 6)
- **Performance of a Service / User Consent (Art. 6(1)(a) & (b)):** All vehicle telemetry, OAuth connection, geofencing, and schedule automation are enabled explicitly by you.

## 4. Storage, Encryption & Security
- **Encryption at Rest:** All user profiles, vehicle telemetry, OAuth tokens, saved places, and schedules are stored in an isolated per-user vault encrypted with **AES-256-GCM** using authenticated encryption (`user:<id>` and `data:<id>` AAD).
- **Encryption in Transit:** All communication between the Android App, Web Portal, and backend uses **HTTPS / TLS** via Cloudflare & Caddy.
- **No Ads or Trackers:** The App and Web Portal contain **zero** third-party advertising SDKs, analytics trackers, or behavioral profiling.
- **12V Battery Protection:** No background periodic vehicle wake-up polling is performed; telemetry refreshes occur only when you manually tap Sync or send a command.

## 5. Data Retention & Your GDPR Rights
Under GDPR, you have the right to:
- **Access & Portability (Art. 15 & 20):** Export your trips, charges, and full account data in **CSV** or **JSON** format directly from the Web Portal.
- **Erasure / "Right to be Forgotten" (Art. 17):** Permanently delete your account, OAuth tokens, Passkeys, and all encrypted data at any time using the **Delete Account** button in the Web Portal. Deletion is immediate and irreversible.
- **Disconnect Anytime:** You can revoke MyMazda access via **Disconnect** without deleting your account.

## 6. Contact
For privacy or GDPR inquiries, please open an issue on the [GitHub repository](https://github.com/gulb/mx30companion) or contact your server administrator.
