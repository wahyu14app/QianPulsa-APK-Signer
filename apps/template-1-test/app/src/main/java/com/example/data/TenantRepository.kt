package com.example.data

import kotlinx.coroutines.flow.Flow

class TenantRepository(private val tenantDao: TenantDao) {
    val allTenants: Flow<List<Tenant>> = tenantDao.getAllTenants()

    suspend fun insert(tenant: Tenant) = tenantDao.insertTenant(tenant)
    suspend fun update(tenant: Tenant) = tenantDao.updateTenant(tenant)
    suspend fun deleteById(id: Int) = tenantDao.deleteTenantById(id)
}
