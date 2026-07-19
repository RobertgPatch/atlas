import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { config } from '../src/config.js'
import { lockoutService } from '../src/modules/auth/lockout.service.js'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'

describe('password-only login', () => {
  let fixture: TestFixture

  beforeEach(async () => {
    fixture = await createTestFixture()
    vi.spyOn(lockoutService, 'getLockout').mockResolvedValue(null)
    vi.spyOn(lockoutService, 'clear').mockResolvedValue()
  })

  afterEach(async () => {
    await fixture.app.close()
    vi.restoreAllMocks()
  })

  it('creates an authenticated session after valid email and password', async () => {
    const response = await fixture.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: {
        email: fixture.admin.email,
        password: config.adminPassword,
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      user: {
        id: fixture.admin.id,
        email: fixture.admin.email,
        role: 'Admin',
        status: 'Active',
      },
      role: 'Admin',
      session: {
        idleTimeoutSeconds: config.sessionIdleTimeoutSeconds,
        absoluteTimeoutSeconds: config.sessionAbsoluteTimeoutSeconds,
      },
    })
    expect(response.json()).not.toHaveProperty('challengeId')

    const setCookie = response.headers['set-cookie']
    const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie
    expect(cookie).toContain(`${config.sessionCookieName}=`)

    const sessionResponse = await fixture.app.inject({
      method: 'GET',
      url: '/v1/auth/session',
      headers: { cookie: cookie!.split(';', 1)[0]! },
    })
    expect(sessionResponse.statusCode).toBe(200)
    expect(sessionResponse.json().user).toMatchObject({ id: fixture.admin.id })
  })
})
