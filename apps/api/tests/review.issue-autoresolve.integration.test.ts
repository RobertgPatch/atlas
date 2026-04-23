import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createReviewFixture, type ReviewFixture } from './helpers/reviewFixture.js'
import { k1Repository } from '../src/modules/k1/k1.repository.js'
import { auditRepository } from '../src/modules/audit/audit.repository.js'

// T038 — SC-012: correcting a field auto-resolves its linked OPEN issues; unlinked
// issues are left untouched.
describe('Review corrections — issue auto-resolve (SC-012)', () => {
  let f: ReviewFixture

  beforeEach(async () => {
    f = await createReviewFixture()
  })

  afterEach(async () => {
    await f.app.close()
  })

  it('linked issue is auto-resolved; unlinked issue stays OPEN', async () => {
    const linkedField = f.fieldByName(f.k1NeedsReview, 'box_1_ordinary_income')!
    const otherField = f.fieldByName(f.k1NeedsReview, 'partner_name')!

    // Open a linked issue against box_1_ordinary_income.
    const openLinked = await f.app.inject({
      method: 'POST',
      url: `/v1/k1-documents/${f.k1NeedsReview}/issues`,
      headers: { cookie: f.cookie, 'if-match': '0' },
      payload: { message: 'Looks wrong', k1FieldValueId: linkedField.id, severity: 'HIGH' },
    })
    expect(openLinked.statusCode).toBe(201)
    const { issueId: linkedIssueId, version: v1 } = openLinked.json()

    // Open an unlinked issue (not tied to any field).
    const openUnlinked = await f.app.inject({
      method: 'POST',
      url: `/v1/k1-documents/${f.k1NeedsReview}/issues`,
      headers: { cookie: f.cookie, 'if-match': String(v1) },
      payload: { message: 'Unrelated concern', severity: 'LOW' },
    })
    expect(openUnlinked.statusCode).toBe(201)
    const { version: v2 } = openUnlinked.json()

    // Correcting box_1_ordinary_income should auto-resolve the linked issue.
    const correct = await f.app.inject({
      method: 'PUT',
      url: `/v1/k1-documents/${f.k1NeedsReview}/corrections`,
      headers: { cookie: f.cookie, 'if-match': String(v2) },
      payload: { corrections: [{ fieldId: linkedField.id, value: '55000.00' }] },
    })
    expect(correct.statusCode).toBe(200)
    const body = correct.json()
    expect(body.resolvedIssueIds).toContain(linkedIssueId)

    // Verify: linked issue is RESOLVED.
    const resolvedIssue = k1Repository.getIssue(linkedIssueId)
    expect(resolvedIssue?.status).toBe('RESOLVED')

    // Verify: unlinked issue still OPEN.
    const issues = k1Repository.listIssuesForK1(f.k1NeedsReview)
    const unlinked = issues.find((i) => i.id !== linkedIssueId)
    expect(unlinked?.status).toBe('OPEN')

    // Verify audit events contain k1.issue_resolved for the linked issue only.
    const events = auditRepository.getInMemoryEvents()
    const resolved = events.filter((e) => e.eventName === 'k1.issue_resolved')
    expect(resolved.some((e) => e.objectId === linkedIssueId)).toBe(true)
    // Correcting other field should not close the unlinked issue.
    const unlinkedResolvedEvents = resolved.filter((e) => e.objectId !== linkedIssueId)
    expect(unlinkedResolvedEvents.length).toBe(0)

    // Also verify: correcting an unrelated field does not auto-resolve the unlinked issue.
    const currentK = k1Repository.getK1Document(f.k1NeedsReview)!
    const correctOther = await f.app.inject({
      method: 'PUT',
      url: `/v1/k1-documents/${f.k1NeedsReview}/corrections`,
      headers: { cookie: f.cookie, 'if-match': String(currentK.version) },
      payload: { corrections: [{ fieldId: otherField.id, value: 'New Name LLC' }] },
    })
    expect(correctOther.statusCode).toBe(200)
    expect(correctOther.json().resolvedIssueIds.length).toBe(0)

    const stillOpen = k1Repository.listIssuesForK1(f.k1NeedsReview).find((i) => i.status === 'OPEN')
    expect(stillOpen).toBeDefined()
  })
})
