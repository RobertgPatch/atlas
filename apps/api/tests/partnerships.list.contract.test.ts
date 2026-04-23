import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'

// T016 — Contract: GET /v1/partnerships (directory list)
// Asserts response shape, default sort, pagination, filter params, sort validation.
// NOTE: Without DATABASE_URL these tests exercise contract shape only (empty rows).
describe('GET /v1/partnerships — list contract (T016)', () => {
  let f: TestFixture

  beforeEach(async () => {
    f = await createTestFixture()
  })

  afterEach(async () => {
    await f.app.close()
  })

  it('returns { rows, totals, page } shape for an authenticated Admin', async () => {
    const res = await f.app.inject({
      method: 'GET',
      url: '/v1/partnerships',
      headers: { cookie: f.cookie },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveProperty('rows')
    expect(body).toHaveProperty('totals')
    expect(body).toHaveProperty('page')
    expect(Array.isArray(body.rows)).toBe(true)
    const totals = body.totals
    expect(typeof totals.partnershipCount).toBe('number')
    expect(typeof totals.totalDistributionsUsd).toBe('number')
    expect(typeof totals.totalFmvUsd).toBe('number')
    const page = body.page
    expect(typeof page.size).toBe('number')
    expect(typeof page.offset).toBe('number')
    expect(typeof page.total).toBe('number')
  })

  it('returns 401 when no session cookie is provided', async () => {
    const res = await f.app.inject({
      method: 'GET',
      url: '/v1/partnerships',
    })
    expect(res.statusCode).toBe(401)
  })

  it('accepts all four filter query params without error', async () => {
    const res = await f.app.inject({
      method: 'GET',
      url: '/v1/partnerships?search=test&assetClass=PE&status=ACTIVE&status=PENDING&page=1&pageSize=10',
      headers: { cookie: f.cookie },
    })
    expect(res.statusCode).toBe(200)
  })

  it('accepts all valid sort values', async () => {
    const sortValues = [
      'name', '-name', 'entity', '-entity', 'assetClass', '-assetClass',
      'latestK1Year', '-latestK1Year', 'latestDistributionUsd', '-latestDistributionUsd',
      'latestFmvAmountUsd', '-latestFmvAmountUsd', 'status', '-status',
    ]
    for (const sort of sortValues) {
      const res = await f.app.inject({
        method: 'GET',
        url: `/v1/partnerships?sort=${sort}`,
        headers: { cookie: f.cookie },
      })
      expect(res.statusCode, `sort=${sort} should be 200`).toBe(200)
    }
  })

  it('returns 400 for unknown sort values', async () => {
    const res = await f.app.inject({
      method: 'GET',
      url: '/v1/partnerships?sort=unknown_field',
      headers: { cookie: f.cookie },
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 400 for invalid entityId UUID', async () => {
    const res = await f.app.inject({
      method: 'GET',
      url: '/v1/partnerships?entityId=not-a-uuid',
      headers: { cookie: f.cookie },
    })
    expect(res.statusCode).toBe(400)
  })
})
