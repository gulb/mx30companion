package com.mazda.mx30companion.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import com.mazda.mx30companion.data.MX30ApiClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class MX30Widget2x2Provider : AppWidgetProvider() {
    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        val api = MX30ApiClient(context)
        val cached = api.getCachedStatus()
        for (appWidgetId in appWidgetIds) {
            MX30WidgetProvider.renderWidget(
                context,
                appWidgetManager,
                appWidgetId,
                cached,
                MX30WidgetProvider.LayoutType.RING_2X2
            )
        }
        val pendingResult = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val fresh = api.fetchStatus(forceRefresh = false)
                MX30WidgetProvider.renderAllWidgets(context, fresh)
            } catch (_: Exception) {
                // Keep cached views
            } finally {
                pendingResult.finish()
            }
        }
    }
}
