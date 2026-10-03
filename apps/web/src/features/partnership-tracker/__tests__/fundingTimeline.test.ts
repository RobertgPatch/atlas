import { describe, expect, it } from 'vitest'
import { estimateFutureFunding, groupHistoricFunding } from '../components/magic-patterns/fundingTimeline'

describe('Funding timeline', () => {
  it('uses five future years for a new partnership and three for one started two years ago', () => {
    expect(estimateFutureFunding(1_000_000n, 2026, 2026)).toEqual([
      { year: 2027, amount: 200_000n }, { year: 2028, amount: 200_000n },
      { year: 2029, amount: 200_000n }, { year: 2030, amount: 200_000n }, { year: 2031, amount: 200_000n },
    ])
    expect(estimateFutureFunding(900_000n, 2024, 2026)).toEqual([
      { year: 2027, amount: 300_000n }, { year: 2028, amount: 300_000n }, { year: 2029, amount: 300_000n },
    ])
  })

  it('reconciles rounded annual allocations and supports older investments without dividing by zero', () => {
    const thirds = estimateFutureFunding(1_000_000n, 2024, 2026)
    expect(thirds.map(({ amount }) => amount)).toEqual([333_300n, 333_300n, 333_400n])
    expect(thirds.reduce((sum, { amount }) => sum + amount, 0n)).toBe(1_000_000n)
    expect(estimateFutureFunding(1_000_000n, 2018, 2026)).toHaveLength(5)
    expect(estimateFutureFunding(1_000_000n, null, 2026)).toHaveLength(5)
    expect(estimateFutureFunding(0n, 2026, 2026)).toEqual([])
  })

  it('preserves all historic calls across five contiguous ranges plus a separate current-year bar', () => {
    const bars = groupHistoricFunding([
      { year: 2010, called: 100n }, { year: 2017, called: 200n }, { year: 2026, called: 300n },
    ], 2010, 2026)
    expect(bars.map(({ label }) => label)).toEqual(['2010–2012', '2013–2015', '2016–2018', '2019–2021', '2022–2025', '2026'])
    expect(bars.map(({ called }) => called)).toEqual([100n, 0n, 200n, 0n, 0n, 300n])
    expect(bars.at(-1)?.cumulative).toBe(600n)
  })

  it('uses individual years for young partnerships, including years with no calls', () => {
    expect(groupHistoricFunding([{ year: 2025, called: 100n }], 2024, 2026)).toEqual([
      { label: '2024', startYear: 2024, endYear: 2024, called: 0n, cumulative: 0n },
      { label: '2025', startYear: 2025, endYear: 2025, called: 100n, cumulative: 100n },
      { label: '2026', startYear: 2026, endYear: 2026, called: 0n, cumulative: 100n },
    ])
    expect(groupHistoricFunding([], 2026, 2026)).toHaveLength(1)
  })
})
