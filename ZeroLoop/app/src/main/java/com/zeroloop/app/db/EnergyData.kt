package com.zeroloop.app.db

import androidx.room.Entity
import androidx.room.PrimaryKey
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient

@OptIn(ExperimentalSerializationApi::class)
@Serializable
@Entity(tableName = "energy_data")
data class EnergyData(
    @Transient // Excluded from serialization
    @PrimaryKey(autoGenerate = true) val id: Int = 0,

    @SerialName("org_id")
    val orgId: String,
    @SerialName("user_id")
    val userId: String,
    @SerialName("device_id")
    val deviceId: String,
    @SerialName("start_time")
    val startTime: String,
    val state: String,
    @SerialName("duration_seconds")
    val durationSeconds: Long,
    @SerialName("energy_drained_mwh")
    val energyDrainedMwh: Double,
    val zone: String,

    @Transient // Excluded from serialization
    val isSent: Boolean = false
)