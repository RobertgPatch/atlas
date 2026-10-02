import { describe, expect, it } from 'vitest'
import { calculateInvestmentPerformance } from '../src/modules/partnership-tracker/investment-performance.js'
import { createPartnershipCashFlowBodySchema, createPartnershipCashFlowsBodySchema, updatePartnershipCashFlowBodySchema } from '../src/modules/partnership-tracker/partnership-tracker.zod.js'

// No Target!A26:I32. Activity amounts are gross (column D); net = gross + signed fees (columns E/F).
const schedule = [
  { activityDate: '2021-01-28', kind: 'CAPITAL_CALL' as const, amount: '612000.00' },
  { activityDate: '2022-09-20', kind: 'DISTRIBUTION' as const, amount: '392957.70' },
  { activityDate: '2023-11-01', kind: 'CAPITAL_CALL' as const, amount: '7374.03' },
  { activityDate: '2024-09-20', kind: 'CAPITAL_CALL' as const, amount: '7375.44' },
  { activityDate: '2025-04-17', kind: 'CAPITAL_CALL' as const, amount: '7128.22' },
  { activityDate: '2026-03-18', kind: 'CAPITAL_CALL' as const, amount: '8060.86' },
  { activityDate: '2026-09-15', kind: 'DISTRIBUTION' as const, amount: '1211888.675', feesAndCarry: '192581.565' },
]
const input = { cashFlowEvents: schedule, committedCapital: '600000', latestNav: null, finalLiquidationDate: '2026-09-15' }

