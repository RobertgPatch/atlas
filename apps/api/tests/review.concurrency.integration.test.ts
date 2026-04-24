import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createReviewFixture, type ReviewFixture } from './helpers/reviewFixture.js'

// T037 — two interleaved corrections requests against the same K-1 with the same
// starting version must commit exactly once; the loser returns 409 STALE_K1_VERSION
// and the DB is mutated exactly once (SC-011).
describe('Review corrections — optimistic-concurrency (SC-011)', () => {
  let f: ReviewFixture

  beforeEach(async () => {
    f = await createReviewFixture()
  })

  afterEach(async () => {
    await f.app.close()
  })

  it('two simultaneous corrections on the same version: one wins, other 409', async () => {
    const target = f.fieldByName(f.k1NeedsReview, 'box_1_ordinary_income')!
    const url = `/v1/k1-documents/${f.k1NeedsReview}/corrections`
    const headers = { cookie: f.cookie, 'if-match': '0' }

    const [res1, res2] = await Promise.all([
      f.app.inject({
        method: 'PUT',
        url,
        headers,
        payload: { corrections: [{ fieldId: target.id, value: '11111.11' }] },
      }),
      f.app.inject({
        method: 'PUT',
        url,
        headers,
        payload: { corrections: [{ fieldId: target.id, value: '22222.22' }] },
      }),
    ])

    const statuses = [res1.statusCode, res2.statusCode].sort()
    expect(statuses).toEqual([200, 409])

    const loser = res1.statusCode === 409 ? res1 : res2
    expect(loser.json().error).toBe('STALE_K1_VERSION')
    expect(loser.json().currentVersion).toBe(1)

    // DB mutated exactly once — version is 1, raw_value unchanged.
    const after = f.fieldByName(f.k1NeedsReview, 'box_1_ordinary_income')!
    expect(after.rawValue).toBe('50000.00')
    expect(['11111.11', '22222.22']).toContain(after.reviewerCorrectedValue)
  })
})
