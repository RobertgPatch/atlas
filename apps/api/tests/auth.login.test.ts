import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { config } from '../src/config.js'
import { authRepository } from '../src/modules/auth/auth.repository.js'
import { lockoutService } from '../src/modules/auth/lockout.service.js'
import { authenticator } from 'otplib'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'

describe('multi-factor login', () => {
  let fixture: TestFixture

  beforeEach(async () => {
    fixture = await createTestFixture()
    authRepository.resetUserMfa(fixture.admin.id)
    vi.spyOn(lockoutService, 'getLockout').mockResolvedValue(null)
    vi.spyOn(lockoutService, 'clear').mockResolvedValue()
    vi.spyOn(lockoutService, 'recordFailure').mockResolvedValue(null)
  })

  afterEach(async () => {
    await fixture.app.close()
    vi.restoreAllMocks()
  })

  it('requires enrollment before issuing an authenticated session', async () => {
    const loginResponse = await fixture.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: {
        email: fixture.admin.email,
        password: config.adminPassword,
      },
    })

    expect(loginResponse.statusCode).toBe(200)
    expect(loginResponse.headers['set-cookie']).toBeUndefined()
    expect(loginResponse.json()).toMatchObject({
      status: 'MFA_ENROLL_REQUIRED',
    })
    expect(authRepository.getUserById(fixture.admin.id)?.passwordHash).toMatch(
      /^scrypt-v1\$/,
    )

    const enrollment = loginResponse.json() as {
      enrollmentToken: string
      manualEntryKey: string
    }
    const enrollmentResponse = await fixture.app.inject({
      method: 'POST',
      url: '/v1/auth/mfa/enroll/complete',
      payload: {
        enrollmentToken: enrollment.enrollmentToken,
        code: authenticator.generate(enrollment.manualEntryKey),
      },
    })

    expect(enrollmentResponse.statusCode).toBe(200)
    const setCookie = enrollmentResponse.headers['set-cookie']
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

  it('requires an MFA challenge on subsequent logins', async () => {
    const secret = authenticator.generateSecret()
    authRepository.completeMfaEnrollment(fixture.admin.id, secret)

    const loginResponse = await fixture.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: {
        email: fixture.admin.email,
        password: config.adminPassword,
      },
    })

    expect(loginResponse.statusCode).toBe(200)
    expect(loginResponse.headers['set-cookie']).toBeUndefined()
    expect(loginResponse.json()).toMatchObject({ status: 'MFA_REQUIRED' })

    const challenge = loginResponse.json() as { challengeId: string }
    const verifyResponse = await fixture.app.inject({
      method: 'POST',
      url: '/v1/auth/mfa/verify',
      payload: {
        challengeId: challenge.challengeId,
        code: authenticator.generate(secret),
      },
    })

    expect(verifyResponse.statusCode).toBe(200)
    expect(verifyResponse.headers['set-cookie']).toContain(config.sessionCookieName)
  })

  it('does not allow invited accounts to use a shared bootstrap password', async () => {
    const invited = authRepository.upsertInvitedUser(
      `security-audit-${Date.now()}@example.com`,
      'User',
    )

    const response = await fixture.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: {
        email: invited.email,
        password: config.userPassword,
      },
    })

    expect(response.statusCode).toBe(401)
    expect(response.headers['set-cookie']).toBeUndefined()
  })
})
