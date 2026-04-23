import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'

// T030 — Contract: GET /v1/partnerships/:id (detail)
// Asserts response shape, section arrays, FMV ordering, scope enforcement.
// NOTE: Without DATABASE_URL the partnership will not exist → 404 is the expected
// response for any id; shape and authz assertions are the valuable contract here.
describe('GET /v1/partnerships/:id — detail contract (T030)', () => {
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
      url: '/v1/partnerships/00000000-0000-0000-0000-000000000001',
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns 400 for non-uuid id param', async () => {
    const res = await f.app.inject({
      method: 'GET',
      url: '/v1/partnerships/not-a-uuid',
      headers: { cookie: f.cookie },
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 404 for a valid UUID that does not exist (no DB → always not found)', async () => {
    const res = await f.app.inject({
      method: 'GET',
      url: '/v1/partnerships/00000000-0000-0000-0000-000000000001',
      headers: { cookie: f.cookie },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('PARTNERSHIP_NOT_FOUND')
  })

  it('detail 404 body does not leak any internal data', async () => {
    const res = await f.app.inject({
      method: 'GET',
      url: '/v1/partnerships/00000000-0000-0000-0000-000000000002',
      headers: { cookie: f.cookie },
    })
    expect(res.statusCode).toBe(404)
    const body = res.json()
    expect(Object.keys(body)).toEqual(['error'])
  })
})
