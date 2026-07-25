import { describe, expect, it } from 'vitest'
import type { PartnershipAggregationQuery, PartnershipTrackerSummary } from '../src/modules/partnership-tracker/partnership-tracker.contracts.js'
import {
  DEFAULT_PARTNERSHIP_AGGREGATION_QUERY,
  classifyPartnershipDataQuality,
  composePartnershipAggregation,
} from '../src/modules/partnership-tracker/partnership-aggregation.js'

const summary = (overrides: Partial<PartnershipTrackerSummary> & {
  id: string
  name: string
  ownerId?: string
  ownerName?: string
}): PartnershipTrackerSummary => ({
  partnership: {
    id: overrides.id,
    entity: { id: overrides.ownerId ?? '00000000-0000-4000-8000-000000000001', name: overrides.ownerName ?? 'Alder Family' },
    name: overrides.name,
    partnershipType: 'Private Equity',
    status: 'ACTIVE',
    notes: null,
    inceptionDate: '2020-01-01',
    managementFeeRate: null,
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
    ...(overrides.partnership ?? {}),
  },
  currentCommittedCapital: { amount: '100000.00', date: '2020-01-01' },
  latestNav: { amount: '75000.00', date: '2025-12-31' },
  earliestK1Year: 2025,
  latestTaxYear: 2025,
  latestWorkflowStatus: 'RECONCILED',
  latestEndingOutsideBasis: '60000.00',
  latestSectionLCapital: '60000.00',
  totalCapitalContributions: '60000.00',
  totalDistributions: '15000.00',
  totalRecallableDistributions: '0.00',
  dpi: '0.25000000',
  tvpi: '1.50000000',
  irr: '0.12000000',
  irrTerminalDate: '2025-12-31',
  irrUsesCarriedForwardNav: false,
  annualizedCashOnCashYield: '0.05000000',
  performanceAsOfDate: '2026-07-16',
  unfundedCommitmentAmount: '40000.00',
  unfundedCommitmentPercentage: '0.40000000',
  performanceStatus: { dpi: 'AVAILABLE', tvpi: 'AVAILABLE', irr: 'AVAILABLE', annualizedCashOnCashYield: 'AVAILABLE', unfundedCommitment: 'AVAILABLE' },
  simplifiedIrr: '0.12000000',
  displayIrr: '0.12000000',
  irrType: 'XIRR',
  vintageYear: 2020,
  warningCount: 0,
  ...overrides,
})

const query = (overrides: Partial<PartnershipAggregationQuery> = {}): PartnershipAggregationQuery => ({
  ...DEFAULT_PARTNERSHIP_AGGREGATION_QUERY,
  ...overrides,
})

