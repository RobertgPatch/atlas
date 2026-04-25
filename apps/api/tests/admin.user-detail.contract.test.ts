import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestFixture, sessionCookieFor, type TestFixture } from './helpers/testApp.js'

describe('GET /v1/admin/users/:userId — user detail contract', () => {
  let f: TestFixture

  beforeEach(async () => {
    f = await createTestFixture()
  })

  afterEach(async () => {
    await f.app.close()
  })

  it('returns detail payload for an admin request', async () => {
    const res = await f.app.inject({
      method: 'GET',
      url: `/v1/admin/users/${f.user.id}`,
      headers: { cookie: f.cookie },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.user.id).toBe(f.user.id)
    expect(body.user.email).toBe(f.user.email)
    expect(body.user).toHaveProperty('mfaEnabled')
    expect(body.user).toHaveProperty('createdAt')
    expect(body.user).toHaveProperty('lastLoginAt')
    expect(body.user).toHaveProperty('loginCount')
    expect(Array.isArray(body.assignedEntities)).toBe(true)
    expect(Array.isArray(body.activity)).toBe(true)
  })

  it('returns 403 for a non-admin request', async () => {
    const userCookie = sessionCookieFor(f.user.id)
    const res = await f.app.inject({
      method: 'GET',
      url: `/v1/admin/users/${f.admin.id}`,
      headers: { cookie: userCookie },
    })

    expect(res.statusCode).toBe(403)
  })

  it('returns 404 for an unknown user id', async () => {
    const res = await f.app.inject({
      method: 'GET',
      url: '/v1/admin/users/00000000-0000-0000-0000-000000000001',
      headers: { cookie: f.cookie },
    })

    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('NOT_FOUND')
  })
})