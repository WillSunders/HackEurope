package com.zeroloop.app.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface EnergyDataDao {
    @Insert
    suspend fun insert(energyData: EnergyData): Long

    @Query("SELECT * FROM energy_data ORDER BY isSent ASC, id DESC")
    fun getAll(): Flow<List<EnergyData>>

    @Query("SELECT * FROM energy_data WHERE isSent = 0")
    fun getUnsent(): Flow<List<EnergyData>>

    @Query("UPDATE energy_data SET isSent = 1 WHERE id = :id")
    suspend fun markAsSent(id: Int)

    @Query("DELETE FROM energy_data WHERE startTime >= :startTime AND startTime < :endTime")
    suspend fun deleteInRange(startTime: String, endTime: String)
}