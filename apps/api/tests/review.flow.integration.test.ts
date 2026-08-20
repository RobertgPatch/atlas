import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createReviewFixture, type ReviewFixture } from './helpers/reviewFixture.js'
import { pool } from '../src/infra/db/client.js'
import { createDurableK1ReviewFixture, type DurableK1ReviewFixture } from './helpers/durableK1ReviewFixture.js'

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

const durable = pool ? describe : describe.skip

durable('Feature 022 durable review session and typed corrections', () => {
  let f: DurableK1ReviewFixture
  beforeEach(async () => { f = await createDurableK1ReviewFixture() })
  afterEach(async () => { await f.cleanup() })

  it('returns only active-attempt typed occurrences, attempt history, evidence, issues, and blockers', async () => {
    const res = await f.app.inject({
      method: 'GET', url: `/v1/k1-documents/${f.k1DocumentId}/review-session`,
      headers: { cookie: f.cookie },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(res.headers.etag).toBe('3')
    expect(body.activeAttempt).toMatchObject({ id: f.activeAttemptId, attemptNumber: 2, status: 'SUCCEEDED' })
    expect(body.attemptHistory).toHaveLength(2)
    expect(body.fields.core).toHaveLength(2)
    expect(body.fields.core.some((field: { fieldName: string }) => field.fieldName === 'inactive_field')).toBe(false)
    expect(body.fields.core.find((field: { id: string }) => field.id === f.codeRowFieldId)).toMatchObject({
      valueKind: 'CODE_ROW', effectiveValueJson: { code: 'W', value: 45 },
      sourceLocations: [{ page: 2, bbox: [0.2, 0.3, 0.5, 0.4] }],
    })
    expect(body.applyBlockingReasons).toContain('OPEN_ISSUES')
  })

  it('persists a typed correction/history in PostgreSQL and survives process-local resets', async () => {
    const corrected = await f.app.inject({
      method: 'PUT', url: `/v1/k1-documents/${f.k1DocumentId}/corrections`,
      headers: { cookie: f.cookie, 'if-match': '3' },
      payload: { corrections: [{ fieldValueId: f.moneyFieldId, value: 2000.25, reason: 'Verified against page 1' }] },
    })
    expect(corrected.statusCode).toBe(200)
    expect(corrected.json()).toMatchObject({ version: 4, resolvedIssueIds: [f.issueId] })
    const { reviewRepository } = await import('../src/modules/review/review.repository.js')
    reviewRepository._debugReset()
    const session = await f.app.inject({
      method: 'GET', url: `/v1/k1-documents/${f.k1DocumentId}/review-session`, headers: { cookie: f.cookie },
    })
    const target = session.json().fields.core.find((candidate: { id: string }) => candidate.id === f.moneyFieldId)
    expect(target).toMatchObject({ rawValueJson: 1250.5, effectiveValueJson: 2000.25, reviewStatus: 'CORRECTED' })
    expect(target.correctionHistory).toHaveLength(1)
    expect(session.json().issues.find((issue: { id: string }) => issue.id === f.issueId).status).toBe('RESOLVED')
  })

  it('makes review finalization an explicit, reachable step before apply preview', async () => {
    const corrected = await f.app.inject({
      method: 'PUT', url: `/v1/k1-documents/${f.k1DocumentId}/corrections`,
      headers: { cookie: f.cookie, 'if-match': '3' },
      payload: { corrections: [{ fieldValueId: f.moneyFieldId, value: 1250.5 }] },
    })
    expect(corrected.statusCode).toBe(200)

    const readyToFinalize = await f.app.inject({
      method: 'GET', url: `/v1/k1-documents/${f.k1DocumentId}/review-session`, headers: { cookie: f.cookie },
    })
    expect(readyToFinalize.json()).toMatchObject({ canFinalize: true, canApply: false })
    expect(readyToFinalize.json().applyBlockingReasons).toEqual(['REVIEW_NOT_FINALIZED'])

    const finalized = await f.app.inject({
      method: 'POST', url: `/v1/k1-documents/${f.k1DocumentId}/finalize`,
      headers: { cookie: f.cookie, 'if-match': String(corrected.json().version) },
    })
    expect(finalized.statusCode).toBe(200)
    expect(finalized.json()).toMatchObject({ status: 'READY_FOR_APPROVAL', readyToApply: true })

    const readyToApply = await f.app.inject({
      method: 'GET', url: `/v1/k1-documents/${f.k1DocumentId}/review-session`, headers: { cookie: f.cookie },
    })
    expect(readyToApply.json()).toMatchObject({ canFinalize: false, canApply: true, applyBlockingReasons: [] })
  })

  it('streams authorized PDF byte ranges and rechecks access on every request', async () => {
    const range = await f.app.inject({
      method: 'GET', url: `/v1/k1-documents/${f.k1DocumentId}/pdf`,
      headers: { cookie: f.userCookie, range: 'bytes=0-7' },
    })
    expect(range.statusCode).toBe(206)
    expect(range.headers['accept-ranges']).toBe('bytes')
    expect(range.headers['content-range']).toMatch(/^bytes 0-7\//)
    expect(range.headers['x-frame-options']).toBeUndefined()
    expect(range.headers['content-security-policy']).toContain("frame-ancestors 'self'")
    expect(range.headers['cross-origin-resource-policy']).toBe('cross-origin')
    expect(range.body).toBe('%PDF-1.4')
    await pool!.query('delete from entity_memberships where user_id = $1 and entity_id = $2', [f.user.id, f.entityId])
    const denied = await f.app.inject({
      method: 'GET', url: `/v1/k1-documents/${f.k1DocumentId}/pdf`, headers: { cookie: f.userCookie },
    })
    expect(denied.statusCode).toBe(404)
  })

  it('resolves every matching issue when the reviewer confirms the destination', async () => {
    const matchingIssueId = randomUUID()
    await pool!.query(
      `insert into k1_issues
         (id, k1_document_id, issue_type, severity, status, message,
          extraction_attempt_id, issue_code, details_json)
       values ($1, $2, 'MATCHING', 'HIGH', 'OPEN', 'Confirm the destination.',
          $3, 'ENTITY_MATCH_NOT_FOUND', '{}'::jsonb)`,
      [matchingIssueId, f.k1DocumentId, f.activeAttemptId],
    )
    await pool!.query(
      `update k1_documents set partnership_id = null, match_status = 'REQUIRES_REVIEW' where id = $1`,
      [f.k1DocumentId],
    )
    await pool!.query(
      `update k1_ingestion_items set status = 'NEEDS_MATCH' where id = $1`,
      [f.itemId],
    )

    const response = await f.app.inject({
      method: 'PUT',
      url: `/v1/k1-documents/${f.k1DocumentId}/match`,
      headers: { cookie: f.cookie },
      payload: {
        expectedDocumentVersion: 3,
        entityId: f.entityId,
        partnershipId: f.partnershipId,
        taxYear: 2025,
        reviewedEvidence: true,
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ matchStatus: 'MATCHED', partnershipId: f.partnershipId, taxYear: 2025 })
    const issue = await pool!.query<{ status: string }>('select status from k1_issues where id = $1', [matchingIssueId])
    const item = await pool!.query<{ status: string }>('select status from k1_ingestion_items where id = $1', [f.itemId])
    expect(issue.rows[0]?.status).toBe('RESOLVED')
    expect(item.rows[0]?.status).toBe('NEEDS_REVIEW')
  })
})
