import type {
  K1TrackerCalculation,
  K1TrackerCashFlowEvent,
  K1TrackerFieldChange,
  K1TrackerOfficialFormData,
  K1TrackerPartnershipDetail,
  K1TrackerSignoffState,
  K1TrackerWorkflowStatus,
  K1TrackerYearDetail,
  K1TrackerYearSummary,
} from './k1-tracker.js'
import type { PartnershipStatus } from './partnership-management.js'

export const PARTNERSHIP_TYPES = [
  'Private Equity',
  'Real Estate',
  'Hedge Fund',
  'Venture Capital',
  'Credit',
  'Infrastructure',
  'JSP',
  'Other',
] as const

export type PartnershipType = (typeof PARTNERSHIP_TYPES)[number]
export type PartnershipTrackerMoney = string
export type PartnershipTrackerRatio = string
export const PARTNERSHIP_TRACKER_METRIC_AVAILABILITY = [
  'AVAILABLE',
  'MISSING_CONTRIBUTIONS',
  'MISSING_DISTRIBUTIONS',
  'MISSING_NAV',
  'MISSING_INCEPTION_DATE',
  'MISSING_COMMITMENT',
  'INSUFFICIENT_HOLDING_PERIOD',
  'NAV_PRECEDES_CASH_FLOWS',
  'INSUFFICIENT_CASH_FLOWS',
  'AMBIGUOUS_IRR',
] as const
export type PartnershipTrackerMetricAvailability = (typeof PARTNERSHIP_TRACKER_METRIC_AVAILABILITY)[number]
export interface PartnershipTrackerPerformanceStatus {
  dpi: PartnershipTrackerMetricAvailability
  tvpi: PartnershipTrackerMetricAvailability
  irr: PartnershipTrackerMetricAvailability
  annualizedCashOnCashYield: PartnershipTrackerMetricAvailability
  unfundedCommitment: PartnershipTrackerMetricAvailability
}
export type PartnershipTrackerWorkflowStatus =
  | Exclude<K1TrackerWorkflowStatus, 'IMPORTED'>
  | 'IN_PROGRESS'

export interface PartnershipTrackerIdentity {
  id: string
  aggregationGroupId?: string
  entity: { id: string; name: string }
  name: string
  partnershipType: PartnershipType
  status: PartnershipStatus
  notes: string | null
  inceptionDate: string | null
  managementFeeRate: PartnershipTrackerRatio | null
  ein: string | null
  fundManager: string | null
  addressLine1: string | null
  addressLine2: string | null
  addressCity: string | null
  addressRegion: string | null
  addressPostalCode: string | null
  addressCountry: string | null
  createdAt: string
  updatedAt: string
}

export interface PartnershipTrackerDatedMoney {
  amount: PartnershipTrackerMoney
  date: string
}

export interface PartnershipTrackerSummary {
  partnership: PartnershipTrackerIdentity
  currentCommittedCapital: PartnershipTrackerDatedMoney | null
  latestNav: PartnershipTrackerDatedMoney | null
  earliestK1Year: number | null
  latestTaxYear: number | null
  latestWorkflowStatus: PartnershipTrackerWorkflowStatus | null
  latestEndingOutsideBasis: PartnershipTrackerMoney | null
  latestSectionLCapital: PartnershipTrackerMoney | null
  totalCapitalContributions: PartnershipTrackerMoney | null
  totalDistributions: PartnershipTrackerMoney | null
  totalRecallableDistributions: PartnershipTrackerMoney
  dpi: string | null
  tvpi: string | null
  irr: string | null
  irrTerminalDate: string | null
  irrUsesCarriedForwardNav: boolean
  annualizedCashOnCashYield: PartnershipTrackerRatio | null
  performanceAsOfDate: string
  unfundedCommitmentAmount: PartnershipTrackerMoney | null
  unfundedCommitmentPercentage: PartnershipTrackerRatio | null
  performanceStatus: PartnershipTrackerPerformanceStatus
  simplifiedIrr: PartnershipTrackerRatio | null
  displayIrr: PartnershipTrackerRatio | null
  irrType: 'XIRR' | 'SIMPLIFIED' | null
  vintageYear: number | null
  warningCount: number
}

