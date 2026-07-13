import { describe, expect, it } from 'vitest'
import { partnershipTrackerSignoffBodySchema } from '../src/modules/partnership-tracker/partnership-tracker.zod.js'

describe('Partnership Tracker sign-off contract', () => {
  it('uses prepare/review/invalidate actions and requires an invalidation reason', () => {
    expect(partnershipTrackerSignoffBodySchema.parse({ expectedRevision: 1, action: 'PREPARE' }).action).toBe('PREPARE')
    expect(partnershipTrackerSignoffBodySchema.parse({ expectedRevision: 1, action: 'REVIEW' }).action).toBe('REVIEW')
    expect(() => partnershipTrackerSignoffBodySchema.parse({ expectedRevision: 1, action: 'INVALIDATE' })).toThrow()
    expect(partnershipTrackerSignoffBodySchema.parse({ expectedRevision: 1, action: 'INVALIDATE', reason: 'Updated source' }).reason).toBe('Updated source')
  })
})