describe('Investment Performance workbook parity', () => {
  it('matches every result in No Target!B9:B22 without rounding half-cent inputs', () => {
    expect(calculateInvestmentPerformance(input)).toMatchObject({
      paidInCapital: '641938.5500', grossDistributions: '1604846.3750', feesAndCarry: '-192581.5650',
      netDistributions: '1412264.8100', commitmentCalled: '1.06989758', grossMoic: '2.50000000',
      netMoicDpi: '2.20000000', netXirr: '0.21479396', netGain: '770326.2600',
      holdingPeriodYears: '5.63287671', rvpi: '0.00000000', tvpi: '2.20000000', netXirrIncludingResidual: '0.21479396',
      residualValue: '0.0000', xirrTerminalDate: '2026-09-15',
    })
    // Excel's iterative XIRR cache and bisection can differ below 1e-7.
    expect(Number(calculateInvestmentPerformance(input).grossXirr)).toBeCloseTo(0.24604062438011168, 7)
  })

  it('only adds NAV to RVPI, TVPI and the residual-inclusive XIRR', () => {
    const original = calculateInvestmentPerformance(input)
    const withNav = calculateInvestmentPerformance({ ...input, latestNav: { amount: '100000', date: '2026-09-15' } })
    for (const field of ['netGain', 'grossXirr', 'netXirr', 'grossMoic', 'netMoicDpi'] as const) expect(withNav[field]).toBe(original[field])
    expect(Number(withNav.rvpi)).toBeCloseTo(100000 / 641938.55, 8)
    expect(Number(withNav.tvpi)).toBeCloseTo(2.2 + 100000 / 641938.55, 8)
    expect(Number(withNav.netXirrIncludingResidual)).toBeGreaterThan(Number(original.netXirr))
    expect(calculateInvestmentPerformance({ ...input, latestNav: { amount: '0', date: '2026-09-15' } })).toMatchObject({
      netXirrIncludingResidual: original.netXirrIncludingResidual, tvpi: original.tvpi,
    })
  })

  it('sorts dates, includes recallable distributions, and excludes announced activity', () => {
    const cashFlowEvents = [...schedule].reverse().map((flow) => flow.kind === 'DISTRIBUTION' ? { ...flow, kind: 'RECALLABLE_DISTRIBUTION' as const } : flow)
    expect(calculateInvestmentPerformance({ ...input, cashFlowEvents: [...cashFlowEvents,
      { kind: 'CAPITAL_CALL', amount: '1000000', activityDate: '2020-01-01', settlementStatus: 'ANNOUNCED' },
    ] })).toEqual(calculateInvestmentPerformance(input))
  })

  it('returns n/a for zero denominators, no liquidation date, and undefined XIRRs', () => {
    const result = calculateInvestmentPerformance({ cashFlowEvents: [], committedCapital: '0', latestNav: null })
    expect(result).toMatchObject({ paidInCapital: '0.0000', feesAndCarry: '0.0000', residualValue: '0.0000',
      commitmentCalled: null, grossMoic: null, netMoicDpi: null, rvpi: null, tvpi: null,
      grossXirr: null, netXirr: null, netXirrIncludingResidual: null, holdingPeriodYears: null, finalLiquidationDate: null })
    expect(calculateInvestmentPerformance({ ...input, finalLiquidationDate: '2020-01-01' }).holdingPeriodYears).toBeNull()
  })

  it('deducts fees from contribution and distribution cash flows per columns D/E/F', () => {
    const result = calculateInvestmentPerformance({ committedCapital: '100', latestNav: null, cashFlowEvents: [
      { kind: 'CAPITAL_CALL', activityDate: '2021-01-01', amount: '110', feesAndCarry: '10' },
      { kind: 'DISTRIBUTION', activityDate: '2022-01-01', amount: '150', feesAndCarry: '20' },
    ] })
    expect(result).toMatchObject({ paidInCapital: '110.0000', grossDistributions: '150.0000', feesAndCarry: '-30.0000', netDistributions: '120.0000', netGain: '10.0000', grossXirr: '0.36363636', netXirr: '0.08333333', tvpi: '1.09090909' })
  })

  it('floors net gain at zero when paid-in capital has no distributions', () => {
    const result = calculateInvestmentPerformance({ committedCapital: '1000', latestNav: null, cashFlowEvents: [
      { kind: 'CAPITAL_CALL', activityDate: '2026-01-01', amount: '600.00' },
      { kind: 'CAPITAL_CALL', activityDate: '2026-06-01', amount: '125.50' },
    ] })

    expect(result).toMatchObject({
      paidInCapital: '725.5000',
      grossDistributions: '0.0000',
      netDistributions: '0.0000',
      netGain: '0.0000',
    })
  })

  it('uses recorded gross distributions for the user-reported whole-dollar figures', () => {
    const result = calculateInvestmentPerformance({ committedCapital: '600000', latestNav: null, cashFlowEvents: [
      { kind: 'CAPITAL_CALL', activityDate: '2021-01-28', amount: '641938.00' },
      { kind: 'DISTRIBUTION', activityDate: '2026-09-15', amount: '1604846.68', feesAndCarry: '192581.57' },
    ] })
    expect(result).toMatchObject({ grossDistributions: '1604846.6800', feesAndCarry: '-192581.5700',
      netDistributions: '1412265.1100', netGain: '770327.1100', tvpi: '2.20000235' })
    expect(Number(result.netXirr)).toBeLessThan(Number(result.grossXirr))
    expect(result.netXirrIncludingResidual).toBe(result.netXirr)
  })

  it('accepts four-decimal actual fees and rejects negative or excessive precision', () => {
    const base = { kind: 'CAPITAL_CALL', activityDate: '2026-09-15', amount: '100.00' }
    expect(createPartnershipCashFlowBodySchema.parse({ ...base, feesAndCarry: '1.2345' }).feesAndCarry).toBe('1.2345')
    expect(createPartnershipCashFlowBodySchema.safeParse({ ...base, feesAndCarry: '101' }).success).toBe(true)
    for (const feesAndCarry of ['-1', '1.23456']) expect(createPartnershipCashFlowBodySchema.safeParse({ ...base, feesAndCarry }).success).toBe(false)
  })

  it('allows a fee-only capital call and excludes its zero gross amount from paid-in capital', () => {
    const feeOnly = { kind: 'CAPITAL_CALL' as const, activityDate: '2026-09-15', amount: '0.00', feesAndCarry: '25.1250' }
    expect(createPartnershipCashFlowBodySchema.safeParse(feeOnly).success).toBe(true)
    expect(updatePartnershipCashFlowBodySchema.safeParse({ ...feeOnly, expectedUpdatedAt: '2026-09-16T00:00:00Z' }).success).toBe(true)
    for (const invalid of [
      { ...feeOnly, feesAndCarry: '0' },
      { kind: 'DISTRIBUTION', activityDate: feeOnly.activityDate, amount: '0.00', feesAndCarry: '25.1250' },
      { kind: 'RECALLABLE_DISTRIBUTION', activityDate: feeOnly.activityDate, amount: '0.00', feesAndCarry: '25.1250' },
    ]) expect(createPartnershipCashFlowBodySchema.safeParse(invalid).success).toBe(false)

    expect(calculateInvestmentPerformance({ committedCapital: '100', latestNav: null, cashFlowEvents: [
      { kind: 'CAPITAL_CALL', activityDate: '2025-01-01', amount: '100.00' },
      feeOnly,
      { kind: 'DISTRIBUTION', activityDate: '2026-12-31', amount: '150.00' },
    ] })).toMatchObject({ paidInCapital: '100.0000', grossDistributions: '150.0000', feesAndCarry: '-25.1250', netDistributions: '124.8750' })
  })

  it('allows one settled, non-recallable final liquidation in a batch', () => {
    const final = { kind: 'DISTRIBUTION', activityDate: '2026-09-15', amount: '100.00', isFinalLiquidation: true }
    expect(createPartnershipCashFlowBodySchema.safeParse(final).success).toBe(true)
    for (const invalid of [
      { ...final, kind: 'CAPITAL_CALL' },
      { ...final, kind: 'RECALLABLE_DISTRIBUTION' },
      { ...final, settlementStatus: 'ANNOUNCED' },
    ]) expect(createPartnershipCashFlowBodySchema.safeParse(invalid).success).toBe(false)
    expect(createPartnershipCashFlowsBodySchema.safeParse({ entries: [final, final] }).success).toBe(false)
  })
})
