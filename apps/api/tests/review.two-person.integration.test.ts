import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createReviewFixture, type ReviewFixture } from './helpers/reviewFixture.js'
import { sessionCookieFor } from './helpers/testApp.js'
import { authRepository } from '../src/modules/auth/auth.repository.js'
import { k1Repository } from '../src/modules/k1/k1.repository.js'
import { auditRepository } from '../src/modules/audit/audit.repository.js'

// T056 — two-person rule round-trip (FR-019a, SC-006):
//   seed NEEDS_REVIEW → approve as Admin A → attempt finalize as Admin A (409) → finalize as Admin B (200).
describe('Review two-person rule — full round-trip', () => {
  let f: ReviewFixture

  beforeEach(async () => {
    f = await createReviewFixture()
  })

  afterEach(async () => {
    await f.app.close()
  })

  it('Admin A approves; Admin A is blocked from finalizing; Admin B finalizes successfully', async () => {
    // Create a second Admin user (Admin B) for the two-person rule.
    const adminB = authRepository.upsertInvitedUser('admin-b@atlas.com', 'Admin')
    k1Repository._debugSetMemberships(adminB.id, f.entityIds)
    const cookieB = sessionCookieFor(adminB.id)

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

    // Step 2: Admin A attempts to finalize — must be rejected (two-person rule).
    const finalizeAsA = await f.app.inject({
      method: 'POST',
      url: `/v1/k1-documents/${f.k1NeedsReview}/finalize`,
      headers: { cookie: f.cookie, 'if-match': String(v1) },
    })
    expect(finalizeAsA.statusCode).toBe(409)
    expect(finalizeAsA.json().error).toBe('SAME_ACTOR_FINALIZE_FORBIDDEN')

    // Step 3: Admin B finalizes successfully.
    const finalizeAsB = await f.app.inject({
      method: 'POST',
      url: `/v1/k1-documents/${f.k1NeedsReview}/finalize`,
      headers: { cookie: cookieB, 'if-match': String(v1) },
    })
    expect(finalizeAsB.statusCode).toBe(200)
    const finalBody = finalizeAsB.json()
    expect(finalBody.status).toBe('FINALIZED')
    expect(finalBody.finalizedByUserId).toBe(adminB.id)

    const events = auditRepository.getInMemoryEvents()
    const approved = events.find(
      (e) => e.eventName === 'k1.approved' && e.objectId === f.k1NeedsReview,
    )
    const finalized = events.find(
      (e) => e.eventName === 'k1.finalized' && e.objectId === f.k1NeedsReview,
    )
    expect(approved?.actorUserId).toBe(f.admin.id)
    expect(finalized?.actorUserId).toBe(adminB.id)
    // Verify the two actors are distinct (core two-person invariant).
    expect(approved?.actorUserId).not.toBe(finalized?.actorUserId)
  })
})
