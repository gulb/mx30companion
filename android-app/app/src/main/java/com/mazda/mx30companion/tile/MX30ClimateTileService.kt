package com.mazda.mx30companion.tile

import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import com.mazda.mx30companion.data.MX30ApiClient
import com.mazda.mx30companion.data.VehicleStatus
import com.mazda.mx30companion.widget.MX30WidgetProvider
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

class MX30ClimateTileService : TileService() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onStartListening() {
        super.onStartListening()
        val api = MX30ApiClient(this)
        applyTileState(api.getCachedStatus())

        scope.launch {
            try {
                val fresh = api.fetchStatus(forceRefresh = false)
                applyTileState(fresh)
            } catch (_: Exception) {
                // Keep cached tile state when server is temporarily unreachable
            }
        }
    }

    override fun onClick() {
        super.onClick()
        val api = MX30ApiClient(this)
        val optimisticOn = !api.getCachedStatus().hvac.hvacOn
        qsTile?.apply {
            state = if (optimisticOn) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
            updateTile()
        }

        scope.launch {
            try {
                val updated = api.toggleHvac()
                applyTileState(updated)
                MX30WidgetProvider.notifyWidgetsChanged(this@MX30ClimateTileService, updated)
            } catch (_: Exception) {
                applyTileState(api.getCachedStatus())
            }
        }
    }

    private fun applyTileState(status: VehicleStatus) {
        val tile = qsTile ?: return
        tile.label = "MX-30 Climate"
        tile.state = if (status.hvac.hvacOn) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val hvacWord = if (status.hvac.hvacOn) "ON" else "OFF"
            val tempDisplay = if (status.hvac.hvacOn) {
                status.hvac.targetTempC.toInt()
            } else {
                status.hvac.interiorTempC
            }
            tile.subtitle = "$hvacWord • ${tempDisplay}°C (${status.battery.socPercent}%)"
        }
        tile.updateTile()
    }

    override fun onDestroy() {
        super.onDestroy()
        scope.cancel()
    }
}