export interface PartnershipCommitmentEntry {
  id: string
  partnershipId: string
  amount: PartnershipTrackerMoney
  effectiveDate: string
  sourceType: 'manual' | 'parsed'
  isCurrent: boolean
  sourceCashFlowEventId: string | null
  note: string | null
  createdAt: string
  updatedAt: string
}

export const PARTNERSHIP_NAV_SOURCES = [
  'manager_statement',
  'valuation_409a',
  'k1',
  'manual',
] as const

export type PartnershipNavSource = (typeof PARTNERSHIP_NAV_SOURCES)[number]

export interface PartnershipNavEntry {
  id: string
  partnershipId: string
  amount: PartnershipTrackerMoney
  valuationDate: string
  sourceType: PartnershipNavSource
  note: string | null
  createdAt: string
  updatedAt: string
}

export interface PartnershipTrackerPermissions {
  canEditPartnership: boolean
  canEditK1: boolean
  canEditCommitment: boolean
  canEditNav: boolean
  canSignoff: boolean
}

export interface PartnershipTrackerDetail {
  summary: PartnershipTrackerSummary
  years: K1TrackerYearSummary[]
  cashFlowEvents: K1TrackerCashFlowEvent[]
  commitments: PartnershipCommitmentEntry[]
  navEntries: PartnershipNavEntry[]
  permissions: PartnershipTrackerPermissions
}

export interface PartnershipTrackerListResponse {
  items: PartnershipTrackerSummary[]
  total: number
  nextCursor: string | null
}

export const PARTNERSHIP_AGGREGATION_WORKFLOWS = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'NEEDS_REVIEW',
  'RECONCILED',
  'NO_K1_YEAR',
] as const
export type PartnershipAggregationWorkflow = (typeof PARTNERSHIP_AGGREGATION_WORKFLOWS)[number]

export const PARTNERSHIP_DATA_QUALITIES = ['COMPLETE', 'MISSING_DATA', 'WARNINGS'] as const
export type PartnershipDataQuality = (typeof PARTNERSHIP_DATA_QUALITIES)[number]

export const PARTNERSHIP_AGGREGATION_SORTS = [
  'partnership',
  'owner',
  'type',
  'status',
  'commitment',
  'paidIn',
  'distributions',
  'nav',
  'unfunded',
  'dpi',
  'tvpi',
  'irr',
  'cashYield',
  'latestTaxYear',
  'warningCount',
] as const
export type PartnershipAggregationSort = (typeof PARTNERSHIP_AGGREGATION_SORTS)[number]
export type PartnershipAggregationDirection = 'asc' | 'desc'
export type PartnershipAggregationPageSize = 25 | 50 | 100

export interface PartnershipAggregationQuery {
  search?: string
  ownerIds: string[]
  partnershipTypes: PartnershipType[]
  statuses: PartnershipStatus[]
  workflowStatuses: PartnershipAggregationWorkflow[]
  dataQuality: PartnershipDataQuality[]
  sort: PartnershipAggregationSort
  direction: PartnershipAggregationDirection
  page: number
  pageSize: PartnershipAggregationPageSize
}

export interface PartnershipAggregateRow extends PartnershipTrackerSummary {
  dataQuality: PartnershipDataQuality
}

export interface PartnershipAggregationCoveredMoney {
  amount: PartnershipTrackerMoney | null
  knownCount: number
  totalCount: number
}

export const PARTNERSHIP_AGGREGATION_RATIO_STATUSES = [
  'AVAILABLE',
  'PARTIAL_COVERAGE',
  'NO_DATA',
  'ZERO_DENOMINATOR',
] as const
export type PartnershipAggregationRatioStatus = (typeof PARTNERSHIP_AGGREGATION_RATIO_STATUSES)[number]

export interface PartnershipAggregationCoveredRatio {
  value: PartnershipTrackerRatio | null
  status: PartnershipAggregationRatioStatus
  numeratorKnownCount: number
  denominatorKnownCount: number
  totalCount: number
}

