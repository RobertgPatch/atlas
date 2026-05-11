import type { PlaidInvestmentAccount } from './plaid.js'

export type ReportView =
  | 'portfolio_summary'
  | 'asset_class_summary'
  | 'activity_detail'
  | 'consolidated_holdings'

export type ReportExportFormat = 'csv' | 'xlsx'

export type ReportDateRange = 'all' | '1y' | '3y' | '5y'

export type ReportSortDirection = 'asc' | 'desc'

export interface ReportsQueryBase {
  search?: string
  dateRange?: ReportDateRange | string
  entityType?: string
  entityId?: string
  partnershipId?: string
  taxYear?: number
  sort?: string
  direction?: ReportSortDirection
  page?: number
  pageSize?: number
}

export type HoldingsGainLossState = 'gain' | 'loss' | 'flat' | 'unknown'

export interface ConsolidatedHoldingsQuery {
  search?: string
  custodian?: string
  accountId?: string
  type?: string
  gainLossState?: HoldingsGainLossState
  sort?: 'symbol' | 'type' | 'quantity' | 'costBasis' | 'unrealizedGainLoss' | 'marketValue'
  direction?: ReportSortDirection
  page?: number
  pageSize?: number
}

export type HoldingsSyncStatus =
  | 'never_synced'
  | 'success'
  | 'partial_success'
  | 'failed'
  | 'needs_user_action'

export interface HoldingsSyncSnapshot {
  id: string
  status: 'pending' | 'success' | 'partial_success' | 'failed'
  startedAt: string
  completedAt: string | null
  errorMessage: string | null
}

export interface ConsolidatedHoldingsKpis {
  totalMarketValue: number | null
  totalCostBasis: number | null
  totalUnrealizedGainLoss: number | null
  gainLossPercent: number | null
  uniqueAssetCount: number
  selectedAccountCount: number
}

export interface CustodianHoldingDetailRow {
  id: string
  symbol: string | null
  description: string
  type: string
  custodian: string
  accountName: string
  accountMask: string | null
  quantity: number | null
  costBasis: number | null
  averageCostBasis: number | null
  unrealizedGainLoss: number | null
  gainLossPercent: number | null
  marketValue: number | null
}

export interface ConsolidatedHoldingRow {
  id: string
  symbol: string | null
  description: string
  type: string
  custodianSummary: string
  quantity: number | null
  costBasis: number | null
  averageCostBasis: number | null
  unrealizedGainLoss: number | null
  gainLossPercent: number | null
  marketValue: number | null
  identityConfidence: 'high' | 'medium' | 'low'
  details: CustodianHoldingDetailRow[]
}

export interface ConsolidatedHoldingsResponse {
  kpis: ConsolidatedHoldingsKpis
  rows: ConsolidatedHoldingRow[]
  page: {
    size: number
    offset: number
    total: number
  }
  selectedAccounts: PlaidInvestmentAccount[]
  sync: {
    status: HoldingsSyncStatus
    lastSuccessfulSyncAt: string | null
    warnings: string[]
  }
}

export interface ReportTotals {
  originalCommitmentUsd: number
  calledPct: number | null
  unfundedUsd: number
  paidInUsd: number
  distributionsUsd: number
  residualValueUsd: number
  dpi: number | null
  rvpi: number | null
  tvpi: number | null
  irr: number | null
}

export interface PortfolioSummaryKpis {
  totalCommitmentUsd: number
  totalDistributionsUsd: number
  weightedIrr: number | null
  weightedTvpi: number | null
}

export interface PortfolioCommitmentTarget {
  partnershipId: string
  commitmentId: string
  updatedAt: string
}

export interface PortfolioSummaryRowEditability {
  originalCommitmentEditable: boolean
  reason: string | null
  commitmentTarget: PortfolioCommitmentTarget | null
}

export interface PortfolioSummaryRow {
  id: string
  entityId: string
  entityName: string
  entityType: string
  /**
   * Aggregated asset class across the entity's partnerships.
   * - A single asset class name when all partnerships share one.
   * - "Mixed" when partnerships have differing asset classes.
   * - null when no asset class is set on any partnership.
   */
  assetClassSummary: string | null
  partnershipCount: number
  originalCommitmentUsd: number | null
  calledPct: number | null
  unfundedUsd: number | null
  paidInUsd: number | null
  distributionsUsd: number | null
  residualValueUsd: number | null
  dpi: number | null
  rvpi: number | null
  tvpi: number | null
  irr: number | null
  editability: PortfolioSummaryRowEditability
}

export interface PortfolioSummaryResponse {
  kpis: PortfolioSummaryKpis
  rows: PortfolioSummaryRow[]
  totals: ReportTotals
  page: {
    size: number
    offset: number
    total: number
  }
}

export interface AssetClassSummaryRow {
  id: string
  assetClass: string
  partnershipCount: number
  originalCommitmentUsd: number | null
  calledPct: number | null
  unfundedUsd: number | null
  paidInUsd: number | null
  distributionsUsd: number | null
  residualValueUsd: number | null
  dpi: number | null
  rvpi: number | null
  tvpi: number | null
  irr: number | null
}

export interface AssetClassSummaryResponse {
  rows: AssetClassSummaryRow[]
  totals: ReportTotals
}

export interface ActivityDetailSourceSignals {
  hasK1: boolean
  hasCapitalActivity: boolean
  hasFmv: boolean
  hasManualInput: boolean
}

export interface ActivityDetailRow {
  id: string
  entityId: string
  entityName: string
  partnershipId: string
  partnershipName: string
  taxYear: number
  beginningBasisUsd: number | null
  contributionsUsd: number | null
  interestUsd: number | null
  dividendsUsd: number | null
  capitalGainsUsd: number | null
  remainingK1Usd: number | null
  totalIncomeUsd: number | null
  distributionsUsd: number | null
  otherAdjustmentsUsd: number | null
  endingTaxBasisUsd: number | null
  endingGlBalanceUsd: number | null
  bookToBookAdjustmentUsd: number | null
  k1CapitalAccountUsd: number | null
  k1VsTaxDifferenceUsd: number | null
  excessDistributionUsd: number | null
  negativeBasis: boolean
  endingBasisUsd: number | null
  notes: string | null
  sourceSignals: ActivityDetailSourceSignals
  finalizedFromK1DocumentId: string | null
  updatedAt: string
}

export interface ActivityDetailResponse {
  rows: ActivityDetailRow[]
  page: {
    size: number
    offset: number
    total: number
  }
}

export interface UpdatePortfolioOriginalCommitmentRequest {
  partnershipId: string
  commitmentId: string
  commitmentAmountUsd: number
  expectedUpdatedAt?: string
}

export interface UpdateActivityDetailRowRequest {
  rowId: string
  beginningBasisUsd?: number | null
  contributionsUsd?: number | null
  otherAdjustmentsUsd?: number | null
  endingGlBalanceUsd?: number | null
  notes?: string | null
  expectedUpdatedAt?: string
}

export interface UndoActivityDetailEditRequest {
  rowId: string
}

export interface ReportExportRequest extends ReportsQueryBase {
  reportType: ReportView
  format: ReportExportFormat
}

export interface ReportConflictError {
  error: 'STALE_COMMITMENT_UPDATE'
  message?: string
}
