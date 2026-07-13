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
})
