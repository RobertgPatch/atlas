import { describe, expect, it } from 'vitest'
import { calculateTrackerYear } from '../src/modules/k1-tracker/k1-tracker.calculation.js'

describe('manual Partnership Tracker workflow calculation', () => {
  it('distinguishes an empty year from a partially entered manual year', () => {
    const base = { id: 'year', taxYear: 2024, revision: 1, status: 'NOT_STARTED' as const }
    const empty = calculateTrackerYear({ ...base, values: {} })
    const partial = calculateTrackerYear({ ...base, values: { opening_outside_basis: 10000n } })
    expect(empty.summary.status).toBe('NOT_STARTED')
    expect(partial.summary.status).toBe('IN_PROGRESS')
  })

  it('keeps a liability-only change out of basis, warnings, and workflow status', () => {
    const base = { id: 'year', taxYear: 2024, revision: 1, status: 'IN_PROGRESS' as const, values: { opening_outside_basis: 10_000n, capital_contributions: 5_000n, box_19_distributions: 2_500n } }
    const withLiabilities = calculateTrackerYear({
      ...base,
      values: { ...base.values, liability_nonrecourse_beginning: 1_000n, liability_nonrecourse_ending: 99_000n },
    })
    const withoutLiabilities = calculateTrackerYear(base)

    expect(withLiabilities.basis.endingOutsideBasis).toBe(withoutLiabilities.basis.endingOutsideBasis)
    expect(withLiabilities.distribution.taxableExcessDistribution).toBe(withoutLiabilities.distribution.taxableExcessDistribution)
    expect(withLiabilities.summary.status).toBe(withoutLiabilities.summary.status)
    expect(withLiabilities.checks.map((check) => check.key)).toEqual(withoutLiabilities.checks.map((check) => check.key))
  })
})