describe('partnership aggregation composition', () => {
  const alpha = summary({ id: '00000000-0000-4000-8000-000000000101', name: 'Alpha Growth I' })
  const beacon = summary({
    id: '00000000-0000-4000-8000-000000000102',
    name: 'Beacon Credit',
    ownerId: '00000000-0000-4000-8000-000000000002',
    ownerName: 'Beacon Holdings',
    partnership: { ...summary({ id: 'x', name: 'x' }).partnership, id: '00000000-0000-4000-8000-000000000102', name: 'Beacon Credit', entity: { id: '00000000-0000-4000-8000-000000000002', name: 'Beacon Holdings' }, partnershipType: 'Credit' },
    currentCommittedCapital: { amount: '200000.00', date: '2022-01-01' },
    totalCapitalContributions: '120000.00',
    totalDistributions: '30000.00',
    latestNav: { amount: '150000.00', date: '2026-03-31' },
    unfundedCommitmentAmount: '80000.00',
  })
  const cedar = summary({
    id: '00000000-0000-4000-8000-000000000103',
    name: 'Cedar Legacy',
    partnership: { ...summary({ id: 'x', name: 'x' }).partnership, id: '00000000-0000-4000-8000-000000000103', name: 'Cedar Legacy', status: 'CLOSED', partnershipType: 'Real Estate' },
    currentCommittedCapital: null,
    latestNav: null,
    earliestK1Year: null,
    latestTaxYear: null,
    latestWorkflowStatus: null,
    totalCapitalContributions: null,
    totalDistributions: null,
    dpi: null,
    tvpi: null,
    irr: null,
    unfundedCommitmentAmount: null,
  })
  const delta = summary({
    id: '00000000-0000-4000-8000-000000000104',
    name: 'Delta Warning',
    ownerId: '00000000-0000-4000-8000-000000000002',
    ownerName: 'Beacon Holdings',
    partnership: { ...summary({ id: 'x', name: 'x' }).partnership, id: '00000000-0000-4000-8000-000000000104', name: 'Delta Warning', entity: { id: '00000000-0000-4000-8000-000000000002', name: 'Beacon Holdings' }, status: 'PENDING', partnershipType: 'Infrastructure' },
    currentCommittedCapital: { amount: '50000.00', date: '2023-01-01' },
    totalCapitalContributions: '55000.00',
    totalDistributions: '5000.00',
    latestNav: { amount: '45000.00', date: '2024-12-31' },
    unfundedCommitmentAmount: '-5000.00',
    warningCount: 2,
  })
  const rows = [delta, cedar, beacon, alpha]

  it('classifies warnings before missing data and preserves known zero', () => {
    expect(classifyPartnershipDataQuality(delta)).toBe('WARNINGS')
    expect(classifyPartnershipDataQuality(cedar)).toBe('MISSING_DATA')
    expect(classifyPartnershipDataQuality(summary({ id: 'zero', name: 'Zero', totalDistributions: '0.00' }))).toBe('COMPLETE')
  })

  it('composes exact partial-coverage totals and recomputes portfolio ratios', () => {
    const result = composePartnershipAggregation(rows, query(), '2026-07-16')
    expect(result.items.map((group) => group.name)).toEqual(['Alpha Growth I', 'Beacon Credit', 'Cedar Legacy', 'Delta Warning'])
    expect(result.rollup).toMatchObject({
      partnershipCount: 4,
      ownerRecordCount: 4,
      committedCapital: { amount: '350000.00', knownCount: 3, totalCount: 4 },
      paidInCapital: { amount: '235000.00', knownCount: 3, totalCount: 4 },
      distributions: { amount: '50000.00', knownCount: 3, totalCount: 4 },
      latestNav: { amount: '270000.00', knownCount: 3, totalCount: 4 },
      unfundedCommitment: { amount: '115000.00', knownCount: 3, totalCount: 4 },
      dpi: { value: '0.21276596', status: 'PARTIAL_COVERAGE' },
      tvpi: { value: '1.36170213', status: 'PARTIAL_COVERAGE' },
      annualizedCashOnCashYield: { value: '0.05000000', status: 'PARTIAL_COVERAGE' },
      navValuationRange: { earliest: '2024-12-31', latest: '2026-03-31' },
    })
    expect(result.rollup).not.toHaveProperty('irr')
  })

  it('reports zero denominators and no data without inventing ratios', () => {
    const zero = summary({ id: 'zero', name: 'Zero', totalCapitalContributions: '0.00', totalDistributions: '0.00', latestNav: { amount: '0.00', date: '2025-12-31' } })
    expect(composePartnershipAggregation([zero]).rollup.dpi).toMatchObject({ value: null, status: 'ZERO_DENOMINATOR' })
    expect(composePartnershipAggregation([cedar]).rollup.dpi).toMatchObject({ value: null, status: 'NO_DATA' })
  })

  it('combines filters, keeps base facets stable, and removes unavailable owners', () => {
    const result = composePartnershipAggregation(rows, query({
      search: 'a',
      ownerIds: ['00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-999999999999'],
      statuses: ['ACTIVE', 'PENDING'],
      dataQuality: ['COMPLETE', 'WARNINGS'],
    }))
    expect(result.items.map((group) => group.name)).toEqual(['Beacon Credit', 'Delta Warning'])
    expect(result.query.ownerIds).toEqual(['00000000-0000-4000-8000-000000000002'])
    expect(result.facets.owners).toHaveLength(2)
    expect(result.rollup.partnershipCount).toBe(2)
  })

  it('sorts known values globally, leaves null last in both directions, and clamps pages', () => {
    const ascending = composePartnershipAggregation(rows, query({ sort: 'nav', direction: 'asc', pageSize: 25 }))
    const descending = composePartnershipAggregation(rows, query({ sort: 'nav', direction: 'desc', pageSize: 25 }))
    expect(ascending.items.map((group) => group.name)).toEqual(['Delta Warning', 'Alpha Growth I', 'Beacon Credit', 'Cedar Legacy'])
    expect(descending.items.map((group) => group.name)).toEqual(['Beacon Credit', 'Alpha Growth I', 'Delta Warning', 'Cedar Legacy'])
    expect(composePartnershipAggregation(rows, query({ page: 99, pageSize: 25 })).pageInfo.page).toBe(1)
    expect(composePartnershipAggregation([], query({ page: 99 })).pageInfo).toMatchObject({ page: 1, totalPages: 0, hasPreviousPage: false, hasNextPage: false })
  })

  it('groups owner records before sorting and pagination and aggregates their exact totals', () => {
    const groupId = '00000000-0000-4000-8000-000000000900'
    const first = summary({
      id: '00000000-0000-4000-8000-000000000901',
      name: 'AC Bell Investors, LLC',
      partnership: { ...alpha.partnership, id: '00000000-0000-4000-8000-000000000901', aggregationGroupId: groupId, name: 'AC Bell Investors, LLC' },
    })
    const second = summary({
      id: '00000000-0000-4000-8000-000000000902',
      name: 'AC Bell Investors, LLC',
      ownerId: '00000000-0000-4000-8000-000000000002',
      ownerName: 'Beacon Holdings',
      partnership: { ...alpha.partnership, id: '00000000-0000-4000-8000-000000000902', aggregationGroupId: groupId, name: 'AC Bell Investors, LLC', entity: { id: '00000000-0000-4000-8000-000000000002', name: 'Beacon Holdings' } },
      currentCommittedCapital: { amount: '250000.00', date: '2022-01-01' },
      totalCapitalContributions: '140000.00',
      totalDistributions: '35000.00',
      latestNav: { amount: '180000.00', date: '2026-03-31' },
      unfundedCommitmentAmount: '110000.00',
    })

    const result = composePartnershipAggregation([first, second], query({ pageSize: 25 }), '2026-07-16')

    expect(result.pageInfo.totalItems).toBe(1)
    expect(result.rollup).toMatchObject({ partnershipCount: 1, ownerRecordCount: 2 })
    expect(result.items[0]).toMatchObject({
      groupKey: groupId,
      name: 'AC Bell Investors, LLC',
      ownerCount: 2,
      totals: {
        committedCapital: { amount: '350000.00', knownCount: 2, totalCount: 2 },
        paidInCapital: { amount: '200000.00', knownCount: 2, totalCount: 2 },
        distributions: { amount: '50000.00', knownCount: 2, totalCount: 2 },
        latestNav: { amount: '255000.00', knownCount: 2, totalCount: 2 },
        unfundedCommitment: { amount: '150000.00', knownCount: 2, totalCount: 2 },
        dpi: { value: '0.25000000', status: 'AVAILABLE' },
        tvpi: { value: '1.52500000', status: 'AVAILABLE' },
      },
    })
    expect(result.items[0]?.members.map((member) => member.partnership.entity.name)).toEqual(['Alder Family', 'Beacon Holdings'])
  })

  it.each(['partnership', 'owner', 'type', 'status', 'commitment', 'paidIn', 'distributions', 'nav', 'unfunded', 'dpi', 'tvpi', 'irr', 'cashYield', 'latestTaxYear', 'warningCount'] as const)('supports the %s sort key', (sort) => {
    expect(composePartnershipAggregation(rows, query({ sort })).items).toHaveLength(4)
    expect(composePartnershipAggregation(rows, query({ sort, direction: 'desc' })).items).toHaveLength(4)
  })
})
