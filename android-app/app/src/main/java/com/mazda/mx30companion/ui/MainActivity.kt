package com.mazda.mx30companion.ui

import android.content.ComponentName
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.service.quicksettings.TileService
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.*
import com.mazda.mx30companion.data.DeviceSessionItem
import com.mazda.mx30companion.data.MX30ApiClient
import com.mazda.mx30companion.data.UnauthorizedException
import com.mazda.mx30companion.data.VehicleStatus
import com.mazda.mx30companion.tile.MX30ClimateTileService
import com.mazda.mx30companion.widget.MX30WidgetProvider
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    private var pendingAuthCode by mutableStateOf<String?>(null)

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        extractAuthCode(intent)?.let { pendingAuthCode = it }
    }

    private fun extractAuthCode(intent: Intent?): String? {
        val data = intent?.data ?: return null
        if (data.scheme == "mx30companion" && data.host == "auth") {
            return data.getQueryParameter("code")?.takeIf { it.isNotBlank() }
        }
        return null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val api = MX30ApiClient(this)
        extractAuthCode(intent)?.let { pendingAuthCode = it }

        setContent {
            MaterialTheme(colorScheme = lightColorScheme()) {
                val scope = rememberCoroutineScope()
                var isLoggedIn by remember { mutableStateOf(api.isLoggedIn()) }
                var hasLocalPasskey by remember { mutableStateOf(api.hasLocalPasskey()) }
                var userEmail by remember { mutableStateOf(api.getUserEmail()) }
                var status by remember { mutableStateOf(api.getCachedStatus()) }
                var sessions by remember { mutableStateOf<List<DeviceSessionItem>>(emptyList()) }
                var serverUrl by remember { mutableStateOf(api.getServerUrl()) }
                var isBusy by remember { mutableStateOf(false) }
                var errorMsg by remember { mutableStateOf<String?>(null) }

                fun runCommand(action: suspend () -> VehicleStatus) {
                    scope.launch {
                        isBusy = true
                        errorMsg = null
                        try {
                            val updated = action()
                            status = updated
                            isLoggedIn = api.isLoggedIn()
                            hasLocalPasskey = api.hasLocalPasskey()
                            userEmail = api.getUserEmail()
                            errorMsg = updated.lastError
                            MX30WidgetProvider.notifyWidgetsChanged(this@MainActivity, updated)
                            TileService.requestListeningState(
                                this@MainActivity,
                                ComponentName(this@MainActivity, MX30ClimateTileService::class.java)
                            )
                        } catch (e: UnauthorizedException) {
                            api.clearAuth()
                            isLoggedIn = false
                            errorMsg = e.message
                        } catch (e: Exception) {
                            errorMsg = e.message ?: "Connection failed"
                        } finally {
                            isBusy = false
                        }
                    }
                }

                LaunchedEffect(isLoggedIn) {
                    if (isLoggedIn) {
                        runCommand { api.fetchStatus(forceRefresh = false) }
                    }
                }

                LaunchedEffect(pendingAuthCode) {
                    val code = pendingAuthCode
                    if (!code.isNullOrBlank()) {
                        pendingAuthCode = null
                        runCommand { api.exchangeAppCode(code) }
                    }
                }

                DashboardScreen(
                    isLoggedIn = isLoggedIn,
                    hasLocalPasskey = hasLocalPasskey,
                    userEmail = userEmail,
                    status = status,
                    sessions = sessions,
                    serverUrl = serverUrl,
                    isBusy = isBusy,
                    errorMessage = errorMsg,
                    onBrowserSignIn = { url ->
                        api.setServerUrl(url)
                        serverUrl = api.getServerUrl()
                        val authUri = Uri.parse("${api.getServerUrl()}/?app_callback=mx30companion://auth")
                        CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(this@MainActivity, authUri)
                    },
                    onPasskeyLogin = { url ->
                        api.setServerUrl(url)
                        serverUrl = api.getServerUrl()
                        runCommand { api.loginWithPasskey() }
                    },
                    onRegisterPasskey = {
                        runCommand { api.registerAndroidPasskey() }
                    },
                    onLogout = {
                        scope.launch {
                            api.logout()
                            isLoggedIn = false
                            sessions = emptyList()
                            hasLocalPasskey = api.hasLocalPasskey()
                            errorMsg = null
                        }
                    },
                    onToggleLang = {
                        val nextLang = if (status.lang == "en") "hu" else "en"
                        runCommand { api.setPreferences(lang = nextLang) }
                    },
                    onSelectCarColor = { color ->
                        runCommand { api.setPreferences(carColor = color) }
                    },
                    onUpdatePrivacy = { pauseLoc, confirmCmd ->
                        runCommand {
                            api.setPreferences(
                                pauseLocation = pauseLoc,
                                confirmCommands = confirmCmd
                            )
                        }
                    },
                    onRefreshSessions = {
                        scope.launch {
                            try {
                                sessions = api.fetchSessions()
                            } catch (e: UnauthorizedException) {
                                api.clearAuth()
                                isLoggedIn = false
                                errorMsg = e.message
                            } catch (_: Exception) {
                            }
                        }
                    },
                    onRevokeSession = { sessionId ->
                        scope.launch {
                            try {
                                sessions = api.revokeSession(sessionId)
                            } catch (e: Exception) {
                                errorMsg = e.message ?: "Failed to revoke session"
                            }
                        }
                    },
                    onLogoutOtherDevices = {
                        scope.launch {
                            try {
                                sessions = api.logoutOtherDevices()
                            } catch (e: Exception) {
                                errorMsg = e.message ?: "Failed to sign out other devices"
                            }
                        }
                    },
                    onOpenPrivacyPolicy = {
                        val privacyUri = Uri.parse("${api.getServerUrl()}/privacy.html")
                        CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(this@MainActivity, privacyUri)
                    },
                    onDeleteAccount = {
                        scope.launch {
                            isBusy = true
                            try {
                                api.deleteAccount()
                                isLoggedIn = false
                                sessions = emptyList()
                                hasLocalPasskey = api.hasLocalPasskey()
                                errorMsg = null
                            } catch (e: Exception) {
                                errorMsg = e.message ?: "Account deletion failed"
                            } finally {
                                isBusy = false
                            }
                        }
                    },
                    onRefresh = { runCommand { api.fetchStatus(forceRefresh = true) } },
                    onToggleHvac = { runCommand { api.toggleHvac() } },
                    onUpdateHvacSettings = { temp, front, rear ->
                        runCommand { api.updateHvacSettings(temp, front, rear) }
                    },
                    onSetCharging = { start -> runCommand { api.setCharging(start) } },
                    onLockDoors = { runCommand { api.lockDoors() } },
                    onUnlockDoors = { runCommand { api.unlockDoors() } },
                    onFlashHazards = { runCommand { api.flashHazards() } },
                    onSendPoi = { lat, lon, name -> runCommand { api.sendPoi(lat, lon, name) } },
                    onToggleSchedule = { sched ->
                        val updatedList = status.schedules.map {
                            if (it.id == sched.id) it.copy(enabled = !it.enabled) else it
                        }
                        runCommand { api.saveSchedules(updatedList) }
                    },
                    onSaveSchedules = { updatedList ->
                        runCommand { api.saveSchedules(updatedList) }
                    },
                    onSkipNextSchedule = { id -> runCommand { api.skipNextSchedule(id) } },
                    onSaveConnection = { url, region, mode ->
                        api.setServerUrl(url)
                        serverUrl = api.getServerUrl()
                        runCommand { api.saveConfig(region, mode) }
                    }
                )
            }
        }
    }
}
