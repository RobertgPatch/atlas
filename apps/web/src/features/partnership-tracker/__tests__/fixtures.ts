import type { PartnershipCommitmentEntry, PartnershipNavEntry, PartnershipTrackerSummary } from '../../../../../../packages/types/src/partnership-tracker'
import type { K1TrackerYearSummary } from '../../../../../../packages/types/src/k1-tracker'

export const ownerFixtures = [
  { id: 'e-1', name: 'Atlas Family Trust' },
  { id: 'e-2', name: 'Summit Holdings LLC' },
]

export const summaryFixture: PartnershipTrackerSummary = {
  partnership: { id: 'p-1', entity: { id: 'e-1', name: 'Atlas Family Trust' }, name: 'Redwood Fund', partnershipType: 'Real Estate', status: 'ACTIVE', notes: 'Core real estate holding', inceptionDate: '2022-01-01', managementFeeRate: '0.02000000', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' },
  currentCommittedCapital: { amount: '1000000.00', date: '2024-01-01' },
  latestNav: { amount: '950000.00', date: '2024-12-31' },
  earliestK1Year: 2021,
  latestTaxYear: 2024,
  latestWorkflowStatus: 'IN_PROGRESS',
  latestEndingOutsideBasis: '425000.00',
  latestSectionLCapital: '450000.00',
  totalCapitalContributions: '1000000.00',
  totalDistributions: '75000.00',
  dpi: '0.07500000',
  tvpi: '1.02500000',
  irr: '0.07870000',
  irrTerminalDate: '2024-12-31',
  irrUsesCarriedForwardNav: false,
  annualizedCashOnCashYield: '0.05000000',
  performanceAsOfDate: '2024-12-31',
  unfundedCommitmentAmount: '0.00',
  unfundedCommitmentPercentage: '0.00000000',
  unrealizedGain: '525000.00',
  performanceStatus: { dpi: 'AVAILABLE', tvpi: 'AVAILABLE', irr: 'AVAILABLE', annualizedCashOnCashYield: 'AVAILABLE', unfundedCommitment: 'AVAILABLE', unrealizedGain: 'AVAILABLE' },
  warningCount: 2,
}

export const unavailablePerformanceSummaryFixture: PartnershipTrackerSummary = {
  ...summaryFixture,
  partnership: { ...summaryFixture.partnership, inceptionDate: null },
  latestNav: null,
  currentCommittedCapital: null,
  latestEndingOutsideBasis: null,
  totalCapitalContributions: null,
  totalDistributions: '0.00',
  dpi: null,
  tvpi: null,
  irr: null,
  irrTerminalDate: null,
  irrUsesCarriedForwardNav: false,
  annualizedCashOnCashYield: null,
  performanceAsOfDate: null,
  unfundedCommitmentAmount: null,
  unfundedCommitmentPercentage: null,
  unrealizedGain: null,
  performanceStatus: {
    dpi: 'MISSING_CONTRIBUTIONS',
    tvpi: 'MISSING_CONTRIBUTIONS',
    irr: 'MISSING_CONTRIBUTIONS',
    annualizedCashOnCashYield: 'MISSING_INCEPTION_DATE',
    unfundedCommitment: 'MISSING_COMMITMENT',
    unrealizedGain: 'MISSING_NAV',
  },
}

export const yearSummaryFixtures = (count: 4 | 10): K1TrackerYearSummary[] =>
  Array.from({ length: count }, (_, index) => ({
    taxYear: 2024 - index,
    status: 'IN_PROGRESS',
    revision: 1,
    capitalContributed: index === 1 ? null : index === 2 ? '0.00' : `${100000 + index}.00`,
    distributions: index === 3 ? null : `${10000 + index}.00`,
    endingOutsideBasis: `${90000 - index}.00`,
    cumulativeSuspendedLoss: '0.00',
    taxableExcessDistribution: '0.00',
    sectionLDifference: '0.00',
    warningCount: 0,
    sourceConflictCount: 0,
  }))

export const commitmentFixtures: PartnershipCommitmentEntry[] = [
  { id: 'c-1', partnershipId: 'p-1', amount: '750000.00', effectiveDate: '2022-01-01', sourceType: 'manual', note: 'Initial close', isCurrent: false, createdAt: '2022-01-01T00:00:00.000Z', updatedAt: '2022-01-01T00:00:00.000Z' },
  { id: 'c-2', partnershipId: 'p-1', amount: '1000000.00', effectiveDate: '2024-01-01', sourceType: 'manual', note: null, isCurrent: true, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' },
]

export const navFixtures: PartnershipNavEntry[] = [
  { id: 'n-1', partnershipId: 'p-1', amount: '800000.00', valuationDate: '2024-03-31', sourceType: 'manual', note: null, createdAt: '2024-04-01T00:00:00.000Z', updatedAt: '2024-04-01T00:00:00.000Z' },
  { id: 'n-2', partnershipId: 'p-1', amount: '875000.00', valuationDate: '2024-09-30', sourceType: 'manual', note: 'Quarterly statement', createdAt: '2024-10-01T00:00:00.000Z', updatedAt: '2024-10-01T00:00:00.000Z' },
  { id: 'n-3', partnershipId: 'p-1', amount: '950000.00', valuationDate: '2025-03-31', sourceType: 'manual', note: null, createdAt: '2025-04-01T00:00:00.000Z', updatedAt: '2025-04-01T00:00:00.000Z' },
]
