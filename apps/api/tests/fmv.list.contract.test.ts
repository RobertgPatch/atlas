import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'

// T056 — Contract: GET /v1/partnerships/:id/fmv-snapshots
describe('GET /v1/partnerships/:id/fmv-snapshots — list FMV contract (T056)', () => {
  let f: TestFixture

  beforeEach(async () => {
    f = await createTestFixture()
  })

  afterEach(async () => {
    await f.app.close()
  })

  it('returns 401 without session', async () => {
    const res = await f.app.inject({
      method: 'GET',
      url: '/v1/partnerships/00000000-0000-0000-0000-000000000001/fmv-snapshots',
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns 400 for non-uuid id', async () => {
    const res = await f.app.inject({
      method: 'GET',
      url: '/v1/partnerships/not-a-uuid/fmv-snapshots',
      headers: { cookie: f.cookie },
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns an array (empty or 404) for an unknown partnership (no DB)', async () => {
    const res = await f.app.inject({
      method: 'GET',
      url: '/v1/partnerships/00000000-0000-0000-0000-000000000001/fmv-snapshots',
      headers: { cookie: f.cookie },
    })
    // No DB: empty array from repository
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.json())).toBe(true)
  })

  it('does not expose PATCH or DELETE verbs', async () => {
    const patch = await f.app.inject({
      method: 'PATCH',
      url: '/v1/partnerships/00000000-0000-0000-0000-000000000001/fmv-snapshots',
      headers: { cookie: f.cookie },
    })
    expect(patch.statusCode).toBe(404)

    const del = await f.app.inject({
      method: 'DELETE',
      url: '/v1/partnerships/00000000-0000-0000-0000-000000000001/fmv-snapshots',
      headers: { cookie: f.cookie },
    })
    expect(del.statusCode).toBe(404)
  })
})
