package com.zeroloop.app

import android.util.Log
import com.zeroloop.app.db.EnergyData
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException

object SupabaseClient {

    private const val SUPABASE_URL = "https://dgzwhtjsaxuhqqjwbimm.supabase.co"
    private const val SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRnendodGpzYXh1aHFxandiaW1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2ODYyNjIsImV4cCI6MjA4NzI2MjI2Mn0.ewbIJ_wGtu3bz3OV-mcD6_5FMpYFgRVAkW0_kW_4U2A"

    private val client = OkHttpClient()
    private val json = Json { ignoreUnknownKeys = true }

    fun sendData(energyData: EnergyData): Boolean {
        return try {
            val jsonBody = json.encodeToString(energyData)
            val request = Request.Builder()
                .url("$SUPABASE_URL/rest/v1/energy_metrics")
                .post(jsonBody.toRequestBody("application/json".toMediaType()))
                .addHeader("apikey", SUPABASE_KEY)
                .addHeader("Authorization", "Bearer $SUPABASE_KEY")
                .addHeader("Prefer", "return=minimal") // To avoid getting the inserted data back
                .build()

            val response = client.newCall(request).execute()
            if (response.isSuccessful) {
                Log.d("SupabaseClient", "Successfully sent data to Supabase.")
                true
            } else {
                Log.e("SupabaseClient", "Failed to send data: ${response.code} ${response.message}")
                Log.e("SupabaseClient", "Response body: ${response.body?.string()}")
                false
            }
        } catch (e: IOException) {
            Log.e("SupabaseClient", "Error sending data to Supabase", e)
            false
        }
    }
}