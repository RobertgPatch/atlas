import type { PartnershipCommitmentEntry, PartnershipNavEntry, PartnershipTrackerSummary } from '../../../../../../packages/types/src/partnership-tracker'

export const summaryFixture: PartnershipTrackerSummary = {
  partnership: { id: 'p-1', entity: { id: 'e-1', name: 'Atlas Family Trust' }, name: 'Redwood Fund', partnershipType: 'Real Estate', status: 'ACTIVE', notes: 'Core real estate holding', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' },
  currentCommittedCapital: { amount: '1000000.00', date: '2024-01-01' },
  latestNav: { amount: '950000.00', date: '2024-12-31' },
  earliestK1Year: 2021,
  latestTaxYear: 2024,
  latestWorkflowStatus: 'IN_PROGRESS',
  latestEndingOutsideBasis: '425000.00',
  latestSectionLCapital: '450000.00',
  totalCapitalContributions: '1000000.00',
  totalDistributions: '75000.00',
  dpi: '0.0750',
  tvpi: '1.0250',
  irr: '0.0247',
  performanceStatus: { dpi: 'AVAILABLE', tvpi: 'AVAILABLE', irr: 'AVAILABLE' },
  warningCount: 2,
}

export const commitmentFixtures: PartnershipCommitmentEntry[] = [
  { id: 'c-1', partnershipId: 'p-1', amount: '750000.00', effectiveDate: '2022-01-01', sourceType: 'manual', note: 'Initial close', isCurrent: false, createdAt: '2022-01-01T00:00:00.000Z', updatedAt: '2022-01-01T00:00:00.000Z' },
  { id: 'c-2', partnershipId: 'p-1', amount: '1000000.00', effectiveDate: '2024-01-01', sourceType: 'manual', note: null, isCurrent: true, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' },
]

export const navFixtures: PartnershipNavEntry[] = [
  { id: 'n-1', partnershipId: 'p-1', amount: '800000.00', valuationDate: '2024-03-31', sourceType: 'manual', note: null, createdAt: '2024-04-01T00:00:00.000Z', updatedAt: '2024-04-01T00:00:00.000Z' },
  { id: 'n-2', partnershipId: 'p-1', amount: '875000.00', valuationDate: '2024-09-30', sourceType: 'manual', note: 'Quarterly statement', createdAt: '2024-10-01T00:00:00.000Z', updatedAt: '2024-10-01T00:00:00.000Z' },
  { id: 'n-3', partnershipId: 'p-1', amount: '950000.00', valuationDate: '2025-03-31', sourceType: 'manual', note: null, createdAt: '2025-04-01T00:00:00.000Z', updatedAt: '2025-04-01T00:00:00.000Z' },
]
