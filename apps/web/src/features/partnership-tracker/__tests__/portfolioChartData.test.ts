import { describe, expect, it } from 'vitest'
import type { PartnershipAggregateRow, PartnershipPortfolioCashFlowEvent, PartnershipType } from '../../../../../../packages/types/src/partnership-tracker'
import { buildPortfolioChartData, portfolioMoney } from '../components/magic-patterns/portfolioChartData'
import { summaryFixture } from './fixtures'

const event = (id: string, kind: PartnershipPortfolioCashFlowEvent['kind'], activityDate: string, amount: string, feesAndCarry = '0.0000'): PartnershipPortfolioCashFlowEvent => ({ id, kind, activityDate, amount, feesAndCarry })
const member = (id: string, type: PartnershipType, commitment: string, paidIn: string, remaining: string, distributions: string, cashFlowEvents: PartnershipPortfolioCashFlowEvent[]): PartnershipAggregateRow => ({
  ...summaryFixture,
  partnership: { ...summaryFixture.partnership, id, partnershipType: type },
  currentCommittedCapital: { amount: commitment, date: '2026-01-01' },
  totalCapitalContributions: paidIn,
  unfundedCommitmentAmount: remaining,
  totalDistributions: distributions,
  dataQuality: 'COMPLETE',
  cashFlowEvents,
})

describe('portfolio chart data', () => {
  const realEstate = member('real-estate', 'Real Estate', '200.00', '100.00', '100.00', '40.00', [
    event('call', 'CAPITAL_CALL', '2026-01-01', '100.00'),
    event('fee-only', 'CAPITAL_CALL', '2026-02-01', '0.0000', '10.0000'),
    event('distribution', 'DISTRIBUTION', '2026-03-01', '40.00', '5.0000'),
  ])
  const privateEquity = member('private-equity', 'Private Equity', '300.00', '150.00', '150.00', '90.00', [
    event('call-2', 'CAPITAL_CALL', '2026-01-01', '150.00'),
    event('distribution-2', 'DISTRIBUTION', '2026-04-01', '90.00'),
  ])

  it('sums selected owner records, funding, and settled cash exactly', () => {
    const result = buildPortfolioChartData([realEstate, privateEquity])
    expect(result.commitment).toMatchObject({ committed: 5_000_000n, paidIn: 2_500_000n, remaining: 2_500_000n, coveredCount: 2 })
    expect(result.distributions.byType).toEqual([
      { type: 'Private Equity', amount: 900_000n },
      { type: 'Real Estate', amount: 400_000n },
    ])
    expect(result.cash).toMatchObject({ paid: 2_600_000n, returned: 1_250_000n, eventCount: 5 })
    expect(result.funding).toMatchObject({ committed: 5_000_000n, called: 2_500_000n, coveredCount: 2 })
    expect(result.funding.years).toEqual([{ year: 2026, called: 2_500_000n, cumulative: 2_500_000n }])
    expect(portfolioMoney(1_001_250n)).toBe('$100.13')
  })

  it('uses only the records passed after filtering', () => {
    const result = buildPortfolioChartData([realEstate])
    expect(result.commitment.committed).toBe(2_000_000n)
    expect(result.distributions.byType).toEqual([{ type: 'Real Estate', amount: 400_000n }])
    expect(result.cash.paid).toBe(1_100_000n)
    expect(result.cash.returned).toBe(350_000n)
    expect(result.funding.called).toBe(1_000_000n)
  })

  it('shows cumulative annual funding, including a flat year with a fee-only call', () => {
    const record = member('annual', 'Real Estate', '1500000', '900000', '600000', '0', [
      event('2023-call', 'CAPITAL_CALL', '2023-04-01', '400000'),
      event('2024-call', 'CAPITAL_CALL', '2024-04-01', '500000'),
      event('2025-fee', 'CAPITAL_CALL', '2025-04-01', '0', '1000'),
    ])
    const result = buildPortfolioChartData([record])
    expect(result.funding).toMatchObject({ committed: 15_000_000_000n, called: 9_000_000_000n })
    expect(result.funding.years).toEqual([
      { year: 2023, called: 4_000_000_000n, cumulative: 4_000_000_000n },
      { year: 2024, called: 5_000_000_000n, cumulative: 9_000_000_000n },
      { year: 2025, called: 0n, cumulative: 9_000_000_000n },
    ])
    expect(result.cash.paid).toBe(9_010_000_000n)
  })
})
