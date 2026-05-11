// Feature 004 — Partnership Management wire types
// Shapes mirror contracts/partnership-management.openapi.yaml (data-model.md §3)

export type PartnershipStatus = 'ACTIVE' | 'PENDING' | 'LIQUIDATED' | 'CLOSED'

export type FmvSource = 'manager_statement' | 'valuation_409a' | 'k1' | 'manual'

export type CommitmentStatus = 'ACTIVE' | 'INACTIVE'

export type CapitalDataSource = 'manual' | 'parsed' | 'calculated'

export type CapitalActivityEventType =
  | 'capital_call'
  | 'funded_contribution'
  | 'other_adjustment'

export type PartnershipAssetSource = 'manual' | 'imported' | 'plaid'

export type AssetFmvSource =
  | 'manual'
  | 'manager_statement'
  | 'valuation_409a'
  | 'k1'
  | 'imported'
  | 'plaid'

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
    totalCommitmentUsd: number
    totalPaidInUsd: number
    totalUnfundedUsd: number
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

export interface PartnershipCommitment {
  id: string
  entityId: string
  partnershipId: string
  commitmentAmountUsd: number
  commitmentDate: string | null
  commitmentStartDate: string | null
  commitmentEndDate: string | null
  status: CommitmentStatus
  sourceType: Exclude<CapitalDataSource, 'calculated'>
  notes: string | null
  createdByUserId: string | null
  createdByEmail: string | null
  createdAt: string
  updatedAt: string
}

export interface CapitalActivityEvent {
  id: string
  entityId: string
  partnershipId: string
  activityDate: string
  eventType: CapitalActivityEventType
  amountUsd: number
  sourceType: Exclude<CapitalDataSource, 'calculated'>
  notes: string | null
  createdByUserId: string | null
  createdByEmail: string | null
  createdAt: string
  updatedAt: string
}

export interface PartnershipCapitalOverview {
  originalCommitmentUsd: number | null
  paidInUsd: number
  percentCalled: number | null
  unfundedUsd: number | null
  reportedDistributionsUsd: number
  residualValueUsd: number | null
  dpi: number | null
  rvpi: number | null
  tvpi: number | null
  valueSources: {
    originalCommitment: Exclude<CapitalDataSource, 'calculated'> | 'none'
    paidIn: 'calculated'
    reportedDistributions: 'parsed'
    residualValue: Exclude<CapitalDataSource, 'calculated'> | 'none'
    performanceMultiples: 'calculated'
  }
}

export interface ActivityDetailRow {
  id: string
  entityId: string
  partnershipId: string
  taxYear: number
  reportedDistributionUsd: number | null
  originalCommitmentUsd: number | null
  paidInUsd: number | null
  percentCalled: number | null
  unfundedUsd: number | null
  residualValueUsd: number | null
  dpi: number | null
  rvpi: number | null
  tvpi: number | null
  sourceSignals: {
    hasK1: boolean
    hasCapitalActivity: boolean
    hasFmv: boolean
    hasManualInput: boolean
  }
  finalizedFromK1DocumentId: string | null
  createdAt: string
  updatedAt: string
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
  commitments: PartnershipCommitment[]
  capitalActivity: CapitalActivityEvent[]
  capitalOverview: PartnershipCapitalOverview
  activityDetail: ActivityDetailRow[]
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
    totalCommitmentUsd: number
    totalPaidInUsd: number
    totalUnfundedUsd: number
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

export interface CreatePartnershipCommitmentRequest {
  commitmentAmountUsd: number
  commitmentDate?: string | null
  commitmentStartDate?: string | null
  commitmentEndDate?: string | null
  status?: CommitmentStatus
  sourceType?: Exclude<CapitalDataSource, 'calculated'>
  notes?: string | null
}

export interface UpdatePartnershipCommitmentRequest {
  commitmentAmountUsd?: number
  commitmentDate?: string | null
  commitmentStartDate?: string | null
  commitmentEndDate?: string | null
  status?: CommitmentStatus
  sourceType?: Exclude<CapitalDataSource, 'calculated'>
  notes?: string | null
  expectedUpdatedAt?: string
}

export interface CreateCapitalActivityEventRequest {
  activityDate: string
  eventType: CapitalActivityEventType
  amountUsd: number
  sourceType?: Exclude<CapitalDataSource, 'calculated'>
  notes?: string | null
}

export interface UpdateCapitalActivityEventRequest {
  activityDate?: string
  eventType?: CapitalActivityEventType
  amountUsd?: number
  sourceType?: Exclude<CapitalDataSource, 'calculated'>
  notes?: string | null
}

export interface AssetFmvSnapshotPreview {
  amountUsd: number
  valuationDate: string
  source: AssetFmvSource
  confidenceLabel: string | null
  createdAt: string
}

export interface PartnershipAssetRow {
  id: string
  partnershipId: string
  name: string
  assetType: string
  sourceType: PartnershipAssetSource
  status: string
  description: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  latestFmv: AssetFmvSnapshotPreview | null
}

export interface PartnershipAssetsResponse {
  summary: {
    assetCount: number
    valuedAssetCount: number
    totalLatestAssetFmvUsd: number | null
  }
  rows: PartnershipAssetRow[]
}

export interface AssetFmvSnapshot {
  id: string
  assetId: string
  valuationDate: string
  amountUsd: number
  source: AssetFmvSource
  confidenceLabel: string | null
  note: string | null
  recordedByUserId: string | null
  recordedByEmail: string | null
  createdAt: string
}

export interface PartnershipAssetDetail {
  asset: PartnershipAssetRow
  latestFmv: AssetFmvSnapshot | null
}

export interface CreateAssetFmvSnapshotRequest {
  valuationDate: string
  amountUsd: number
  source: AssetFmvSource
  confidenceLabel?: string | null
  note?: string | null
}

export interface CreatePartnershipAssetRequest {
  name: string
  assetType: string
  description?: string | null
  notes?: string | null
  initialValuation?: CreateAssetFmvSnapshotRequest | null
}

export interface DuplicatePartnershipAssetError {
  kind: 'duplicate-asset'
  error: 'DUPLICATE_PARTNERSHIP_ASSET'
}

/** Discriminated error shape for 409 duplicate-name responses */
export interface DuplicatePartnershipNameError {
  kind: 'duplicate-name'
  error: 'DUPLICATE_PARTNERSHIP_NAME'
}
