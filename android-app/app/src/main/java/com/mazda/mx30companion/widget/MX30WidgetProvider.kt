package com.mazda.mx30companion.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.service.quicksettings.TileService
import android.widget.RemoteViews
import com.mazda.mx30companion.R
import com.mazda.mx30companion.data.MX30ApiClient
import com.mazda.mx30companion.data.VehicleStatus
import com.mazda.mx30companion.tile.MX30ClimateTileService
import com.mazda.mx30companion.ui.MainActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlin.math.roundToInt

class MX30WidgetProvider : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        handleWidgetUpdate(context, appWidgetManager, appWidgetIds, LayoutType.CAR_4X2, goAsync())
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        val action = intent.action ?: return
        val handledActions = setOf(
            ACTION_TOGGLE_HVAC,
            ACTION_PREHEAT_ON,
            ACTION_CLIMATE_OFF,
            ACTION_LOCK_DOORS,
            ACTION_TOGGLE_CHARGE,
            ACTION_REFRESH
        )
        if (action !in handledActions) return

        val pendingResult = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            val api = MX30ApiClient(context)
            try {
                val cached = api.getCachedStatus()
                val updated = when (action) {
                    ACTION_TOGGLE_HVAC -> api.toggleHvac()
                    ACTION_PREHEAT_ON -> api.setHvacPower(true)
                    ACTION_CLIMATE_OFF -> api.setHvacPower(false)
                    ACTION_LOCK_DOORS -> api.lockDoors()
                    ACTION_TOGGLE_CHARGE -> api.setCharging(!cached.battery.charging)
                    ACTION_REFRESH -> api.fetchStatus(forceRefresh = true)
                    else -> api.fetchStatus(forceRefresh = false)
                }
                renderAllWidgets(context, updated)
                TileService.requestListeningState(
                    context,
                    ComponentName(context, MX30ClimateTileService::class.java)
                )
            } catch (_: Exception) {
                renderAllWidgets(context, api.getCachedStatus())
            } finally {
                pendingResult.finish()
            }
        }
    }

    enum class LayoutType {
        RING_2X2,
        CAR_4X2,
        STATUS_4X3,
        HERO_4X4
    }

    companion object {
        const val ACTION_TOGGLE_HVAC = "com.mazda.mx30companion.ACTION_TOGGLE_HVAC"
        const val ACTION_PREHEAT_ON = "com.mazda.mx30companion.ACTION_PREHEAT_ON"
        const val ACTION_CLIMATE_OFF = "com.mazda.mx30companion.ACTION_CLIMATE_OFF"
        const val ACTION_LOCK_DOORS = "com.mazda.mx30companion.ACTION_LOCK_DOORS"
        const val ACTION_TOGGLE_CHARGE = "com.mazda.mx30companion.ACTION_TOGGLE_CHARGE"
        const val ACTION_REFRESH = "com.mazda.mx30companion.ACTION_REFRESH"

        private val TIME_FORMATTER = DateTimeFormatter.ofPattern("HH:mm")
            .withZone(ZoneId.systemDefault())

        private fun providerMap(context: Context): List<Pair<ComponentName, LayoutType>> = listOf(
            ComponentName(context, MX30WidgetProvider::class.java) to LayoutType.CAR_4X2,
            ComponentName(context, MX30Widget2x2Provider::class.java) to LayoutType.RING_2X2,
            ComponentName(context, MX30Widget4x3Provider::class.java) to LayoutType.STATUS_4X3,
            ComponentName(context, MX30Widget4x4Provider::class.java) to LayoutType.HERO_4X4
        )

        fun handleWidgetUpdate(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetIds: IntArray,
            type: LayoutType,
            pendingResult: BroadcastReceiver.PendingResult? = null
        ) {
            val api = MX30ApiClient(context)
            val cached = api.getCachedStatus()
            for (appWidgetId in appWidgetIds) {
                renderWidget(context, appWidgetManager, appWidgetId, cached, type)
            }

            // 12V-safe background sync: never wake the car during periodic widget refreshes.
            CoroutineScope(Dispatchers.IO).launch {
                try {
                    val fresh = api.fetchStatus(forceRefresh = false)
                    renderAllWidgets(context, fresh)
                } catch (_: Exception) {
                    // Keep cached views on transient errors
                } finally {
                    pendingResult?.finish()
                }
            }
        }

        fun notifyWidgetsChanged(context: Context, status: VehicleStatus? = null) {
            if (status != null) {
                renderAllWidgets(context, status)
                return
            }
            val manager = AppWidgetManager.getInstance(context)
            val clsList = listOf(
                MX30WidgetProvider::class.java,
                MX30Widget2x2Provider::class.java,
                MX30Widget4x3Provider::class.java,
                MX30Widget4x4Provider::class.java
            )
            for (cls in clsList) {
                val ids = manager.getAppWidgetIds(ComponentName(context, cls))
                if (ids.isNotEmpty()) {
                    val intent = Intent(context, cls).apply {
                        action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
                        putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
                    }
                    context.sendBroadcast(intent)
                }
            }
        }

        fun renderAllWidgets(context: Context, status: VehicleStatus) {
            val manager = AppWidgetManager.getInstance(context)
            for ((component, type) in providerMap(context)) {
                val ids = manager.getAppWidgetIds(component)
                for (id in ids) {
                    renderWidget(context, manager, id, status, type)
                }
            }
        }

        fun renderWidget(
            context: Context,
            manager: AppWidgetManager,
            appWidgetId: Int,
            status: VehicleStatus,
            type: LayoutType
        ) {
            val views = when (type) {
                LayoutType.RING_2X2 -> build2x2Views(context, status)
                LayoutType.CAR_4X2 -> build4x2Views(context, status)
                LayoutType.STATUS_4X3 -> build4x3Views(context, status)
                LayoutType.HERO_4X4 -> build4x4Views(context, status)
            }
            manager.updateAppWidget(appWidgetId, views)
        }

        private fun build2x2Views(context: Context, status: VehicleStatus): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.widget_mx30_2x2)
            val isHu = status.lang != "en"
            val ringBitmap = drawBatteryRingBitmap(status.battery.socPercent, status.battery.charging)
            views.setImageViewBitmap(R.id.widget_ring_img, ringBitmap)
            views.setTextViewText(R.id.widget_ring_soc, "${status.battery.socPercent}%")
            views.setTextViewText(
                R.id.widget_ring_range,
                if (status.battery.charging && status.battery.chargingKw > 0.1) {
                    "${status.battery.remainingRangeKm} km · ${status.battery.chargingKw} kW"
                } else {
                    "${status.battery.remainingRangeKm} km ${if (isHu) "táv" else "EV"}"
                }
            )
            views.setOnClickPendingIntent(R.id.widget_2x2_root, openAppPendingIntent(context))
            return views
        }

        private fun build4x2Views(context: Context, status: VehicleStatus): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.widget_mx30)
            val isHu = status.lang != "en"
            val formattedTime = formatTime(status.lastUpdated)
            val updatedText = if (isHu) "Frissítve $formattedTime" else "Updated $formattedTime"
            val tempInt = status.hvac.interiorTempC.roundToInt()

            views.setTextViewText(R.id.widget_title, "Mazda MX-30")
            views.setTextViewText(R.id.widget_updated, updatedText)
            views.setTextViewText(R.id.widget_soc, "${status.battery.socPercent}")
            views.setTextViewText(
                R.id.widget_range_cabin,
                "${status.battery.remainingRangeKm} km · $tempInt °C"
            )
            views.setProgressBar(R.id.widget_soc_progress, 100, status.battery.socPercent, false)
            views.setImageViewResource(R.id.widget_car_img, carWidgetDrawableRes(status.carColor))

            // Button highlights + tints
            views.setInt(
                R.id.widget_btn_lock,
                "setBackgroundResource",
                if (status.doors.locked) R.drawable.widget_btn_bg else R.drawable.widget_btn_warm
            )
            views.setInt(
                R.id.widget_btn_lock_icon,
                "setColorFilter",
                Color.parseColor(if (status.doors.locked) "#4ADE80" else "#FBBF24")
            )
            views.setInt(
                R.id.widget_btn_climate,
                "setBackgroundResource",
                if (status.hvac.hvacOn) R.drawable.widget_btn_warm else R.drawable.widget_btn_bg
            )
            views.setInt(
                R.id.widget_btn_charge,
                "setBackgroundResource",
                if (status.battery.charging) R.drawable.widget_btn_cool else R.drawable.widget_btn_bg
            )

            views.setOnClickPendingIntent(R.id.widget_root, openAppPendingIntent(context))
            views.setOnClickPendingIntent(R.id.widget_btn_lock, broadcastAction(context, ACTION_LOCK_DOORS, 11))
            views.setOnClickPendingIntent(R.id.widget_btn_climate, broadcastAction(context, ACTION_TOGGLE_HVAC, 12))
            views.setOnClickPendingIntent(R.id.widget_btn_charge, broadcastAction(context, ACTION_TOGGLE_CHARGE, 13))
            views.setOnClickPendingIntent(R.id.widget_btn_refresh, broadcastAction(context, ACTION_REFRESH, 14))
            return views
        }

        private fun build4x3Views(context: Context, status: VehicleStatus): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.widget_mx30_4x3)
            val isHu = status.lang != "en"
            val formattedTime = formatTime(status.lastUpdated)
            val allClosed = !status.doors.driverOpen && !status.doors.passengerOpen &&
                !status.doors.rearLeftOpen && !status.doors.rearRightOpen &&
                !status.doors.trunkOpen && !status.doors.hoodOpen &&
                !status.windows.driverOpen && !status.windows.passengerOpen
            val lockLabel = if (status.doors.locked) {
                if (isHu) "Zárva" else "Locked"
            } else {
                if (isHu) "Nyitva" else "Unlocked"
            }
            val lockSub = if (allClosed) {
                if (isHu) "minden zárva" else "all closed"
            } else {
                if (isHu) "ajtó/ablak nyitva" else "door/window open"
            }
            val chargeVal = when {
                status.battery.charging -> {
                    val kw = if (status.battery.chargingKw > 0.1) " · ${status.battery.chargingKw} kW" else ""
                    (if (isHu) "Töltés aktív" else "Charging") + kw
                }
                status.battery.pluggedIn -> if (isHu) "Csatlakoztatva" else "Plugged in"
                else -> if (isHu) "Nincs bedugva" else "Unplugged"
            }
            val hvacTemp = status.hvac.interiorTempC.roundToInt()
            val hvacVal = if (status.hvac.hvacOn) {
                if (isHu) "Aktív · ${status.hvac.targetTempC.roundToInt()} °C" else "On · ${status.hvac.targetTempC.roundToInt()} °C"
            } else {
                if (isHu) "$hvacTemp °C · Ki" else "$hvacTemp °C · Off"
            }
            val nextSched = status.schedules.firstOrNull { it.enabled }
            val statusText = nextSched?.let { "${it.time} · ${it.name}" }
                ?: if (isHu) "Minden rendben" else "All systems OK"

            views.setTextViewText(R.id.widget_4x3_title, "Mazda MX-30")
            views.setTextViewText(R.id.widget_4x3_updated, if (isHu) "Frissítve $formattedTime" else "Updated $formattedTime")
            views.setTextViewText(R.id.widget_4x3_lock_label, lockLabel)
            views.setTextViewText(R.id.widget_4x3_lock_val, lockSub)
            views.setInt(
                R.id.widget_4x3_lock_icon,
                "setColorFilter",
                Color.parseColor(if (status.doors.locked && allClosed) "#4ADE80" else "#FBBF24")
            )
            views.setTextViewText(R.id.widget_4x3_bat_label, if (isHu) "Akkumulátor" else "Battery")
            views.setTextViewText(R.id.widget_4x3_bat_val, "${status.battery.socPercent}% · ${status.battery.remainingRangeKm} km")
            views.setTextViewText(R.id.widget_4x3_charge_label, if (isHu) "Töltés" else "Charging")
            views.setTextViewText(R.id.widget_4x3_charge_val, chargeVal)
            views.setTextViewText(R.id.widget_4x3_climate_label, if (isHu) "Klíma" else "Climate")
            views.setTextViewText(R.id.widget_4x3_climate_val, hvacVal)
            views.setTextViewText(R.id.widget_4x3_loc_label, if (isHu) "Helyzet" else "Location")
            views.setTextViewText(R.id.widget_4x3_loc_val, status.currentPlace)
            views.setTextViewText(R.id.widget_4x3_status_label, if (nextSched != null) (if (isHu) "Ütemezés" else "Schedule") else (if (isHu) "Állapot" else "Status"))
            views.setTextViewText(R.id.widget_4x3_status_val, statusText)

            views.setOnClickPendingIntent(R.id.widget_4x3_root, openAppPendingIntent(context))
            views.setOnClickPendingIntent(R.id.widget_4x3_refresh, broadcastAction(context, ACTION_REFRESH, 21))
            return views
        }

        private fun build4x4Views(context: Context, status: VehicleStatus): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.widget_mx30_4x4)
            val isHu = status.lang != "en"
            val formattedTime = formatTime(status.lastUpdated)
            val tempInt = status.hvac.interiorTempC.roundToInt()
            val allClosed = !status.doors.driverOpen && !status.doors.passengerOpen &&
                !status.doors.rearLeftOpen && !status.doors.rearRightOpen &&
                !status.doors.trunkOpen && !status.doors.hoodOpen

            views.setTextViewText(R.id.widget_4x4_title, "Mazda MX-30")
            views.setTextViewText(
                R.id.widget_4x4_sub,
                (if (isHu) "Frissítve $formattedTime" else "Updated $formattedTime") + " · ${status.currentPlace}"
            )
            views.setTextViewText(R.id.widget_4x4_soc, "${status.battery.socPercent}")
            views.setImageViewResource(R.id.widget_4x4_car_img, carWidgetDrawableRes(status.carColor))

            views.setTextViewText(R.id.widget_4x4_range, "${status.battery.remainingRangeKm} km")
            views.setTextViewText(R.id.widget_4x4_range_sub, if (isHu) "EV hatótáv" else "EV range")

            views.setTextViewText(R.id.widget_4x4_cabin, "$tempInt °C")
            views.setTextViewText(
                R.id.widget_4x4_cabin_sub,
                if (status.hvac.hvacOn) (if (isHu) "klíma · Aktív" else "cabin · On")
                else (if (isHu) "utastér · Ki" else "cabin · Off")
            )

            views.setTextViewText(
                R.id.widget_4x4_lock_state,
                if (status.doors.locked) (if (isHu) "Zárva" else "Locked") else (if (isHu) "Nyitva" else "Unlocked")
            )
            views.setTextColor(
                R.id.widget_4x4_lock_state,
                Color.parseColor(if (status.doors.locked) "#4ADE80" else "#FBBF24")
            )
            views.setTextViewText(
                R.id.widget_4x4_lock_sub,
                if (allClosed) (if (isHu) "minden zárva" else "all closed") else (if (isHu) "ajtó nyitva" else "door open")
            )

            // Localized button captions & active states
            views.setTextViewText(R.id.widget_4x4_lbl_lock, if (isHu) "Zárás" else "Lock")
            views.setTextViewText(R.id.widget_4x4_lbl_warmup, if (isHu) "Fűtés" else "Warm-up")
            views.setTextViewText(R.id.widget_4x4_lbl_charge, if (isHu) "Töltés" else "Charge")
            views.setTextViewText(R.id.widget_4x4_lbl_hvac_off, if (isHu) "Klíma ki" else "Climate off")
            views.setTextViewText(R.id.widget_4x4_lbl_refresh, if (isHu) "Frissít" else "Refresh")

            views.setInt(
                R.id.widget_4x4_btn_lock_icon,
                "setColorFilter",
                Color.parseColor(if (status.doors.locked) "#4ADE80" else "#FBBF24")
            )
            views.setInt(
                R.id.widget_4x4_btn_warmup,
                "setBackgroundResource",
                if (status.hvac.hvacOn) R.drawable.widget_btn_warm else R.drawable.widget_btn_bg
            )
            views.setInt(
                R.id.widget_4x4_btn_charge,
                "setBackgroundResource",
                if (status.battery.charging) R.drawable.widget_btn_cool else R.drawable.widget_btn_bg
            )

            views.setOnClickPendingIntent(R.id.widget_4x4_root, openAppPendingIntent(context))
            views.setOnClickPendingIntent(R.id.widget_4x4_btn_lock, broadcastAction(context, ACTION_LOCK_DOORS, 31))
            views.setOnClickPendingIntent(R.id.widget_4x4_btn_warmup, broadcastAction(context, ACTION_PREHEAT_ON, 32))
            views.setOnClickPendingIntent(R.id.widget_4x4_btn_charge, broadcastAction(context, ACTION_TOGGLE_CHARGE, 33))
            views.setOnClickPendingIntent(R.id.widget_4x4_btn_hvac_off, broadcastAction(context, ACTION_CLIMATE_OFF, 34))
            views.setOnClickPendingIntent(R.id.widget_4x4_btn_refresh, broadcastAction(context, ACTION_REFRESH, 35))
            return views
        }

        private fun drawBatteryRingBitmap(socPercent: Int, charging: Boolean): Bitmap {
            val size = 280
            val stroke = 24f
            val pad = stroke / 2f + 8f
            val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)
            val oval = RectF(pad, pad, size - pad, size - pad)

            val trackPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.STROKE
                strokeWidth = stroke
                color = Color.parseColor("#2E3742")
            }
            canvas.drawArc(oval, 0f, 360f, false, trackPaint)

            val ringColor = when {
                charging -> Color.parseColor("#38BDF8")
                socPercent <= 20 -> Color.parseColor("#F59E0B")
                else -> Color.parseColor("#1CE068")
            }
            val arcPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.STROKE
                strokeWidth = stroke
                strokeCap = Paint.Cap.ROUND
                color = ringColor
            }
            val sweep = (socPercent.coerceIn(0, 100) / 100f) * 360f
            if (sweep > 0f) {
                canvas.drawArc(oval, -90f, sweep, false, arcPaint)
            }
            return bitmap
        }

        private fun carWidgetDrawableRes(carColor: String): Int = when (carColor) {
            "soul_red" -> R.drawable.mx30_w_soul_red
            "polymetal_grey" -> R.drawable.mx30_w_polymetal_grey
            "arctic_white" -> R.drawable.mx30_w_arctic_white
            else -> R.drawable.mx30_w_ceramic_metallic
        }

        private fun formatTime(iso: String): String = try {
            TIME_FORMATTER.format(Instant.parse(iso))
        } catch (_: Exception) {
            "--:--"
        }

        private fun broadcastAction(context: Context, action: String, reqCode: Int): PendingIntent {
            val intent = Intent(context, MX30WidgetProvider::class.java).apply {
                this.action = action
            }
            return PendingIntent.getBroadcast(
                context,
                reqCode,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }

        private fun openAppPendingIntent(context: Context): PendingIntent {
            val intent = Intent(context, MainActivity::class.java)
            return PendingIntent.getActivity(
                context,
                100,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }
    }
}
