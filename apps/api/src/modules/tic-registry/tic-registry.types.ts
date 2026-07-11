import type { Pool, PoolClient } from 'pg'

export type TicPropertyType =
  | 'multifamily'
  | 'retail'
  | 'office'
  | 'industrial'
  | 'self_storage'
  | 'hospitality'
  | 'land'
  | 'mixed_use'
  | 'other'

export type TicPropertyStatus = 'held' | 'under_contract' | 'sold'
export type TicInterestStatus = 'active' | 'rolled' | 'exited'
export type TicAcquisitionOrigin = 'cash' | 'exchange'

export type TicOwnerType =
  | 'individual'
  | 'llc'
  | 'trust'
  | 'partnership'
  | 's_corp'
  | 'ira'
  | 'other'

export type TicAllocationState = 'ok' | 'under' | 'over'

export interface TicAllocationStatus {
  status: TicAllocationState
  allocatedPercentage: number
  message: string
}

export interface TicOwner {
  id: string
  ticInterestId: string
  name: string
  ownerType: TicOwnerType
  ticPercentage: number
  effectivePropertyPercentage: number
  createdAt: string
  updatedAt: string
}

export interface TicInterest {
  id: string
  propertyId: string
  name: string
  propertyPercentage: number
  status: TicInterestStatus
  acquisitionOrigin: TicAcquisitionOrigin
  relinquishedInterestId: string | null
  relinquishedSourceName: string | null
  relinquishedSourceLabel: string | null
  acquisitionDate: string | null
  acquisitionValueUsd: number | null
  notes: string | null
  allocation: TicAllocationStatus
  owners: TicOwner[]
  createdAt: string
  updatedAt: string
}

export interface TicProperty {
  id: string
  name: string
  propertyType: TicPropertyType
  status: TicPropertyStatus
  acquiredDate: string | null
  estimatedValueUsd: number | null
  notes: string | null
  allocation: TicAllocationStatus
  interests: TicInterest[]
  createdAt: string
  updatedAt: string
}

export interface TicRegistrySummary {
  propertyCount: number
  ticInterestCount: number
  ownerCount: number
  estimatedHeldValueUsd: number
  underAllocatedPropertyCount: number
  overAllocatedPropertyCount: number
  underAllocatedInterestCount: number
  overAllocatedInterestCount: number
}

export interface TicRegistryResponse {
  summary: TicRegistrySummary
  properties: TicProperty[]
}

export interface TicRegistryQuery {
  status?: TicPropertyStatus
  propertyType?: TicPropertyType
  search?: string
}

export interface CreateTicPropertyRequest {
  name: string
  propertyType: TicPropertyType
  status?: TicPropertyStatus
  acquiredDate?: string | null
  estimatedValueUsd?: number | null
  notes?: string | null
}

export interface UpdateTicPropertyRequest {
  name?: string
  propertyType?: TicPropertyType
  status?: TicPropertyStatus
  acquiredDate?: string | null
  estimatedValueUsd?: number | null
  notes?: string | null
  expectedUpdatedAt?: string
}

export interface CreateTicInterestRequest {
  name: string
  propertyPercentage: number
  status?: TicInterestStatus
  acquisitionOrigin: TicAcquisitionOrigin
  relinquishedInterestId?: string | null
  relinquishedSourceName?: string | null
  acquisitionDate?: string | null
  acquisitionValueUsd?: number | null
  notes?: string | null
}

export interface UpdateTicInterestRequest {
  name?: string
  propertyPercentage?: number
  status?: TicInterestStatus
  acquisitionOrigin?: TicAcquisitionOrigin
  relinquishedInterestId?: string | null
  relinquishedSourceName?: string | null
  acquisitionDate?: string | null
  acquisitionValueUsd?: number | null
  notes?: string | null
  expectedUpdatedAt?: string
}

export interface CreateTicOwnerRequest {
  name: string
  ownerType: TicOwnerType
  ticPercentage: number
}

export interface UpdateTicOwnerRequest {
  name?: string
  ownerType?: TicOwnerType
  ticPercentage?: number
  expectedUpdatedAt?: string
}

export type TicRegistryScope = {
  isAdmin: boolean
}

export type Queryable = Pool | PoolClient

export interface TicPropertyRow {
  id: string
  name: string
  property_type: TicPropertyType
  status: TicPropertyStatus
  acquired_date: Date | string | null
  estimated_value_usd: string | number | null
  notes: string | null
  created_at: Date | string
  updated_at: Date | string
}

export interface TicInterestRow {
  id: string
  property_id: string
  name: string
  property_percentage: string | number
  status: TicInterestStatus
  acquisition_origin: TicAcquisitionOrigin
  relinquished_interest_id: string | null
  relinquished_source_name: string | null
  relinquished_source_label: string | null
  acquisition_date: Date | string | null
  acquisition_value_usd: string | number | null
  notes: string | null
  created_at: Date | string
  updated_at: Date | string
}

export interface TicOwnerRow {
  id: string
  tic_interest_id: string
  name: string
  owner_type: TicOwnerType
  tic_percentage: string | number
  created_at: Date | string
  updated_at: Date | string
}

export type TicRegistryRepositoryError =
  | 'DATABASE_REQUIRED'
  | 'TIC_PROPERTY_NOT_FOUND'
  | 'TIC_INTEREST_NOT_FOUND'
  | 'TIC_OWNER_NOT_FOUND'
  | 'TIC_SOURCE_NOT_FOUND'
  | 'INVALID_EXCHANGE_SOURCE'
  | 'STALE_TIC_UPDATE'

export class TicRegistryError extends Error {
  constructor(public readonly code: TicRegistryRepositoryError) {
    super(code)
  }
}
