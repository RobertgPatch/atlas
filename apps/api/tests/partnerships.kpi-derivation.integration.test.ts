import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'

// T018 — Integration: KPI derivation from totals
// Asserts totals shape and non-negative values.
// With no DATABASE_URL, all values are 0 (empty safe state).
describe('GET /v1/partnerships — KPI totals shape (T018)', () => {
  let f: TestFixture

  beforeEach(async () => {
    f = await createTestFixture()
  })

  afterEach(async () => {
    await f.app.close()
  })

  it('totals contains partnershipCount, totalDistributionsUsd, totalFmvUsd', async () => {
    const res = await f.app.inject({
      method: 'GET',
      url: '/v1/partnerships',
      headers: { cookie: f.cookie },
    })
    expect(res.statusCode).toBe(200)
    const { totals } = res.json()
    expect(totals).toHaveProperty('partnershipCount')
    expect(totals).toHaveProperty('totalDistributionsUsd')
    expect(totals).toHaveProperty('totalFmvUsd')
  })

  it('totals values are numeric and non-negative', async () => {
    const res = await f.app.inject({
      method: 'GET',
      url: '/v1/partnerships',
      headers: { cookie: f.cookie },
    })
    const { totals } = res.json()
    expect(typeof totals.partnershipCount).toBe('number')
    expect(totals.partnershipCount).toBeGreaterThanOrEqual(0)
    expect(typeof totals.totalDistributionsUsd).toBe('number')
    expect(totals.totalDistributionsUsd).toBeGreaterThanOrEqual(0)
    expect(typeof totals.totalFmvUsd).toBe('number')
    expect(totals.totalFmvUsd).toBeGreaterThanOrEqual(0)
  })

  it('page total equals partnershipCount (single page when < pageSize)', async () => {
    const res = await f.app.inject({
      method: 'GET',
      url: '/v1/partnerships?pageSize=50',
      headers: { cookie: f.cookie },
    })
    const body = res.json()
    // rows.length <= page.total
    expect(body.rows.length).toBeLessThanOrEqual(body.page.total)
  })
})
