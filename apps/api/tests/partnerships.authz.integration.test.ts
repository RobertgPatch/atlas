import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestFixture, sessionCookieFor, type TestFixture } from './helpers/testApp.js'

// T017 — Integration: entity-scope authorization for partnerships
// - Unauthenticated → 401
// - Non-Admin with no scope → 200 with empty rows (fail-safe fallback when no DB)
// - Admin bypasses entity_memberships check
// - Non-Admin with explicit entityId filter → returns empty set (no DB scope data)
describe('partnerships entity-scope authorization (T017)', () => {
  let f: TestFixture

  beforeEach(async () => {
    f = await createTestFixture()
  })

  afterEach(async () => {
    await f.app.close()
  })

  it('returns 401 when no session cookie is present', async () => {
    const res = await f.app.inject({
      method: 'GET',
      url: '/v1/partnerships',
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns 401 for detail endpoint without session', async () => {
    const res = await f.app.inject({
      method: 'GET',
      url: '/v1/partnerships/00000000-0000-0000-0000-000000000001',
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns 401 for entity detail endpoint without session', async () => {
    const res = await f.app.inject({
      method: 'GET',
      url: '/v1/entities/00000000-0000-0000-0000-000000000001',
    })
    expect(res.statusCode).toBe(401)
  })

  it('Admin session gets 200 on list (scope bypassed)', async () => {
    const res = await f.app.inject({
      method: 'GET',
      url: '/v1/partnerships',
      headers: { cookie: f.cookie },
    })
    expect(res.statusCode).toBe(200)
  })

  it('User session gets 200 on list (no DB → empty safe scope)', async () => {
    const userCookie = sessionCookieFor(f.user.id)
    const res = await f.app.inject({
      method: 'GET',
      url: '/v1/partnerships',
      headers: { cookie: userCookie },
    })
    // Non-admin with no DB has empty scope, should still return 200 with empty rows
    expect(res.statusCode).toBe(200)
    expect(res.json().rows).toEqual([])
  })

  it('returns 404 for a non-existent partnership UUID', async () => {
    const res = await f.app.inject({
      method: 'GET',
      url: '/v1/partnerships/00000000-0000-0000-0000-000000000001',
      headers: { cookie: f.cookie },
    })
    expect(res.statusCode).toBe(404)
  })

  it('returns 403 for out-of-scope entityId filter when user has no entity memberships', async () => {
    const userCookie = sessionCookieFor(f.user.id)
    const res = await f.app.inject({
      method: 'GET',
      url: `/v1/partnerships?entityId=${f.entityIds[0]}`,
      headers: { cookie: userCookie },
    })
    expect(res.statusCode).toBe(403)
  })
})
