// Mirror of packages/types/src/partnership-tracker.ts. Kept local because the API
// compiler deliberately limits rootDir to apps/api/src.
import type {
  K1TrackerCalculation,
  K1TrackerFieldChange,
  K1TrackerSignoffState,
  K1TrackerYearDetail,
  K1TrackerYearSummary,
} from '../k1-tracker/k1-tracker.contracts.js'

export const PARTNERSHIP_TYPES = ['Private Equity', 'Real Estate', 'Hedge Fund', 'Venture Capital', 'Credit', 'Infrastructure', 'Other'] as const
export type PartnershipType = (typeof PARTNERSHIP_TYPES)[number]
export const PARTNERSHIP_NAV_SOURCES = ['manager_statement', 'valuation_409a', 'k1', 'manual'] as const
export type PartnershipNavSource = (typeof PARTNERSHIP_NAV_SOURCES)[number]
export type PartnershipTrackerMoney = string
export type PartnershipTrackerRatio = string
export const PARTNERSHIP_TRACKER_METRIC_AVAILABILITY = ['AVAILABLE', 'MISSING_CONTRIBUTIONS', 'MISSING_DISTRIBUTIONS', 'MISSING_NAV', 'MISSING_INCEPTION_DATE', 'MISSING_COMMITMENT', 'MISSING_OUTSIDE_BASIS', 'NAV_PRECEDES_CASH_FLOWS', 'INSUFFICIENT_CASH_FLOWS', 'AMBIGUOUS_IRR'] as const
export type PartnershipTrackerMetricAvailability = (typeof PARTNERSHIP_TRACKER_METRIC_AVAILABILITY)[number]
export interface PartnershipTrackerPerformanceStatus {
  dpi: PartnershipTrackerMetricAvailability
  tvpi: PartnershipTrackerMetricAvailability
  irr: PartnershipTrackerMetricAvailability
  annualizedCashOnCashYield: PartnershipTrackerMetricAvailability
  unfundedCommitment: PartnershipTrackerMetricAvailability
  unrealizedGain: PartnershipTrackerMetricAvailability
}
export type PartnershipTrackerWorkflowStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'NEEDS_REVIEW' | 'RECONCILED'

export interface PartnershipTrackerSummary {
  partnership: {
    id: string
    entity: { id: string; name: string }
    name: string
    partnershipType: PartnershipType
    status: 'ACTIVE' | 'PENDING' | 'LIQUIDATED' | 'CLOSED'
    notes: string | null
    inceptionDate: string | null
    managementFeeRate: PartnershipTrackerRatio | null
    createdAt: string
    updatedAt: string
  }
  currentCommittedCapital: { amount: PartnershipTrackerMoney; date: string } | null
  latestNav: { amount: PartnershipTrackerMoney; date: string } | null
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
  id: string; partnershipId: string; amount: string; effectiveDate: string; isCurrent: boolean
  sourceType: 'manual' | 'parsed'; note: string | null; createdAt: string; updatedAt: string
}
export interface PartnershipNavEntry {
  id: string; partnershipId: string; amount: string; valuationDate: string; sourceType: PartnershipNavSource
  note: string | null; createdAt: string; updatedAt: string
}
export interface PartnershipTrackerDetail {
  summary: PartnershipTrackerSummary
  years: K1TrackerYearSummary[]
  commitments: PartnershipCommitmentEntry[]
  navEntries: PartnershipNavEntry[]
  permissions: { canEditPartnership: boolean; canEditK1: boolean; canEditCommitment: boolean; canEditNav: boolean; canSignoff: boolean }
}
export interface PartnershipTrackerListResponse { items: PartnershipTrackerSummary[]; total: number; nextCursor: string | null }

export const PARTNERSHIP_MANAGEMENT_FEE_AVAILABILITY = ['AVAILABLE', 'MISSING_INCEPTION_DATE', 'MISSING_MANAGEMENT_FEE_RATE', 'MISSING_COMMITMENT'] as const
export type PartnershipManagementFeeAvailability = (typeof PARTNERSHIP_MANAGEMENT_FEE_AVAILABILITY)[number]
export interface PartnershipManagementFeeAnnualRow { calendarYear: number; periodStart: string; periodEnd: string; activeDays: number; daysInYear: 365 | 366; weightedCommittedCapital: string | null; annualRate: string; estimatedFee: string | null }
export interface PartnershipManagementFeeEstimate { partnershipId: string; inceptionDate: string | null; annualRate: string | null; asOfDate: string; status: PartnershipManagementFeeAvailability; annualRows: PartnershipManagementFeeAnnualRow[]; cumulativeEstimatedFee: string | null }

export type { K1TrackerCalculation, K1TrackerFieldChange, K1TrackerSignoffState, K1TrackerYearDetail }
