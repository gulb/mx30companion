package com.mazda.mx30companion.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mazda.mx30companion.R
import com.mazda.mx30companion.data.ScheduleItem
import com.mazda.mx30companion.data.VehicleStatus
import kotlin.math.roundToInt

// Apple iOS Light Bento Palette (Layout Plan 2)
private val BgLightTop = Color(0xFFF3F6FB)
private val BgLightBottom = Color(0xFFE7EDF6)
private val GlassWhite = Color(0xFAFFFFFF)
private val GlassSoft = Color(0xFFF8FAFC)
private val GlassBorder = Color(0xFFE2E8F0)
private val Slate900 = Color(0xFF0F172A)
private val Slate700 = Color(0xFF334155)
private val Slate500 = Color(0xFF64748B)
private val IosBlue = Color(0xFF0A84FF)
private val IosEmerald = Color(0xFF10B981)
private val IosEmeraldBg = Color(0xFFD1FAE5)
private val IosEmeraldText = Color(0xFF065F46)
private val IosAmber = Color(0xFFF59E0B)
private val IosAmberBg = Color(0xFFFEF3C7)
private val IosAmberText = Color(0xFF92400E)
private val MazdaRose = Color(0xFFE11D48)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(
    isLoggedIn: Boolean,
    hasLocalPasskey: Boolean,
    userEmail: String,
    status: VehicleStatus,
    serverUrl: String,
    isBusy: Boolean,
    errorMessage: String?,
    onBrowserSignIn: (url: String) -> Unit,
    onPasskeyLogin: (url: String) -> Unit,
    onRegisterPasskey: () -> Unit,
    onLogout: () -> Unit,
    onToggleLang: () -> Unit,
    onSelectCarColor: (String) -> Unit,
    onRefresh: () -> Unit,
    onToggleHvac: () -> Unit,
    onUpdateHvacSettings: (Double, Boolean, Boolean) -> Unit,
    onSetCharging: (Boolean) -> Unit,
    onLockDoors: () -> Unit,
    onUnlockDoors: () -> Unit,
    onFlashHazards: () -> Unit,
    onSendPoi: (Double, Double, String) -> Unit,
    onToggleSchedule: (ScheduleItem) -> Unit,
    onSaveSchedules: (List<ScheduleItem>) -> Unit,
    onSkipNextSchedule: (String) -> Unit,
    onSaveConnection: (url: String, region: String, mode: String) -> Unit
) {
    val isHu = status.lang != "en"
    var showSettings by remember { mutableStateOf(false) }
    var showPoiDialog by remember { mutableStateOf(false) }
    var showSchedulesPage by remember { mutableStateOf(false) }

    if (!isLoggedIn) {
        AuthScreen(
            initialUrl = serverUrl,
            initialLang = status.lang,
            hasLocalPasskey = hasLocalPasskey,
            isBusy = isBusy,
            errorMessage = errorMessage,
            onBrowserSignIn = onBrowserSignIn,
            onPasskeyLogin = onPasskeyLogin
        )
        return
    }

    if (showSchedulesPage) {
        SchedulesScreen(
            status = status,
            isHu = isHu,
            isBusy = isBusy,
            onBack = { showSchedulesPage = false },
            onSaveSchedules = onSaveSchedules
        )
        return
    }

    val allDoorsClosed = !status.doors.driverOpen && !status.doors.passengerOpen &&
        !status.doors.rearLeftOpen && !status.doors.rearRightOpen &&
        !status.doors.trunkOpen && !status.doors.hoodOpen
    val firstSchedule = status.schedules.firstOrNull()

    Scaffold(
        containerColor = Color.Transparent,
        modifier = Modifier.background(Brush.verticalGradient(listOf(BgLightTop, BgLightBottom))),
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color.Transparent,
                    titleContentColor = Slate900
                ),
                title = {
                    Column {
                        Text(
                            text = status.nickname,
                            fontSize = 17.sp,
                            fontWeight = FontWeight.Bold,
                            color = Slate900,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(999.dp))
                                    .background(if (status.mode == "live") IosEmeraldBg else IosAmberBg)
                                    .padding(horizontal = 7.dp, vertical = 1.dp)
                            ) {
                                Text(
                                    text = if (status.mode == "live") "LIVE" else "DEMO",
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = if (status.mode == "live") IosEmeraldText else IosAmberText
                                )
                            }
                            Text(
                                text = "${status.currentPlace} • $userEmail",
                                fontSize = 11.sp,
                                color = Slate500,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }
                },
                actions = {
                    TextButton(onClick = onToggleLang, enabled = !isBusy) {
                        Text(
                            text = if (isHu) "HU" else "EN",
                            color = IosBlue,
                            fontWeight = FontWeight.Bold
                        )
                    }
                    IconButton(onClick = onRefresh, enabled = !isBusy) {
                        Icon(Icons.Default.Refresh, contentDescription = "Sync", tint = Slate900)
                    }
                    IconButton(onClick = { showSettings = true }) {
                        Icon(Icons.Default.Settings, contentDescription = "Settings", tint = Slate900)
                    }
                }
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            contentPadding = PaddingValues(top = 4.dp, bottom = 28.dp)
        ) {
            if (isBusy) {
                item {
                    LinearProgressIndicator(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(999.dp)),
                        color = IosBlue,
                        trackColor = GlassBorder
                    )
                }
            }

            if (!errorMessage.isNullOrBlank()) {
                item {
                    IosGlassCard(
                        containerColor = Color(0xFFFFF1F2),
                        borderColor = Color(0xFFFECDD3)
                    ) {
                        Text(errorMessage, color = Color(0xFF9F1239), fontSize = 12.sp)
                    }
                }
            }

            if (!hasLocalPasskey) {
                item {
                    IosGlassCard(
                        containerColor = Color(0xFFEFF6FF),
                        borderColor = Color(0xFFBFDBFE)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Column(modifier = Modifier.weight(1f).padding(end = 8.dp)) {
                                Text(
                                    text = if (isHu) "Passkey beállítása" else "Enable 1-Tap Passkey",
                                    fontWeight = FontWeight.Bold,
                                    color = Slate900,
                                    fontSize = 13.sp
                                )
                                Text(
                                    text = if (isHu) "Mentsd el a készülékkulcsot gyors belépéshez."
                                    else "Save a hardware key for instant sign-in.",
                                    color = Slate500,
                                    fontSize = 11.sp
                                )
                            }
                            Button(
                                onClick = onRegisterPasskey,
                                enabled = !isBusy,
                                colors = ButtonDefaults.buttonColors(containerColor = IosBlue),
                                shape = RoundedCornerShape(14.dp),
                                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                            ) {
                                Text(if (isHu) "Mentés" else "Save", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }

            // 1. Next Action Island (Plan 2)
            item {
                val primaryAction = status.actions.firstOrNull()
                val isOk = status.doors.locked && allDoorsClosed &&
                    (primaryAction == null || primaryAction.severity == "ok")
                IosGlassCard {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column(modifier = Modifier.weight(1f).padding(end = 10.dp)) {
                            Text(
                                text = (if (isHu) "KÖVETKEZŐ TEENDŐ" else "NEXT ACTION"),
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 0.6.sp,
                                color = if (isOk) IosEmeraldText else IosAmberText
                            )
                            Spacer(Modifier.height(2.dp))
                            Text(
                                text = primaryAction?.title ?: if (isOk) {
                                    if (isHu) "Minden rendben • Zárva és kész" else "All OK • Locked & Ready"
                                } else {
                                    if (isHu) "Az autó nyitva van!" else "Car is unlocked!"
                                },
                                fontSize = 13.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = Slate900
                            )
                        }
                        Box(
                            modifier = Modifier
                                .size(36.dp)
                                .clip(CircleShape)
                                .background(if (isOk) IosEmeraldBg else IosAmberBg),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = if (isOk) Icons.Default.VerifiedUser else Icons.Default.LockOpen,
                                contentDescription = null,
                                tint = if (isOk) IosEmeraldText else IosAmberText,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }
                }
            }

            // 2. Top 2 Bento Squircles (Battery & Weather)
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    IosGlassCard(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "MX-30 • ${status.currentPlace}",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium,
                            color = Slate500,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Spacer(Modifier.height(4.dp))
                        Text(
                            text = "${status.battery.socPercent}%",
                            fontSize = 28.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = Slate900
                        )
                        Text(
                            text = "${status.battery.remainingRangeKm} km • ${status.battery.storedKwh} kWh",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = IosBlue
                        )
                    }

                    IosGlassCard(modifier = Modifier.weight(1f)) {
                        Text(
                            text = if (isHu) "Időjárás" else "Weather",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium,
                            color = Slate500
                        )
                        Spacer(Modifier.height(4.dp))
                        Text(
                            text = "${String.format("%.1f", status.weather.tempC)}°C",
                            fontSize = 28.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = Slate900
                        )
                        Text(
                            text = when {
                                status.weather.frostWarning -> if (isHu) "❄ Fagyveszély" else "❄ Frost Alert"
                                status.weather.heatWarning -> if (isHu) "☀ Hőség" else "☀ Heat Alert"
                                else -> status.weather.condition
                            },
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = if (status.weather.frostWarning) IosBlue else Slate700,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
            }

            // 3. Center MX-30 Spatial Car Stage (Real Photo!)
            item {
                IosGlassCard {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(999.dp))
                                .background(if (allDoorsClosed) IosEmeraldBg else IosAmberBg)
                                .padding(horizontal = 10.dp, vertical = 4.dp)
                        ) {
                            Text(
                                text = if (allDoorsClosed) {
                                    if (isHu) "Ajtók OK" else "Doors OK"
                                } else {
                                    if (isHu) "Nyitott ajtó!" else "Door Open!"
                                },
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = if (allDoorsClosed) IosEmeraldText else IosAmberText
                            )
                        }
                        Text(
                            text = "${if (isHu) "Utastér" else "Cabin"}: ${String.format("%.1f", status.hvac.interiorTempC)}°C",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Slate500
                        )
                    }

                    Spacer(Modifier.height(8.dp))

                    val carDrawable = when (status.carColor) {
                        "soul_red" -> R.drawable.mx30_soul_red
                        "polymetal_grey" -> R.drawable.mx30_polymetal_grey
                        "arctic_white" -> R.drawable.mx30_arctic_white
                        else -> R.drawable.mx30_ceramic_metallic
                    }

                    Image(
                        painter = painterResource(id = carDrawable),
                        contentDescription = "Mazda MX-30",
                        contentScale = ContentScale.Crop,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(176.dp)
                            .clip(RoundedCornerShape(18.dp))
                    )

                    Spacer(Modifier.height(8.dp))

                    // Car Color Picker Dots (syncs with web & app)
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        val colorSwatches = listOf(
                            "ceramic_metallic" to Color(0xFFD1D5DB),
                            "soul_red" to Color(0xFFB91C1C),
                            "polymetal_grey" to Color(0xFF64748B),
                            "arctic_white" to Color(0xFFF8FAFC)
                        )
                        colorSwatches.forEach { (key, swatchColor) ->
                            val selected = status.carColor == key || (status.carColor.isBlank() && key == "ceramic_metallic")
                            Surface(
                                onClick = { if (!isBusy) onSelectCarColor(key) },
                                shape = CircleShape,
                                color = swatchColor,
                                modifier = Modifier
                                    .padding(horizontal = 6.dp)
                                    .size(if (selected) 24.dp else 18.dp)
                                    .border(
                                        width = if (selected) 2.5.dp else 1.dp,
                                        color = if (selected) IosBlue else Slate500.copy(alpha = 0.4f),
                                        shape = CircleShape
                                    )
                            ) {}
                        }
                    }

                    Spacer(Modifier.height(10.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        TireMiniChip("FL", status.tires.frontLeftBar)
                        TireMiniChip("FR", status.tires.frontRightBar)
                        TireMiniChip("RL", status.tires.rearLeftBar)
                        TireMiniChip("RR", status.tires.rearRightBar)
                    }
                }
            }

            // 4. iOS Control Center Climate Bento Pill
            item {
                IosGlassCard {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column(modifier = Modifier.weight(1f).padding(end = 8.dp)) {
                            Text(
                                text = "${if (status.hvac.hvacOn) (if (isHu) "Klíma BE" else "Climate ON") else (if (isHu) "Előfűtés" else "Pre-Heat")} • ${String.format("%.1f", status.hvac.targetTempC)}°C",
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold,
                                color = Slate900
                            )
                            Text(
                                text = if (isHu) "Munkaszüneti napok kihagyva" else "Auto-skip bank holidays",
                                fontSize = 11.sp,
                                color = Slate500
                            )
                        }
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            SmallCircleStepButton("−", enabled = !isBusy) {
                                val next = (status.hvac.targetTempC - 0.5).coerceIn(15.0, 29.0)
                                onUpdateHvacSettings((next * 10.0).roundToInt() / 10.0, status.hvac.frontDefroster, status.hvac.rearDefroster)
                            }
                            SmallCircleStepButton("+", enabled = !isBusy) {
                                val next = (status.hvac.targetTempC + 0.5).coerceIn(15.0, 29.0)
                                onUpdateHvacSettings((next * 10.0).roundToInt() / 10.0, status.hvac.frontDefroster, status.hvac.rearDefroster)
                            }
                            Button(
                                onClick = onToggleHvac,
                                enabled = !isBusy,
                                shape = RoundedCornerShape(16.dp),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = if (status.hvac.hvacOn) MazdaRose else Slate900,
                                    contentColor = Color.White
                                ),
                                contentPadding = PaddingValues(horizontal = 14.dp, vertical = 8.dp)
                            ) {
                                Text(
                                    text = if (status.hvac.hvacOn) "ON" else "GO",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }
                    }
                }
            }

            // 5. 2x2 Light Squircle Control Buttons (Plan 2)
            item {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        SquircleControlTile(
                            label = if (status.doors.locked) {
                                if (isHu) "Nyitás" else "Unlock"
                            } else {
                                if (isHu) "Zárás" else "Lock"
                            },
                            icon = if (status.doors.locked) Icons.Default.Lock else Icons.Default.LockOpen,
                            active = !status.doors.locked,
                            activeColor = IosAmber,
                            enabled = !isBusy,
                            modifier = Modifier.weight(1f),
                            onClick = { if (status.doors.locked) onUnlockDoors() else onLockDoors() }
                        )
                        SquircleControlTile(
                            label = if (status.battery.charging) {
                                if (isHu) "Töltés aktív" else "Charging"
                            } else {
                                if (isHu) "Töltés indítása" else "Start Charge"
                            },
                            icon = Icons.Default.Bolt,
                            active = status.battery.charging,
                            activeColor = IosEmerald,
                            enabled = !isBusy,
                            modifier = Modifier.weight(1f),
                            onClick = { onSetCharging(!status.battery.charging) }
                        )
                    }
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        val isSkipped = firstSchedule?.skipNext == true
                        SquircleControlTile(
                            label = if (isSkipped) {
                                if (isHu) "Holnap kihagyva" else "Skipped"
                            } else {
                                if (isHu) "Holnap kihagyása" else "Skip Next"
                            },
                            icon = Icons.Default.SkipNext,
                            active = isSkipped,
                            activeColor = IosBlue,
                            enabled = !isBusy && firstSchedule != null,
                            modifier = Modifier.weight(1f),
                            onClick = { firstSchedule?.let { onSkipNextSchedule(it.id) } }
                        )
                        SquircleControlTile(
                            label = if (isHu) "Cél küldése (POI)" else "Send POI",
                            icon = Icons.Default.Place,
                            active = false,
                            activeColor = MazdaRose,
                            enabled = !isBusy,
                            modifier = Modifier.weight(1f),
                            onClick = { showPoiDialog = true }
                        )
                    }
                }
            }

            // 6. Smart Pre-Heat Pro Schedules
            item {
                IosGlassCard {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = if (isHu) "ÜTEMEZÉSEK (PRECONDITION & CHARGE)" else "SCHEDULES (PRECONDITION & CHARGE)",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 0.8.sp,
                            color = Slate500
                        )
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            TextButton(onClick = { showSchedulesPage = true }) {
                                Text(
                                    text = if (isHu) "Beállítás ›" else "Set Schedules ›",
                                    fontSize = 12.sp,
                                    color = IosBlue,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                            TextButton(onClick = onFlashHazards, enabled = !isBusy) {
                                Text(
                                    text = if (isHu) "🚨 Villogtatás" else "🚨 Flash",
                                    fontSize = 12.sp,
                                    color = MazdaRose,
                                    fontWeight = FontWeight.SemiBold
                                )
                            }
                        }
                    }
                    status.schedules.forEach { sched ->
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = "${sched.time} • ${sched.name}",
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = Slate900
                                )
                                Text(
                                    text = "${sched.targetTempC.toInt()}°C • ${if (sched.skipNext) (if (isHu) "Következő kihagyva" else "Next skipped") else (if (isHu) "Aktív" else "Active")}",
                                    fontSize = 11.sp,
                                    color = if (sched.skipNext) IosAmberText else Slate500
                                )
                            }
                            Switch(
                                checked = sched.enabled,
                                onCheckedChange = { onToggleSchedule(sched) },
                                enabled = !isBusy
                            )
                        }
                    }
                }
            }

            // 7. Real Weekly & Monthly Stats + Trip & Charge Logs
            item {
                IosGlassCard {
                    Text(
                        text = if (isHu) "STATISZTIKA & NAPLÓ" else "STATS & ACTIVITY LOGS",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 0.8.sp,
                        color = Slate500
                    )
                    Spacer(Modifier.height(10.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        StatMiniTile(
                            title = if (isHu) "Heti (7n)" else "Weekly (7d)",
                            value = "${status.weeklyStats.distanceKm} km",
                            sub = "${status.weeklyStats.kwhCharged} kWh",
                            modifier = Modifier.weight(1f)
                        )
                        StatMiniTile(
                            title = if (isHu) "Havi (30n)" else "Monthly (30d)",
                            value = "${status.monthlyStats.distanceKm} km",
                            sub = "${status.monthlyStats.kwhCharged} kWh",
                            modifier = Modifier.weight(1f)
                        )
                    }

                    Spacer(Modifier.height(12.dp))
                    Text(
                        text = if (isHu) "Legutóbbi utak" else "Recent Trips",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = Slate700
                    )
                    Spacer(Modifier.height(4.dp))
                    if (status.trips.isEmpty()) {
                        Text(
                            text = if (isHu) "Még nincs rögzített valódi út." else "No real trips recorded yet.",
                            fontSize = 12.sp,
                            color = Slate500
                        )
                    } else {
                        status.trips.take(4).forEach { trip ->
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text("${trip.fromPlace} → ${trip.toPlace}", fontSize = 12.sp, color = Slate900)
                                Text("${trip.distanceKm} km • ${trip.kwhUsed} kWh", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Slate700)
                            }
                        }
                    }

                    Spacer(Modifier.height(10.dp))
                    Text(
                        text = if (isHu) "Legutóbbi töltések" else "Recent Charges",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = Slate700
                    )
                    Spacer(Modifier.height(4.dp))
                    if (status.charges.isEmpty()) {
                        Text(
                            text = if (isHu) "Még nincs rögzített valódi töltés." else "No real charges recorded yet.",
                            fontSize = 12.sp,
                            color = Slate500
                        )
                    } else {
                        status.charges.take(4).forEach { chg ->
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text("${chg.place} (${chg.startSoc}%→${chg.endSoc}%)", fontSize = 12.sp, color = Slate900)
                                Text("+${chg.kwhAdded} kWh", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = IosEmeraldText)
                            }
                        }
                    }
                }
            }
        }
    }

    if (showPoiDialog) {
        SendPoiDialog(
            initialLat = status.latitude,
            initialLon = status.longitude,
            isHu = isHu,
            onDismiss = { showPoiDialog = false },
            onSend = { lat, lon, name ->
                showPoiDialog = false
                onSendPoi(lat, lon, name)
            }
        )
    }

    if (showSettings) {
        ConnectionSettingsDialog(
            initialUrl = serverUrl,
            initialRegion = status.region,
            initialMode = status.mode,
            isHu = isHu,
            onDismiss = { showSettings = false },
            onLogout = {
                showSettings = false
                onLogout()
            },
            onSave = { url, region, mode ->
                showSettings = false
                onSaveConnection(url, region, mode)
            }
        )
    }
}

