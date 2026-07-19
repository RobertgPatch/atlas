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
    expect(result.dpi).toBe('0.0636')
    expect(result.tvpi).toBe('1.0636')
    expect(result.irr).toBe('0.0636')
    expect(result.performanceStatus).toEqual({ dpi: 'AVAILABLE', tvpi: 'AVAILABLE', irr: 'AVAILABLE' })
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
      annualValues: [{ taxYear: 2024, hasCanonicalContribution: true, capitalContributions: '100.00', legacyCapitalContributions: null, distributions: '0.00' }],
      latestNav: { amount: '100.00', date: '2023-12-31' },
    })
    expect(zero.totalCapitalContributions).toBe('0.00')
    expect(zero.dpi).toBeNull()
    expect(zero.performanceStatus).toEqual({ dpi: 'MISSING_CONTRIBUTIONS', tvpi: 'MISSING_CONTRIBUTIONS', irr: 'MISSING_CONTRIBUTIONS' })
    expect(staleNav.performanceStatus.irr).toBe('NAV_PRECEDES_CASH_FLOWS')
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

    expect(sameDate.irr).toBe('0.2502')
    expect(negative.irr).toMatch(/^-/)
    expect(ambiguous.performanceStatus.irr).toBe('AMBIGUOUS_IRR')
    expect(missingNav.performanceStatus).toMatchObject({ dpi: 'AVAILABLE', tvpi: 'MISSING_NAV', irr: 'MISSING_NAV' })
  })
})
