import type { EntityFundPosition, PartnershipAggregateGroup, PartnershipAggregateRow, PartnershipAggregationResponse, PartnershipCommitmentEntry, PartnershipNavEntry, PartnershipTrackerSummary, PrivateInvestmentActivityRow, PrivateInvestmentTrackerResponse } from '../../../../../../packages/types/src/partnership-tracker'
import type { K1TrackerCalculation, K1TrackerCashFlowEvent, K1TrackerValue, K1TrackerYearDetail, K1TrackerYearSummary } from '../../../../../../packages/types/src/k1-tracker'

export const ownerFixtures = [
  { id: 'e-1', name: 'Jackson Family Trust' },
  { id: 'e-2', name: 'Summit Holdings LLC' },
]

export const summaryFixture: PartnershipTrackerSummary = {
  partnership: { id: 'p-1', entity: { id: 'e-1', name: 'Jackson Family Trust' }, name: 'Redwood Fund', partnershipType: 'Real Estate', status: 'ACTIVE', notes: 'Core real estate holding', inceptionDate: '2022-01-01', managementFeeRate: '0.02000000', ein: '123456789', fundManager: 'Redwood Capital', addressLine1: '100 Market Street', addressLine2: null, addressCity: 'San Francisco', addressRegion: 'CA', addressPostalCode: '94105', addressCountry: 'United States', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' },
  currentCommittedCapital: { amount: '1000000.00', date: '2024-01-01' },
  latestNav: { amount: '950000.00', date: '2024-12-31' },
  earliestK1Year: 2021,
  latestTaxYear: 2024,
  latestWorkflowStatus: 'IN_PROGRESS',
  latestEndingOutsideBasis: '425000.00',
  latestSectionLCapital: '450000.00',
  totalCapitalContributions: '1000000.00',
  totalDistributions: '75000.00',
  totalRecallableDistributions: '10000.00',
  dpi: '0.07500000',
  tvpi: '1.02500000',
  irr: '0.07870000',
  irrTerminalDate: '2024-12-31',
  irrUsesCarriedForwardNav: false,
  annualizedCashOnCashYield: '0.05000000',
  performanceAsOfDate: '2024-12-31',
  unfundedCommitmentAmount: '0.00',
  unfundedCommitmentPercentage: '0.00000000',
  performanceStatus: { dpi: 'AVAILABLE', tvpi: 'AVAILABLE', irr: 'AVAILABLE', annualizedCashOnCashYield: 'AVAILABLE', unfundedCommitment: 'AVAILABLE' },
  simplifiedIrr: '0.07500000',
  displayIrr: '0.07870000',
  irrType: 'XIRR',
  vintageYear: 2022,
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
  simplifiedIrr: null,
  displayIrr: null,
  irrType: null,
  vintageYear: null,
  annualizedCashOnCashYield: null,
  performanceAsOfDate: summaryFixture.performanceAsOfDate,
  unfundedCommitmentAmount: null,
  unfundedCommitmentPercentage: null,
  performanceStatus: {
    dpi: 'MISSING_CONTRIBUTIONS',
    tvpi: 'MISSING_CONTRIBUTIONS',
    irr: 'MISSING_CONTRIBUTIONS',
    annualizedCashOnCashYield: 'MISSING_INCEPTION_DATE',
    unfundedCommitment: 'MISSING_COMMITMENT',
  },
}

export const privateInvestmentPositionFixture: EntityFundPosition = {
  positionKey: 'e-1:p-1',
  entity: { id: 'e-1', name: 'Jackson Family Trust' },
  partnership: { id: 'p-1', name: 'Redwood Fund' },
  assetClass: 'Real Estate',
  status: 'ACTIVE',
  metricScope: 'LIFETIME_FOR_MATCHED_POSITION',
  totalCommitted: { amount: '1000000.00', date: '2024-01-01' },
  remainingCommitment: '0.00',
  vintageYear: 2022,
  totalInvested: '1000000.00',
  nonRecallableDistributions: '75000.00',
  recallableDistributions: '10000.00',
  latestValuation: { amount: '950000.00', date: '2024-12-31' },
  dpi: '0.07500000',
  tvpi: '1.02500000',
  xirr: '0.07870000',
  xirrTerminalDate: '2024-12-31',
  xirrUsesCarriedForwardNav: false,
  simplifiedIrr: '0.07500000',
  displayIrr: '0.07870000',
  irrType: 'XIRR',
  availability: { remainingCommitment: 'AVAILABLE', dpi: 'AVAILABLE', tvpi: 'AVAILABLE', xirr: 'AVAILABLE', simplifiedIrr: 'AVAILABLE' },
}

export const privateInvestmentActivityFixtures: PrivateInvestmentActivityRow[] = [
  { rowId: 'CAPITAL_AND_NAV:nav-1', sourceId: 'nav-1', sourceKind: 'CAPITAL_AND_NAV', entity: privateInvestmentPositionFixture.entity, partnership: privateInvestmentPositionFixture.partnership, date: '2024-12-31', type: 'VALUATION', amount: '950000.00', displayDirection: 'POINT_IN_TIME', sourceType: 'manual', note: null, createdAt: '2025-01-01T00:00:00.000Z' },
  { rowId: 'NET_CASH_ACTIVITY:dist-1', sourceId: 'dist-1', sourceKind: 'NET_CASH_ACTIVITY', entity: privateInvestmentPositionFixture.entity, partnership: privateInvestmentPositionFixture.partnership, date: '2024-08-15', type: 'NON_RECALLABLE_DISTRIBUTION', amount: '75000.00', displayDirection: 'INFLOW', sourceType: 'manual', note: null, createdAt: '2024-08-15T00:00:00.000Z' },
  { rowId: 'NET_CASH_ACTIVITY:call-1', sourceId: 'call-1', sourceKind: 'NET_CASH_ACTIVITY', entity: privateInvestmentPositionFixture.entity, partnership: privateInvestmentPositionFixture.partnership, date: '2024-03-01', type: 'CAPITAL_CALL', amount: '1000000.00', displayDirection: 'OUTFLOW', sourceType: 'manual', note: null, createdAt: '2024-03-01T00:00:00.000Z' },
]

export const privateInvestmentResponseFixture: PrivateInvestmentTrackerResponse = {
  query: { assetClasses: [], entityIds: [], partnershipIds: [], dateFrom: null, dateTo: null, amountMin: null, amountMax: null, page: 1, pageSize: 50 },
  positionMetricScope: 'LIFETIME_FOR_MATCHED_POSITIONS',
  positions: [privateInvestmentPositionFixture],
  facets: {
    assetClasses: [{ value: 'Real Estate', label: 'Real Estate', count: 3 }],
    entities: [{ value: 'e-1', label: 'Jackson Family Trust', count: 3 }],
    partnerships: [{ value: 'p-1', label: 'Redwood Fund', count: 3, entityId: 'e-1', entityName: 'Jackson Family Trust', assetClass: 'Real Estate' }],
  },
  activities: privateInvestmentActivityFixtures,
  pageInfo: { page: 1, pageSize: 50, totalItems: 3, totalPages: 1, hasPreviousPage: false, hasNextPage: false },
  asOfDate: '2026-07-23',
}

export const missingK1IdentitySummaryFixture: PartnershipTrackerSummary = {
  ...summaryFixture,
  partnership: {
    ...summaryFixture.partnership,
    ein: null,
    addressLine1: null,
    addressLine2: null,
    addressCity: null,
    addressRegion: null,
    addressPostalCode: null,
    addressCountry: null,
  },
}

const k1Value = (
  id: string,
  fieldKey: K1TrackerValue['fieldKey'],
  amount: string,
  sourceType: K1TrackerValue['sourceType'],
  overrides: Partial<K1TrackerValue> = {},
): K1TrackerValue => ({
  id,
  fieldKey,
  amount,
  sourceType,
  originalSourceText: amount,
  sourceK1DocumentId: sourceType === 'FINALIZED_K1' ? 'document-2024' : null,
  sourceK1FieldValueId: sourceType === 'FINALIZED_K1' ? `${id}-source` : null,
  importBatchId: sourceType === 'WORKBOOK_IMPORT' ? 'import-2024' : null,
  sourceSheet: sourceType === 'WORKBOOK_IMPORT' ? '2024 K-1' : null,
  sourceCell: sourceType === 'WORKBOOK_IMPORT' ? 'F12' : null,
  carryforwardFromTaxYear: sourceType === 'CARRYFORWARD' ? 2023 : null,
  overrideReason: sourceType === 'MANUAL_OVERRIDE' ? 'Corrected to the final K-1' : null,
  isActive: true,
  createdByEmail: 'preparer@jackson.test',
  createdAt: '2025-03-15T12:00:00.000Z',
  ...overrides,
})

const k1CalculationFixture = {
  calculationVersion: 'fixture-v1',
  summary: {
    taxYear: 2024,
    status: 'IN_PROGRESS',
    revision: 4,
    capitalContributed: '250000.00',
    distributions: '50000.00',
    endingOutsideBasis: '1246862889.50',
    cumulativeSuspendedLoss: '1500.00',
    taxableExcessDistribution: '0.00',
    sectionLDifference: '0.00',
    warningCount: 0,
    sourceConflictCount: 0,
  },
  basis: { beginningOutsideBasis: '1234567890.00', endingOutsideBasis: '1246862889.50' },
  lossLimitation: { priorSuspendedLoss: '1500.00' },
  distribution: { cashOrPropertyDistribution: '50000.00' },
  liabilities: {
    nonrecourseBeginning: '450000.00',
    qualifiedNonrecourseBeginning: '125000.00',
    recourseBeginning: '75000.00',
  },
  sectionL: { reportedBeginning: '900000.00' },
  bookTax: {},
  journalEntries: [],
  journalBalance: '0.00',
  checks: [],
} as unknown as K1TrackerCalculation

export const k1EntryDetailFixture: K1TrackerYearDetail = {
  partnershipId: 'p-1',
  taxYear: 2024,
  status: 'IN_PROGRESS',
  revision: 4,
  values: [
    k1Value('value-opening-basis', 'opening_outside_basis', '1234567890.00', 'FINALIZED_K1'),
    k1Value('value-opening-loss', 'opening_suspended_loss', '1500.00', 'CARRYFORWARD'),
    k1Value('value-line-1', 'box_1_ordinary_income_loss', '-12500.50', 'WORKBOOK_IMPORT'),
    k1Value('value-liability', 'liability_nonrecourse_beginning', '450000.00', 'FINALIZED_K1'),
    k1Value('value-section-l', 'section_l_beginning_capital', '900000.00', 'MANUAL_OVERRIDE'),
    k1Value('value-line-13-legacy', 'box_13_other_deductions', '3250.00', 'WORKBOOK_IMPORT'),
  ],
  cashFlowEvents: [],
  sourceConflicts: [{ fieldKey: 'section_l_beginning_capital', message: 'Reported beginning capital differs from the carried amount.' }],
  calculation: k1CalculationFixture,
  signoff: {
    yearRevision: 4,
    preparedByEmail: null,
    preparedAt: null,
    reviewedByEmail: null,
    reviewedAt: null,
    invalidatedAt: null,
    invalidationReason: null,
  },
}

const cashActivity = (
  id: string,
  kind: K1TrackerCashFlowEvent['kind'],
  activityDate: string,
  amount: string,
): K1TrackerCashFlowEvent => ({
  id,
  partnershipId: 'p-1',
  taxYear: 2024,
  kind,
  activityDate,
  amount,
  note: null,
  createdAt: '2024-12-31T12:00:00.000Z',
  updatedAt: '2024-12-31T12:00:00.000Z',
})

export const k1CashActivityDetailFixture: K1TrackerYearDetail = {
  ...k1EntryDetailFixture,
  values: [
    ...k1EntryDetailFixture.values,
    k1Value('value-contributions', 'capital_contributions', '250000.00', 'MANUAL_ENTRY'),
    k1Value('value-distributions', 'box_19_distributions', '50000.00', 'MANUAL_ENTRY'),
  ],
  cashFlowEvents: [
    cashActivity('cash-call', 'CAPITAL_CALL', '2024-03-01', '250000.00'),
    cashActivity('cash-distribution', 'DISTRIBUTION', '2024-08-15', '40000.00'),
    cashActivity('cash-recallable', 'RECALLABLE_DISTRIBUTION', '2024-11-30', '10000.00'),
  ],
}

const aggregateRow = (
  id: string,
  name: string,
  owner: { id: string; name: string },
  overrides: Partial<PartnershipTrackerSummary> & { dataQuality: 'COMPLETE' | 'MISSING_DATA' | 'WARNINGS' },
): PartnershipAggregateRow => ({
  ...summaryFixture,
  ...overrides,
  partnership: { ...summaryFixture.partnership, id, name, entity: owner, ...(overrides.partnership ?? {}) },
})

const aggregateGroup = (row: PartnershipAggregateRow): PartnershipAggregateGroup => {
  const coveredMoney = (amount: string | null | undefined) => ({ amount: amount ?? null, knownCount: amount == null ? 0 : 1, totalCount: 1 })
  const ratio = (value: string | null, numeratorKnownCount: number, denominatorKnownCount: number) => ({
    value,
    status: value == null ? 'NO_DATA' as const : 'AVAILABLE' as const,
    numeratorKnownCount,
    denominatorKnownCount,
    totalCount: 1,
  })
  return {
    groupKey: row.partnership.aggregationGroupId ?? row.partnership.id,
    name: row.partnership.name,
    partnershipType: row.partnership.partnershipType,
    ownerCount: 1,
    lifecycleStatuses: [row.partnership.status],
    workflowStatuses: [row.latestWorkflowStatus ?? 'NO_K1_YEAR'],
    dataQuality: row.dataQuality,
    latestTaxYear: row.latestTaxYear,
    warningCount: row.warningCount,
    totals: {
      partnershipCount: 1,
      ownerRecordCount: 1,
      committedCapital: coveredMoney(row.currentCommittedCapital?.amount),
      paidInCapital: coveredMoney(row.totalCapitalContributions),
      distributions: coveredMoney(row.totalDistributions),
      latestNav: coveredMoney(row.latestNav?.amount),
      unfundedCommitment: coveredMoney(row.unfundedCommitmentAmount),
      dpi: ratio(row.dpi, row.totalDistributions == null ? 0 : 1, row.totalCapitalContributions == null ? 0 : 1),
      tvpi: ratio(row.tvpi, row.latestNav == null || row.totalDistributions == null ? 0 : 1, row.totalCapitalContributions == null ? 0 : 1),
      annualizedCashOnCashYield: ratio(row.annualizedCashOnCashYield, row.annualizedCashOnCashYield == null ? 0 : 1, row.totalCapitalContributions == null ? 0 : 1),
      asOfDate: row.performanceAsOfDate,
      navValuationRange: { earliest: row.latestNav?.date ?? null, latest: row.latestNav?.date ?? null },
    },
    members: [row],
  }
}

export const aggregationResponseFixture: PartnershipAggregationResponse = {
  query: {
    ownerIds: [],
    partnershipTypes: [],
    statuses: [],
    workflowStatuses: [],
    dataQuality: [],
    sort: 'partnership',
    direction: 'asc',
    page: 1,
    pageSize: 50,
  },
  rollup: {
    partnershipCount: 4,
    ownerRecordCount: 4,
    committedCapital: { amount: '350000.00', knownCount: 3, totalCount: 4 },
    paidInCapital: { amount: '235000.00', knownCount: 3, totalCount: 4 },
    distributions: { amount: '50000.00', knownCount: 3, totalCount: 4 },
    latestNav: { amount: '270000.00', knownCount: 3, totalCount: 4 },
    unfundedCommitment: { amount: '115000.00', knownCount: 3, totalCount: 4 },
    dpi: { value: '0.21276596', status: 'PARTIAL_COVERAGE', numeratorKnownCount: 3, denominatorKnownCount: 3, totalCount: 4 },
    tvpi: { value: '1.36170213', status: 'PARTIAL_COVERAGE', numeratorKnownCount: 3, denominatorKnownCount: 3, totalCount: 4 },
    annualizedCashOnCashYield: { value: '0.05000000', status: 'PARTIAL_COVERAGE', numeratorKnownCount: 3, denominatorKnownCount: 3, totalCount: 4 },
    asOfDate: '2026-07-16',
    navValuationRange: { earliest: '2024-12-31', latest: '2026-03-31' },
  },
  facets: {
    owners: [{ value: 'e-1', label: 'Alder Family', count: 2 }, { value: 'e-2', label: 'Beacon Holdings', count: 2 }],
    partnershipTypes: [{ value: 'Private Equity', label: 'Private Equity', count: 1 }, { value: 'Credit', label: 'Credit', count: 1 }, { value: 'Real Estate', label: 'Real Estate', count: 1 }, { value: 'Infrastructure', label: 'Infrastructure', count: 1 }],
    statuses: [{ value: 'ACTIVE', label: 'Active', count: 2 }, { value: 'PENDING', label: 'Pending', count: 1 }, { value: 'CLOSED', label: 'Closed', count: 1 }],
    workflowStatuses: [{ value: 'IN_PROGRESS', label: 'In progress', count: 2 }, { value: 'NO_K1_YEAR', label: 'No K-1 year', count: 1 }, { value: 'NEEDS_REVIEW', label: 'Needs review', count: 1 }],
    dataQuality: [{ value: 'COMPLETE', label: 'Complete', count: 2 }, { value: 'MISSING_DATA', label: 'Missing data', count: 1 }, { value: 'WARNINGS', label: 'Warnings', count: 1 }],
  },
  items: [
    aggregateGroup(aggregateRow('p-alpha', 'Alpha Growth I', { id: 'e-1', name: 'Alder Family' }, { dataQuality: 'COMPLETE', warningCount: 0, currentCommittedCapital: { amount: '100000.00', date: '2021-01-01' }, totalCapitalContributions: '60000.00', totalDistributions: '15000.00', latestNav: { amount: '75000.00', date: '2025-12-31' }, unfundedCommitmentAmount: '40000.00', dpi: '0.25000000', tvpi: '1.50000000' })),
    aggregateGroup(aggregateRow('p-beacon', 'Beacon Credit', { id: 'e-2', name: 'Beacon Holdings' }, { dataQuality: 'COMPLETE', warningCount: 0, currentCommittedCapital: { amount: '200000.00', date: '2022-01-01' }, totalCapitalContributions: '120000.00', totalDistributions: '30000.00', latestNav: { amount: '150000.00', date: '2026-03-31' }, unfundedCommitmentAmount: '80000.00', dpi: '0.25000000', tvpi: '1.50000000' })),
    aggregateGroup(aggregateRow('p-cedar', 'Cedar Legacy', { id: 'e-1', name: 'Alder Family' }, { ...unavailablePerformanceSummaryFixture, dataQuality: 'MISSING_DATA', warningCount: 0 })),
    aggregateGroup(aggregateRow('p-delta', 'Delta Warning', { id: 'e-2', name: 'Beacon Holdings' }, { dataQuality: 'WARNINGS', warningCount: 2, currentCommittedCapital: { amount: '50000.00', date: '2023-01-01' }, totalCapitalContributions: '55000.00', totalDistributions: '5000.00', latestNav: { amount: '45000.00', date: '2024-12-31' }, unfundedCommitmentAmount: '-5000.00' })),
  ],
  pageInfo: { page: 1, pageSize: 50, totalItems: 4, totalPages: 1, hasPreviousPage: false, hasNextPage: false },
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
  { id: 'c-1', partnershipId: 'p-1', amount: '750000.00', effectiveDate: '2022-01-01', sourceType: 'manual', sourceCashFlowEventId: null, note: 'Initial close', isCurrent: false, createdAt: '2022-01-01T00:00:00.000Z', updatedAt: '2022-01-01T00:00:00.000Z' },
  { id: 'c-2', partnershipId: 'p-1', amount: '1000000.00', effectiveDate: '2024-01-01', sourceType: 'manual', sourceCashFlowEventId: null, note: null, isCurrent: true, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' },
]

export const navFixtures: PartnershipNavEntry[] = [
  { id: 'n-1', partnershipId: 'p-1', amount: '800000.00', valuationDate: '2024-03-31', sourceType: 'manual', note: null, createdAt: '2024-04-01T00:00:00.000Z', updatedAt: '2024-04-01T00:00:00.000Z' },
  { id: 'n-2', partnershipId: 'p-1', amount: '875000.00', valuationDate: '2024-09-30', sourceType: 'manual', note: 'Quarterly statement', createdAt: '2024-10-01T00:00:00.000Z', updatedAt: '2024-10-01T00:00:00.000Z' },
  { id: 'n-3', partnershipId: 'p-1', amount: '950000.00', valuationDate: '2025-03-31', sourceType: 'manual', note: null, createdAt: '2025-04-01T00:00:00.000Z', updatedAt: '2025-04-01T00:00:00.000Z' },
]
