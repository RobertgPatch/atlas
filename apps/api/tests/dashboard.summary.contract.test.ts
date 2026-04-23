import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestFixture, sessionCookieFor, type TestFixture } from './helpers/testApp.js'

describe('GET /v1/dashboard — dashboard summary contract', () => {
  let f: TestFixture

  beforeEach(async () => {
    f = await createTestFixture()
  })

  afterEach(async () => {
    await f.app.close()
  })

  it('returns a scoped dashboard summary for an authenticated user', async () => {
    const res = await f.app.inject({
      method: 'GET',
      url: '/v1/dashboard',
      headers: { cookie: f.cookie },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.kpis.totalEntities).toBe(f.entities.length)
    expect(body.kpis).toHaveProperty('totalPartnerships')
    expect(body.kpis).toHaveProperty('totalK1Documents')
    expect(body.kpis).toHaveProperty('openIssuesCount')
    expect(body.kpis).toHaveProperty('portfolioValueUsd')
    expect(body.statusCounts).toHaveProperty('FINALIZED')
    expect(Array.isArray(body.recentK1Activity)).toBe(true)
    expect(Array.isArray(body.openIssues)).toBe(true)
  })

  it('returns 401 without a session', async () => {
    const res = await f.app.inject({
      method: 'GET',
      url: '/v1/dashboard',
    })

    expect(res.statusCode).toBe(401)
  })

  it('returns a summary for a non-admin scoped user', async () => {
    const userCookie = sessionCookieFor(f.user.id)
    const res = await f.app.inject({
      method: 'GET',
      url: '/v1/dashboard',
      headers: { cookie: userCookie },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().kpis.totalEntities).toBeGreaterThanOrEqual(0)
  })
})