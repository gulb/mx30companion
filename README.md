# Mazda MX-30 Companion (Docker Backend + Native Android App)

A self-hosted companion ecosystem for the **Mazda MX-30**, designed to replace the slow login & missing widget experience of the official MyMazda app.

## Architecture

- **`backend/` (`docker-compose.yml`)**: Node.js (`node:20-alpine`) REST API, smart pre-heat scheduler, and web dashboard running on port `3080`. Includes an interactive **Demo Simulation** mode out of the box plus flexible **Live** connection adapters (Home Assistant webhook / telemetry bridge or a community `node-mymazda` fork).
- **`android-app/`**: Native Kotlin + Jetpack Compose Android application (`com.mazda.mx30companion`) featuring:
  - **Home Screen Widget (`MX30WidgetProvider`)**: Shows Battery %, EV Range (km), Cabin Temp, Plug/Lock status, plus 1-tap **Pre-Heat**, **Lock**, and **Sync** buttons.
  - **Quick Settings Tile (`MX30ClimateTileService`)**: Swipe down Android Quick Settings to toggle **MX-30 Climate** in one tap.
  - **Companion Dashboard**: Instant cached loading, HVAC target temperature & defrosters, charging control, door lock/unlock, hazard flash, smart schedules, and connection settings (pre-configured for `http://192.168.68.150:3080`).

---

## 1. Run the Backend on Your Mac Docker Instance

```bash
cd /Users/gulb/Downloads/Ai/mazda
cp .env.example .env   # Optional: configure MAZDA_EMAIL / MAZDA_PASSWORD / WEBHOOK_URL
docker compose up -d --build
```

Open the Web Dashboard:
- **On this Mac:** `http://localhost:3080`
- **From your Android phone (same Wi-Fi):** `http://192.168.68.150:3080`

> **Tip for outside-home access:** Install **Tailscale** on your Mac and Android phone, then point the Android app to your Mac's Tailscale IP (`http://100.x.y.z:3080`) so your Home Screen Widget and Quick Settings Tile work securely from anywhere without opening router ports.

---

## 2. Live Mode Options (Post-DMCA MyMazda `MME` Setup)

Because the public npm package `node-mymazda@1.1.9` was emptied by its author following Mazda's DMCA takedown (`"This package is no longer available."`), the backend supports three Live Mode paths:

1. **Home Assistant / Node-RED Bridge (Recommended):**
   - Run the community HACS fork **`runDMCA/home-assistant-mazda`** (or **`ImLunaHey/mazda2mqtt`**) alongside this backend.
   - Set `WEBHOOK_URL` (via `.env` or `POST /api/config`) to receive `{ action, params, vehicleId, timestamp }` JSON webhooks for `turnOnHvac`, `turnOffHvac`, `setHvacSettings`, `startCharging`, `stopCharging`, `lockDoors`, `unlockDoors`, `flashHazardLights`, and `refresh`.
   - Push vehicle state updates into the Docker cache via `POST http://localhost:3080/api/telemetry` (works for Home Assistant automations, WiCAN OBD-II, or CarScanner/Tasker).
2. **Custom `node-mymazda` Fork:**
   - Place a working community `node-mymazda` build at `/app/data/mymazda-client.js` inside the container volume (`mx30_data`), then configure your MyMazda email, password, and region (`MME`) in the Web UI or Android Settings.
3. **Demo Simulation Mode (Default):**
   - Works out of the box with zero external setup so you can test the Dashboard, Android Widget, Quick Settings Tile, and Smart Schedules immediately.

---

## 3. Build & Install the Android App

### Option A: Build the APK via Docker (no Android Studio needed)
```bash
docker compose --profile build run --rm android-builder
```
The compiled debug APK will be written to:
`android-app/app/build/outputs/apk/debug/app-debug.apk`

### Option B: Open in Android Studio
Open `/Users/gulb/Downloads/Ai/mazda/android-app` in Android Studio and click **Run**.

---

## 4. Add the Home Screen Widget & Quick Settings Tile

1. **Home Screen Widget**: Long-press your Android home screen → **Widgets** → **MX-30 Companion** → **MX-30 Status & Controls**.
2. **Quick Settings Tile**: Swipe down twice from the top of your Android screen → tap the **Edit (pencil)** icon → drag **MX-30 Climate** into your active Quick Settings tiles.
