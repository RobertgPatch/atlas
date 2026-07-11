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

export interface TicRegistryQuery {
  status?: TicPropertyStatus
  propertyType?: TicPropertyType
  search?: string
}
