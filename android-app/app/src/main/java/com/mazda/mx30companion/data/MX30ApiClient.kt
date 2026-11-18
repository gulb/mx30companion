package com.mazda.mx30companion.data

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.nio.ByteBuffer
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.MessageDigest
import java.security.PrivateKey
import java.security.SecureRandom
import java.security.Signature
import java.security.spec.ECGenParameterSpec

class UnauthorizedException(message: String) : IllegalStateException(message)

class MX30ApiClient(context: Context) {

    private val prefs = context.applicationContext
        .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun getServerUrl(): String {
        val raw = prefs.getString(KEY_SERVER_URL, DEFAULT_SERVER_URL) ?: DEFAULT_SERVER_URL
        return raw.trim().trimEnd('/')
    }

    fun setServerUrl(url: String) {
        val normalized = url.trim().trimEnd('/').let {
            if (it.startsWith("http://") || it.startsWith("https://")) it else "http://$it"
        }
        prefs.edit().putString(KEY_SERVER_URL, normalized).apply()
    }

    fun getAuthToken(): String = prefs.getString(KEY_AUTH_TOKEN, "") ?: ""

    fun isLoggedIn(): Boolean = getAuthToken().isNotBlank()

    fun getUserEmail(): String = prefs.getString(KEY_USER_EMAIL, "") ?: ""

    fun hasLocalPasskey(): Boolean {
        val credId = prefs.getString(KEY_PASSKEY_CRED_ID, "") ?: ""
        if (credId.isBlank()) return false
        return try {
            val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
            ks.containsAlias(PASSKEY_ALIAS)
        } catch (_: Exception) {
            false
        }
    }

    fun clearAuth() {
        prefs.edit().remove(KEY_AUTH_TOKEN).apply()
    }

    fun getCachedStatus(): VehicleStatus {
        val raw = prefs.getString(KEY_CACHED_STATUS, null) ?: return VehicleStatus()
        return try {
            VehicleStatus.fromJson(JSONObject(raw))
        } catch (_: Exception) {
            VehicleStatus()
        }
    }

    private fun saveCachedStatus(json: JSONObject) {
        prefs.edit().putString(KEY_CACHED_STATUS, json.toString()).apply()
    }

