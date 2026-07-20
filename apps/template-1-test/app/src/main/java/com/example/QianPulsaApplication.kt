package com.example

import android.app.Application
import androidx.room.Room
import com.example.data.AppDatabase
import com.example.data.TenantRepository

class QianPulsaApplication : Application() {
    lateinit var database: AppDatabase
    lateinit var repository: TenantRepository

    override fun onCreate() {
        super.onCreate()
        database = Room.databaseBuilder(
            this,
            AppDatabase::class.java,
            "qianpulsa_database"
        ).build()
        repository = TenantRepository(database.tenantDao())
    }
}
