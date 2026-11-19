# Carmeo (`getcarmeo.app`) Feature Analysis & Mazda MX-30 Roadmap

Review of **Carmeo (v1.0 – v1.7.0)** mapped directly to **Mazda MX-30 Companion** capabilities and Mazda Connected Services (`MME` / `pymazda`) API constraints.

---

## 1. Already Implemented in MX-30 Companion
- **Glance & Telemetry:** SoC %, electric range, stored kWh, plug/charge status, cabin & exterior temp, tire pressures (`EB`/`EJ`/`HB`/`HJ` & `FL`/`FR`/`RL`/`RR`), odometer, parked map, Saved Places geofencing, Next Action card.
- **Remote Controls:** Door lock (`remoteLock`), climate ON/OFF, target temp stepper, front/rear defrost, hazard lights flash, send POI to car navigation, start/stop charging.
- **Tesla-Style Smart Automation:** Precondition & Charge schedules with day-of-week / Single Day mode, location filter, Skip Next, weather-aware frost warning, auto UK/HU bank holidays & local timezones (`Europe/London`, `Europe/Budapest`).
- **Logs & Exports:** Real trip & charge detection (zero demo data leakage in live mode), weekly/monthly stats, CSV (`trips.csv`, `charges.csv`) & `data.json` export.
- **Auth & Platforms:** Google Sign-In, WebAuthn Passkeys, Chrome Custom Tabs RFC 8252 Android login, 4 car studio colors synced Web ↔ Android, Quick Settings tile, 12V-safe on-demand refresh.

## 2. Added in This Milestone
- **Graceful Mazda Europe (`MME`) Unlock Handling:** Auto-detects `MME` region capability (`remoteUnlock: false`) with clear localized explanation instead of confusing HTTP 500s.
- **4 Carmeo-Style Android Home Screen Widgets:** `2×2` Battery Ring, `4×2` Car Hero + Controls, `4×3` 6-Tile Status Grid, `4×4` Full Car Hero + 3 Metric Pills + 5 Command Buttons.
- **Privacy & Security Parity+:** Pause location recording, confirm before remote commands, 90-day session expiry, active device list & remote logout/revoke, VIN log redaction, ~1.1 km weather coordinate rounding, bilingual privacy/terms/delete-account portal.

## 3. High-Value Next Roadmap Items (Implementable with Mazda API)
1. **Live Push Notifications & Live Ongoing Notifications (`FCM` + Foreground Service):** Alerts for unlocked door at night, open door/window, target SoC % reached, charge interrupted, frost tonight, and 12V drain warning.
2. **Real Energy Tariff & CO₂ / Petrol Savings Calculator:** Configurable home day/night kWh tariff, public charger kWh pricing, monthly energy cost & savings vs petrol baseline.
3. **Interactive Temperature Dial & Custom Warm-Up / Cool-Down Presets:** Configurable presets on Android (choosing exact temp + front/rear defrost per preset) + What's New dialog after app updates.
4. **Family / Multi-Driver Car Sharing:** Invite a second user account with role permissions (View only / Climate + Charge / Full control) and optional location visibility.
5. **Service & Document Expiry Log + Charge Curve Graph:** Service/MOT/insurance/tyre-check date & km reminders, plus visual charge curve & trip route polyline map (`OSM` / `MapTiler`).
6. **iOS / SwiftUI App + WidgetKit / Live Activities:** Companion iPhone app if expanding beyond Android.

## 4. Not Supported on Mazda MX-30 (`MME`) Hardware / Cloud
- **Remote Door Unlock (`MME`):** Disabled by Mazda Motor Europe server-side (`HTTP 500` on `remoteServices/doorUnlock/v4`; works only in `MNAO`/`MCI` regions).
- **Trunk, Windows & Sunroof Remote Control / Heated & Ventilated Seats / Steering Wheel Heating:** Mazda MX-30 `pymazda` API does not expose individual window/sunroof actuators or seat/steering-wheel remote switches (status sensors only for doors/hood/trunk/windows).
- **Fuel Tank Range (R-EV only):** Applicable only if a rotary range-extender MX-30 R-EV VIN is connected (`vehicle.hasFuel`).
