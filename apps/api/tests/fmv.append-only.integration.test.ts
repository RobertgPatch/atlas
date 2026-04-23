import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'

// T058 — Integration test: FMV append-only semantics
// Without a real DB, these tests verify handler + repository path flow
// (full append-only persistence tested in DB integration tests)
describe('FMV append-only semantics (T058)', () => {
  let f: TestFixture

  beforeEach(async () => {
    f = await createTestFixture()
  })

  afterEach(async () => {
    await f.app.close()
  })

  it('GET /fmv-snapshots returns an array (append-only capable shape)', async () => {
    const res = await f.app.inject({
      method: 'GET',
      url: '/v1/partnerships/00000000-0000-0000-0000-000000000001/fmv-snapshots',
      headers: { cookie: f.cookie },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(Array.isArray(body)).toBe(true)
  })

  it('POST endpoint is registered and returns auth failure without cookie', async () => {
    const res = await f.app.inject({
      method: 'POST',
      url: '/v1/partnerships/00000000-0000-0000-0000-000000000001/fmv-snapshots',
      payload: { asOfDate: '2024-01-01', amountUsd: 100, source: 'manual' },
    })
    expect(res.statusCode).toBe(401)
  })
})
