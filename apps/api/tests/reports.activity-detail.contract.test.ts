import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { auditRepository } from '../src/modules/audit/audit.repository.js'
import { PARTNERSHIP_AUDIT_EVENTS } from '../src/modules/audit/audit.events.js'
import { capitalRepository } from '../src/modules/partnerships/capital.repository.js'
import { reviewRepository } from '../src/modules/review/review.repository.js'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'

describe('GET /v1/reports/activity-detail contract', () => {
  let fixture: TestFixture

  beforeEach(async () => {
    fixture = await createTestFixture()
    reviewRepository._debugReset()
  })

  afterEach(async () => {
    await fixture.app.close()
  })

  it('returns 401 when session cookie is missing', async () => {
    const response = await fixture.app.inject({
      method: 'GET',
      url: '/v1/reports/activity-detail',
    })

    expect(response.statusCode).toBe(401)
  })

  it('returns paged activity-detail rows for authenticated callers', async () => {
    const partnership = fixture.partnerships[0]!

    await capitalRepository.createCommitment(
      partnership.id,
      partnership.entityId,
      {
        commitmentAmountUsd: 2_000_000,
        commitmentDate: '2024-01-01',
        sourceType: 'manual',
        status: 'ACTIVE',
      },
      fixture.admin.id,
      null,
    )

    await capitalRepository.createCapitalActivity(
      partnership.id,
      partnership.entityId,
      {
        activityDate: '2024-05-01',
        eventType: 'funded_contribution',
        amountUsd: 600_000,
        sourceType: 'manual',
      },
      fixture.admin.id,
      null,
    )

    const response = await fixture.app.inject({
      method: 'GET',
      url: '/v1/reports/activity-detail?page=1&pageSize=25&sort=taxYear&direction=desc',
      headers: { cookie: fixture.cookie },
    })

    expect(response.statusCode).toBe(200)

    const body = response.json()
    expect(body).toHaveProperty('rows')
    expect(body).toHaveProperty('page')
    expect(body.page).toMatchObject({ size: 25, offset: 0 })

    const row = body.rows.find(
      (candidate: { partnershipId: string; taxYear: number }) =>
        candidate.partnershipId === partnership.id && candidate.taxYear === 2024,
    )

    expect(row).toBeTruthy()
    expect(row).toMatchObject({
      entityId: partnership.entityId,
      partnershipId: partnership.id,
      taxYear: 2024,
    })
    expect(row).toHaveProperty('entityName')
    expect(row).toHaveProperty('partnershipName')
    expect(row).toHaveProperty('distributionsUsd')
    expect(row).toHaveProperty('sourceSignals')
  })

  it('returns a scoped response for non-admin users', async () => {
    const response = await fixture.app.inject({
      method: 'GET',
      url: '/v1/reports/activity-detail',
      headers: { cookie: fixture.userCookie },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toHaveProperty('rows')
  })

  it('supports admin inline edit and single-step undo for activity detail rows', async () => {
    const partnership = fixture.partnerships[0]!

    await capitalRepository.createCommitment(
      partnership.id,
      partnership.entityId,
      {
        commitmentAmountUsd: 2_000_000,
        commitmentDate: '2024-01-01',
        sourceType: 'manual',
        status: 'ACTIVE',
      },
      fixture.admin.id,
      null,
    )

    await capitalRepository.createCapitalActivity(
      partnership.id,
      partnership.entityId,
      {
        activityDate: '2024-05-01',
        eventType: 'funded_contribution',
        amountUsd: 600_000,
        sourceType: 'manual',
      },
      fixture.admin.id,
      null,
    )

    const beforeRes = await fixture.app.inject({
      method: 'GET',
      url: `/v1/reports/activity-detail?entityId=${partnership.entityId}&partnershipId=${partnership.id}&taxYear=2024`,
      headers: { cookie: fixture.cookie },
    })

    expect(beforeRes.statusCode).toBe(200)
    const beforeRow = beforeRes.json().rows[0] as {
      id: string
      contributionsUsd: number | null
      updatedAt: string
    }

    expect(beforeRow).toBeTruthy()

    const nextContributions = (beforeRow.contributionsUsd ?? 0) + 12_500
    const patchRes = await fixture.app.inject({
      method: 'PATCH',
      url: `/v1/reports/activity-detail/${beforeRow.id}`,
      headers: { cookie: fixture.cookie },
      payload: {
        contributionsUsd: nextContributions,
        expectedUpdatedAt: beforeRow.updatedAt,
      },
    })

    expect(patchRes.statusCode).toBe(200)
    expect(patchRes.json().contributionsUsd).toBe(nextContributions)

    const undoRes = await fixture.app.inject({
      method: 'POST',
      url: `/v1/reports/activity-detail/${beforeRow.id}/undo`,
      headers: { cookie: fixture.cookie },
    })

    expect(undoRes.statusCode).toBe(200)
    expect(undoRes.json().contributionsUsd).toBe(beforeRow.contributionsUsd)

    const inMemoryEvents = auditRepository.getInMemoryEvents()
    const editedEvent = inMemoryEvents.find(
      (event) =>
        event.eventName === PARTNERSHIP_AUDIT_EVENTS.REPORT_ACTIVITY_DETAIL_EDITED &&
        event.objectId === beforeRow.id,
    )
    const undoneEvent = inMemoryEvents.find(
      (event) =>
        event.eventName === PARTNERSHIP_AUDIT_EVENTS.REPORT_ACTIVITY_DETAIL_UNDONE &&
        event.objectId === beforeRow.id,
    )

    expect(editedEvent).toBeTruthy()
    expect(undoneEvent).toBeTruthy()
  })

  it('rejects stale activity detail edits and requires an eligible undo', async () => {
    const partnership = fixture.partnerships[0]!

    await capitalRepository.createCommitment(
      partnership.id,
      partnership.entityId,
      {
        commitmentAmountUsd: 1_000_000,
        commitmentDate: '2024-01-01',
        sourceType: 'manual',
        status: 'ACTIVE',
      },
      fixture.admin.id,
      null,
    )

    const beforeRes = await fixture.app.inject({
      method: 'GET',
      url: `/v1/reports/activity-detail?entityId=${partnership.entityId}&partnershipId=${partnership.id}&taxYear=2024`,
      headers: { cookie: fixture.cookie },
    })

    expect(beforeRes.statusCode).toBe(200)
    const row = beforeRes.json().rows[0] as {
      id: string
      updatedAt: string
      notes: string | null
    }

    const firstPatch = await fixture.app.inject({
      method: 'PATCH',
      url: `/v1/reports/activity-detail/${row.id}`,
      headers: { cookie: fixture.cookie },
      payload: {
        notes: 'first edit',
        expectedUpdatedAt: row.updatedAt,
      },
    })
    expect(firstPatch.statusCode).toBe(200)

    const stalePatch = await fixture.app.inject({
      method: 'PATCH',
      url: `/v1/reports/activity-detail/${row.id}`,
      headers: { cookie: fixture.cookie },
      payload: {
        notes: 'stale edit',
        expectedUpdatedAt: row.updatedAt,
      },
    })

    expect(stalePatch.statusCode).toBe(409)
    expect(stalePatch.json().error).toBe('STALE_ACTIVITY_DETAIL_UPDATE')

    const undoRes = await fixture.app.inject({
      method: 'POST',
      url: `/v1/reports/activity-detail/${row.id}/undo`,
      headers: { cookie: fixture.cookie },
    })
    expect(undoRes.statusCode).toBe(200)

    const undoAgainRes = await fixture.app.inject({
      method: 'POST',
      url: `/v1/reports/activity-detail/${row.id}/undo`,
      headers: { cookie: fixture.cookie },
    })
    expect(undoAgainRes.statusCode).toBe(409)
    expect(undoAgainRes.json().error).toBe('ACTIVITY_DETAIL_UNDO_NOT_AVAILABLE')
  })
})