export interface PartnershipPortfolioRollup {
  partnershipCount: number
  ownerRecordCount: number
  committedCapital: PartnershipAggregationCoveredMoney
  paidInCapital: PartnershipAggregationCoveredMoney
  distributions: PartnershipAggregationCoveredMoney
  latestNav: PartnershipAggregationCoveredMoney
  unfundedCommitment: PartnershipAggregationCoveredMoney
  dpi: PartnershipAggregationCoveredRatio
  tvpi: PartnershipAggregationCoveredRatio
  annualizedCashOnCashYield: PartnershipAggregationCoveredRatio
  asOfDate: string
  navValuationRange: { earliest: string | null; latest: string | null }
}

export interface PartnershipAggregateGroup {
  groupKey: string
  name: string
  partnershipType: PartnershipType
  ownerCount: number
  lifecycleStatuses: PartnershipStatus[]
  workflowStatuses: PartnershipAggregationWorkflow[]
  dataQuality: PartnershipDataQuality
  latestTaxYear: number | null
  warningCount: number
  totals: PartnershipPortfolioRollup
  members: PartnershipAggregateRow[]
}

export interface PartnershipAggregationFacetOption<T extends string = string> {
  value: T
  label: string
  count: number
}

export interface PartnershipAggregationFacetSet {
  owners: PartnershipAggregationFacetOption<string>[]
  partnershipTypes: PartnershipAggregationFacetOption<PartnershipType>[]
  statuses: PartnershipAggregationFacetOption<PartnershipStatus>[]
  workflowStatuses: PartnershipAggregationFacetOption<PartnershipAggregationWorkflow>[]
  dataQuality: PartnershipAggregationFacetOption<PartnershipDataQuality>[]
}

export interface PartnershipAggregationPageInfo {
  page: number
  pageSize: PartnershipAggregationPageSize
  totalItems: number
  totalPages: number
  hasPreviousPage: boolean
  hasNextPage: boolean
}

export interface PartnershipAggregationResponse {
  query: PartnershipAggregationQuery
  rollup: PartnershipPortfolioRollup
  facets: PartnershipAggregationFacetSet
  items: PartnershipAggregateGroup[]
  pageInfo: PartnershipAggregationPageInfo
}

export interface CreateTrackedPartnershipRequest {
  entityId: string
  name: string
  partnershipType: PartnershipType
  existingPartnershipId?: string
  copyK1YearsFrom?: {
    partnershipId: string
    taxYears: number[]
  }
  notes?: string | null
  inceptionDate?: string | null
  managementFeeRate?: PartnershipTrackerRatio | null
  ein?: string | null
  fundManager?: string | null
  addressLine1?: string | null
  addressLine2?: string | null
  addressCity?: string | null
  addressRegion?: string | null
  addressPostalCode?: string | null
  addressCountry?: string | null
  capitalCommitment?: PartnershipTrackerMoney | null
  initialValuationAmount?: PartnershipTrackerMoney | null
  initialValuationDate?: string | null
}

export interface UpdateTrackedPartnershipRequest {
  entityId?: string
  name?: string
  partnershipType?: PartnershipType
  status?: PartnershipStatus
  notes?: string | null
  inceptionDate?: string | null
  managementFeeRate?: PartnershipTrackerRatio | null
  ein?: string | null
  fundManager?: string | null
  addressLine1?: string | null
  addressLine2?: string | null
  addressCity?: string | null
  addressRegion?: string | null
  addressPostalCode?: string | null
  addressCountry?: string | null
  capitalCommitment?: PartnershipTrackerMoney
  expectedUpdatedAt: string
}

export interface CreatePartnershipCashFlowRequest {
  kind: 'CAPITAL_CALL' | 'DISTRIBUTION' | 'RECALLABLE_DISTRIBUTION'
  activityDate: string
  amount: PartnershipTrackerMoney
  note?: string | null
}

export interface CreatePartnershipCashFlowsRequest {
  entries: CreatePartnershipCashFlowRequest[]
}

export const PARTNERSHIP_MANAGEMENT_FEE_AVAILABILITY = [
  'AVAILABLE',
  'MISSING_INCEPTION_DATE',
  'MISSING_MANAGEMENT_FEE_RATE',
  'MISSING_COMMITMENT',
] as const

