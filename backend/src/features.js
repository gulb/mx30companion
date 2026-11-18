const WEATHER_CACHE = new Map();
const WEATHER_TTL_MS = 15 * 60 * 1000;

const FIXED_HU_HOLIDAYS = new Set([
  "01-01",
  "03-15",
  "05-01",
  "08-20",
  "10-23",
  "11-01",
  "12-25",
  "12-26"
]);

function computeEasterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function formatMonthDay(date) {
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(date, days) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function isHungarianHoliday(date = new Date()) {
  const mmdd = formatMonthDay(date);
  if (FIXED_HU_HOLIDAYS.has(mmdd)) return true;

  const easter = computeEasterSunday(date.getFullYear());
  const moveable = [
    addDays(easter, -2), // Nagypéntek
    addDays(easter, 1),  // Húsvéthétfő
    addDays(easter, 50)  // Pünkösdhétfő
  ];
  return moveable.some((holiday) => formatMonthDay(holiday) === mmdd);
}

function isUkBankHoliday(date = new Date()) {
  const year = date.getFullYear();
  const mmdd = formatMonthDay(date);
  const sameDay = (d) => formatMonthDay(d) === mmdd;

  // Substitute weekday helper (if Sat -> Mon, if Sun -> Mon)
  const observedFixed = (monthIdx, dayNum) => {
    const d = new Date(year, monthIdx, dayNum);
    const dow = d.getDay();
    if (dow === 6) return addDays(d, 2);
    if (dow === 0) return addDays(d, 1);
    return d;
  };

  // New Year's Day (Jan 1 observed)
  if (sameDay(observedFixed(0, 1))) return true;

  // Good Friday & Easter Monday
  const easter = computeEasterSunday(year);
  if (sameDay(addDays(easter, -2)) || sameDay(addDays(easter, 1))) return true;

  // Early May Bank Holiday (first Monday of May)
  const may1 = new Date(year, 4, 1);
  const earlyMay = addDays(may1, (8 - may1.getDay()) % 7);
  if (sameDay(earlyMay)) return true;

  // Spring Bank Holiday (last Monday of May)
  const may31 = new Date(year, 4, 31);
  const springBank = addDays(may31, -((may31.getDay() + 6) % 7));
  if (sameDay(springBank)) return true;

  // Summer Bank Holiday (last Monday of August)
  const aug31 = new Date(year, 7, 31);
  const summerBank = addDays(aug31, -((aug31.getDay() + 6) % 7));
  if (sameDay(summerBank)) return true;

  // Christmas Day (Dec 25) & Boxing Day (Dec 26) with substitute rules
  const xmas = new Date(year, 11, 25);
  const boxing = new Date(year, 11, 26);
  const xmasDow = xmas.getDay();
  if (xmasDow === 5) {
    // Fri Dec 25 + Sat Dec 26 -> Mon Dec 28
    if (sameDay(xmas) || sameDay(addDays(boxing, 2))) return true;
  } else if (xmasDow === 6) {
    // Sat Dec 25 + Sun Dec 26 -> Mon Dec 27 + Tue Dec 28
    if (sameDay(addDays(xmas, 2)) || sameDay(addDays(boxing, 2))) return true;
  } else if (xmasDow === 0) {
    // Sun Dec 25 + Mon Dec 26 -> Mon Dec 26 + Tue Dec 27
    if (sameDay(boxing) || sameDay(addDays(boxing, 1))) return true;
  } else {
    if (sameDay(xmas) || sameDay(boxing)) return true;
  }

  return false;
}

function detectHolidayCountry(state = {}) {
  const lat = Number(state.location?.latitude ?? state.places?.[0]?.latitude);
  const lon = Number(state.location?.longitude ?? state.places?.[0]?.longitude);
  if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
    if (lat >= 49.5 && lat <= 61.0 && lon >= -8.8 && lon <= 2.0) return "GB";
    if (lat >= 45.7 && lat <= 48.7 && lon >= 16.0 && lon <= 23.0) return "HU";
  }
  return state.lang === "hu" ? "HU" : "GB";
}

