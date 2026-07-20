package com.example.data

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "tenants")
data class Tenant(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val name: String,
    val packageName: String,
    val keystoreBase64: String? = null,
    val lastBuildTime: Long = 0,
    val lastBuildStatus: String = "Not Built"
)
