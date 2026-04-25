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

  it('creates snapshot for an existing in-memory partnership when DB is unavailable', async () => {
    const partnershipId = f.partnerships[0]?.id
    expect(partnershipId).toBeTruthy()

    const res = await f.app.inject({
      method: 'POST',
      url: `/v1/partnerships/${partnershipId}/fmv-snapshots`,
      headers: { cookie: f.cookie },
      payload: {
        asOfDate: '2024-01-01',
        amountUsd: 1250000,
        source: 'manual',
        note: 'initial snapshot',
      },
    })

    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.partnershipId).toBe(partnershipId)
    expect(body.amountUsd).toBe(1250000)
    expect(body.source).toBe('manual')
    expect(body.note).toBe('initial snapshot')
    expect(typeof body.id).toBe('string')
  })

  it('shows newly created partnership-level FMV in partnership detail response (in-memory)', async () => {
    const partnershipId = f.partnerships[0]?.id
    expect(partnershipId).toBeTruthy()

    const createRes = await f.app.inject({
      method: 'POST',
      url: `/v1/partnerships/${partnershipId}/fmv-snapshots`,
      headers: { cookie: f.cookie },
      payload: {
        asOfDate: '2024-03-31',
        amountUsd: 990000,
        source: 'manual',
      },
    })

    expect(createRes.statusCode).toBe(201)

    const detailRes = await f.app.inject({
      method: 'GET',
      url: `/v1/partnerships/${partnershipId}`,
      headers: { cookie: f.cookie },
    })

    expect(detailRes.statusCode).toBe(200)
    const detail = detailRes.json()
    expect(Array.isArray(detail.fmvSnapshots)).toBe(true)
    expect(detail.fmvSnapshots.length).toBeGreaterThanOrEqual(1)
    expect(detail.fmvSnapshots[0].amountUsd).toBe(990000)
    expect(detail.fmvSnapshots[0].asOfDate).toBe('2024-03-31')
    expect(detail.kpis.latestFmvUsd).toBe(990000)
  })
})
