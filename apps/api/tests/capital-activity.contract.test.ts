import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'

describe('Capital activity contract', () => {
  let f: TestFixture

  beforeEach(async () => {
    f = await createTestFixture()
  })

  afterEach(async () => {
    await f.app.close()
  })

  it('returns 403 when non-admin attempts to create capital activity', async () => {
    const partnershipId = f.partnerships[0]?.id
    expect(partnershipId).toBeTruthy()

    const res = await f.app.inject({
      method: 'POST',
      url: `/v1/partnerships/${partnershipId}/capital-activity`,
      headers: { cookie: f.userCookie },
      payload: {
        activityDate: '2024-02-01',
        eventType: 'capital_call',
        amountUsd: 500000,
      },
    })

    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe('FORBIDDEN_ROLE')
  })

  it('creates, updates, and lists capital activity records for admin users', async () => {
    const partnershipId = f.partnerships[0]?.id
    expect(partnershipId).toBeTruthy()

    const createRes = await f.app.inject({
      method: 'POST',
      url: `/v1/partnerships/${partnershipId}/capital-activity`,
      headers: { cookie: f.cookie },
      payload: {
        activityDate: '2024-02-01',
        eventType: 'capital_call',
        amountUsd: 800000,
        notes: 'Funding call',
      },
    })

    expect(createRes.statusCode).toBe(201)
    const created = createRes.json()
    expect(created.partnershipId).toBe(partnershipId)
    expect(created.eventType).toBe('capital_call')
    expect(created.amountUsd).toBe(800000)

    const updateRes = await f.app.inject({
      method: 'PATCH',
      url: `/v1/partnerships/${partnershipId}/capital-activity/${created.id}`,
      headers: { cookie: f.cookie },
      payload: {
        amountUsd: 850000,
        notes: 'Revised funding call',
      },
    })

    expect(updateRes.statusCode).toBe(200)
    const updated = updateRes.json()
    expect(updated.id).toBe(created.id)
    expect(updated.amountUsd).toBe(850000)
    expect(updated.notes).toBe('Revised funding call')

    const listRes = await f.app.inject({
      method: 'GET',
      url: `/v1/partnerships/${partnershipId}/capital-activity`,
      headers: { cookie: f.cookie },
    })

    expect(listRes.statusCode).toBe(200)
    const rows = listRes.json()
    expect(Array.isArray(rows)).toBe(true)
    expect(rows.length).toBeGreaterThanOrEqual(1)
    expect(rows[0].partnershipId).toBe(partnershipId)
  })

  it('returns 400 for invalid amount by event type rule', async () => {
    const partnershipId = f.partnerships[0]?.id
    expect(partnershipId).toBeTruthy()

    const res = await f.app.inject({
      method: 'POST',
      url: `/v1/partnerships/${partnershipId}/capital-activity`,
      headers: { cookie: f.cookie },
      payload: {
        activityDate: '2024-02-15',
        eventType: 'capital_call',
        amountUsd: -1,
      },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('VALIDATION_ERROR')
  })
})
