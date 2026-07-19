import { describe, expect, it } from 'vitest'
import { createNavBodySchema, updateNavBodySchema } from '../src/modules/partnership-tracker/partnership-tracker.zod.js'

describe('NAV contract', () => {
  it('requires exact nonnegative money, a calendar date, and a mutation on PATCH', () => {
    expect(createNavBodySchema.parse({ amount: '0.00', valuationDate: '2024-12-31' }).valuationDate).toBe('2024-12-31')
    expect(() => createNavBodySchema.parse({ amount: '2.5', valuationDate: '2024-12-31' })).toThrow()
    expect(() => createNavBodySchema.parse({ amount: '2.50', valuationDate: '2024-02-30' })).toThrow()
    expect(() => updateNavBodySchema.parse({ expectedUpdatedAt: new Date().toISOString() })).toThrow()
  })
})
