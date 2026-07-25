import { describe, expect, it } from 'vitest'
import type { PartnershipTrackerSummary, PrivateInvestmentQuery } from '../src/modules/partnership-tracker/partnership-tracker.contracts.js'
import {
  composePrivateInvestmentTracker,
  mapPrivateInvestmentActivity,
  type PrivateInvestmentSourceRow,
} from '../src/modules/partnership-tracker/private-investment-tracker.js'
import { privateInvestmentQuerySchema } from '../src/modules/partnership-tracker/partnership-tracker.zod.js'

const summary = (id: string, entityId: string, entityName: string, fundName: string): PartnershipTrackerSummary => ({
  partnership: {
    id,
    aggregationGroupId: id,
    entity: { id: entityId, name: entityName },
    name: fundName,
    partnershipType: 'Private Equity',
    status: 'ACTIVE',
    notes: null,
    inceptionDate: '2021-01-01',
    managementFeeRate: null,
    ein: null,
    fundManager: null,
    addressLine1: null,
    addressLine2: null,
    addressCity: null,
    addressRegion: null,
    addressPostalCode: null,
    addressCountry: null,
    createdAt: '2021-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  currentCommittedCapital: { amount: '1000.00', date: '2025-01-01' },
  latestNav: { amount: '900.00', date: '2025-12-31' },
  earliestK1Year: 2021,
  latestTaxYear: 2025,
  latestWorkflowStatus: 'RECONCILED',
  latestEndingOutsideBasis: '700.00',
  latestSectionLCapital: '710.00',
  totalCapitalContributions: '800.00',
  totalDistributions: '150.00',
  totalRecallableDistributions: '25.00',
  dpi: '0.18750000',
  tvpi: '1.31250000',
  irr: '0.11000000',
  irrTerminalDate: '2025-12-31',
  irrUsesCarriedForwardNav: false,
  annualizedCashOnCashYield: '0.04000000',
  performanceAsOfDate: '2026-07-23',
  unfundedCommitmentAmount: '200.00',
  unfundedCommitmentPercentage: '0.20000000',
  performanceStatus: { dpi: 'AVAILABLE', tvpi: 'AVAILABLE', irr: 'AVAILABLE', annualizedCashOnCashYield: 'AVAILABLE', unfundedCommitment: 'AVAILABLE' },
  simplifiedIrr: '0.10000000',
  displayIrr: '0.11000000',
  irrType: 'XIRR',
  vintageYear: 2021,
  warningCount: 0,
})

const source = (overrides: Partial<PrivateInvestmentSourceRow> = {}): PrivateInvestmentSourceRow => ({
  sourceId: '00000000-0000-4000-8000-000000000101',
  sourceKind: 'NET_CASH_ACTIVITY',
  entityId: '00000000-0000-4000-8000-000000000001',
  entityName: 'Alder Trust',
  partnershipId: '00000000-0000-4000-8000-000000000011',
  partnershipName: 'Growth Fund',
  date: '2025-03-01',
  type: 'CAPITAL_CALL',
  amount: '800.00',
  sourceType: 'manual',
  note: null,
  createdAt: '2025-03-01T12:00:00.000Z',
  ...overrides,
})
const query = (overrides: Partial<PrivateInvestmentQuery> = {}): PrivateInvestmentQuery => ({
  assetClasses: [],
  entityIds: [],
  partnershipIds: [],
  dateFrom: null,
  dateTo: null,
  amountMin: null,
  amountMax: null,
  page: 1,
  pageSize: 25,
  ...overrides,
})

describe('private investment tracker composition', () => {
  it('maps accounting direction and stable source row identity', () => {
    expect(mapPrivateInvestmentActivity(source())).toMatchObject({
      rowId: 'NET_CASH_ACTIVITY:00000000-0000-4000-8000-000000000101',
      type: 'CAPITAL_CALL',
      displayDirection: 'OUTFLOW',
    })
    expect(mapPrivateInvestmentActivity(source({ type: 'VALUATION', sourceKind: 'CAPITAL_AND_NAV' })).displayDirection).toBe('POINT_IN_TIME')
  })

  it('uses asset-class-filtered membership with complete lifetime position metrics', () => {
    const first = summary('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000001', 'Alder Trust', 'Growth Fund')
    const second = summary('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000002', 'Birch Trust', 'Growth Fund')
    second.partnership.partnershipType = 'Credit'
    const result = composePrivateInvestmentTracker([first, second], [
      source(),
      source({ sourceId: '00000000-0000-4000-8000-000000000102', type: 'NON_RECALLABLE_DISTRIBUTION', amount: '150.00', date: '2025-09-01' }),
      source({ sourceId: '00000000-0000-4000-8000-000000000103', entityId: second.partnership.entity.id, entityName: second.partnership.entity.name, partnershipId: second.partnership.id, amount: '500.00' }),
    ], query({ assetClasses: ['Private Equity'] }), '2026-07-23')

    expect(result.activities).toHaveLength(2)
    expect(result.positions).toHaveLength(1)
    expect(result.positions[0]).toMatchObject({
      positionKey: `${first.partnership.entity.id}:${first.partnership.id}`,
      totalInvested: '800.00',
      nonRecallableDistributions: '150.00',
      recallableDistributions: '25.00',
    })
    expect(result.facets.assetClasses).toEqual([
      { value: 'Private Equity', label: 'Private Equity', count: 2 },
      { value: 'Credit', label: 'Credit', count: 1 },
    ])
    expect(result.facets.partnerships[0]).toHaveProperty('assetClass')
  })

  it('keeps every copied owner position visible before it has cash activity', () => {
    const beggs = summary('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000001', 'Beggs B. Gardner Trust', 'AC Bell Investors, LLC')
    const georgia = summary('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000002', 'Georgia Gardner Trust', 'AC Bell Investors, LLC')
    const theodore = summary('00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000003', 'Theodore Gardner Trust', 'AC Bell Investors, LLC')
    const result = composePrivateInvestmentTracker([beggs, georgia, theodore], [source({
      entityId: beggs.partnership.entity.id,
      entityName: beggs.partnership.entity.name,
      partnershipId: beggs.partnership.id,
      partnershipName: beggs.partnership.name,
    })], query())

    expect(result.positions.map((position) => position.entity.name)).toEqual([
      'Beggs B. Gardner Trust',
      'Georgia Gardner Trust',
      'Theodore Gardner Trust',
    ])
    expect(result.positions.every((position) => position.totalCommitted?.amount === '1000.00')).toBe(true)
    expect(result.facets.entities).toHaveLength(3)

    const georgiaOnly = composePrivateInvestmentTracker([beggs, georgia, theodore], [source({
      entityId: beggs.partnership.entity.id,
      entityName: beggs.partnership.entity.name,
      partnershipId: beggs.partnership.id,
      partnershipName: beggs.partnership.name,
    })], query({ entityIds: [georgia.partnership.entity.id] }))
    expect(georgiaOnly.positions).toHaveLength(1)
    expect(georgiaOnly.positions[0]?.entity.name).toBe('Georgia Gardner Trust')
    expect(georgiaOnly.activities).toHaveLength(0)
  })

  it('applies inclusive amount/date filters, newest-first ties, and page clamping', () => {
    const item = summary('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000001', 'Alder Trust', 'Growth Fund')
    const result = composePrivateInvestmentTracker([item], [
      source({ sourceId: '00000000-0000-4000-8000-000000000102', amount: '100.00', date: '2025-01-01' }),
      source({ sourceId: '00000000-0000-4000-8000-000000000101', amount: '100.00', date: '2025-01-01', createdAt: '2025-01-02T00:00:00.000Z' }),
      source({ sourceId: '00000000-0000-4000-8000-000000000103', amount: '99.99', date: '2025-01-01' }),
    ], query({ dateFrom: '2025-01-01', dateTo: '2025-01-01', amountMin: '100.00', amountMax: '100.00', page: 99 }))
    expect(result.allMatchingActivities.map((row) => row.sourceId)).toEqual([
      '00000000-0000-4000-8000-000000000102',
      '00000000-0000-4000-8000-000000000101',
    ])
    expect(result.query.page).toBe(1)
  })

  it('canonicalizes query lists and rejects reversed ranges', () => {
    const parsed = privateInvestmentQuerySchema.parse({
      assetClasses: 'Credit,Private Equity,Credit',
      entityIds: '00000000-0000-4000-8000-000000000002,00000000-0000-4000-8000-000000000001',
      pageSize: '25',
    })
    expect(parsed.assetClasses).toEqual(['Private Equity', 'Credit'])
    expect(parsed.entityIds).toEqual([
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
    ])
    expect(() => privateInvestmentQuerySchema.parse({ dateFrom: '2025-02-01', dateTo: '2025-01-01' })).toThrow()
    expect(() => privateInvestmentQuerySchema.parse({ amountMin: '100.00', amountMax: '99.99' })).toThrow()
  })
})
