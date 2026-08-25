import { createHash, randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { config } from '../src/config.js'
import { authRepository } from '../src/modules/auth/auth.repository.js'
import { lockoutService } from '../src/modules/auth/lockout.service.js'
import { totpService } from '../src/modules/auth/totp.service.js'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'

const setMfaLoginEnabled = (enabled: boolean) => {
  Object.assign(config, { mfaLoginEnabled: enabled })
}

describe('feature-flagged login', () => {
  let fixture: TestFixture

  beforeEach(async () => {
    setMfaLoginEnabled(false)
    fixture = await createTestFixture()
    vi.spyOn(lockoutService, 'getLockout').mockResolvedValue(null)
    vi.spyOn(lockoutService, 'clear').mockResolvedValue()
    vi.spyOn(lockoutService, 'recordFailure').mockResolvedValue(null)
  })

  afterEach(async () => {
    setMfaLoginEnabled(false)
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
    expect(sessionResponse.json().session.issuedAt).toBe(response.json().session.issuedAt)

    const extensionResponse = await fixture.app.inject({
      method: 'POST',
      url: '/v1/auth/session/extend',
      headers: { cookie: cookie!.split(';', 1)[0]! },
    })
    expect(extensionResponse.statusCode).toBe(200)
    expect(extensionResponse.json()).toMatchObject({
      user: { id: fixture.admin.id },
      session: {
        issuedAt: response.json().session.issuedAt,
        idleTimeoutSeconds: config.sessionIdleTimeoutSeconds,
      },
    })
  })

  it('requires MFA enrollment without creating a session when the flag is enabled', async () => {
    setMfaLoginEnabled(true)
    authRepository.resetUserMfa(fixture.admin.id)

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
      status: 'MFA_ENROLL_REQUIRED',
      enrollmentToken: expect.any(String),
      otpAuthUrl: expect.any(String),
      qrCodeDataUrl: expect.stringMatching(/^data:image\/png;base64,/),
      manualEntryKey: expect.any(String),
    })
    expect(response.headers['set-cookie']).toBeUndefined()
  })

  it('requires an MFA challenge without creating a session for an enrolled user', async () => {
    setMfaLoginEnabled(true)
    authRepository.completeMfaEnrollment(fixture.admin.id, totpService.generateSecret())

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
      status: 'MFA_REQUIRED',
      challengeId: expect.any(String),
    })
    expect(response.headers['set-cookie']).toBeUndefined()
  })

  it('stores bootstrap passwords with Argon2id', () => {
    const admin = authRepository.getUserById(fixture.admin.id)

    expect(admin?.passwordHash).toMatch(/^\$argon2id\$v=19\$/)
  })

  it('upgrades a valid legacy SHA-256 password during login', async () => {
    const admin = authRepository.getUserById(fixture.admin.id)!
    admin.passwordHash = createHash('sha256').update(config.adminPassword).digest('hex')

    const response = await fixture.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: {
        email: fixture.admin.email,
        password: config.adminPassword,
      },
    })

    expect(response.statusCode).toBe(200)
    expect(admin.passwordHash).toMatch(/^\$argon2id\$v=19\$/)
  })

  it.each([false, true])(
    'does not upgrade a legacy hash when the password is incorrect with MFA=%s',
    async (mfaEnabled) => {
      setMfaLoginEnabled(mfaEnabled)
    const admin = authRepository.getUserById(fixture.admin.id)!
    const legacyHash = createHash('sha256').update(config.adminPassword).digest('hex')
    admin.passwordHash = legacyHash

    const response = await fixture.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: {
        email: fixture.admin.email,
        password: 'definitely-wrong',
      },
    })

    expect(response.statusCode).toBe(401)
    expect(admin.passwordHash).toBe(legacyHash)
      expect(response.headers['set-cookie']).toBeUndefined()
    },
  )

  it.each([false, true])(
    'preserves password lockout behavior with MFA=%s',
    async (mfaEnabled) => {
      setMfaLoginEnabled(mfaEnabled)
      const lockoutUntil = new Date('2026-08-25T12:30:00.000Z')
      vi.mocked(lockoutService.recordFailure).mockResolvedValueOnce(lockoutUntil)

      const response = await fixture.app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: {
          email: fixture.admin.email,
          password: 'definitely-wrong',
        },
      })

      expect(response.statusCode).toBe(423)
      expect(response.json()).toEqual({
        error: 'ACCOUNT_LOCKED',
        lockoutUntil: lockoutUntil.toISOString(),
      })
      expect(response.headers['set-cookie']).toBeUndefined()
    },
  )

  it('uses Argon2id when a new invited user record is created', async () => {
    const invited = await authRepository.upsertInvitedUser(
      `argon-invite-${randomUUID()}@example.com`,
      'User',
    )

    expect(invited.passwordHash).toMatch(/^\$argon2id\$v=19\$/)
  })

  it('rejects a session extension without a valid session cookie', async () => {
    const response = await fixture.app.inject({
      method: 'POST',
      url: '/v1/auth/session/extend',
    })

    expect(response.statusCode).toBe(401)
    expect(response.headers['set-cookie']).toContain(`${config.sessionCookieName}=;`)
  })
})
