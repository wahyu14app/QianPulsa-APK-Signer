package com.example.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface TenantDao {
    @Query("SELECT * FROM tenants ORDER BY id DESC")
    fun getAllTenants(): Flow<List<Tenant>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertTenant(tenant: Tenant)

    @Update
    suspend fun updateTenant(tenant: Tenant)

    @Query("DELETE FROM tenants WHERE id = :id")
    suspend fun deleteTenantById(id: Int)
}
