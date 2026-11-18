# Google Play Console — Data Safety & App Content Guide

Use these exact declarations when completing **App content** in Google Play Console for `com.mazda.mx30companion`.

## 1. Privacy Policy URL
- `https://your-domain.example/privacy.html` (or raw/rendered link to `docs/PRIVACY_POLICY.md`)

## 2. Data Safety Overview
- **Does your app collect or share any of the required user data types?** **Yes** (Collects only; **No** data is shared with third parties).
- **Is all of the user data collected by your app encrypted in transit?** **Yes** (HTTPS / TLS only; `usesCleartextTraffic="false"`).
- **Do you provide a way for users to request that their data is deleted?** **Yes** (In-app / Web Portal **Delete Account** button + `DELETE /api/account`).

## 3. Data Types Collected
| Category | Data Type | Purpose | Ephemeral? | Optional? |
| --- | --- | --- | --- | --- |
| **Personal info** | Name, Email address, User IDs | Account management & Google Sign-In authentication | No | No |
| **Location** | Precise location | Parked car map, local weather, geofenced Saved Places & schedule location matching | No | Yes (user can leave Places empty) |
| **App activity** | App interactions / Vehicle command & trip logs | Trip log, charge log, timeline audit | No | Yes |

## 4. Advertising & Tracking
- **Contains ads:** **No**
- **Data shared with third parties:** **No** (weather lookup uses only coarse/parked coordinates via Open-Meteo with no user identity).
