package com.mazda.mx30companion.data

import org.json.JSONArray
import org.json.JSONObject

data class BatteryState(
    val socPercent: Int = 78,
    val remainingRangeKm: Int = 164,
    val capacityKwh: Double = 30.0,
    val storedKwh: Double = 23.4,
    val chargingKw: Double = 0.0,
    val pluggedIn: Boolean = true,
    val charging: Boolean = false,
    val chargeTimeRemainingMin: Int = 0,
    val batteryHeaterOn: Boolean = false
)

data class HvacState(
    val hvacOn: Boolean = false,
    val interiorTempC: Double = 14.5,
    val targetTempC: Double = 21.0,
    val frontDefroster: Boolean = true,
    val rearDefroster: Boolean = false
)

data class DoorsState(
    val locked: Boolean = true,
    val driverOpen: Boolean = false,
    val passengerOpen: Boolean = false,
    val rearLeftOpen: Boolean = false,
    val rearRightOpen: Boolean = false,
    val trunkOpen: Boolean = false,
    val hoodOpen: Boolean = false
)

data class WindowState(
    val driverOpen: Boolean = false,
    val passengerOpen: Boolean = false,
    val rearLeftOpen: Boolean = false,
    val rearRightOpen: Boolean = false
)

data class TireState(
    val frontLeftBar: Double = 2.5,
    val frontRightBar: Double = 2.5,
    val rearLeftBar: Double = 2.5,
    val rearRightBar: Double = 2.5
)

data class WeatherState(
    val tempC: Double = 4.0,
    val minTempC: Double = 0.0,
    val maxTempC: Double = 7.5,
    val condition: String = "Részben felhős",
    val frostWarning: Boolean = false,
    val heatWarning: Boolean = false
)

data class ActionItem(
    val id: String,
    val severity: String,
    val title: String,
    val detail: String
)

data class PlaceItem(
    val id: String,
    val name: String,
    val latitude: Double,
    val longitude: Double
)

data class ScheduleItem(
    val id: String,
    val type: String = "preheat",
    val name: String,
    val time: String,
    val endTime: String = "",
    val repeatWeekly: Boolean = true,
    val days: List<Int>,
    val locationId: String = "",
    val locationName: String = "",
    val enabled: Boolean,
    val targetTempC: Double,
    val frontDefroster: Boolean,
    val rearDefroster: Boolean = false,
    val targetSocPercent: Int = 80,
    val requirePluggedIn: Boolean,
    val skipHolidays: Boolean = true,
    val weatherAware: Boolean = true,
    val skipNext: Boolean = false
)

data class TripItem(
    val id: String,
    val fromPlace: String,
    val toPlace: String,
    val distanceKm: Int,
    val kwhUsed: Double,
    val efficiencyKwhPer100Km: Double,
    val endTime: String
)

data class ChargeItem(
    val id: String,
    val place: String,
    val startSoc: Int,
    val endSoc: Int,
    val kwhAdded: Double,
    val avgKw: Double,
    val timestamp: String
)

data class PeriodStats(
    val distanceKm: Int = 0,
    val kwhUsed: Double = 0.0,
    val kwhCharged: Double = 0.0,
    val avgEfficiency: Double = 0.0
)

data class HistoryItem(
    val timestamp: String,
    val event: String,
    val source: String
)

