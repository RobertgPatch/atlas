import { describe, expect, it } from 'vitest'
import { composePartnershipPerformance } from '../src/modules/partnership-tracker/partnership-performance.js'
import { twoYearPerformanceFixture } from './helpers/partnershipTrackerFixture.js'

describe('Partnership Tracker performance', () => {
  it('aggregates canonical contributions and absolute distributions into overview metrics', () => {
    const result = composePartnershipPerformance({
      annualValues: twoYearPerformanceFixture().map((value) => value.taxYear === 2022
        ? { ...value, legacyCapitalContributions: '500.00' }
        : value),
      latestNav: { amount: '3000000.00', date: '2022-12-31' },
    })

    expect(result.totalCapitalContributions).toBe('3000000.00')
    expect(result.totalDistributions).toBe('190773.00')
    expect(result.dpi).toBe('0.06359100')
    expect(result.tvpi).toBe('1.06359100')
    expect(result.irr).toBe('0.06363591')
    expect(result.performanceStatus).toMatchObject({ dpi: 'AVAILABLE', tvpi: 'AVAILABLE', irr: 'AVAILABLE' })
  })

  it('uses a legacy contribution exactly once only when the canonical value is absent', () => {
    const result = composePartnershipPerformance({
      annualValues: [
        { taxYear: 2022, hasCanonicalContribution: false, capitalContributions: null, legacyCapitalContributions: '100.00', distributions: '10.00' },
        { taxYear: 2023, hasCanonicalContribution: true, capitalContributions: '100.00', legacyCapitalContributions: '999.00', distributions: '10.00' },
      ],
      latestNav: { amount: '200.00', date: '2023-12-31' },
    })
    expect(result.totalCapitalContributions).toBe('200.00')
    expect(result.totalDistributions).toBe('20.00')
  })

  it('keeps zero distinct from missing and returns deterministic unavailable statuses', () => {
    const zero = composePartnershipPerformance({
      annualValues: [{ taxYear: 2022, hasCanonicalContribution: true, capitalContributions: '0.00', legacyCapitalContributions: null, distributions: '0.00' }],
      latestNav: null,
    })
    const staleNav = composePartnershipPerformance({
      annualValues: [
        { taxYear: 2022, hasCanonicalContribution: true, capitalContributions: '100.00', legacyCapitalContributions: null, distributions: '0.00' },
        { taxYear: 2024, hasCanonicalContribution: true, capitalContributions: '0.00', legacyCapitalContributions: null, distributions: '10.00' },
      ],
      latestNav: { amount: '100.00', date: '2023-12-31' },
    })
    expect(zero.totalCapitalContributions).toBe('0.00')
    expect(zero.dpi).toBeNull()
    expect(zero.performanceStatus).toMatchObject({ dpi: 'MISSING_CONTRIBUTIONS', tvpi: 'MISSING_CONTRIBUTIONS', irr: 'MISSING_CONTRIBUTIONS' })
    expect(staleNav.performanceStatus.irr).toBe('AVAILABLE')
    expect(staleNav.irrTerminalDate).toBe('2024-12-31')
    expect(staleNav.irrUsesCarriedForwardNav).toBe(true)
  })

  it('handles nonconsecutive years, same-date flows, negative returns, and ambiguous roots', () => {
    const sameDate = composePartnershipPerformance({
      annualValues: [
        { taxYear: 2021, hasCanonicalContribution: true, capitalContributions: '100.00', legacyCapitalContributions: null, distributions: '-20.00' },
        { taxYear: 2022, hasCanonicalContribution: true, capitalContributions: '0.00', legacyCapitalContributions: null, distributions: '-100.00' },
      ],
      latestNav: { amount: '0.00', date: '2022-12-31' },
    })
    const negative = composePartnershipPerformance({
      annualValues: [{ taxYear: 2021, hasCanonicalContribution: true, capitalContributions: '100.00', legacyCapitalContributions: null, distributions: '0.00' }],
      latestNav: { amount: '50.00', date: '2022-12-31' },
    })
    const ambiguous = composePartnershipPerformance({
      annualValues: [
        { taxYear: 2021, hasCanonicalContribution: true, capitalContributions: '100.00', legacyCapitalContributions: null, distributions: '0.00' },
        { taxYear: 2022, hasCanonicalContribution: true, capitalContributions: '0.00', legacyCapitalContributions: null, distributions: '-230.00' },
        { taxYear: 2023, hasCanonicalContribution: true, capitalContributions: '132.00', legacyCapitalContributions: null, distributions: '0.00' },
      ],
      latestNav: { amount: '0.00', date: '2023-12-31' },
    })
    const missingNav = composePartnershipPerformance({
      annualValues: [{ taxYear: 2024, hasCanonicalContribution: true, capitalContributions: '100.00', legacyCapitalContributions: null, distributions: '0.00' }],
      latestNav: null,
    })

    expect(sameDate.irr).toMatch(/^0\.250/)
    expect(negative.irr).toMatch(/^-/)
    expect(ambiguous.performanceStatus.irr).toBe('AMBIGUOUS_IRR')
    expect(missingNav.performanceStatus).toMatchObject({ dpi: 'AVAILABLE', tvpi: 'MISSING_NAV', irr: 'MISSING_NAV' })
  })

  it('annualizes cash yield and derives signed commitment and unrealized values', () => {
    const result = composePartnershipPerformance({
      annualValues: [
        { taxYear: 2022, hasCanonicalContribution: true, capitalContributions: '100000.00', legacyCapitalContributions: null, distributions: '0.00' },
        { taxYear: 2024, hasCanonicalContribution: true, capitalContributions: '0.00', legacyCapitalContributions: null, distributions: '10000.00' },
      ],
      latestNav: { amount: '135000.00', date: '2023-12-31' },
      inceptionDate: '2022-07-01',
      asOfDate: '2024-07-01',
      currentCommitment: '250000.00',
      latestEndingOutsideBasis: '120000.00',
    })

    expect(Number(result.annualizedCashOnCashYield)).toBeCloseTo(0.05, 4)
    expect(result.performanceAsOfDate).toBe('2024-07-01')
    expect(result.unfundedCommitmentAmount).toBe('150000.00')
    expect(result.unfundedCommitmentPercentage).toBe('0.60000000')
    expect(result.unrealizedGain).toBe('15000.00')
    expect(result.performanceStatus).toMatchObject({
      annualizedCashOnCashYield: 'AVAILABLE',
      unfundedCommitment: 'AVAILABLE',
      unrealizedGain: 'AVAILABLE',
    })
  })
})
