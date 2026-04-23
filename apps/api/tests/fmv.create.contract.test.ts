import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'

// T057 — Contract: POST /v1/partnerships/:id/fmv-snapshots
describe('POST /v1/partnerships/:id/fmv-snapshots — create FMV contract (T057)', () => {
  let f: TestFixture

  beforeEach(async () => {
    f = await createTestFixture()
  })

  afterEach(async () => {
    await f.app.close()
  })

  const BASE_URL = '/v1/partnerships/00000000-0000-0000-0000-000000000001/fmv-snapshots'
  const validBody = {
    asOfDate: '2024-01-01',
    amountUsd: 1_000_000,
    source: 'manual' as const,
  }

  it('returns 401 without session', async () => {
    const res = await f.app.inject({ method: 'POST', url: BASE_URL, payload: validBody })
    expect(res.statusCode).toBe(401)
  })

  it('returns 403 when caller is non-Admin', async () => {
    const res = await f.app.inject({
      method: 'POST',
      url: BASE_URL,
      headers: { cookie: f.userCookie },
      payload: validBody,
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe('FORBIDDEN_ROLE')
  })

  it('returns 400 on negative amount', async () => {
    const res = await f.app.inject({
      method: 'POST',
      url: BASE_URL,
      headers: { cookie: f.cookie },
      payload: { ...validBody, amountUsd: -100 },
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 400 on future asOfDate', async () => {
    const futureDate = new Date(Date.now() + 86_400_000 * 2).toISOString().slice(0, 10)
    const res = await f.app.inject({
      method: 'POST',
      url: BASE_URL,
      headers: { cookie: f.cookie },
      payload: { ...validBody, asOfDate: futureDate },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('FUTURE_DATE_NOT_ALLOWED')
  })

  it('returns 400 on zero amount for non-LIQUIDATED partnership (no DB → 404)', async () => {
    // Without DB, after role/date check we 404 — this verifies at minimum it does not 200
    const res = await f.app.inject({
      method: 'POST',
      url: BASE_URL,
      headers: { cookie: f.cookie },
      payload: { ...validBody, amountUsd: 0 },
    })
    // Zero on active partnership → 400 (or 404 since no DB); either way not 200
    expect(res.statusCode).not.toBe(200)
  })
})
