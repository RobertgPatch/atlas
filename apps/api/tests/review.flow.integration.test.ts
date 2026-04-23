import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createReviewFixture, type ReviewFixture } from './helpers/reviewFixture.js'

// T019, T020, T035-T039 — contract + integration for the review session + corrections flow.
describe('Review session + corrections (US1/US2)', () => {
  let f: ReviewFixture

  beforeEach(async () => {
    f = await createReviewFixture()
  })

  afterEach(async () => {
    await f.app.close()
  })

  it('GET /v1/k1-documents/:id/review-session returns structured fields + ETag', async () => {
    const res = await f.app.inject({
      method: 'GET',
      url: `/v1/k1-documents/${f.k1NeedsReview}/review-session`,
      headers: { cookie: f.cookie },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.k1DocumentId).toBe(f.k1NeedsReview)
    expect(typeof body.version).toBe('number')
    expect(body.fields.entityMapping.length).toBeGreaterThan(0)
    expect(body.fields.partnershipMapping.length).toBeGreaterThan(0)
    expect(body.fields.core.length).toBeGreaterThan(0)
    expect(body.fields.core[0].confidenceBand).toMatch(/^(high|medium|low|none)$/)
    expect(res.headers.etag).toBe(String(body.version))
  })

  it('GET /v1/k1-documents/:id/review-session derives reported distribution from extracted field values', async () => {
    const { reviewRepository } = await import('../src/modules/review/review.repository.js')
    reviewRepository._debugDeleteReportedDistribution(f.k1ReadyForApproval)

    const res = await f.app.inject({
      method: 'GET',
      url: `/v1/k1-documents/${f.k1ReadyForApproval}/review-session`,
      headers: { cookie: f.cookie },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.status).toBe('READY_FOR_APPROVAL')
    expect(body.reportedDistributionAmount).toBe('10000.00')
    expect(body.canFinalize).toBe(true)
  })

  it('returns 404 for K-1 outside caller entity scope', async () => {
    // Drop admin memberships so they can't see the K-1.
    const { k1Repository } = await import('../src/modules/k1/k1.repository.js')
    k1Repository._debugSetMemberships(f.admin.id, [])
    const res = await f.app.inject({
      method: 'GET',
      url: `/v1/k1-documents/${f.k1NeedsReview}/review-session`,
      headers: { cookie: f.cookie },
    })
    expect(res.statusCode).toBe(404)
  })

  it('PUT /corrections rejects missing If-Match with 428', async () => {
    const fieldId = f.fieldIdsForK1(f.k1NeedsReview)[0]!
    const res = await f.app.inject({
      method: 'PUT',
      url: `/v1/k1-documents/${f.k1NeedsReview}/corrections`,
      headers: { cookie: f.cookie },
      payload: { corrections: [{ fieldId, value: '99999.99' }] },
    })
    expect(res.statusCode).toBe(428)
    expect(res.json().error).toBe('IF_MATCH_REQUIRED')
  })

  it('PUT /corrections rejects stale version with 409 STALE_K1_VERSION', async () => {
    const fieldId = f.fieldByName(f.k1NeedsReview, 'box_1_ordinary_income')!.id
    const res = await f.app.inject({
      method: 'PUT',
      url: `/v1/k1-documents/${f.k1NeedsReview}/corrections`,
      headers: { cookie: f.cookie, 'if-match': '99' },
      payload: { corrections: [{ fieldId, value: '77777.00' }] },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error).toBe('STALE_K1_VERSION')
    expect(res.json().currentVersion).toBe(0)
  })

  it('PUT /corrections validates format (invalid currency -> VALIDATION_FAILED)', async () => {
    const fieldId = f.fieldByName(f.k1NeedsReview, 'box_1_ordinary_income')!.id
    const res = await f.app.inject({
      method: 'PUT',
      url: `/v1/k1-documents/${f.k1NeedsReview}/corrections`,
      headers: { cookie: f.cookie, 'if-match': '0' },
      payload: { corrections: [{ fieldId, value: 'not a number' }] },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('VALIDATION_FAILED')
  })

  it('PUT /corrections saves + bumps version + never mutates raw_value', async () => {
    const target = f.fieldByName(f.k1NeedsReview, 'box_1_ordinary_income')!
    const originalRaw = target.rawValue
    const res = await f.app.inject({
      method: 'PUT',
      url: `/v1/k1-documents/${f.k1NeedsReview}/corrections`,
      headers: { cookie: f.cookie, 'if-match': '0' },
      payload: { corrections: [{ fieldId: target.id, value: '51234.56' }] },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().version).toBe(1)
    expect(res.headers.etag).toBe('1')

    // Verify immutability: raw_value stays; only corrected value changes.
    const after = f.fieldByName(f.k1NeedsReview, 'box_1_ordinary_income')!
    expect(after.rawValue).toBe(originalRaw)
    expect(after.reviewerCorrectedValue).toBe('51234.56')
    expect(after.normalizedValue).toBe('51234.56')
  })

  it('PUT /corrections rejects attempts to modify FINALIZED K-1 with 409 K1_FINALIZED', async () => {
    const fieldId = f.fieldIdsForK1(f.k1Finalized)[0]!
    const res = await f.app.inject({
      method: 'PUT',
      url: `/v1/k1-documents/${f.k1Finalized}/corrections`,
      headers: { cookie: f.cookie, 'if-match': '0' },
      payload: { corrections: [{ fieldId, value: 'X' }] },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error).toBe('K1_FINALIZED')
  })
})

// T054, T055, T056 — approve + finalize with admin self-approval allowed.
describe('Approve + Finalize (US3) with admin self-approval', () => {
  let f: ReviewFixture

  beforeEach(async () => {
    f = await createReviewFixture()
  })

  afterEach(async () => {
    await f.app.close()
  })

  it('POST /approve requires Admin role', async () => {
    const { sessionCookieFor } = await import('./helpers/testApp.js')
    const userCookie = sessionCookieFor(f.user.id)
    const res = await f.app.inject({
      method: 'POST',
      url: `/v1/k1-documents/${f.k1NeedsReview}/approve`,
      headers: { cookie: userCookie, 'if-match': '0' },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe('ROLE_REQUIRED_ADMIN')
  })

  it('POST /approve transitions NEEDS_REVIEW -> READY_FOR_APPROVAL and records approver', async () => {
    const res = await f.app.inject({
      method: 'POST',
      url: `/v1/k1-documents/${f.k1NeedsReview}/approve`,
      headers: { cookie: f.cookie, 'if-match': '0' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.status).toBe('READY_FOR_APPROVAL')
    expect(body.approvedByUserId).toBe(f.admin.id)
    expect(body.version).toBe(1)
  })

  it('POST /finalize allows the same Admin who approved to finalize', async () => {
    const res = await f.app.inject({
      method: 'POST',
      url: `/v1/k1-documents/${f.k1ReadyForApproval}/finalize`,
      headers: { cookie: f.cookie, 'if-match': '0' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.status).toBe('FINALIZED')
    expect(body.finalizedByUserId).toBe(f.admin.id)
  })

  it('POST /finalize transitions READY_FOR_APPROVAL -> FINALIZED and upserts annual activity', async () => {
    const res = await f.app.inject({
      method: 'POST',
      url: `/v1/k1-documents/${f.k1ReadyForApproval}/finalize`,
      headers: { cookie: f.cookie, 'if-match': '0' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.status).toBe('FINALIZED')
    expect(body.finalizedByUserId).toBe(f.admin.id)
    expect(body.partnershipAnnualActivityId).toBeTruthy()

    // Verify the partnership_annual_activity row exists.
    const { reviewRepository } = await import('../src/modules/review/review.repository.js')
    const { k1Repository } = await import('../src/modules/k1/k1.repository.js')
    const k = k1Repository.getK1Document(f.k1ReadyForApproval)!
    const paa = reviewRepository.getPartnershipAnnualActivity(
      k.entityId,
      k.partnershipId,
      k.taxYear,
    )
    expect(paa?.reportedDistributionAmount).toBe('10000.00')
    expect(paa?.finalizedFromK1DocumentId).toBe(f.k1ReadyForApproval)
  })

  it('POST /finalize succeeds when the stored reported distribution row is missing', async () => {
    const { reviewRepository } = await import('../src/modules/review/review.repository.js')
    reviewRepository._debugDeleteReportedDistribution(f.k1ReadyForApproval)

    const res = await f.app.inject({
      method: 'POST',
      url: `/v1/k1-documents/${f.k1ReadyForApproval}/finalize`,
      headers: { cookie: f.cookie, 'if-match': '0' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('FINALIZED')
  })
})

// T066 — open/resolve issues.
describe('Issues (US4)', () => {
  let f: ReviewFixture

  beforeEach(async () => {
    f = await createReviewFixture()
  })

  afterEach(async () => {
    await f.app.close()
  })

  it('POST /issues opens an issue and bumps version', async () => {
    const fieldId = f.fieldIdsForK1(f.k1NeedsReview)[0]!
    const res = await f.app.inject({
      method: 'POST',
      url: `/v1/k1-documents/${f.k1NeedsReview}/issues`,
      headers: { cookie: f.cookie, 'if-match': '0' },
      payload: {
        message: 'This field looks wrong',
        k1FieldValueId: fieldId,
        severity: 'HIGH',
      },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.issueId).toBeTruthy()
    expect(body.version).toBe(1)
  })

  it('POST /issues/:id/resolve closes an issue manually', async () => {
    const fieldId = f.fieldIdsForK1(f.k1NeedsReview)[0]!
    const open = await f.app.inject({
      method: 'POST',
      url: `/v1/k1-documents/${f.k1NeedsReview}/issues`,
      headers: { cookie: f.cookie, 'if-match': '0' },
      payload: { message: 'x', k1FieldValueId: fieldId },
    })
    const { issueId, version } = open.json()

    const resolve = await f.app.inject({
      method: 'POST',
      url: `/v1/k1-documents/${f.k1NeedsReview}/issues/${issueId}/resolve`,
      headers: { cookie: f.cookie, 'if-match': String(version) },
    })
    expect(resolve.statusCode).toBe(200)
    expect(resolve.json().version).toBe(version + 1)
  })

  it('corrections auto-resolve linked OPEN issues', async () => {
    const target = f.fieldByName(f.k1NeedsReview, 'box_1_ordinary_income')!
    const open = await f.app.inject({
      method: 'POST',
      url: `/v1/k1-documents/${f.k1NeedsReview}/issues`,
      headers: { cookie: f.cookie, 'if-match': '0' },
      payload: {
        message: 'unclear',
        k1FieldValueId: target.id,
        severity: 'LOW',
      },
    })
    const { version } = open.json()

    const correct = await f.app.inject({
      method: 'PUT',
      url: `/v1/k1-documents/${f.k1NeedsReview}/corrections`,
      headers: { cookie: f.cookie, 'if-match': String(version) },
      payload: { corrections: [{ fieldId: target.id, value: '42000.00' }] },
    })
    expect(correct.statusCode).toBe(200)
    const body = correct.json()
    expect(body.resolvedIssueIds.length).toBe(1)
  })
})
