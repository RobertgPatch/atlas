import { describe, expect, it } from 'vitest'
import type { PartnershipAggregateRow } from '../../../../../packages/types/src/partnership-tracker'
import { summaryFixture } from '../partnership-tracker/__tests__/fixtures'
import { buildInvestmentTrackerRollup } from './investmentTrackerRollup'

const member = (overrides: Partial<PartnershipAggregateRow>): PartnershipAggregateRow => ({
  ...summaryFixture, dataQuality: 'COMPLETE', cashFlowEvents: [], ...overrides,
})

describe('Investment tracker summary rollup', () => {
  it('combines exact amounts and recomputes ratios from totals rather than averaging owner ratios', () => {
    const result = buildInvestmentTrackerRollup([
      member({ currentCommittedCapital: { amount: '0.10', date: '2026-01-01' }, totalCapitalContributions: '100.00', totalDistributions: '50.00', latestNav: { amount: '100.00', date: '2026-02-01' }, dpi: '0.5', tvpi: '1.5' }),
      member({ currentCommittedCapital: { amount: '0.20', date: '2026-01-01' }, totalCapitalContributions: '900.00', totalDistributions: '90.00', latestNav: { amount: '300.00', date: '2026-07-01' }, dpi: '0.1', tvpi: '0.43333333' }),
    ], 1, '2026-10-02')
    expect(result.committedCapital.amount).toBe('0.3000')
    expect(result.dpi.value).toBe('0.14000000')
    expect(result.tvpi.value).toBe('0.54000000')
    expect(result.navValuationRange).toEqual({ earliest: '2026-02-01', latest: '2026-07-01' })
    expect(result.partnershipCount).toBe(1)
    expect(result.ownerRecordCount).toBe(2)
  })

  it('retains missing-data coverage and excludes missing valuations from date ranges', () => {
    const result = buildInvestmentTrackerRollup([
      member({ totalCapitalContributions: '100.00', totalDistributions: '20.00', latestNav: { amount: '75.00', date: '2026-07-01' } }),
      member({ currentCommittedCapital: null, totalCapitalContributions: null, totalDistributions: null, latestNav: null, unfundedCommitmentAmount: null }),
    ], 2, '2026-10-02')
    expect(result.latestNav).toEqual({ amount: '75.0000', knownCount: 1, totalCount: 2 })
    expect(result.committedCapital.knownCount).toBe(1)
    expect(result.navValuationRange).toEqual({ earliest: '2026-07-01', latest: '2026-07-01' })
    expect(result.dpi).toMatchObject({ value: '0.20000000', status: 'PARTIAL_COVERAGE', numeratorKnownCount: 1, denominatorKnownCount: 1, totalCount: 2 })
    expect(result.tvpi.value).toBe('0.95000000')
  })

  it('returns unavailable totals for an empty selection and unavailable ratios for zero paid-in capital', () => {
    const empty = buildInvestmentTrackerRollup([], 0, '2026-10-02')
    expect(empty.committedCapital).toEqual({ amount: null, knownCount: 0, totalCount: 0 })
    expect(empty.dpi.status).toBe('NO_DATA')
    expect(empty.tvpi.value).toBeNull()
    expect(empty.navValuationRange).toEqual({ earliest: null, latest: null })
    const zero = buildInvestmentTrackerRollup([member({ totalCapitalContributions: '0.00' })], 1, '2026-10-02')
    expect(zero.paidInCapital.amount).toBe('0.0000')
    expect(zero.dpi.status).toBe('ZERO_DENOMINATOR')
    expect(zero.tvpi.value).toBeNull()
  })
})