data class VehicleStatus(
    val lang: String = "hu",
    val carColor: String = "ceramic_metallic",
    val mode: String = "demo",
    val region: String = "MME",
    val vehicleId: String = "JMZDR1WBJ00123456",
    val nickname: String = "Mazda MX-30 e-SKYACTIV",
    val currentPlace: String = "Otthon",
    val latitude: Double = 47.4979,
    val longitude: Double = 19.0402,
    val lastUpdated: String = "",
    val lastError: String? = null,
    val odometerKm: Int = 24580,
    val configEmail: String = "",
    val hasOAuthToken: Boolean = false,
    val hasPasskey: Boolean = false,
    val passkeysCount: Int = 0,
    val battery: BatteryState = BatteryState(),
    val hvac: HvacState = HvacState(),
    val doors: DoorsState = DoorsState(),
    val windows: WindowState = WindowState(),
    val tires: TireState = TireState(),
    val weather: WeatherState = WeatherState(),
    val actions: List<ActionItem> = emptyList(),
    val places: List<PlaceItem> = emptyList(),
    val schedules: List<ScheduleItem> = emptyList(),
    val trips: List<TripItem> = emptyList(),
    val charges: List<ChargeItem> = emptyList(),
    val weeklyStats: PeriodStats = PeriodStats(),
    val monthlyStats: PeriodStats = PeriodStats(),
    val history: List<HistoryItem> = emptyList()
) {
    companion object {
        fun fromJson(json: JSONObject): VehicleStatus {
            val bat = json.optJSONObject("battery") ?: JSONObject()
            val hvacObj = json.optJSONObject("hvac") ?: JSONObject()
            val doorsObj = json.optJSONObject("doors") ?: JSONObject()
            val winObj = json.optJSONObject("windows") ?: JSONObject()
            val tiresObj = json.optJSONObject("tires") ?: JSONObject()
            val weatherObj = json.optJSONObject("weather") ?: JSONObject()
            val locObj = json.optJSONObject("location") ?: JSONObject()
            val configObj = json.optJSONObject("config") ?: JSONObject()
            val userObj = json.optJSONObject("user") ?: JSONObject()
            val statsObj = json.optJSONObject("stats") ?: JSONObject()
            val wkObj = statsObj.optJSONObject("weekly") ?: JSONObject()
            val moObj = statsObj.optJSONObject("monthly") ?: JSONObject()

            val actionsArr = json.optJSONArray("actions") ?: JSONArray()
            val actions = buildList {
                for (i in 0 until actionsArr.length()) {
                    val a = actionsArr.optJSONObject(i) ?: continue
                    add(
                        ActionItem(
                            id = a.optString("id", "act-$i"),
                            severity = a.optString("severity", "ok"),
                            title = a.optString("title", ""),
                            detail = a.optString("detail", "")
                        )
                    )
                }
            }

            val placesArr = json.optJSONArray("places") ?: JSONArray()
            val places = buildList {
                for (i in 0 until placesArr.length()) {
                    val p = placesArr.optJSONObject(i) ?: continue
                    add(
                        PlaceItem(
                            id = p.optString("id", "place-$i"),
                            name = p.optString("name", "Place"),
                            latitude = p.optDouble("latitude", 47.4979),
                            longitude = p.optDouble("longitude", 19.0402)
                        )
                    )
                }
            }

            val schedArray = json.optJSONArray("schedules") ?: JSONArray()
            val schedules = buildList {
                for (i in 0 until schedArray.length()) {
                    val s = schedArray.optJSONObject(i) ?: continue
                    val daysJson = s.optJSONArray("days") ?: JSONArray()
                    val daysList = buildList {
                        for (d in 0 until daysJson.length()) {
                            add(daysJson.optInt(d))
                        }
                    }
                    add(
                        ScheduleItem(
                            id = s.optString("id", "sched-$i"),
                            type = s.optString("type", "preheat"),
                            name = s.optString("name", "Pre-Heat"),
                            time = s.optString("time", "07:15"),
                            endTime = s.optString("endTime", ""),
                            repeatWeekly = s.optBoolean("repeatWeekly", true),
                            days = daysList,
                            locationId = s.optString("locationId", ""),
                            locationName = s.optString("locationName", ""),
                            enabled = s.optBoolean("enabled", true),
                            targetTempC = s.optDouble("targetTempC", 21.0),
                            frontDefroster = s.optBoolean("frontDefroster", true),
                            rearDefroster = s.optBoolean("rearDefroster", false),
                            targetSocPercent = s.optInt("targetSocPercent", 80),
                            requirePluggedIn = s.optBoolean("requirePluggedIn", false),
                            skipHolidays = s.optBoolean("skipHolidays", true),
                            weatherAware = s.optBoolean("weatherAware", true),
                            skipNext = s.optBoolean("skipNext", false)
                        )
                    )
                }
            }

            val tripsArr = json.optJSONArray("trips") ?: JSONArray()
            val trips = buildList {
                for (i in 0 until minOf(tripsArr.length(), 10)) {
                    val t = tripsArr.optJSONObject(i) ?: continue
                    add(
                        TripItem(
                            id = t.optString("id", "trip-$i"),
                            fromPlace = t.optString("fromPlace", ""),
                            toPlace = t.optString("toPlace", ""),
                            distanceKm = t.optInt("distanceKm", 0),
                            kwhUsed = t.optDouble("kwhUsed", 0.0),
                            efficiencyKwhPer100Km = t.optDouble("efficiencyKwhPer100Km", 0.0),
                            endTime = t.optString("endTime", "")
                        )
                    )
                }
            }

            val chargesArr = json.optJSONArray("charges") ?: JSONArray()
            val charges = buildList {
                for (i in 0 until minOf(chargesArr.length(), 10)) {
                    val c = chargesArr.optJSONObject(i) ?: continue
                    add(
                        ChargeItem(
                            id = c.optString("id", "chg-$i"),
                            place = c.optString("place", ""),
                            startSoc = c.optInt("startSoc", 0),
                            endSoc = c.optInt("endSoc", 0),
                            kwhAdded = c.optDouble("kwhAdded", 0.0),
                            avgKw = c.optDouble("avgKw", 0.0),
                            timestamp = c.optString("timestamp", "")
                        )
                    )
                }
            }

            val histArray = json.optJSONArray("history") ?: JSONArray()
            val history = buildList {
                for (i in 0 until minOf(histArray.length(), 15)) {
                    val h = histArray.optJSONObject(i) ?: continue
                    add(
                        HistoryItem(
                            timestamp = h.optString("timestamp", ""),
                            event = h.optString("event", ""),
                            source = h.optString("source", "system")
                        )
                    )
                }
            }

            return VehicleStatus(
                lang = json.optString("lang", "hu"),
                carColor = json.optString("carColor", "ceramic_metallic"),
                mode = json.optString("mode", "demo"),
                region = json.optString("region", "MME"),
                vehicleId = json.optString("vehicleId", "MX-30"),
                nickname = json.optString("nickname", "Mazda MX-30 e-SKYACTIV"),
                currentPlace = json.optString("currentPlace", "Otthon"),
                latitude = locObj.optDouble("latitude", 47.4979),
                longitude = locObj.optDouble("longitude", 19.0402),
                lastUpdated = json.optString("lastUpdated", ""),
                lastError = json.optString("lastError", "").takeIf { it.isNotBlank() && it != "null" },
                odometerKm = json.optInt("odometerKm", 0),
                configEmail = configObj.optString("email", ""),
                hasOAuthToken = configObj.optBoolean("hasOAuthToken", false),
                hasPasskey = userObj.optBoolean("hasPasskey", false),
                passkeysCount = userObj.optInt("passkeysCount", 0),
                battery = BatteryState(
                    socPercent = bat.optInt("socPercent", 78),
                    remainingRangeKm = bat.optInt("remainingRangeKm", 164),
                    capacityKwh = bat.optDouble("capacityKwh", 30.0),
                    storedKwh = bat.optDouble("storedKwh", 23.4),
                    chargingKw = bat.optDouble("chargingKw", 0.0),
                    pluggedIn = bat.optBoolean("pluggedIn", false),
                    charging = bat.optBoolean("charging", false),
                    chargeTimeRemainingMin = bat.optInt("chargeTimeRemainingMin", 0),
                    batteryHeaterOn = bat.optBoolean("batteryHeaterOn", false)
                ),
                hvac = HvacState(
                    hvacOn = hvacObj.optBoolean("hvacOn", false),
                    interiorTempC = hvacObj.optDouble("interiorTempC", 14.5),
                    targetTempC = hvacObj.optDouble("targetTempC", 21.0),
                    frontDefroster = hvacObj.optBoolean("frontDefroster", true),
                    rearDefroster = hvacObj.optBoolean("rearDefroster", false)
                ),
                doors = DoorsState(
                    locked = doorsObj.optBoolean("locked", true),
                    driverOpen = doorsObj.optBoolean("driverOpen", false),
                    passengerOpen = doorsObj.optBoolean("passengerOpen", false),
                    rearLeftOpen = doorsObj.optBoolean("rearLeftOpen", false),
                    rearRightOpen = doorsObj.optBoolean("rearRightOpen", false),
                    trunkOpen = doorsObj.optBoolean("trunkOpen", false),
                    hoodOpen = doorsObj.optBoolean("hoodOpen", false)
                ),
                windows = WindowState(
                    driverOpen = winObj.optBoolean("driverOpen", false),
                    passengerOpen = winObj.optBoolean("passengerOpen", false),
                    rearLeftOpen = winObj.optBoolean("rearLeftOpen", false),
                    rearRightOpen = winObj.optBoolean("rearRightOpen", false)
                ),
                tires = TireState(
                    frontLeftBar = tiresObj.optDouble("frontLeftBar", 2.5),
                    frontRightBar = tiresObj.optDouble("frontRightBar", 2.5),
                    rearLeftBar = tiresObj.optDouble("rearLeftBar", 2.5),
                    rearRightBar = tiresObj.optDouble("rearRightBar", 2.5)
                ),
                weather = WeatherState(
                    tempC = weatherObj.optDouble("tempC", 4.0),
                    minTempC = weatherObj.optDouble("minTempC", 0.0),
                    maxTempC = weatherObj.optDouble("maxTempC", 7.5),
                    condition = weatherObj.optString("condition", ""),
                    frostWarning = weatherObj.optBoolean("frostWarning", false),
                    heatWarning = weatherObj.optBoolean("heatWarning", false)
                ),
                actions = actions,
                places = places,
                schedules = schedules,
                trips = trips,
                charges = charges,
                weeklyStats = PeriodStats(
                    distanceKm = wkObj.optInt("distanceKm", 0),
                    kwhUsed = wkObj.optDouble("kwhUsed", 0.0),
                    kwhCharged = wkObj.optDouble("kwhCharged", 0.0),
                    avgEfficiency = wkObj.optDouble("avgEfficiency", 0.0)
                ),
                monthlyStats = PeriodStats(
                    distanceKm = moObj.optInt("distanceKm", 0),
                    kwhUsed = moObj.optDouble("kwhUsed", 0.0),
                    kwhCharged = moObj.optDouble("kwhCharged", 0.0),
                    avgEfficiency = moObj.optDouble("avgEfficiency", 0.0)
                ),
                history = history
            )
        }
    }
}