    private fun b64urlEncode(bytes: ByteArray): String =
        Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)

    private suspend fun rawRequest(
        endpoint: String,
        method: String = "GET",
        body: JSONObject? = null,
        includeAuth: Boolean = true
    ): JSONObject = withContext(Dispatchers.IO) {
        val baseUrl = getServerUrl()
        val url = URL("$baseUrl$endpoint")
        val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 8000
            readTimeout = 20000
            setRequestProperty("Accept", "application/json")
            if (includeAuth) {
                val token = getAuthToken()
                if (token.isNotBlank()) {
                    setRequestProperty("Authorization", "Bearer $token")
                }
            }
            if (body != null) {
                setRequestProperty("Content-Type", "application/json")
                doOutput = true
            }
        }

        try {
            if (body != null) {
                OutputStreamWriter(conn.outputStream, Charsets.UTF_8).use { writer ->
                    writer.write(body.toString())
                }
            }

            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val text = stream?.bufferedReader()?.use(BufferedReader::readText).orEmpty()
            val parsed = JSONObject(text.ifBlank { "{}" })

            if (code == 401) {
                throw UnauthorizedException(parsed.optString("error", "Please sign in"))
            }
            if (code !in 200..299) {
                throw IllegalStateException(parsed.optString("error", "HTTP $code from $endpoint"))
            }
            parsed
        } finally {
            conn.disconnect()
        }
    }

    private suspend fun requestStatus(
        endpoint: String,
        method: String = "GET",
        body: JSONObject? = null
    ): VehicleStatus {
        val parsed = rawRequest(endpoint, method, body, includeAuth = true)
        saveCachedStatus(parsed)
        return VehicleStatus.fromJson(parsed)
    }

    suspend fun signInWithGoogle(
        email: String,
        name: String = "",
        idToken: String = "",
        lang: String = "hu"
    ): VehicleStatus {
        val payload = JSONObject()
            .put("email", email.trim())
            .put("name", name.trim())
            .put("lang", lang)
            .put("deviceName", "MX-30 Android App")
        if (idToken.isNotBlank()) {
            payload.put("idToken", idToken)
        }
        val res = rawRequest("/api/auth/google", "POST", payload, includeAuth = false)
        val token = res.optString("token", "")
        if (token.isBlank()) throw IllegalStateException("No session token received")
        val resolvedEmail = res.optJSONObject("user")?.optString("email", email.trim()) ?: email.trim()
        prefs.edit()
            .putString(KEY_AUTH_TOKEN, token)
            .putString(KEY_USER_EMAIL, resolvedEmail)
            .apply()
        return fetchStatus(forceRefresh = false)
    }

    suspend fun exchangeAppCode(code: String): VehicleStatus {
        val payload = JSONObject()
            .put("code", code.trim())
            .put("deviceName", "MX-30 Android App")
        val res = rawRequest("/api/auth/app-exchange", "POST", payload, includeAuth = false)
        val token = res.optString("token", "")
        if (token.isBlank()) throw IllegalStateException("No session token received")
        val resolvedEmail = res.optJSONObject("user")?.optString("email", "") ?: ""
        prefs.edit()
            .putString(KEY_AUTH_TOKEN, token)
            .putString(KEY_USER_EMAIL, resolvedEmail)
            .apply()
        return fetchStatus(forceRefresh = false)
    }

    suspend fun registerAndroidPasskey(deviceName: String = "Android Keystore Passkey"): VehicleStatus =
        withContext(Dispatchers.IO) {
            val opts = rawRequest("/api/auth/passkey/register/options", "POST", JSONObject(), includeAuth = true)
            val challengeId = opts.getString("challengeId")
            val pk = opts.getJSONObject("publicKey")
            val challenge = pk.getString("challenge")

            val kpg = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore")
            val spec = KeyGenParameterSpec.Builder(
                PASSKEY_ALIAS,
                KeyProperties.PURPOSE_SIGN
            )
                .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
                .setDigests(KeyProperties.DIGEST_SHA256)
                .build()
            kpg.initialize(spec)
            val kp = kpg.generateKeyPair()

            val credBytes = ByteArray(32).also { SecureRandom().nextBytes(it) }
            val credentialId = b64urlEncode(credBytes)
            val clientData = JSONObject()
                .put("type", "webauthn.create")
                .put("challenge", challenge)
                .put("origin", getServerUrl())
                .toString()
            val verifyBody = JSONObject()
                .put("challengeId", challengeId)
                .put("id", credentialId)
                .put("rawId", credentialId)
                .put("clientDataJSON", b64urlEncode(clientData.toByteArray(Charsets.UTF_8)))
                .put("publicKeySpki", b64urlEncode(kp.public.encoded))
                .put("publicKeyAlg", -7)
                .put("transports", JSONArray().put("internal"))
                .put("deviceName", deviceName)

            rawRequest("/api/auth/passkey/register/verify", "POST", verifyBody, includeAuth = true)
            prefs.edit()
                .putString(KEY_PASSKEY_CRED_ID, credentialId)
                .putInt(KEY_PASSKEY_COUNTER, 0)
                .apply()
            fetchStatus(forceRefresh = false)
        }

    suspend fun loginWithPasskey(): VehicleStatus = withContext(Dispatchers.IO) {
        val credentialId = prefs.getString(KEY_PASSKEY_CRED_ID, "") ?: ""
        if (credentialId.isBlank()) {
            throw IllegalStateException("No Passkey registered on this device yet. Sign in with Google first.")
        }
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val privateKey = (ks.getKey(PASSKEY_ALIAS, null) as? PrivateKey)
            ?: throw IllegalStateException("Android Passkey key not found — re-register with Google.")

        val optsPayload = JSONObject().put("email", getUserEmail())
        val opts = rawRequest("/api/auth/passkey/login/options", "POST", optsPayload, includeAuth = false)
        val challengeId = opts.getString("challengeId")
        val pk = opts.getJSONObject("publicKey")
        val challenge = pk.getString("challenge")
        val rpId = pk.optString("rpId", URL(getServerUrl()).host)

        val clientDataBytes = JSONObject()
            .put("type", "webauthn.get")
            .put("challenge", challenge)
            .put("origin", getServerUrl())
            .toString()
            .toByteArray(Charsets.UTF_8)

        val nextCounter = prefs.getInt(KEY_PASSKEY_COUNTER, 0) + 1
        val rpIdHash = MessageDigest.getInstance("SHA-256").digest(rpId.toByteArray(Charsets.UTF_8))
        val authData = ByteBuffer.allocate(37)
            .put(rpIdHash)
            .put(0x01.toByte()) // UP flag
            .putInt(nextCounter)
            .array()

        val clientDataHash = MessageDigest.getInstance("SHA-256").digest(clientDataBytes)
        val signer = Signature.getInstance("SHA256withECDSA").apply {
            initSign(privateKey)
            update(authData)
            update(clientDataHash)
        }
        val sigBytes = signer.sign()

        val verifyBody = JSONObject()
            .put("challengeId", challengeId)
            .put("id", credentialId)
            .put("rawId", credentialId)
            .put("clientDataJSON", b64urlEncode(clientDataBytes))
            .put("authenticatorData", b64urlEncode(authData))
            .put("signature", b64urlEncode(sigBytes))
            .put("deviceName", "Android Passkey")

        val res = rawRequest("/api/auth/passkey/login/verify", "POST", verifyBody, includeAuth = false)
        val token = res.optString("token", "")
        if (token.isBlank()) throw IllegalStateException("Passkey login did not return token")

        val resolvedEmail = res.optJSONObject("user")?.optString("email", getUserEmail()) ?: getUserEmail()
        prefs.edit()
            .putInt(KEY_PASSKEY_COUNTER, nextCounter)
            .putString(KEY_AUTH_TOKEN, token)
            .putString(KEY_USER_EMAIL, resolvedEmail)
            .apply()

        fetchStatus(forceRefresh = false)
    }

    suspend fun logout() {
        try {
            if (isLoggedIn()) {
                rawRequest("/api/auth/logout", "POST", JSONObject(), includeAuth = true)
            }
        } catch (_: Exception) {
        } finally {
            clearAuth()
        }
    }

    suspend fun fetchStatus(forceRefresh: Boolean = false): VehicleStatus {
        val endpoint = if (forceRefresh) "/api/refresh" else "/api/status"
        val method = if (forceRefresh) "POST" else "GET"
        return requestStatus(endpoint, method)
    }

    suspend fun toggleHvac(): VehicleStatus = requestStatus("/api/hvac/toggle", "POST")

    suspend fun updateHvacSettings(
        targetTempC: Double,
        frontDefroster: Boolean,
        rearDefroster: Boolean
    ): VehicleStatus {
        val payload = JSONObject()
            .put("targetTempC", targetTempC)
            .put("frontDefroster", frontDefroster)
            .put("rearDefroster", rearDefroster)
        return requestStatus("/api/hvac/settings", "POST", payload)
    }

    suspend fun setCharging(start: Boolean): VehicleStatus =
        requestStatus(if (start) "/api/charge/start" else "/api/charge/stop", "POST")

    suspend fun lockDoors(): VehicleStatus = requestStatus("/api/doors/lock", "POST")

    suspend fun unlockDoors(): VehicleStatus = requestStatus("/api/doors/unlock", "POST")

    suspend fun flashHazards(): VehicleStatus = requestStatus("/api/lights/hazard", "POST")

    suspend fun sendPoi(latitude: Double, longitude: Double, name: String): VehicleStatus {
        val payload = JSONObject()
            .put("latitude", latitude)
            .put("longitude", longitude)
            .put("name", name)
        return requestStatus("/api/poi/send", "POST", payload)
    }

    suspend fun skipNextSchedule(scheduleId: String): VehicleStatus =
        requestStatus("/api/schedules/$scheduleId/skip-next", "POST", JSONObject())

    suspend fun setPreferences(
        lang: String? = null,
        capacityKwh: Double? = null,
        carColor: String? = null
    ): VehicleStatus {
        val payload = JSONObject()
        if (lang != null) payload.put("lang", lang)
        if (capacityKwh != null) payload.put("capacityKwh", capacityKwh)
        if (carColor != null) payload.put("carColor", carColor)
        return requestStatus("/api/preferences", "POST", payload)
    }

    suspend fun saveSchedules(schedules: List<ScheduleItem>): VehicleStatus {
        val arr = JSONArray()
        schedules.forEach { s ->
            val days = JSONArray()
            s.days.forEach { days.put(it) }
            arr.put(
                JSONObject()
                    .put("id", s.id)
                    .put("type", s.type)
                    .put("name", s.name)
                    .put("time", s.time)
                    .put("endTime", s.endTime)
                    .put("repeatWeekly", s.repeatWeekly)
                    .put("days", days)
                    .put("locationId", s.locationId)
                    .put("locationName", s.locationName)
                    .put("enabled", s.enabled)
                    .put("targetTempC", s.targetTempC)
                    .put("frontDefroster", s.frontDefroster)
                    .put("rearDefroster", s.rearDefroster)
                    .put("targetSocPercent", s.targetSocPercent)
                    .put("requirePluggedIn", s.requirePluggedIn)
                    .put("skipHolidays", s.skipHolidays)
                    .put("weatherAware", s.weatherAware)
                    .put("skipNext", s.skipNext)
            )
        }
        rawRequest("/api/schedules", "POST", JSONObject().put("schedules", arr))
        return fetchStatus(forceRefresh = false)
    }

    suspend fun saveConfig(region: String, mode: String): VehicleStatus {
        val payload = JSONObject()
            .put("region", region)
            .put("mode", mode)
        return requestStatus("/api/config", "POST", payload)
    }

    companion object {
        private const val PREFS_NAME = "mx30_companion_prefs"
        private const val KEY_SERVER_URL = "server_url"
        private const val KEY_AUTH_TOKEN = "auth_token"
        private const val KEY_USER_EMAIL = "user_email"
        private const val KEY_PASSKEY_CRED_ID = "passkey_cred_id"
        private const val KEY_PASSKEY_COUNTER = "passkey_counter"
        private const val KEY_CACHED_STATUS = "cached_status_json"
        private const val PASSKEY_ALIAS = "mx30_passkey_ec"
        const val DEFAULT_SERVER_URL = "https://mx30.g-family.uk"
    }
}
