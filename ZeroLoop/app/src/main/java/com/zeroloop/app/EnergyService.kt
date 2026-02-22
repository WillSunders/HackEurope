package com.zeroloop.app

import android.app.*
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import com.zeroloop.app.db.AppDatabase
import com.zeroloop.app.db.EnergyData
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*
import kotlin.math.abs

class EnergyService : Service() {

    private val handler = Handler(Looper.getMainLooper())
    private val intervalMs = 60_000L

    private val CHANNEL_ID = "zeroloop_channel"

    private val db by lazy { AppDatabase.getDatabase(this) }
    private val dao by lazy { db.energyDataDao() }
    private lateinit var powerManager: PowerManager

    companion object {
        var isRunning = false
        private val _status = MutableStateFlow("✅ Monitoring active")
        val status = _status.asStateFlow()
        private const val VOLTAGE = 3.7 // Assume a standard voltage for mWh calculation
        // More realistic fallback constants for charging estimation
        private const val FALLBACK_MA_ON = 200.0
        private const val FALLBACK_MA_OFF = 100.0
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        isRunning = true
        createNotificationChannel()
        powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("ZeroLoop")
            .setContentText("Monitoring energy usage...")
            .setSmallIcon(android.R.drawable.ic_menu_compass)
            .build()

        startForeground(1, notification)
        handler.postDelayed(energyRunnable, intervalMs)
        return START_STICKY
    }

    private val energyRunnable = object : Runnable {
        override fun run() {
            readAndCacheEnergyData()
            sendUnsentData()
            handler.postDelayed(this, intervalMs)
        }
    }

    private fun readAndCacheEnergyData() {
        val bm = getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        val batteryStatusIntent = IntentFilter(Intent.ACTION_BATTERY_CHANGED).let { this.registerReceiver(null, it) }

        val currentMicroAmps = bm.getLongProperty(BatteryManager.BATTERY_PROPERTY_CURRENT_NOW)
        val voltageMilliVolts = batteryStatusIntent?.getIntExtra(BatteryManager.EXTRA_VOLTAGE, -1)!!

        val batteryStatus = getBatteryStatus(batteryStatusIntent)
        val isScreenOn = powerManager.isInteractive
        val energyMwh: Double
        val finalState: String

        val intervalHours = intervalMs / (3600.0 * 1000.0)

        if (batteryStatus == "charging" || batteryStatus == "full") {
            // When charging, use the simple, reliable fallback constants
            val estimatedMa = if (isScreenOn) FALLBACK_MA_ON else FALLBACK_MA_OFF
            energyMwh = estimatedMa * VOLTAGE * intervalHours
            finalState = if (isScreenOn) "charging (screen on)" else "charging (screen off)"
        } else {
            // When discharging, use the direct power calculation
            val powerMw = (currentMicroAmps.toDouble() * voltageMilliVolts.toDouble()) / 1_000_000.0
            energyMwh = abs(powerMw) * intervalHours
            finalState = if (isScreenOn) "discharging (screen on)" else "discharging (screen off)"
        }

        val startTime = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault())
            .format(Date(System.currentTimeMillis() - intervalMs))

        saveDataLocally(startTime, energyMwh, finalState)
    }

    private fun getBatteryStatus(intent: Intent?): String {
        val status: Int = intent?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        return when (status) {
            BatteryManager.BATTERY_STATUS_CHARGING -> "charging"
            BatteryManager.BATTERY_STATUS_DISCHARGING -> "discharging"
            BatteryManager.BATTERY_STATUS_FULL -> "full"
            BatteryManager.BATTERY_STATUS_NOT_CHARGING -> "not charging"
            else -> "unknown"
        }
    }

    private fun saveDataLocally(startTime: String, energyMwh: Double, state: String) {
        val energyData = EnergyData(
            orgId = "my-org",
            userId = "user-123",
            deviceId = Build.MANUFACTURER.uppercase() + "_" + Build.MODEL.replace(" ", "_").uppercase(),
            startTime = startTime,
            state = state,
            durationSeconds = intervalMs / 1000,
            energyDrainedMwh = energyMwh,
            zone = "IE",
            isSent = false
        )

        CoroutineScope(Dispatchers.IO).launch {
            dao.insert(energyData)
            Log.d("EnergyService", "Saved new reading to local cache.")
        }
    }

    private fun sendUnsentData() {
        CoroutineScope(Dispatchers.IO).launch {
            val unsentData = dao.getUnsent().first()
            if (unsentData.isNotEmpty()) {
                Log.d("EnergyService", "Attempting to send ${unsentData.size} unsent records.")
                for (data in unsentData) {
                    val success = SupabaseClient.sendData(data)
                    if (success) {
                        dao.markAsSent(data.id)
                        Log.d("EnergyService", "Successfully sent record and marked as sent.")
                    }
                }
            }
        }
    }

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID, "ZeroLoop Monitoring",
            NotificationManager.IMPORTANCE_LOW
        )
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        isRunning = false
        handler.removeCallbacks(energyRunnable)
        super.onDestroy()
    }
}