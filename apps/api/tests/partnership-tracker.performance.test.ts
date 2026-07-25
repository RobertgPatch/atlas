import { describe, expect, it } from 'vitest'
import { composePartnershipPerformance } from '../src/modules/partnership-tracker/partnership-performance.js'

describe('Partnership Tracker operational performance', () => {
  it('uses only dated operational events and separates both distribution classes', () => {
    const result = composePartnershipPerformance({
      cashFlowEvents: [
        { kind: 'CAPITAL_CALL', activityDate: '2021-01-01', amount: '1000000.00' },
        { kind: 'CAPITAL_CALL', activityDate: '2022-01-01', amount: '2000000.00' },
        { kind: 'DISTRIBUTION', activityDate: '2022-07-01', amount: '190773.00' },
        { kind: 'RECALLABLE_DISTRIBUTION', activityDate: '2022-09-01', amount: '5000.00' },
      ],
      latestNav: { amount: '3000000.00', date: '2022-12-31' },
    })

    expect(result.totalCapitalContributions).toBe('3000000.00')
    expect(result.totalDistributions).toBe('190773.00')
    expect(result.totalRecallableDistributions).toBe('5000.00')
    expect(result.dpi).toBe('0.06359100')
    expect(result.tvpi).toBe('1.06359100')
    expect(result.irr).not.toBeNull()
    expect(result.performanceStatus).toMatchObject({ dpi: 'AVAILABLE', tvpi: 'AVAILABLE', irr: 'AVAILABLE' })
  })

  it('never fabricates operational cash from missing activity', () => {
    const result = composePartnershipPerformance({
      cashFlowEvents: [],
      latestNav: { amount: '200.00', date: '2023-12-31' },
    })
    expect(result.totalCapitalContributions).toBe('0.00')
    expect(result.totalDistributions).toBe('0.00')
    expect(result.totalRecallableDistributions).toBe('0.00')
    expect(result.dpi).toBeNull()
    expect(result.performanceStatus.dpi).toBe('MISSING_CONTRIBUTIONS')
  })

  it('keeps zero distinct from missing and discloses a carried-forward NAV', () => {
    const zero = composePartnershipPerformance({ cashFlowEvents: [], latestNav: null })
    const staleNav = composePartnershipPerformance({
      cashFlowEvents: [
        { kind: 'CAPITAL_CALL', activityDate: '2022-01-01', amount: '100.00' },
        { kind: 'DISTRIBUTION', activityDate: '2024-12-31', amount: '10.00' },
      ],
      latestNav: { amount: '100.00', date: '2023-12-31' },
      asOfDate: '2024-12-31',
    })
    expect(zero.totalCapitalContributions).toBe('0.00')
    expect(zero.dpi).toBeNull()
    expect(staleNav.performanceStatus.irr).toBe('AVAILABLE')
    expect(staleNav.irrTerminalDate).toBe('2024-12-31')
    expect(staleNav.irrUsesCarriedForwardNav).toBe(true)
  })

  it('handles negative returns, ambiguous roots, and missing NAV', () => {
    const negative = composePartnershipPerformance({
      cashFlowEvents: [{ kind: 'CAPITAL_CALL', activityDate: '2021-01-01', amount: '100.00' }],
      latestNav: { amount: '50.00', date: '2022-01-01' },
    })
    const ambiguous = composePartnershipPerformance({
      cashFlowEvents: [
        { kind: 'CAPITAL_CALL', activityDate: '2021-01-01', amount: '100.00' },
        { kind: 'DISTRIBUTION', activityDate: '2022-01-01', amount: '230.00' },
        { kind: 'CAPITAL_CALL', activityDate: '2023-01-01', amount: '132.00' },
      ],
      latestNav: { amount: '0.00', date: '2023-01-01' },
    })
    const missingNav = composePartnershipPerformance({
      cashFlowEvents: [{ kind: 'CAPITAL_CALL', activityDate: '2024-01-01', amount: '100.00' }],
      latestNav: null,
    })

    expect(negative.irr).toMatch(/^-/)
    expect(ambiguous.performanceStatus.irr).toBe('AMBIGUOUS_IRR')
    expect(missingNav.performanceStatus).toMatchObject({ dpi: 'AVAILABLE', tvpi: 'MISSING_NAV', irr: 'MISSING_NAV' })
  })

  it('derives commitment without double-counting recallable snapshots', () => {
    const result = composePartnershipPerformance({
      cashFlowEvents: [
        { kind: 'CAPITAL_CALL', activityDate: '2022-07-01', amount: '100000.00' },
        { kind: 'DISTRIBUTION', activityDate: '2024-01-01', amount: '10000.00' },
        { kind: 'RECALLABLE_DISTRIBUTION', activityDate: '2024-02-01', amount: '25000.00' },
      ],
      latestNav: { amount: '135000.00', date: '2023-12-31' },
      asOfDate: '2024-07-01',
      currentCommitment: '275000.00',
    })

    expect(result.unfundedCommitmentAmount).toBe('175000.00')
    expect(result.unfundedCommitmentPercentage).toBe('0.63636364')
    expect(result.vintageYear).toBe(2022)
    expect(result.displayIrr).not.toBeNull()
  })

  it('annualizes simplified TVPI through the performance as-of date', () => {
    const result = composePartnershipPerformance({
      cashFlowEvents: [{ kind: 'CAPITAL_CALL', activityDate: '2020-01-01', amount: '100.00' }],
      latestNav: { amount: '110.00', date: '2021-01-01' },
      asOfDate: '2022-01-01',
    })
    expect(result.tvpi).toBe('1.10000000')
    expect(result.simplifiedIrr).toBe('0.04877466')
    expect(result.extendedAvailability.simplifiedIrr).toBe('AVAILABLE')
  })

  it('excludes future operational records from as-of calculations', () => {
    const result = composePartnershipPerformance({
      cashFlowEvents: [
        { kind: 'CAPITAL_CALL', activityDate: '2024-01-01', amount: '100.00' },
        { kind: 'DISTRIBUTION', activityDate: '2027-01-01', amount: '999.00' },
      ],
      latestNav: { amount: '150.00', date: '2027-01-01' },
      asOfDate: '2026-12-31',
    })
    expect(result.totalDistributions).toBe('0.00')
    expect(result.tvpi).toBeNull()
    expect(result.performanceStatus.tvpi).toBe('MISSING_NAV')
  })
})
