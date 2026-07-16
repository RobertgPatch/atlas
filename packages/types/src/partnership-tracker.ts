import type {
  K1TrackerCalculation,
  K1TrackerFieldChange,
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
  'MISSING_OUTSIDE_BASIS',
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
  unrealizedGain: PartnershipTrackerMetricAvailability
}
export type PartnershipTrackerWorkflowStatus =
  | Exclude<K1TrackerWorkflowStatus, 'IMPORTED'>
  | 'IN_PROGRESS'

export interface PartnershipTrackerIdentity {
  id: string
  entity: { id: string; name: string }
  name: string
  partnershipType: PartnershipType
  status: PartnershipStatus
  notes: string | null
  inceptionDate: string | null
  managementFeeRate: PartnershipTrackerRatio | null
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
  dpi: string | null
  tvpi: string | null
  irr: string | null
  irrTerminalDate: string | null
  irrUsesCarriedForwardNav: boolean
  annualizedCashOnCashYield: PartnershipTrackerRatio | null
  performanceAsOfDate: string
  unfundedCommitmentAmount: PartnershipTrackerMoney | null
  unfundedCommitmentPercentage: PartnershipTrackerRatio | null
  unrealizedGain: PartnershipTrackerMoney | null
  performanceStatus: PartnershipTrackerPerformanceStatus
  warningCount: number
}

export interface PartnershipCommitmentEntry {
  id: string
  partnershipId: string
  amount: PartnershipTrackerMoney
  effectiveDate: string
  sourceType: 'manual' | 'parsed'
  isCurrent: boolean
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
  commitments: PartnershipCommitmentEntry[]
  navEntries: PartnershipNavEntry[]
  permissions: PartnershipTrackerPermissions
}

export interface PartnershipTrackerListResponse {
  items: PartnershipTrackerSummary[]
  total: number
  nextCursor: string | null
}

export interface CreateTrackedPartnershipRequest {
  entityId: string
  name: string
  partnershipType: PartnershipType
  notes?: string | null
  inceptionDate?: string | null
  managementFeeRate?: PartnershipTrackerRatio | null
}

export interface UpdateTrackedPartnershipRequest {
  entityId?: string
  name?: string
  partnershipType?: PartnershipType
  status?: PartnershipStatus
  notes?: string | null
  inceptionDate?: string | null
  managementFeeRate?: PartnershipTrackerRatio | null
  expectedUpdatedAt: string
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

export interface PartnershipTrackerApiError {
  error: string
  message: string
  details?: unknown
}