@Composable
private fun AuthScreen(
    initialUrl: String,
    initialLang: String,
    hasLocalPasskey: Boolean,
    isBusy: Boolean,
    errorMessage: String?,
    onBrowserSignIn: (url: String) -> Unit,
    onPasskeyLogin: (url: String) -> Unit
) {
    var serverUrl by remember { mutableStateOf(initialUrl) }
    var authLang by remember { mutableStateOf(if (initialLang == "en") "en" else "hu") }
    val isHu = authLang != "en"

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Brush.verticalGradient(listOf(BgLightTop, BgLightBottom)))
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        IosGlassCard {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Mazda MX-30",
                    fontSize = 22.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = Slate900
                )
                TextButton(onClick = { authLang = if (isHu) "en" else "hu" }) {
                    Text(if (isHu) "HU → EN" else "EN → HU", color = IosBlue, fontWeight = FontWeight.Bold)
                }
            }

            Image(
                painter = painterResource(id = R.drawable.mx30_hero),
                contentDescription = "Mazda MX-30",
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(145.dp)
                    .clip(RoundedCornerShape(16.dp))
            )

            Spacer(Modifier.height(12.dp))
            Text(
                text = if (isHu) "Biztonságos Google & Passkey belépés (Chrome Custom Tabs + AES-256-GCM)"
                else "Secure Google & Passkey Sign-In (Chrome Custom Tabs + AES-256-GCM)",
                color = Slate500,
                fontSize = 12.sp
            )

            if (hasLocalPasskey) {
                Spacer(Modifier.height(14.dp))
                Button(
                    onClick = { onPasskeyLogin(serverUrl) },
                    enabled = !isBusy,
                    colors = ButtonDefaults.buttonColors(containerColor = IosBlue, contentColor = Color.White),
                    modifier = Modifier.fillMaxWidth().height(48.dp),
                    shape = RoundedCornerShape(16.dp)
                ) {
                    Icon(Icons.Default.Key, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = if (isHu) "Belépés Passkey-jel (1 koppintás)" else "Sign in with Passkey (1-Tap)",
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            Spacer(Modifier.height(14.dp))
            OutlinedTextField(
                value = serverUrl,
                onValueChange = { serverUrl = it },
                label = { Text(if (isHu) "Szerver URL" else "Server URL") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )

            if (!errorMessage.isNullOrBlank()) {
                Spacer(Modifier.height(8.dp))
                Text(errorMessage, color = MazdaRose, fontSize = 12.sp)
            }

            Spacer(Modifier.height(14.dp))
            Button(
                onClick = { onBrowserSignIn(serverUrl) },
                enabled = !isBusy,
                colors = ButtonDefaults.buttonColors(containerColor = Slate900, contentColor = Color.White),
                modifier = Modifier.fillMaxWidth().height(50.dp),
                shape = RoundedCornerShape(16.dp)
            ) {
                Icon(Icons.Default.Security, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text(
                    text = if (isHu) "Belépés Google / Passkey fiókkal" else "Sign in with Google / Passkey",
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}

@Composable
private fun IosGlassCard(
    modifier: Modifier = Modifier,
    containerColor: Color = GlassWhite,
    borderColor: Color = GlassBorder,
    content: @Composable ColumnScope.() -> Unit
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .shadow(4.dp, RoundedCornerShape(24.dp), ambientColor = Color(0x140F172A), spotColor = Color(0x140F172A))
            .clip(RoundedCornerShape(24.dp))
            .background(containerColor)
            .border(1.dp, borderColor, RoundedCornerShape(24.dp))
            .padding(14.dp),
        content = content
    )
}

@Composable
private fun TireMiniChip(label: String, bar: Double) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .clip(RoundedCornerShape(12.dp))
            .background(GlassSoft)
            .border(1.dp, GlassBorder, RoundedCornerShape(12.dp))
            .padding(horizontal = 12.dp, vertical = 6.dp)
    ) {
        Text(label, fontSize = 10.sp, color = Slate500, fontWeight = FontWeight.SemiBold)
        Text("${String.format("%.1f", bar)} bar", fontSize = 12.sp, color = Slate900, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun SmallCircleStepButton(symbol: String, enabled: Boolean, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        enabled = enabled,
        shape = CircleShape,
        color = Color.White,
        shadowElevation = 2.dp,
        modifier = Modifier.size(34.dp).border(1.dp, GlassBorder, CircleShape)
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(symbol, fontSize = 16.sp, fontWeight = FontWeight.Bold, color = Slate900)
        }
    }
}

@Composable
private fun SquircleControlTile(
    label: String,
    icon: ImageVector,
    active: Boolean,
    activeColor: Color,
    enabled: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    val bg = if (active) activeColor else GlassWhite
    val fg = if (active) Color.White else Slate900
    val border = if (active) activeColor else GlassBorder

    Surface(
        onClick = onClick,
        enabled = enabled,
        shape = RoundedCornerShape(20.dp),
        color = bg,
        shadowElevation = if (active) 4.dp else 2.dp,
        modifier = modifier
            .height(58.dp)
            .border(1.dp, border, RoundedCornerShape(20.dp))
    ) {
        Row(
            modifier = Modifier.fillMaxSize().padding(horizontal = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Icon(icon, contentDescription = label, tint = fg, modifier = Modifier.size(20.dp))
            Text(
                text = label,
                color = fg,
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@Composable
private fun StatMiniTile(title: String, value: String, sub: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(16.dp))
            .background(GlassSoft)
            .border(1.dp, GlassBorder, RoundedCornerShape(16.dp))
            .padding(10.dp)
    ) {
        Text(title, fontSize = 11.sp, color = Slate500)
        Text(value, fontSize = 17.sp, fontWeight = FontWeight.ExtraBold, color = Slate900)
        Text(sub, fontSize = 11.sp, color = Slate700)
    }
}

@Composable
private fun SendPoiDialog(
    initialLat: Double,
    initialLon: Double,
    isHu: Boolean,
    onDismiss: () -> Unit,
    onSend: (Double, Double, String) -> Unit
) {
    var name by remember { mutableStateOf("") }
    var latText by remember { mutableStateOf(initialLat.toString()) }
    var lonText by remember { mutableStateOf(initialLon.toString()) }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Color.White,
        titleContentColor = Slate900,
        textContentColor = Slate900,
        title = { Text(if (isHu) "Cél küldése autóba (POI)" else "Send POI to Car", fontWeight = FontWeight.Bold) },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text(if (isHu) "Cél neve" else "Destination name") }, singleLine = true)
                OutlinedTextField(value = latText, onValueChange = { latText = it }, label = { Text("Latitude") }, singleLine = true)
                OutlinedTextField(value = lonText, onValueChange = { lonText = it }, label = { Text("Longitude") }, singleLine = true)
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val lat = latText.toDoubleOrNull() ?: initialLat
                    val lon = lonText.toDoubleOrNull() ?: initialLon
                    onSend(lat, lon, name.ifBlank { "Destination" })
                },
                colors = ButtonDefaults.buttonColors(containerColor = IosBlue)
            ) { Text(if (isHu) "Küldés" else "Send") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(if (isHu) "Mégse" else "Cancel", color = Slate500) }
        }
    )
}

@Composable
private fun ConnectionSettingsDialog(
    initialUrl: String,
    initialRegion: String,
    initialMode: String,
    isHu: Boolean,
    onDismiss: () -> Unit,
    onLogout: () -> Unit,
    onSave: (String, String, String) -> Unit
) {
    var url by remember { mutableStateOf(initialUrl) }
    var region by remember { mutableStateOf(initialRegion.ifBlank { "MME" }) }
    var mode by remember { mutableStateOf(if (initialMode == "live") "auto" else initialMode) }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Color.White,
        titleContentColor = Slate900,
        textContentColor = Slate900,
        title = { Text(if (isHu) "Kapcsolat és Régió" else "Connection & Region", fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(value = url, onValueChange = { url = it }, label = { Text("Server URL") }, singleLine = true)
                OutlinedTextField(value = region, onValueChange = { region = it.uppercase() }, label = { Text("Region (MME / MNAO / MJO)") }, singleLine = true)
                OutlinedTextField(value = mode, onValueChange = { mode = it.lowercase() }, label = { Text("Mode (auto / demo)") }, singleLine = true)
                TextButton(onClick = onLogout) {
                    Text(if (isHu) "Kilépés" else "Sign Out", color = MazdaRose, fontWeight = FontWeight.Bold)
                }
            }
        },
        confirmButton = {
            Button(onClick = { onSave(url, region, mode) }, colors = ButtonDefaults.buttonColors(containerColor = IosBlue)) {
                Text(if (isHu) "Mentés" else "Save")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(if (isHu) "Mégse" else "Cancel", color = Slate500) }
        }
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SchedulesScreen(
    status: VehicleStatus,
    isHu: Boolean,
    isBusy: Boolean,
    onBack: () -> Unit,
    onSaveSchedules: (List<ScheduleItem>) -> Unit
) {
    var selectedType by remember { mutableStateOf("preheat") }
    var editingSchedule by remember { mutableStateOf<ScheduleItem?>(null) }
    var isNewSchedule by remember { mutableStateOf(false) }

    val filtered = status.schedules.filter { it.type == selectedType }
    val dayNames = if (isHu) listOf("V", "H", "K", "Sze", "Cs", "P", "Szo")
    else listOf("Su", "M", "T", "W", "Th", "F", "Sa")

    Scaffold(
        containerColor = Color.Transparent,
        modifier = Modifier.background(Brush.verticalGradient(listOf(BgLightTop, BgLightBottom))),
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color.Transparent,
                    titleContentColor = Slate900
                ),
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = Slate900)
                    }
                },
                title = {
                    Text(
                        text = if (isHu) "Ütemezések" else "Set Schedules",
                        fontWeight = FontWeight.Bold,
                        fontSize = 18.sp
                    )
                },
                actions = {
                    TextButton(
                        onClick = {
                            isNewSchedule = true
                            editingSchedule = ScheduleItem(
                                id = "sched-${System.currentTimeMillis()}",
                                type = selectedType,
                                name = if (selectedType == "charge") {
                                    if (isHu) "Éjszakai töltés" else "Off-Peak Charge"
                                } else {
                                    if (isHu) "Reggeli előfűtés" else "Morning Pre-Heat"
                                },
                                time = if (selectedType == "charge") "23:00" else "07:15",
                                endTime = if (selectedType == "charge") "06:00" else "",
                                repeatWeekly = true,
                                days = listOf(1, 2, 3, 4, 5),
                                locationId = "",
                                locationName = "",
                                enabled = true,
                                targetTempC = 21.0,
                                frontDefroster = true,
                                rearDefroster = false,
                                targetSocPercent = 80,
                                requirePluggedIn = selectedType == "charge",
                                skipHolidays = selectedType != "charge",
                                weatherAware = selectedType != "charge"
                            )
                        }
                    ) {
                        Text(if (isHu) "+ Új" else "+ Add", color = IosBlue, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                    }
                }
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            contentPadding = PaddingValues(top = 6.dp, bottom = 28.dp)
        ) {
            // Segmented Switcher: Precondition | Charge
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(18.dp))
                        .background(Color(0xFFE2E8F0))
                        .padding(4.dp),
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    listOf(
                        "preheat" to (if (isHu) "🔥 Előfűtés" else "🔥 Precondition"),
                        "charge" to (if (isHu) "⚡ Töltés" else "⚡ Charge")
                    ).forEach { (key, label) ->
                        val active = selectedType == key
                        Surface(
                            onClick = { selectedType = key },
                            shape = RoundedCornerShape(14.dp),
                            color = if (active) Color.White else Color.Transparent,
                            shadowElevation = if (active) 2.dp else 0.dp,
                            modifier = Modifier.weight(1f)
                        ) {
                            Box(
                                contentAlignment = Alignment.Center,
                                modifier = Modifier.padding(vertical = 10.dp)
                            ) {
                                Text(
                                    text = label,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = if (active) Slate900 else Slate500
                                )
                            }
                        }
                    }
                }
            }

            if (filtered.isEmpty()) {
                item {
                    IosGlassCard {
                        Text(
                            text = if (selectedType == "charge") {
                                if (isHu) "Még nincs beállított töltési ütemezés. Koppints a + Új gombra."
                                else "No charging schedules yet. Tap + Add to automate start/stop charging."
                            } else {
                                if (isHu) "Még nincs előfűtési ütemezés. Koppints a + Új gombra."
                                else "No precondition schedules yet. Tap + Add to schedule cabin heating."
                            },
                            color = Slate500,
                            fontSize = 13.sp
                        )
                    }
                }
            }

            items(filtered.size) { index ->
                val sched = filtered[index]
                val daysText = if (!sched.repeatWeekly) {
                    if (isHu) "Egyszeri nap" else "Single Day"
                } else {
                    sched.days.sorted().joinToString(" ") { dayNames.getOrElse(it) { "" } }
                }
                val locText = sched.locationName.ifBlank { if (isHu) "Bárhol" else "Anywhere" }
                val timeText = if (sched.type == "charge" && sched.endTime.isNotBlank()) {
                    "${sched.time} → ${sched.endTime}"
                } else {
                    sched.time
                }

                IosGlassCard {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column(modifier = Modifier.weight(1f).padding(end = 8.dp)) {
                            Text(
                                text = timeText,
                                fontSize = 22.sp,
                                fontWeight = FontWeight.ExtraBold,
                                color = Slate900
                            )
                            Text(
                                text = sched.name,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = Slate700
                            )
                            Spacer(Modifier.height(4.dp))
                            Text(
                                text = "📍 $locText • $daysText",
                                fontSize = 11.sp,
                                color = Slate500
                            )
                            if (sched.type == "preheat") {
                                Text(
                                    text = "${sched.targetTempC.toInt()}°C • ${if (sched.frontDefroster) (if (isHu) "Első páramentesítés" else "Front Defrost") else (if (isHu) "Normál" else "Standard")}",
                                    fontSize = 11.sp,
                                    color = IosBlue,
                                    fontWeight = FontWeight.Medium
                                )
                            } else {
                                Text(
                                    text = if (isHu) "Automata indítás / leállítás parancs" else "Auto Start / Stop Charge Command",
                                    fontSize = 11.sp,
                                    color = IosEmeraldText,
                                    fontWeight = FontWeight.Medium
                                )
                            }
                        }
                        Switch(
                            checked = sched.enabled,
                            enabled = !isBusy,
                            onCheckedChange = { checked ->
                                val next = status.schedules.map {
                                    if (it.id == sched.id) it.copy(enabled = checked) else it
                                }
                                onSaveSchedules(next)
                            }
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.End
                    ) {
                        TextButton(onClick = {
                            isNewSchedule = false
                            editingSchedule = sched
                        }) {
                            Text(if (isHu) "Szerkesztés" else "Edit", color = IosBlue, fontWeight = FontWeight.SemiBold)
                        }
                        TextButton(onClick = {
                            onSaveSchedules(status.schedules.filterNot { it.id == sched.id })
                        }) {
                            Text(if (isHu) "Törlés" else "Delete", color = MazdaRose, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            }
        }
    }

    editingSchedule?.let { draft ->
        ScheduleEditorDialog(
            initial = draft,
            places = status.places,
            isHu = isHu,
            onDismiss = { editingSchedule = null },
            onSave = { saved ->
                editingSchedule = null
                val next = if (isNewSchedule) {
                    status.schedules + saved
                } else {
                    status.schedules.map { if (it.id == saved.id) saved else it }
                }
                onSaveSchedules(next)
            }
        )
    }
}

@Composable
private fun ScheduleEditorDialog(
    initial: ScheduleItem,
    places: List<com.mazda.mx30companion.data.PlaceItem>,
    isHu: Boolean,
    onDismiss: () -> Unit,
    onSave: (ScheduleItem) -> Unit
) {
    var name by remember { mutableStateOf(initial.name) }
    var time by remember { mutableStateOf(initial.time) }
    var endTime by remember { mutableStateOf(initial.endTime) }
    var repeatWeekly by remember { mutableStateOf(initial.repeatWeekly) }
    var days by remember { mutableStateOf(initial.days.toSet()) }
    var locationId by remember { mutableStateOf(initial.locationId) }
    var locationName by remember { mutableStateOf(initial.locationName) }
    var targetTemp by remember { mutableStateOf(initial.targetTempC) }
    var frontDefrost by remember { mutableStateOf(initial.frontDefroster) }
    var rearDefrost by remember { mutableStateOf(initial.rearDefroster) }
    var skipHolidays by remember { mutableStateOf(initial.skipHolidays) }
    var requirePlugged by remember { mutableStateOf(initial.requirePluggedIn) }

    val dayChips = if (isHu) {
        listOf(1 to "H", 2 to "K", 3 to "Sz", 4 to "Cs", 5 to "P", 6 to "Sz", 0 to "V")
    } else {
        listOf(1 to "M", 2 to "T", 3 to "W", 4 to "T", 5 to "F", 6 to "S", 0 to "S")
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Color.White,
        titleContentColor = Slate900,
        textContentColor = Slate900,
        title = {
            Text(
                text = if (initial.type == "charge") {
                    if (isHu) "Töltési ütemezés" else "Charge Schedule"
                } else {
                    if (isHu) "Előfűtés ütemezés" else "Precondition Schedule"
                },
                fontWeight = FontWeight.Bold
            )
        },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text(if (isHu) "Név" else "Name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = time,
                        onValueChange = { time = it },
                        label = { Text(if (initial.type == "charge") (if (isHu) "Indítás" else "Start") else (if (isHu) "Időpont" else "Time")) },
                        singleLine = true,
                        modifier = Modifier.weight(1f)
                    )
                    if (initial.type == "charge") {
                        OutlinedTextField(
                            value = endTime,
                            onValueChange = { endTime = it },
                            label = { Text(if (isHu) "Leállítás (op.)" else "Stop (opt)") },
                            singleLine = true,
                            modifier = Modifier.weight(1f)
                        )
                    }
                }

                // Repeat Weekly vs Single Day
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(if (isHu) "Heti ismétlés (KI = egyszeri nap)" else "Repeat Weekly (OFF = Single Day)", fontSize = 12.sp, fontWeight = FontWeight.Medium)
                    Switch(checked = repeatWeekly, onCheckedChange = { repeatWeekly = it })
                }

                // Day selector pills
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    dayChips.forEach { (d, lbl) ->
                        val active = days.contains(d)
                        Surface(
                            onClick = {
                                days = if (!repeatWeekly) {
                                    setOf(d)
                                } else if (active && days.size > 1) {
                                    days - d
                                } else {
                                    days + d
                                }
                            },
                            shape = CircleShape,
                            color = if (active) IosBlue else GlassSoft,
                            modifier = Modifier.size(32.dp).border(1.dp, if (active) IosBlue else GlassBorder, CircleShape)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Text(lbl, fontSize = 11.sp, fontWeight = FontWeight.Bold, color = if (active) Color.White else Slate700)
                            }
                        }
                    }
                }

                // Location selector (horizontally scrollable so long place names never clip other places)
                Text(if (isHu) "Helyszín" else "Location", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Slate700)
                val locOptions = listOf("" to (if (isHu) "Bárhol" else "Anywhere")) +
                    places.map { it.id to it.name }
                LazyRow(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    items(locOptions) { (id, label) ->
                        val selected = locationId == id
                        FilterChip(
                            selected = selected,
                            onClick = {
                                locationId = id
                                locationName = if (id.isBlank()) "" else label
                            },
                            label = { Text(label, fontSize = 11.sp, maxLines = 1) }
                        )
                    }
                }

                if (initial.type == "preheat") {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text("${if (isHu) "Célhőmérséklet" else "Target Temp"}: ${String.format("%.1f", targetTemp)}°C", fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            SmallCircleStepButton("−", enabled = true) { targetTemp = (targetTemp - 0.5).coerceIn(15.0, 29.0) }
                            SmallCircleStepButton("+", enabled = true) { targetTemp = (targetTemp + 0.5).coerceIn(15.0, 29.0) }
                        }
                    }
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(if (isHu) "Első páramentesítés" else "Front Defrost", fontSize = 12.sp)
                        Switch(checked = frontDefrost, onCheckedChange = { frontDefrost = it })
                    }
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(if (isHu) "Hátsó fűtés" else "Rear Defrost", fontSize = 12.sp)
                        Switch(checked = rearDefrost, onCheckedChange = { rearDefrost = it })
                    }
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(if (isHu) "Munkaszüneti napok kihagyása" else "Skip Public Holidays", fontSize = 12.sp)
                        Switch(checked = skipHolidays, onCheckedChange = { skipHolidays = it })
                    }
                } else {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(if (isHu) "Csak csatlakoztatott töltőnél" else "Require Plugged In", fontSize = 12.sp)
                        Switch(checked = requirePlugged, onCheckedChange = { requirePlugged = it })
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val cleanTime = if (Regex("^\\d{2}:\\d{2}$").matches(time.trim())) time.trim() else initial.time
                    val cleanEnd = if (Regex("^\\d{2}:\\d{2}$").matches(endTime.trim())) endTime.trim() else ""
                    onSave(
                        initial.copy(
                            name = name.ifBlank { initial.name },
                            time = cleanTime,
                            endTime = cleanEnd,
                            repeatWeekly = repeatWeekly,
                            days = days.toList().sorted(),
                            locationId = locationId,
                            locationName = locationName,
                            targetTempC = targetTemp,
                            frontDefroster = frontDefrost,
                            rearDefroster = rearDefrost,
                            skipHolidays = skipHolidays,
                            requirePluggedIn = requirePlugged
                        )
                    )
                },
                colors = ButtonDefaults.buttonColors(containerColor = IosBlue)
            ) { Text(if (isHu) "Mentés" else "Save") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(if (isHu) "Mégse" else "Cancel", color = Slate500) }
        }
    )
}
