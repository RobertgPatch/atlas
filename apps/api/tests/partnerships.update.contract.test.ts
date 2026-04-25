import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'

// T047 — Contract: PATCH /v1/partnerships/:id (update partnership)
describe('PATCH /v1/partnerships/:id — update contract (T047)', () => {
  let f: TestFixture

  beforeEach(async () => {
    f = await createTestFixture()
  })

  afterEach(async () => {
    await f.app.close()
  })

  it('returns 401 without session', async () => {
    const res = await f.app.inject({
      method: 'PATCH',
      url: '/v1/partnerships/00000000-0000-0000-0000-000000000001',
      payload: { status: 'CLOSED' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns 403 when caller is non-Admin', async () => {
    const res = await f.app.inject({
      method: 'PATCH',
      url: '/v1/partnerships/00000000-0000-0000-0000-000000000001',
      headers: { cookie: f.userCookie },
      payload: { status: 'CLOSED' },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe('FORBIDDEN_ROLE')
  })

  it('returns 400 for non-uuid id param', async () => {
    const res = await f.app.inject({
      method: 'PATCH',
      url: '/v1/partnerships/not-a-uuid',
      headers: { cookie: f.cookie },
      payload: { status: 'CLOSED' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 400 on empty body', async () => {
    const res = await f.app.inject({
      method: 'PATCH',
      url: '/v1/partnerships/00000000-0000-0000-0000-000000000001',
      headers: { cookie: f.cookie },
      payload: {},
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 404 when partnership does not exist (no DB)', async () => {
    const res = await f.app.inject({
      method: 'PATCH',
      url: '/v1/partnerships/00000000-0000-0000-0000-000000000001',
      headers: { cookie: f.cookie },
      payload: { status: 'CLOSED' },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('PARTNERSHIP_NOT_FOUND')
  })
})
