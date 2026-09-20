import { afterEach, describe, expect, it, vi } from 'vitest'
import { composePartnershipPerformance, type PartnershipPerformanceInput } from '../src/modules/partnership-tracker/partnership-performance.js'

const input: PartnershipPerformanceInput = {
  annualValues: [],
  cashFlowEvents: [
    { kind: 'CAPITAL_CALL', activityDate: '2020-01-01', amount: '100000.00' },
    { kind: 'DISTRIBUTION', activityDate: '2023-01-01', amount: '40000.00' },
    { kind: 'RECALLABLE_DISTRIBUTION', activityDate: '2024-01-01', amount: '10000.00' },
  ],
  inceptionDate: '2020-01-01',
  latestNav: { amount: '900000.00', date: '2021-01-01' },
}

afterEach(() => vi.useRealTimers())

describe('Lifetime cash-on-cash yield', () => {
  it('divides called capital by all distributions and years to today, independently of NAV', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-01T12:00:00Z'))
    const result = composePartnershipPerformance(input)
    expect(result.annualizedCashOnCashYield).toBe('0.50000000')
    expect(result.performanceStatus.annualizedCashOnCashYield).toBe('AVAILABLE')
  })

  it('freezes duration at liquidation even as the current date advances', () => {
    const liquidated = { ...input, finalLiquidationDate: '2024-01-01' }
    expect(composePartnershipPerformance({ ...liquidated, asOfDate: '2025-01-01' }).annualizedCashOnCashYield).toBe('0.50000000')
    expect(composePartnershipPerformance({ ...liquidated, asOfDate: '2026-09-19' }).annualizedCashOnCashYield).toBe('0.50000000')
  })

  it.each(['2020-01-01', '2019-12-31'])('does not fabricate a duration ending %s', (asOfDate) => {
    const result = composePartnershipPerformance({ ...input, asOfDate })
    expect(result.annualizedCashOnCashYield).toBeNull()
    expect(result.performanceStatus.annualizedCashOnCashYield).toBe('INSUFFICIENT_CASH_FLOWS')
  })

  it('reports unavailable without distributions, called capital, or inception', () => {
    for (const cashFlowEvents of [[], input.cashFlowEvents!.slice(0, 1), input.cashFlowEvents!.slice(1)]) {
      expect(composePartnershipPerformance({ ...input, cashFlowEvents }).annualizedCashOnCashYield).toBeNull()
    }
    expect(composePartnershipPerformance({ ...input, inceptionDate: null }).annualizedCashOnCashYield).toBeNull()
  })
})
