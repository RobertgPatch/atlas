import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'

describe('Partnership commitments contract', () => {
  let f: TestFixture

  beforeEach(async () => {
    f = await createTestFixture()
  })

  afterEach(async () => {
    await f.app.close()
  })

  it('returns 401 without session for list endpoint', async () => {
    const partnershipId = f.partnerships[0]?.id
    expect(partnershipId).toBeTruthy()

    const res = await f.app.inject({
      method: 'GET',
      url: `/v1/partnerships/${partnershipId}/commitments`,
    })

    expect(res.statusCode).toBe(401)
  })

  it('returns 403 when non-admin attempts to create commitment', async () => {
    const partnershipId = f.partnerships[0]?.id
    expect(partnershipId).toBeTruthy()

    const res = await f.app.inject({
      method: 'POST',
      url: `/v1/partnerships/${partnershipId}/commitments`,
      headers: { cookie: f.userCookie },
      payload: {
        commitmentAmountUsd: 2000000,
        commitmentDate: '2024-01-02',
      },
    })

    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe('FORBIDDEN_ROLE')
  })

  it('creates and updates commitment for admin users', async () => {
    const partnershipId = f.partnerships[0]?.id
    expect(partnershipId).toBeTruthy()

    const createRes = await f.app.inject({
      method: 'POST',
      url: `/v1/partnerships/${partnershipId}/commitments`,
      headers: { cookie: f.cookie },
      payload: {
        commitmentAmountUsd: 2_500_000,
        commitmentDate: '2024-01-02',
        commitmentStartDate: '2024-01-02',
        commitmentEndDate: '2030-12-31',
        notes: 'Initial commitment',
      },
    })

    expect(createRes.statusCode).toBe(201)
    const created = createRes.json()
    expect(created.partnershipId).toBe(partnershipId)
    expect(created.commitmentAmountUsd).toBe(2_500_000)
    expect(created.status).toBe('ACTIVE')
    expect(created.sourceType).toBe('manual')

    const updateRes = await f.app.inject({
      method: 'PATCH',
      url: `/v1/partnerships/${partnershipId}/commitments/${created.id}`,
      headers: { cookie: f.cookie },
      payload: {
        notes: 'Updated commitment note',
        commitmentAmountUsd: 2_700_000,
      },
    })

    expect(updateRes.statusCode).toBe(200)
    const updated = updateRes.json()
    expect(updated.id).toBe(created.id)
    expect(updated.commitmentAmountUsd).toBe(2_700_000)
    expect(updated.notes).toBe('Updated commitment note')

    const listRes = await f.app.inject({
      method: 'GET',
      url: `/v1/partnerships/${partnershipId}/commitments`,
      headers: { cookie: f.cookie },
    })

    expect(listRes.statusCode).toBe(200)
    const rows = listRes.json()
    expect(Array.isArray(rows)).toBe(true)
    expect(rows.length).toBeGreaterThanOrEqual(1)
    expect(rows[0].partnershipId).toBe(partnershipId)
  })

  it('keeps only one active commitment when a new active record is created', async () => {
    const partnershipId = f.partnerships[0]?.id
    expect(partnershipId).toBeTruthy()

    const first = await f.app.inject({
      method: 'POST',
      url: `/v1/partnerships/${partnershipId}/commitments`,
      headers: { cookie: f.cookie },
      payload: {
        commitmentAmountUsd: 1_000_000,
        commitmentDate: '2023-01-01',
      },
    })
    expect(first.statusCode).toBe(201)

    const second = await f.app.inject({
      method: 'POST',
      url: `/v1/partnerships/${partnershipId}/commitments`,
      headers: { cookie: f.cookie },
      payload: {
        commitmentAmountUsd: 1_500_000,
        commitmentDate: '2024-01-01',
      },
    })
    expect(second.statusCode).toBe(201)

    const listRes = await f.app.inject({
      method: 'GET',
      url: `/v1/partnerships/${partnershipId}/commitments`,
      headers: { cookie: f.cookie },
    })
    expect(listRes.statusCode).toBe(200)

    const rows = listRes.json()
    const activeRows = rows.filter((row: { status: string }) => row.status === 'ACTIVE')
    expect(activeRows.length).toBe(1)
  })
})