function isPublicHolidayForLocation(date = new Date(), state = {}) {
  const country = detectHolidayCountry(state);
  if (country === "HU") return { isHoliday: isHungarianHoliday(date), country };
  if (country === "GB") return { isHoliday: isUkBankHoliday(date), country };
  return { isHoliday: false, country };
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const r = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function resolvePlaceName(lat, lon, places = [], lang = "hu") {
  if (typeof lat !== "number" || typeof lon !== "number") {
    return lang === "hu" ? "Ismeretlen hely" : "Unknown location";
  }
  for (const place of places) {
    if (typeof place.latitude !== "number" || typeof place.longitude !== "number") continue;
    const radius = Math.max(30, Number(place.radiusMeters) || 150);
    if (haversineMeters(lat, lon, place.latitude, place.longitude) <= radius) {
      return place.name;
    }
  }
  return lang === "hu" ? "Parkoló / Úton" : "Parked away";
}

function weatherCodeLabel(code, lang = "hu") {
  const hu = {
    0: "Derült",
    1: "Többnyire derült",
    2: "Részben felhős",
    3: "Borult",
    45: "Ködös",
    48: "Zúzmarás köd",
    51: "Szitálás",
    61: "Eső",
    63: "Mérsékelt eső",
    65: "Erős eső",
    71: "Havazás",
    73: "Mérsékelt havazás",
    75: "Erős havazás",
    80: "Zápor",
    95: "Zivatar"
  };
  const en = {
    0: "Clear",
    1: "Mostly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Foggy",
    48: "Rime fog",
    51: "Drizzle",
    61: "Light rain",
    63: "Rain",
    65: "Heavy rain",
    71: "Light snow",
    73: "Snow",
    75: "Heavy snow",
    80: "Showers",
    95: "Thunderstorm"
  };
  const map = lang === "hu" ? hu : en;
  if (map[code]) return map[code];
  if (code >= 70 && code <= 79) return lang === "hu" ? "Havazás" : "Snow";
  if (code >= 50 && code <= 69) return lang === "hu" ? "Csapadék" : "Rain";
  return lang === "hu" ? "Változó" : "Variable";
}

async function fetchOutdoorWeather(lat, lon, lang = "hu", fallbackWeather = null) {
  if (typeof lat !== "number" || typeof lon !== "number") {
    return fallbackWeather || {
      tempC: 6.0,
      minTempC: 1.0,
      maxTempC: 9.0,
      windKmh: 10,
      weatherCode: 2,
      condition: weatherCodeLabel(2, lang),
      frostWarning: false,
      heatWarning: false,
      fetchedAt: new Date().toISOString(),
      source: "fallback"
    };
  }

  const cacheKey = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const cached = WEATHER_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.ts < WEATHER_TTL_MS) {
    return {
      ...cached.data,
      condition: weatherCodeLabel(cached.data.weatherCode, lang)
    };
  }

  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}` +
      `&longitude=${lon.toFixed(4)}&current=temperature_2m,weather_code,wind_speed_10m` +
      `&daily=temperature_2m_min,temperature_2m_max&timezone=auto`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4500) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const tempC = Number((data.current?.temperature_2m ?? 6).toFixed(1));
    const minTempC = Number((data.daily?.temperature_2m_min?.[0] ?? tempC).toFixed(1));
    const maxTempC = Number((data.daily?.temperature_2m_max?.[0] ?? tempC).toFixed(1));
    const windKmh = Math.round(data.current?.wind_speed_10m ?? 0);
    const weatherCode = Number(data.current?.weather_code ?? 2);

    const parsed = {
      tempC,
      minTempC,
      maxTempC,
      windKmh,
      weatherCode,
      condition: weatherCodeLabel(weatherCode, lang),
      frostWarning: tempC <= 2.0 || minTempC <= 0.0,
      heatWarning: tempC >= 30.0,
      fetchedAt: new Date().toISOString(),
      source: "open-meteo"
    };
    WEATHER_CACHE.set(cacheKey, { ts: Date.now(), data: parsed });
    return parsed;
  } catch (_err) {
    if (cached) {
      return {
        ...cached.data,
        condition: weatherCodeLabel(cached.data.weatherCode, lang)
      };
    }
    return fallbackWeather || {
      tempC: 4.5,
      minTempC: 0.5,
      maxTempC: 8.5,
      windKmh: 8,
      weatherCode: 2,
      condition: weatherCodeLabel(2, lang),
      frostWarning: false,
      heatWarning: false,
      fetchedAt: new Date().toISOString(),
      source: "fallback"
    };
  }
}

function buildActionItems(state, lang = "hu") {
  const isHu = lang !== "en";
  const items = [];
  const doors = state.doors || {};
  const windows = state.windows || {};
  const battery = state.battery || {};
  const tires = state.tires || {};
  const weather = state.weather || {};

  const openDoorNames = [];
  if (doors.driverOpen) openDoorNames.push(isHu ? "Vezető ajtó" : "Driver door");
  if (doors.passengerOpen) openDoorNames.push(isHu ? "Utas ajtó" : "Passenger door");
  if (doors.rearLeftOpen) openDoorNames.push(isHu ? "Bal hátsó" : "Rear left");
  if (doors.rearRightOpen) openDoorNames.push(isHu ? "Jobb hátsó" : "Rear right");
  if (doors.trunkOpen) openDoorNames.push(isHu ? "Csomagtartó" : "Trunk");
  if (doors.hoodOpen) openDoorNames.push(isHu ? "Motorháztető" : "Hood");

  const openWinNames = [];
  if (windows.driverOpen) openWinNames.push(isHu ? "Bal első ablak" : "FL window");
  if (windows.passengerOpen) openWinNames.push(isHu ? "Jobb első ablak" : "FR window");
  if (windows.rearLeftOpen) openWinNames.push(isHu ? "Bal hátsó ablak" : "RL window");
  if (windows.rearRightOpen) openWinNames.push(isHu ? "Jobb hátsó ablak" : "RR window");

  if (openDoorNames.length > 0 || openWinNames.length > 0) {
    items.push({
      id: "open-aperture",
      severity: "critical",
      title: isHu ? "Nyitva maradt ajtó vagy ablak!" : "Door or window left open!",
      detail: [...openDoorNames, ...openWinNames].join(", ")
    });
  }

  if (!doors.locked && !battery.charging) {
    items.push({
      id: "unlocked",
      severity: "warning",
      title: isHu ? "Az autó nincs bezárva" : "Vehicle is unlocked",
      detail: isHu
        ? "Koppints a Zárás gombra a biztonságos lezáráshoz."
        : "Tap Lock to secure your MX-30."
    });
  }

  if (typeof battery.socPercent === "number" && battery.socPercent < 20 && !battery.pluggedIn) {
    items.push({
      id: "low-battery",
      severity: "warning",
      title: isHu ? "Alacsony akkumulátor (<20%)" : "Low battery (<20%)",
      detail: isHu
        ? `Csatlakoztasd a töltőt (${battery.remainingRangeKm} km hatótáv maradt).`
        : `Plug in charger (${battery.remainingRangeKm} km remaining).`
    });
  }

  const lowTires = [
    ["FL", tires.frontLeftBar],
    ["FR", tires.frontRightBar],
    ["RL", tires.rearLeftBar],
    ["RR", tires.rearRightBar]
  ].filter(([, val]) => typeof val === "number" && val > 0 && val < 2.1);

  if (lowTires.length > 0) {
    items.push({
      id: "low-tire",
      severity: "warning",
      title: isHu ? "Alacsony guminyomás" : "Low tire pressure",
      detail: lowTires.map(([k, v]) => `${k}: ${v} bar`).join(" • ")
    });
  }

  if (weather.frostWarning) {
    items.push({
      id: "frost",
      severity: "info",
      title: isHu
        ? `Fagyfigyelmeztetés (${weather.tempC}°C)`
        : `Frost warning (${weather.tempC}°C)`,
      detail: isHu
        ? "Páramentesítés és előfűtés javasolt indulás előtt."
        : "Pre-heating and defrosting recommended before departure."
    });
  } else if (weather.heatWarning) {
    items.push({
      id: "heat",
      severity: "info",
      title: isHu
        ? `Hőségfigyelmeztetés (${weather.tempC}°C)`
        : `Heat warning (${weather.tempC}°C)`,
      detail: isHu
        ? "Előhűtés javasolt indulás előtt."
        : "Pre-cooling recommended before departure."
    });
  }

  if (items.length === 0) {
    items.push({
      id: "all-ok",
      severity: "ok",
      title: isHu
        ? "Minden rendben — indulásra kész"
        : "All good — locked & ready",
      detail: isHu
        ? `${battery.socPercent}% (${battery.storedKwh ?? 0} kWh) • ${state.currentPlace || "MX-30"}`
        : `${battery.socPercent}% (${battery.storedKwh ?? 0} kWh) • ${state.currentPlace || "MX-30"}`
    });
  }

  return items;
}

function updateEnergyMetrics(state) {
  const battery = state.battery;
  const capacity = Math.max(10, Math.min(100, Number(battery.capacityKwh) || 30.0));
  battery.capacityKwh = Number(capacity.toFixed(1));
  battery.storedKwh = Number(((battery.socPercent / 100) * capacity).toFixed(1));

  if (battery.charging) {
    if (battery.chargeTimeRemainingMin > 0 && battery.socPercent < 100) {
      const kwhRemaining = ((100 - battery.socPercent) / 100) * capacity;
      const hoursRemaining = battery.chargeTimeRemainingMin / 60;
      const estimated = kwhRemaining / hoursRemaining;
      battery.chargingKw = Number(Math.max(1.4, Math.min(50.0, estimated)).toFixed(1));
    } else {
      battery.chargingKw = battery.chargingKw > 0 ? battery.chargingKw : 6.6;
    }
  } else {
    battery.chargingKw = 0;
  }
}

function detectTripOrCharge(prevSnapshot, state) {
  updateEnergyMetrics(state);
  if (!prevSnapshot) return;

  const capacity = state.battery.capacityKwh || 30.0;
  const socDelta = state.battery.socPercent - prevSnapshot.socPercent;
  const odoDelta = state.odometerKm - prevSnapshot.odometerKm;

  // Trip detection: odometer moved >= 1 km
  if (odoDelta >= 1) {
    const socUsed = Math.max(0, prevSnapshot.socPercent - state.battery.socPercent);
    const kwhUsed = Number(((socUsed / 100) * capacity).toFixed(2));
    const eff = odoDelta > 0 ? Number(((kwhUsed / odoDelta) * 100).toFixed(1)) : 0;
    state.trips.unshift({
      id: `trip-${Date.now()}`,
      startTime: prevSnapshot.timestamp,
      endTime: new Date().toISOString(),
      fromPlace: prevSnapshot.place || state.currentPlace,
      toPlace: state.currentPlace,
      distanceKm: odoDelta,
      socUsedPercent: socUsed,
      kwhUsed,
      efficiencyKwhPer100Km: eff
    });
    state.trips = state.trips.slice(0, 100);
  }

  // Charge logging: ignore small driving regen spikes unless plugged in
  if (state.battery.pluggedIn && socDelta >= 1) {
    const kwhAdded = Number(((socDelta / 100) * capacity).toFixed(2));
    const latest = state.charges[0];
    const recentSameSession =
      latest &&
      Date.now() - new Date(latest.endTime || latest.timestamp).getTime() < 2 * 60 * 60 * 1000 &&
      latest.endSoc <= state.battery.socPercent;

    if (recentSameSession) {
      latest.endTime = new Date().toISOString();
      latest.endSoc = state.battery.socPercent;
      latest.kwhAdded = Number((((latest.endSoc - latest.startSoc) / 100) * capacity).toFixed(2));
      latest.avgKw = state.battery.chargingKw || latest.avgKw || 6.6;
    } else {
      state.charges.unshift({
        id: `chg-${Date.now()}`,
        timestamp: new Date().toISOString(),
        endTime: new Date().toISOString(),
        place: state.currentPlace,
        startSoc: prevSnapshot.socPercent,
        endSoc: state.battery.socPercent,
        kwhAdded,
        durationMin: Math.max(5, Math.round((kwhAdded / (state.battery.chargingKw || 6.6)) * 60)),
        avgKw: state.battery.chargingKw || 6.6
      });
      state.charges = state.charges.slice(0, 100);
    }
  }
}

function computeStatistics(trips = [], charges = []) {
  const now = Date.now();
  const weekCutoff = now - 7 * 24 * 60 * 60 * 1000;
  const monthCutoff = now - 30 * 24 * 60 * 60 * 1000;

  const summarize = (cutoff) => {
    const tList = trips.filter((t) => new Date(t.endTime || t.startTime).getTime() >= cutoff);
    const cList = charges.filter((c) => new Date(c.timestamp).getTime() >= cutoff);
    const distanceKm = tList.reduce((acc, t) => acc + (Number(t.distanceKm) || 0), 0);
    const kwhUsed = Number(tList.reduce((acc, t) => acc + (Number(t.kwhUsed) || 0), 0).toFixed(1));
    const kwhCharged = Number(
      cList.reduce((acc, c) => acc + (Number(c.kwhAdded) || 0), 0).toFixed(1)
    );
    const avgEfficiency = distanceKm > 0 ? Number(((kwhUsed / distanceKm) * 100).toFixed(1)) : 0;
    return {
      distanceKm,
      kwhUsed,
      kwhCharged,
      avgEfficiency,
      tripCount: tList.length,
      chargeCount: cList.length
    };
  };

  const dailySeries = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    const dayTrips = trips.filter((t) => String(t.endTime || t.startTime).startsWith(key));
    const dayCharges = charges.filter((c) => String(c.timestamp).startsWith(key));
    dailySeries.push({
      date: key.slice(5),
      distanceKm: dayTrips.reduce((acc, t) => acc + (Number(t.distanceKm) || 0), 0),
      kwhCharged: Number(
        dayCharges.reduce((acc, c) => acc + (Number(c.kwhAdded) || 0), 0).toFixed(1)
      )
    });
  }

  return {
    weekly: summarize(weekCutoff),
    monthly: summarize(monthCutoff),
    dailySeries
  };
}

function seedDemoLogs() {
  const now = Date.now();
  const isoAgo = (hours) => new Date(now - hours * 3600 * 1000).toISOString();

  const trips = [
    {
      id: "trip-demo-1",
      startTime: isoAgo(5),
      endTime: isoAgo(4.5),
      fromPlace: "Munkahely",
      toPlace: "Otthon",
      distanceKm: 18,
      socUsedPercent: 10,
      kwhUsed: 3.0,
      efficiencyKwhPer100Km: 16.7
    },
    {
      id: "trip-demo-2",
      startTime: isoAgo(13),
      endTime: isoAgo(12.4),
      fromPlace: "Otthon",
      toPlace: "Munkahely",
      distanceKm: 19,
      socUsedPercent: 11,
      kwhUsed: 3.3,
      efficiencyKwhPer100Km: 17.4
    },
    {
      id: "trip-demo-3",
      startTime: isoAgo(38),
      endTime: isoAgo(37),
      fromPlace: "Otthon",
      toPlace: "Belváros",
      distanceKm: 32,
      socUsedPercent: 18,
      kwhUsed: 5.4,
      efficiencyKwhPer100Km: 16.9
    }
  ];

  const charges = [
    {
      id: "chg-demo-1",
      timestamp: isoAgo(3),
      endTime: isoAgo(1.8),
      place: "Otthon",
      startSoc: 52,
      endSoc: 78,
      kwhAdded: 7.8,
      durationMin: 72,
      avgKw: 6.6
    },
    {
      id: "chg-demo-2",
      timestamp: isoAgo(35),
      endTime: isoAgo(34.5),
      place: "DC Töltő",
      startSoc: 28,
      endSoc: 80,
      kwhAdded: 15.6,
      durationMin: 28,
      avgKw: 33.4
    }
  ];

  return { trips, charges };
}

function toCsv(rows, columns) {
  const escapeCell = (val) => {
    const str = String(val ?? "");
    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const header = columns.map((c) => escapeCell(c.label)).join(",");
  const lines = rows.map((row) => columns.map((c) => escapeCell(row[c.key])).join(","));
  return [header, ...lines].join("\n");
}

module.exports = {
  isHungarianHoliday,
  isUkBankHoliday,
  detectHolidayCountry,
  isPublicHolidayForLocation,
  fetchOutdoorWeather,
  resolvePlaceName,
  buildActionItems,
  updateEnergyMetrics,
  detectTripOrCharge,
  computeStatistics,
  seedDemoLogs,
  toCsv
};
