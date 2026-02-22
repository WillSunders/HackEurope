package com.zeroloop.app

import android.app.AppOpsManager
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.View
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.edit
import androidx.lifecycle.lifecycleScope
import com.zeroloop.app.db.AppDatabase
import com.zeroloop.app.db.EnergyData
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.*

class MainActivity : AppCompatActivity() {

    private val handler = Handler(Looper.getMainLooper())
    private lateinit var statusText: TextView
    private lateinit var startButton: Button
    private lateinit var cachedDataText: TextView

    private val db by lazy { AppDatabase.getDatabase(this) }
    private val dao by lazy { db.energyDataDao() }
    private lateinit var prefs: SharedPreferences

    companion object {
        private const val PREFS_NAME = "zeroloop_prefs"
        private const val KEY_HISTORICAL_IMPORT_COMPLETE = "historical_import_complete"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        statusText = findViewById(R.id.statusText)
        startButton = findViewById(R.id.startButton)
        cachedDataText = findViewById(R.id.cachedDataText)
        prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

        startButton.setOnClickListener {
            toggleMonitoring()
        }

        updateUIState()
        observeCachedData()
    }

    private fun updateUIState() {
        if (EnergyService.isRunning) {
            statusText.text = "✅ Monitoring active"
            startButton.text = getString(R.string.pause_monitoring)
        } else {
            statusText.text = getString(R.string.tap_start)
            startButton.text = getString(R.string.start_monitoring)
        }
    }

    private fun toggleMonitoring() {
        val intent = Intent(this, EnergyService::class.java)
        if (EnergyService.isRunning) {
            stopService(intent)
        } else {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(intent)
            } else {
                startService(intent)
            }
        }
        handler.postDelayed({ updateUIState() }, 100)
    }

    private fun observeCachedData() {
        lifecycleScope.launch {
            dao.getAll().collectLatest { energyDataList ->
                if (energyDataList.isEmpty()) {
                    cachedDataText.text = getString(R.string.no_data)
                } else {
                    val formattedData = StringBuilder()
                    energyDataList.forEach { data ->
                        val time = data.startTime.substringAfter('T')
                        val mwh = String.format(Locale.US, "%.2f", data.energyDrainedMwh)
                        val sentStatus = if (data.isSent) "(sent)" else "(pending)"
                        formattedData.append("$time: $mwh mWh - ${data.state} $sentStatus\n")
                    }
                    cachedDataText.text = formattedData.toString()
                }
            }
        }
    }
}