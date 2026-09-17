import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { config } from '../src/config.js'
import { authRepository } from '../src/modules/auth/auth.repository.js'
import { lockoutService } from '../src/modules/auth/lockout.service.js'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'

describe('forced bootstrap password change', () => {
  let fixture: TestFixture

  beforeEach(async () => {
    fixture = await createTestFixture()
    vi.spyOn(lockoutService, 'getLockout').mockResolvedValue(null)
    vi.spyOn(lockoutService, 'clear').mockResolvedValue()
    vi.spyOn(lockoutService, 'recordFailure').mockResolvedValue(null)
  })

  afterEach(async () => {
    await authRepository.changePassword(fixture.admin.id, config.adminPassword)
    authRepository._debugSetPasswordChangeRequired(fixture.admin.id, false)
    await fixture.app.close()
    vi.restoreAllMocks()
  })

  it('issues no session until a one-time token sets a strong distinct password', async () => {
    authRepository._debugSetPasswordChangeRequired(fixture.admin.id, true)
    const login = await fixture.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: fixture.admin.email, password: config.adminPassword },
    })

    expect(login.statusCode).toBe(200)
    expect(login.headers['set-cookie']).toBeUndefined()
    expect(login.json()).toMatchObject({
      status: 'PASSWORD_CHANGE_REQUIRED',
      changeToken: expect.any(String),
      policy: { minimumCharacters: 15, compositionRequired: false },
    })

    const weak = await fixture.app.inject({
      method: 'POST',
      url: '/v1/auth/password/change',
      payload: { changeToken: login.json().changeToken, newPassword: 'too short' },
    })
    expect(weak.statusCode).toBe(400)
    expect(weak.json().code).toBe('PASSWORD_TOO_SHORT')

    const newPassword = 'maple river lantern orchard'
    const changed = await fixture.app.inject({
      method: 'POST',
      url: '/v1/auth/password/change',
      payload: { changeToken: login.json().changeToken, newPassword },
    })
    expect(changed.statusCode).toBe(200)
    expect(changed.json()).toEqual({ status: 'PASSWORD_CHANGED' })

    const replay = await fixture.app.inject({
      method: 'POST',
      url: '/v1/auth/password/change',
      payload: { changeToken: login.json().changeToken, newPassword: 'another unique river passphrase' },
    })
    expect(replay.statusCode).toBe(401)

    const oldLogin = await fixture.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: fixture.admin.email, password: config.adminPassword },
    })
    expect(oldLogin.statusCode).toBe(401)

    const newLogin = await fixture.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: fixture.admin.email, password: newPassword },
    })
    expect(newLogin.statusCode).toBe(200)
    expect(newLogin.json().user.displayName).toBe('Tony Patch')
    expect(newLogin.headers['set-cookie']).toBeDefined()
  })
})
