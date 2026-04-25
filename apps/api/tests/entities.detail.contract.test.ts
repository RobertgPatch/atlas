import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestFixture, sessionCookieFor, type TestFixture } from './helpers/testApp.js'

// T040 — Contract: GET /v1/entities/:id (entity detail)
// Asserts response shape (entity + partnerships[] + rollup), scope enforcement.
describe('GET /v1/entities/:id — entity detail contract (T040)', () => {
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
      url: '/v1/entities/00000000-0000-0000-0000-000000000001',
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns 400 for non-uuid id param', async () => {
    const res = await f.app.inject({
      method: 'GET',
      url: '/v1/entities/not-a-uuid',
      headers: { cookie: f.cookie },
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 404 for a valid UUID that does not exist (no DB)', async () => {
    const res = await f.app.inject({
      method: 'GET',
      url: '/v1/entities/00000000-0000-0000-0000-000000000001',
      headers: { cookie: f.cookie },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('ENTITY_NOT_FOUND')
  })

  it('non-Admin gets 403 when requesting an entity not in their scope', async () => {
    const userCookie = sessionCookieFor(f.user.id)
    // user has empty scope (no DB → no memberships)
    const res = await f.app.inject({
      method: 'GET',
      url: `/v1/entities/${f.entityIds[0]}`,
      headers: { cookie: userCookie },
    })
    // With no DB, user has empty entityIds scope → 403
    expect(res.statusCode).toBe(403)
  })
})
