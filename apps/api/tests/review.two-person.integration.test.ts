import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createReviewFixture, type ReviewFixture } from './helpers/reviewFixture.js'
import { sessionCookieFor } from './helpers/testApp.js'
import { authRepository } from '../src/modules/auth/auth.repository.js'
import { k1Repository } from '../src/modules/k1/k1.repository.js'
import { auditRepository } from '../src/modules/audit/audit.repository.js'

// T056 — full round-trip with self-approval:
//   seed NEEDS_REVIEW → approve as Admin A → finalize as Admin A (200).
describe('Review self-approval flow — full round-trip', () => {
  let f: ReviewFixture

  beforeEach(async () => {
    f = await createReviewFixture()
  })

  afterEach(async () => {
    await f.app.close()
  })

  it('Admin A approves and Admin A can finalize successfully', async () => {
    // Step 1: Approve as Admin A (f.admin).
    const k = k1Repository.getK1Document(f.k1NeedsReview)!
    const approveRes = await f.app.inject({
      method: 'POST',
      url: `/v1/k1-documents/${f.k1NeedsReview}/approve`,
      headers: { cookie: f.cookie, 'if-match': String(k.version) },
    })
    expect(approveRes.statusCode).toBe(200)
    const { version: v1, approvedByUserId } = approveRes.json()
    expect(approvedByUserId).toBe(f.admin.id)

    // Step 2: Admin A finalizes successfully.
    const finalizeAsA = await f.app.inject({
      method: 'POST',
      url: `/v1/k1-documents/${f.k1NeedsReview}/finalize`,
      headers: { cookie: f.cookie, 'if-match': String(v1) },
    })
    expect(finalizeAsA.statusCode).toBe(200)
    const finalBody = finalizeAsA.json()
    expect(finalBody.status).toBe('FINALIZED')
    expect(finalBody.finalizedByUserId).toBe(f.admin.id)

    const events = auditRepository.getInMemoryEvents()
    const approved = events.find(
      (e) => e.eventName === 'k1.approved' && e.objectId === f.k1NeedsReview,
    )
    const finalized = events.find(
      (e) => e.eventName === 'k1.finalized' && e.objectId === f.k1NeedsReview,
    )
    expect(approved?.actorUserId).toBe(f.admin.id)
    expect(finalized?.actorUserId).toBe(f.admin.id)
  })
})
