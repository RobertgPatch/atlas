// Feature 004 — Partnership Management wire types
// Shapes mirror contracts/partnership-management.openapi.yaml (data-model.md §3)

export type PartnershipStatus = 'ACTIVE' | 'PENDING' | 'LIQUIDATED' | 'CLOSED'

export type FmvSource = 'manager_statement' | 'valuation_409a' | 'k1' | 'manual'

export interface EntitySummary {
  id: string
  name: string
}

export interface Partnership {
  id: string
  entity: EntitySummary
  name: string
  assetClass: string | null
  status: PartnershipStatus
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface PartnershipDirectoryRow {
  id: string
  name: string
  entity: EntitySummary
  assetClass: string | null
  status: PartnershipStatus
  /** Tax year of the most recently finalized K-1; null when none exists */
  latestK1Year: number | null
  /** Reported distribution on the most recently finalized K-1; null when latestK1Year is null */
  latestDistributionUsd: number | null
  /** Latest FMV snapshot by created_at; null when no snapshot exists */
  latestFmv: { amountUsd: number; asOfDate: string; createdAt: string } | null
}

export interface PartnershipDirectoryResponse {
  rows: PartnershipDirectoryRow[]
  totals: {
    partnershipCount: number
    totalDistributionsUsd: number
    totalFmvUsd: number
  }
  page: { size: number; offset: number; total: number }
}

export interface FmvSnapshot {
  id: string
  partnershipId: string
  asOfDate: string
  amountUsd: number
  source: FmvSource
  note: string | null
  recordedByUserId: string
  recordedByEmail: string
  createdAt: string
}

export interface PartnershipDetail {
  partnership: Partnership
  kpis: {
    latestK1Year: number | null
    latestDistributionUsd: number | null
    latestFmvUsd: number | null
    cumulativeReportedDistributionsUsd: number
  }
  k1History: Array<{
    k1DocumentId: string
    taxYear: number
    processingStatus: string
    reportedDistributionUsd: number | null
    finalizedAt: string | null
  }>
  expectedDistributionHistory: Array<{
    taxYear: number
    reportedDistributionUsd: number | null
    finalizedFromK1DocumentId: string | null
  }>
  fmvSnapshots: FmvSnapshot[]
}

export interface EntityDetail {
  entity: {
    id: string
    name: string
    entityType: string
    status: string
    notes: string | null
  }
  partnerships: PartnershipDirectoryRow[]
  rollup: {
    partnershipCount: number
    totalDistributionsUsd: number
    totalFmvUsd: number
    /** MAX tax_year across scoped partnerships with a FINALIZED K-1; null if none */
    latestK1Year: number | null
  }
}

export interface CreatePartnershipRequest {
  entityId: string
  name: string
  assetClass?: string | null
  status?: PartnershipStatus
  notes?: string | null
}

export interface UpdatePartnershipRequest {
  name?: string
  assetClass?: string | null
  status?: PartnershipStatus
  notes?: string | null
}

export interface CreateFmvSnapshotRequest {
  asOfDate: string
  amountUsd: number
  source: FmvSource
  note?: string | null
}

/** Discriminated error shape for 409 duplicate-name responses */
export interface DuplicatePartnershipNameError {
  kind: 'duplicate-name'
  error: 'DUPLICATE_PARTNERSHIP_NAME'
}