export type PartnershipManagementFeeAvailability = (typeof PARTNERSHIP_MANAGEMENT_FEE_AVAILABILITY)[number]

export interface PartnershipManagementFeeAnnualRow {
  calendarYear: number
  periodStart: string
  periodEnd: string
  activeDays: number
  daysInYear: 365 | 366
  weightedCommittedCapital: PartnershipTrackerMoney | null
  annualRate: PartnershipTrackerRatio
  estimatedFee: PartnershipTrackerMoney | null
}

export interface PartnershipManagementFeeEstimate {
  partnershipId: string
  inceptionDate: string | null
  annualRate: PartnershipTrackerRatio | null
  asOfDate: string
  status: PartnershipManagementFeeAvailability
  annualRows: PartnershipManagementFeeAnnualRow[]
  cumulativeEstimatedFee: PartnershipTrackerMoney | null
}

export interface CreatePartnershipCommitmentEntryRequest {
  amount: PartnershipTrackerMoney
  effectiveDate: string
  note?: string | null
}

export interface UpdatePartnershipCommitmentEntryRequest {
  amount?: PartnershipTrackerMoney
  effectiveDate?: string
  note?: string | null
  expectedUpdatedAt: string
}

export interface CreatePartnershipNavEntryRequest {
  amount: PartnershipTrackerMoney
  valuationDate: string
  note?: string | null
}

export interface UpdatePartnershipNavEntryRequest {
  amount?: PartnershipTrackerMoney
  valuationDate?: string
  note?: string | null
  expectedUpdatedAt: string
}

export interface CreatePartnershipTrackerYearRequest {
  taxYear: number
}

export interface UpdatePartnershipTrackerYearRequest {
  expectedRevision: number
  changes: K1TrackerFieldChange[]
  officialFormData?: K1TrackerOfficialFormData
}

export interface CalculatePartnershipTrackerYearRequest {
  changes: K1TrackerFieldChange[]
}

export type PartnershipTrackerSignoffAction = 'PREPARE' | 'REVIEW' | 'INVALIDATE'

export interface PartnershipTrackerSignoffRequest {
  action: PartnershipTrackerSignoffAction
  expectedRevision: number
  reason?: string | null
}

export type PartnershipTrackerK1Detail = K1TrackerPartnershipDetail
export type PartnershipTrackerYearDetail = K1TrackerYearDetail
export type { K1TrackerCalculation, K1TrackerFieldChange, K1TrackerSignoffState }

export const PRIVATE_INVESTMENT_ACTIVITY_TYPES = [
  'CAPITAL_CALL',
  'NON_RECALLABLE_DISTRIBUTION',
  'RECALLABLE_DISTRIBUTION',
  'VALUATION',
] as const
export type PrivateInvestmentActivityType = (typeof PRIVATE_INVESTMENT_ACTIVITY_TYPES)[number]
export type PrivateInvestmentPageSize = 25 | 50 | 100

export interface PrivateInvestmentQuery {
  assetClasses: PartnershipType[]
  entityIds: string[]
  partnershipIds: string[]
  dateFrom: string | null
  dateTo: string | null
  amountMin: PartnershipTrackerMoney | null
  amountMax: PartnershipTrackerMoney | null
  page: number
  pageSize: PrivateInvestmentPageSize
}

export interface PrivateInvestmentMetricAvailability {
  remainingCommitment: PartnershipTrackerMetricAvailability
  dpi: PartnershipTrackerMetricAvailability
  tvpi: PartnershipTrackerMetricAvailability
  xirr: PartnershipTrackerMetricAvailability
  simplifiedIrr: PartnershipTrackerMetricAvailability
}

