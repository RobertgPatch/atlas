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
export type PartnershipTrackerWorkflowStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'NEEDS_REVIEW' | 'RECONCILED'

export interface PartnershipTrackerSummary {
  partnership: {
    id: string
    entity: { id: string; name: string }
    name: string
    partnershipType: PartnershipType
    status: 'ACTIVE' | 'PENDING' | 'LIQUIDATED' | 'CLOSED'
    notes: string | null
    createdAt: string
    updatedAt: string
  }
  currentCommittedCapital: { amount: PartnershipTrackerMoney; date: string } | null
  latestNav: { amount: PartnershipTrackerMoney; date: string } | null
  earliestK1Year: number | null
  latestTaxYear: number | null
  latestWorkflowStatus: PartnershipTrackerWorkflowStatus | null
  latestEndingOutsideBasis: PartnershipTrackerMoney | null
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

export type { K1TrackerCalculation, K1TrackerFieldChange, K1TrackerSignoffState, K1TrackerYearDetail }
