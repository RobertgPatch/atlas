import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createReviewFixture, type ReviewFixture } from './helpers/reviewFixture.js'
import { finalizeFaultInjection } from '../src/modules/review/approve.handler.js'
import { k1Repository } from '../src/modules/k1/k1.repository.js'
import { reviewRepository } from '../src/modules/review/review.repository.js'

// T057 — Parameterized over each write step inside Finalize (status update,
// annual_activity upsert, audit write); injects a throw and asserts the entire
// DB state is identical to pre-Finalize (SC-007).
describe('Review finalize — rollback on injected failure (SC-007)', () => {
  let f: ReviewFixture

  beforeEach(async () => {
    f = await createReviewFixture()
    finalizeFaultInjection.step = null
  })

  afterEach(async () => {
    finalizeFaultInjection.step = null
    await f.app.close()
  })

  const steps = ['status_update', 'annual_activity_upsert', 'audit_write'] as const

  for (const step of steps) {
    it(`rolls back cleanly when fault injected at "${step}"`, async () => {
      // Snapshot pre-state.
      const beforeK = { ...k1Repository.getK1Document(f.k1ReadyForApproval)! }
      const beforeActivityCount = reviewRepository._debugAllAnnualActivity().length

      finalizeFaultInjection.step = step

      const res = await f.app.inject({
        method: 'POST',
        url: `/v1/k1-documents/${f.k1ReadyForApproval}/finalize`,
        headers: { cookie: f.cookie, 'if-match': String(beforeK.version) },
      })

      expect(res.statusCode).toBe(500)
      expect(res.json().error).toBe('FINALIZE_FAILED')
      expect(res.json().step).toBe(step)

      // Post-state must match pre-state.
      const afterK = k1Repository.getK1Document(f.k1ReadyForApproval)!
      expect(afterK.processingStatus).toBe(beforeK.processingStatus)
      expect(afterK.finalizedByUserId).toBe(beforeK.finalizedByUserId)
      expect(afterK.version).toBe(beforeK.version)
      expect(afterK.approvedByUserId).toBe(beforeK.approvedByUserId)

      const afterActivityCount = reviewRepository._debugAllAnnualActivity().length
      expect(afterActivityCount).toBe(beforeActivityCount)

      // No partnership_annual_activity row linked to this K-1 should exist.
      const paa = reviewRepository.getPartnershipAnnualActivity(
        beforeK.entityId,
        beforeK.partnershipId,
        beforeK.taxYear,
      )
      expect(paa?.finalizedFromK1DocumentId).not.toBe(f.k1ReadyForApproval)
    })
  }
})
