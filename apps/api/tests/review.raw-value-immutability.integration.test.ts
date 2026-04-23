import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createReviewFixture, type ReviewFixture } from './helpers/reviewFixture.js'
import { reviewRepository } from '../src/modules/review/review.repository.js'

// T018a — raw_value / original_value must NEVER be touched by any correction.
// Fuzz ≥200 random corrections across the NEEDS_REVIEW fixture and confirm the
// byte-for-byte immutability invariant holds (SC-003).
describe('Review corrections — raw_value immutability fuzz (SC-003)', () => {
  let f: ReviewFixture

  beforeEach(async () => {
    f = await createReviewFixture()
  })

  afterEach(async () => {
    await f.app.close()
  })

  it('200 random corrections never mutate raw_value or original_value', async () => {
    const editableFieldNames = [
      'partnership_name',
      'partnership_ein',
      'partner_name',
      'box_1_ordinary_income',
      'box_19a_distribution',
    ] as const

    // Capture the pre-state for every field.
    const pre = new Map<string, { raw: string | null; original: string | null }>()
    for (const name of editableFieldNames) {
      const fv = f.fieldByName(f.k1NeedsReview, name)!
      pre.set(fv.id, { raw: fv.rawValue, original: fv.originalValue })
    }

    // Value generators keyed by field: numeric currency for boxes, free string for names/EINs.
    const nextValue = (name: string, i: number): string => {
      if (name.startsWith('box_')) return (1000 + i).toFixed(2)
      if (name === 'partnership_ein') return `00-00000${(i % 10)}`
      return `Fuzz ${name} ${i}`
    }

    for (let i = 0; i < 200; i++) {
      const name = editableFieldNames[i % editableFieldNames.length]!
      const fv = f.fieldByName(f.k1NeedsReview, name)!
      const currentK = (await import('../src/modules/k1/k1.repository.js')).k1Repository.getK1Document(
        f.k1NeedsReview,
      )!
      const value = i % 17 === 0 ? null : nextValue(name, i) // revert-to-null cycles
      const res = await f.app.inject({
        method: 'PUT',
        url: `/v1/k1-documents/${f.k1NeedsReview}/corrections`,
        headers: { cookie: f.cookie, 'if-match': String(currentK.version) },
        payload: { corrections: [{ fieldId: fv.id, value }] },
      })
      expect(res.statusCode).toBe(200)
    }

    // Post-state: every raw_value + original_value is byte-for-byte equal.
    for (const [fieldId, snap] of pre.entries()) {
      const after = reviewRepository
        .listFieldValuesForK1(f.k1NeedsReview)
        .find((fv) => fv.id === fieldId)!
      expect(after.rawValue).toBe(snap.raw)
      expect(after.originalValue).toBe(snap.original)
    }
  })
})
