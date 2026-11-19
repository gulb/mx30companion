# Privacy Policy & GDPR Notice — Mazda MX-30 Companion

**Effective Date:** November 19, 2026  
**Service URL:** https://your-domain.example  
**Support & GDPR Contact:** `mx30Support@gmail.com`  
**Repository:** https://github.com/gulb/mx30companion  

> **Unofficial Companion App:** Mazda MX-30 Companion is an independent, unofficial companion project. It is not affiliated with, endorsed by, or supported by Mazda Motor Corporation or Mazda Motor Europe.

---

## 1. Data We Collect, Purpose & Legal Basis (GDPR)

| Data Category | Purpose | Legal Basis |
| --- | --- | --- |
| **Account Identity (Google Sign-In & Passkeys):** Email address, display name, Google Subject ID (`sub`), WebAuthn Passkey public keys & credential IDs. | Create and secure your isolated account without storing passwords. | Contract — Art. 6(1)(b) |
| **MyMazda Connection:** Official OAuth2 access & refresh tokens (stored encrypted with AES-256-GCM). Your MyMazda password is **never** seen or stored. | Read vehicle telemetry and execute remote commands / schedules on your behalf. | Contract — Art. 6(1)(b) |
| **Vehicle & Location Telemetry:** SoC %, range, charging state, odometer, HVAC, locks/doors/windows, tire pressures, GPS position, saved places, Precondition/Charge schedules, trip/charge logs. | Live status, Android widgets, Quick Settings tile, local weather, UK/HU public holiday detection, and schedules. | Contract — Art. 6(1)(b) |
| **Signed-In Devices & Command Audit Log:** Session token SHA-256 hashes, device name, timestamps, and device attribution in the Timeline (no IP addresses persisted). | Account security — inspect active devices, audit commands, and remotely revoke lost devices. | Legitimate interest — Art. 6(1)(f) |
| **Server Error Logs:** Masked diagnostic error messages (17-character VINs redacted). | Troubleshooting and service reliability. | Legitimate interest — Art. 6(1)(f) |

- **Zero Ads or Trackers:** No advertising SDKs, analytics, or user profiling.
- **Pause Location Recording:** Can be toggled on/off anytime; when paused, GPS coordinates and trip place labels are not stored.
- **Privacy-Preserving Weather:** Only coordinates rounded to ~1.1 km (`2 decimal places`) are sent to Open-Meteo, without any user identity.

---

## 2. Data Processors & Third-Party Recipients

| Recipient | Purpose | Notes |
| --- | --- | --- |
| **Google LLC / Google Ireland Ltd.** | Google Sign-In (`id_token` verification) & Google Play app testing/distribution. No Firebase Analytics. | EU-US DPF / SCC |
| **Mazda Connected Services (MME / Regional Operator)** | Vehicle telemetry source & remote command execution via your MyMazda OAuth2 tokens. | Independent controller |
| **Open-Meteo** | Local temperature/frost weather forecast (~1.1 km rounded coordinates, no identity). | EU / Switzerland |
| **Cloudflare Inc.** | DNS & encrypted HTTPS reverse tunnel to the origin server. | EU-US DPF / SCC |
| **Self-Hosted Docker Backend** | Stores per-user AES-256-GCM encrypted vaults (`user:<id>` & `data:<id>` AAD). | Administrator-controlled |

---

## 3. Data Retention

| Item | Retention Period |
| --- | --- |
| Account, OAuth tokens, places, schedules & trip/charge logs | Until deleted by you or immediately erased via **Delete Account**. |
| Device sessions | 90 days max (auto-pruned) or immediately on Logout / Revoke Session. |
| Chrome Custom Tab one-time exchange codes | 60 seconds (single-use). |
| WebAuthn Passkey challenges | 5 minutes (single-use). |

---

## 4. Your GDPR Rights
- **Access & Portability (Art. 15 & 20):** Export CSV (`trips.csv`, `charges.csv`) or full `data.json` anytime from the Web Portal.
- **Erasure (Art. 17):** Use the **Delete Account** button (`DELETE /api/account`), see `/delete-account.html`, or email **`mx30Support@gmail.com`**.
- **Supervisory Authorities:** UK ICO (`https://ico.org.uk`) or Hungarian NAIH (`https://naih.hu`).
