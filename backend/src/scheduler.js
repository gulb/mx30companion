const { isPublicHolidayForLocation } = require("./features");

function matchesScheduleLocation(client, sched) {
  const locId = String(sched.locationId || "").trim();
  if (!locId || locId === "any") return true;
  const places = client.store.state.places || [];
  const matchedPlace = places.find((p) => p.id === locId);
  const expectedName = (matchedPlace?.name || sched.locationName || "").trim().toLowerCase();
  if (!expectedName) return true;
  const currentPlace = String(client.store.state.currentPlace || "").trim().toLowerCase();
  return currentPlace === expectedName;
}

function resolveUserLocalTime(now, state) {
  const { isHoliday, country } = isPublicHolidayForLocation(now, state);
  const timeZone = country === "HU" ? "Europe/Budapest" : "Europe/London";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false
  }).formatToParts(now);

  const map = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const hh = map.hour === "24" ? "00" : map.hour;
  return {
    isHoliday,
    holidayCountry: country,
    timeZone,
    dayOfWeek: dayMap[map.weekday] ?? now.getDay(),
    currentTime: `${hh}:${map.minute}`,
    todayKey: `${map.year}-${map.month}-${map.day}`
  };
}

async function processUserSchedules(client, now) {
  client.applySimulationTick();
  const { isHoliday, holidayCountry, dayOfWeek, currentTime, todayKey } =
    resolveUserLocalTime(now, client.store.state);

  const schedules = client.getSchedules();
  let schedulesUpdated = false;

  for (const sched of schedules) {
    if (!sched.enabled) continue;
    const isCharge = sched.type === "charge";
    const days = Array.isArray(sched.days) && sched.days.length > 0 ? sched.days : [0, 1, 2, 3, 4, 5, 6];

    // Optional Charge Stop Time (off-peak window end)
    if (isCharge && sched.endTime && sched.endTime === currentTime && sched.lastStopTriggeredDate !== todayKey) {
      if (matchesScheduleLocation(client, sched)) {
        try {
          await client.setCharging(false, "schedule");
        } catch (err) {
          client.recordHistory(`Charge stop "${sched.name}" failed: ${err.message}`, "error");
        }
        sched.lastStopTriggeredDate = todayKey;
        if (sched.repeatWeekly === false) {
          sched.enabled = false;
        }
        schedulesUpdated = true;
      }
      continue;
    }

    if (sched.time !== currentTime) continue;
    if (!days.includes(dayOfWeek)) continue;
    if (sched.lastTriggeredDate === todayKey) continue;

    if (!matchesScheduleLocation(client, sched)) {
      client.recordHistory(
        `Skipped schedule "${sched.name}" (car not at ${sched.locationName || sched.locationId})`,
        "schedule"
      );
      sched.lastTriggeredDate = todayKey;
      schedulesUpdated = true;
      continue;
    }

    if (!isCharge && sched.skipHolidays !== false && isHoliday) {
      client.recordHistory(
        `Public holiday (${holidayCountry}) — skipped pre-heat (${sched.name})`,
        "schedule"
      );
      sched.lastTriggeredDate = todayKey;
      schedulesUpdated = true;
      continue;
    }

    if (sched.skipNext === true) {
      sched.skipNext = false;
      sched.lastTriggeredDate = todayKey;
      client.recordHistory(
        `Skip next — skipped schedule (${sched.name})`,
        "schedule"
      );
      schedulesUpdated = true;
      continue;
    }

    if (sched.requirePluggedIn && !client.store.state.battery.pluggedIn) {
      client.recordHistory(
        `Skipped schedule "${sched.name}" (vehicle not plugged in)`,
        "schedule"
      );
      sched.lastTriggeredDate = todayKey;
      schedulesUpdated = true;
      continue;
    }

    try {
      if (isCharge) {
        await client.setCharging(true, "schedule");
      } else {
        const frostActive =
          sched.weatherAware !== false && Boolean(client.store.state.weather?.frostWarning);
        const frontDefroster = frostActive ? true : Boolean(sched.frontDefroster);
        const rearDefroster = frostActive ? true : Boolean(sched.rearDefroster);
        await client.setHvacPower(
          true,
          {
            targetTempC: sched.targetTempC,
            frontDefroster,
            rearDefroster
          },
          "schedule"
        );
      }
      sched.lastTriggeredDate = todayKey;
      if (sched.repeatWeekly === false && (!isCharge || !sched.endTime)) {
        sched.enabled = false;
      }
      schedulesUpdated = true;
    } catch (err) {
      client.recordHistory(
        `Schedule "${sched.name}" failed: ${err.message}`,
        "error"
      );
      schedulesUpdated = true;
    }
  }

  if (schedulesUpdated) {
    await client.finalizeState({ refreshWeather: false });
  }
}

function startScheduler(manager) {
  let checking = false;

  const tick = async () => {
    if (checking) return;
    checking = true;

    try {
      const now = new Date();
      await manager.forEachClient((client) =>
        processUserSchedules(client, now).catch(
          (err) => console.error("Scheduler error for user:", err.message)
        )
      );
    } finally {
      checking = false;
    }
  };

  const timer = setInterval(tick, 30 * 1000);
  return () => clearInterval(timer);
}

module.exports = { startScheduler };
