import { describe, expect, it } from 'vitest'
import { calculateInvestmentPerformance, calculatePortfolioInvestmentPerformance } from '../src/modules/partnership-tracker/investment-performance.js'

const position = (amount: string, distribution: string, nav: string, date: string) => {
  const cashFlowEvents = [
    { kind: 'CAPITAL_CALL' as const, activityDate: '2021-01-01', amount },
    { kind: 'DISTRIBUTION' as const, activityDate: date, amount: distribution, feesAndCarry: '1.0005' },
    { kind: 'CAPITAL_CALL' as const, activityDate: '2020-01-01', amount: '9999', settlementStatus: 'ANNOUNCED' as const },
  ]
  return { cashFlowEvents, investmentPerformance: calculateInvestmentPerformance({ cashFlowEvents, committedCapital: amount, latestNav: { amount: nav, date } }) }
}

describe('Portfolio investment performance', () => {
  it('matches every individual metric when exactly one partnership is selected', () => {
    const item = position('100', '150', '30', '2022-01-01')
    expect(calculatePortfolioInvestmentPerformance([item])).toEqual(item.investmentPerformance)
  })

  it('pools precise cash amounts and ratios and retains each residual valuation date', () => {
    const first = position('100', '150', '30', '2022-01-01')
    const second = position('300', '400', '60', '2023-01-01')
    const result = calculatePortfolioInvestmentPerformance([first, second])
    expect(result).toMatchObject({ paidInCapital: '400.0000', committedCapital: '400.0000', grossDistributions: '550.0000',
      feesAndCarry: '-2.0010', netDistributions: '547.9990', residualValue: '90.0000', rvpi: '0.22500000', finalLiquidationDate: null })
    // Convert each dated residual into a net cash receipt to independently check the pooled XIRR.
    const expected = calculateInvestmentPerformance({ cashFlowEvents: [
      ...first.cashFlowEvents, ...second.cashFlowEvents,
      { kind: 'DISTRIBUTION', activityDate: '2022-01-01', amount: '30' },
      { kind: 'DISTRIBUTION', activityDate: '2023-01-01', amount: '60' },
    ], committedCapital: '400', latestNav: null })
    expect(result.netXirrIncludingResidual).toBe(expected.netXirr)
    expect(Number(result.netXirr)).not.toBeCloseTo((Number(first.investmentPerformance.netXirr) + Number(second.investmentPerformance.netXirr)) / 2, 5)
  })

  it('does not claim complete commitment or liquidation when a selected record lacks it', () => {
    const first = position('100', '150', '30', '2022-01-01')
    const second = position('300', '400', '60', '2023-01-01')
    first.investmentPerformance.finalLiquidationDate = '2022-01-01'
    second.investmentPerformance.committedCapital = null
    expect(calculatePortfolioInvestmentPerformance([first, second])).toMatchObject({ committedCapital: null, commitmentCalled: null, finalLiquidationDate: null, holdingPeriodYears: null })
    expect(calculatePortfolioInvestmentPerformance([])).toMatchObject({ committedCapital: null, grossXirr: null, paidInCapital: '0.0000' })
  })
})
