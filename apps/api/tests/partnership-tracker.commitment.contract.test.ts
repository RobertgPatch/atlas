import { describe, expect, it } from 'vitest'
import { createCommitmentBodySchema, updateCommitmentBodySchema } from '../src/modules/partnership-tracker/partnership-tracker.zod.js'

describe('committed-capital contract', () => {
  it('requires exact nonnegative money and a valid effective date', () => {
    expect(createCommitmentBodySchema.parse({ amount: '1000000.00', effectiveDate: '2024-01-01' }).amount).toBe('1000000.00')
    expect(() => createCommitmentBodySchema.parse({ amount: '-1.00', effectiveDate: '2024-01-01' })).toThrow()
    expect(() => createCommitmentBodySchema.parse({ amount: '1', effectiveDate: '2024-01-01' })).toThrow()
    expect(() => updateCommitmentBodySchema.parse({ expectedUpdatedAt: new Date().toISOString() })).toThrow()
  })
})
