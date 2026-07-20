package com.example.data

import androidx.room.Database
import androidx.room.RoomDatabase

@Database(entities = [Tenant::class], version = 1, exportSchema = false)
abstract class AppDatabase : RoomDatabase() {
    abstract fun tenantDao(): TenantDao
}
