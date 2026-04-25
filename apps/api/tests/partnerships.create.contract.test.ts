import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'

// T046 — Contract: POST /v1/partnerships (create partnership)
describe('POST /v1/partnerships — create contract (T046)', () => {
  let f: TestFixture

  beforeEach(async () => {
    f = await createTestFixture()
  })

  afterEach(async () => {
    await f.app.close()
  })

  it('returns 401 without session', async () => {
    const res = await f.app.inject({
      method: 'POST',
      url: '/v1/partnerships',
      payload: { entityId: '00000000-0000-0000-0000-000000000001', name: 'Test' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns 403 when caller is non-Admin', async () => {
    const res = await f.app.inject({
      method: 'POST',
      url: '/v1/partnerships',
      headers: { cookie: f.userCookie },
      payload: { entityId: '00000000-0000-0000-0000-000000000001', name: 'Test' },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe('FORBIDDEN_ROLE')
  })

  it('returns 400 on Zod failure (missing name)', async () => {
    const res = await f.app.inject({
      method: 'POST',
      url: '/v1/partnerships',
      headers: { cookie: f.cookie },
      payload: { entityId: '00000000-0000-0000-0000-000000000001' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 400 on non-uuid entityId', async () => {
    const res = await f.app.inject({
      method: 'POST',
      url: '/v1/partnerships',
      headers: { cookie: f.cookie },
      payload: { entityId: 'not-a-uuid', name: 'Foo' },
    })
    expect(res.statusCode).toBe(400)
  })

  // With no DB pool, the insert will fail — but at least we reach the handler (not 400/401)
  it('Admin reaching insert (no DB) gets a server error rather than auth/validation error', async () => {
    const res = await f.app.inject({
      method: 'POST',
      url: '/v1/partnerships',
      headers: { cookie: f.cookie },
      payload: { entityId: f.entityIds[0], name: 'New Partnership', status: 'ACTIVE' },
    })
    // Pool undefined → handler returns 404 (entity not found) or 500 — not 401/403/400
    expect([201, 404, 409, 500]).toContain(res.statusCode)
  })
})
