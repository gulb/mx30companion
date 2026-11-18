package com.mazda.mx30companion.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
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

class MX30WidgetProvider : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        val api = MX30ApiClient(context)
        val cached = api.getCachedStatus()
        for (appWidgetId in appWidgetIds) {
            updateWidgetViews(context, appWidgetManager, appWidgetId, cached)
        }

        val pendingResult = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val fresh = api.fetchStatus(forceRefresh = false)
                for (appWidgetId in appWidgetIds) {
                    updateWidgetViews(context, appWidgetManager, appWidgetId, fresh)
                }
            } catch (_: Exception) {
                // Cached state already rendered
            } finally {
                pendingResult.finish()
            }
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        val action = intent.action ?: return
        if (action !in setOf(ACTION_TOGGLE_HVAC, ACTION_LOCK_DOORS, ACTION_REFRESH)) return

        val pendingResult = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            val api = MX30ApiClient(context)
            try {
                val updated = when (action) {
                    ACTION_TOGGLE_HVAC -> api.toggleHvac()
                    ACTION_LOCK_DOORS -> api.lockDoors()
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

    companion object {
        const val ACTION_TOGGLE_HVAC = "com.mazda.mx30companion.ACTION_TOGGLE_HVAC"
        const val ACTION_LOCK_DOORS = "com.mazda.mx30companion.ACTION_LOCK_DOORS"
        const val ACTION_REFRESH = "com.mazda.mx30companion.ACTION_REFRESH"

        private val TIME_FORMATTER = DateTimeFormatter.ofPattern("HH:mm")
            .withZone(ZoneId.systemDefault())

        fun notifyWidgetsChanged(context: Context, status: VehicleStatus? = null) {
            if (status != null) {
                renderAllWidgets(context, status)
                return
            }
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, MX30WidgetProvider::class.java))
            if (ids.isNotEmpty()) {
                val intent = Intent(context, MX30WidgetProvider::class.java).apply {
                    action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
                    putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
                }
                context.sendBroadcast(intent)
            }
        }

        fun renderAllWidgets(context: Context, status: VehicleStatus) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, MX30WidgetProvider::class.java))
            for (id in ids) {
                updateWidgetViews(context, manager, id, status)
            }
        }

        private fun actionPendingIntent(context: Context, action: String, reqCode: Int): PendingIntent {
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

        private fun formatShortTime(iso: String): String {
            return try {
                if (iso.isBlank()) "--:--" else TIME_FORMATTER.format(Instant.parse(iso))
            } catch (_: Exception) {
                "--:--"
            }
        }

        private fun updateWidgetViews(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetId: Int,
            status: VehicleStatus
        ) {
            val views = RemoteViews(context.packageName, R.layout.widget_mx30)

            views.setTextViewText(R.id.widget_soc, "${status.battery.socPercent}%")
            views.setTextViewText(R.id.widget_range, "${status.battery.remainingRangeKm} km")
            views.setProgressBar(R.id.widget_soc_progress, 100, status.battery.socPercent, false)
            views.setTextViewText(
                R.id.widget_cabin,
                "${status.hvac.interiorTempC}°C → ${status.hvac.targetTempC.toInt()}°C"
            )
            views.setTextViewText(
                R.id.widget_lock_badge,
                if (status.doors.locked) "LOCKED" else "UNLOCKED"
            )
            views.setTextViewText(R.id.widget_updated, formatShortTime(status.lastUpdated))

            val plugLabel = when {
                status.battery.charging -> "Charging (${status.battery.chargeTimeRemainingMin}m)"
                status.battery.pluggedIn -> "Plugged In"
                else -> "Unplugged"
            }
            val climateLabel = if (status.hvac.hvacOn) "Climate ON" else "Climate OFF"
            views.setTextViewText(R.id.widget_plug_status, "$plugLabel • $climateLabel")

            views.setTextViewText(
                R.id.widget_btn_climate,
                if (status.hvac.hvacOn) "Climate ON" else "Pre-Heat"
            )
            views.setInt(
                R.id.widget_btn_climate,
                "setBackgroundResource",
                if (status.hvac.hvacOn) R.drawable.widget_btn_active_bg else R.drawable.widget_btn_bg
            )

            val launchIntent = PendingIntent.getActivity(
                context,
                0,
                Intent(context, MainActivity::class.java),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_root, launchIntent)
            views.setOnClickPendingIntent(
                R.id.widget_btn_climate,
                actionPendingIntent(context, ACTION_TOGGLE_HVAC, 101)
            )
            views.setOnClickPendingIntent(
                R.id.widget_btn_lock,
                actionPendingIntent(context, ACTION_LOCK_DOORS, 102)
            )
            views.setOnClickPendingIntent(
                R.id.widget_btn_refresh,
                actionPendingIntent(context, ACTION_REFRESH, 103)
            )

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}