export interface EntityFundPosition {
  positionKey: string
  entity: { id: string; name: string }
  partnership: { id: string; name: string }
  assetClass: PartnershipType
  status: PartnershipStatus
  metricScope: 'LIFETIME_FOR_MATCHED_POSITION'
  totalCommitted: PartnershipTrackerDatedMoney | null
  remainingCommitment: PartnershipTrackerMoney | null
  vintageYear: number | null
  totalInvested: PartnershipTrackerMoney
  nonRecallableDistributions: PartnershipTrackerMoney
  recallableDistributions: PartnershipTrackerMoney
  latestValuation: PartnershipTrackerDatedMoney | null
  dpi: PartnershipTrackerRatio | null
  tvpi: PartnershipTrackerRatio | null
  xirr: PartnershipTrackerRatio | null
  xirrTerminalDate: string | null
  xirrUsesCarriedForwardNav: boolean
  simplifiedIrr: PartnershipTrackerRatio | null
  displayIrr: PartnershipTrackerRatio | null
  irrType: 'XIRR' | 'SIMPLIFIED' | null
  availability: PrivateInvestmentMetricAvailability
}

export interface PrivateInvestmentActivityRow {
  rowId: string
  sourceId: string
  sourceKind: 'NET_CASH_ACTIVITY' | 'CAPITAL_AND_NAV'
  entity: { id: string; name: string }
  partnership: { id: string; name: string }
  date: string
  type: PrivateInvestmentActivityType
  amount: PartnershipTrackerMoney
  displayDirection: 'OUTFLOW' | 'INFLOW' | 'POINT_IN_TIME'
  sourceType: string
  note: string | null
  createdAt: string
}

export interface PrivateInvestmentFacetOption<T extends string = string> {
  value: T
  label: string
  count: number
}

export interface PrivateInvestmentPartnershipFacetOption extends PrivateInvestmentFacetOption {
  entityId: string
  entityName: string
  assetClass: PartnershipType
}

export interface PrivateInvestmentFacetSet {
  assetClasses: PrivateInvestmentFacetOption<PartnershipType>[]
  entities: PrivateInvestmentFacetOption[]
  partnerships: PrivateInvestmentPartnershipFacetOption[]
}

export interface PrivateInvestmentPageInfo {
  page: number
  pageSize: PrivateInvestmentPageSize
  totalItems: number
  totalPages: number
  hasPreviousPage: boolean
  hasNextPage: boolean
}

export interface PrivateInvestmentTrackerResponse {
  query: PrivateInvestmentQuery
  positionMetricScope: 'LIFETIME_FOR_MATCHED_POSITIONS'
  positions: EntityFundPosition[]
  facets: PrivateInvestmentFacetSet
  activities: PrivateInvestmentActivityRow[]
  pageInfo: PrivateInvestmentPageInfo
  asOfDate: string
}

export const PRIVATE_INVESTMENT_SUMMARY_COLUMN_IDS = [
  'entity',
  'fund',
  'assetClass',
  'totalCommitted',
  'remainingCommitment',
  'status',
  'vintageYear',
  'totalInvested',
  'valuation',
  'dpi',
  'tvpi',
  'xirr',
  'simplifiedIrr',
] as const
export type PrivateInvestmentSummaryColumnId = (typeof PRIVATE_INVESTMENT_SUMMARY_COLUMN_IDS)[number]
export const PRIVATE_INVESTMENT_DETAIL_COLUMN_IDS = ['entity', 'fund', 'date', 'amount', 'type', 'source'] as const
export type PrivateInvestmentDetailColumnId = (typeof PRIVATE_INVESTMENT_DETAIL_COLUMN_IDS)[number]
export const DEFAULT_PRIVATE_INVESTMENT_SUMMARY_COLUMNS: PrivateInvestmentSummaryColumnId[] = [
  'entity',
  'fund',
  'assetClass',
  'totalCommitted',
  'remainingCommitment',
  'status',
  'vintageYear',
  'totalInvested',
  'valuation',
  'dpi',
  'tvpi',
]
export const DEFAULT_PRIVATE_INVESTMENT_DETAIL_COLUMNS: PrivateInvestmentDetailColumnId[] = [
  'entity',
  'fund',
  'date',
  'amount',
  'type',
  'source',
]
export type PrivateInvestmentPdfFilters = Omit<PrivateInvestmentQuery, 'page' | 'pageSize'>
export interface PrivateInvestmentPdfRequest {
  filters: PrivateInvestmentPdfFilters
  summaryColumns: PrivateInvestmentSummaryColumnId[]
  detailColumns: PrivateInvestmentDetailColumnId[]
}

export interface PartnershipTrackerApiError {
  error: string
  message: string
  details?: unknown
}
