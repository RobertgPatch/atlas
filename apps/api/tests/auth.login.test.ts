import { createHash, randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { config } from '../src/config.js'
import { authRepository } from '../src/modules/auth/auth.repository.js'
import { lockoutService } from '../src/modules/auth/lockout.service.js'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'

describe('password-only login', () => {
  let fixture: TestFixture

  beforeEach(async () => {
    fixture = await createTestFixture()
    vi.spyOn(lockoutService, 'getLockout').mockResolvedValue(null)
    vi.spyOn(lockoutService, 'clear').mockResolvedValue()
    vi.spyOn(lockoutService, 'recordFailure').mockResolvedValue(null)
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

  it('does not upgrade a legacy hash when the password is incorrect', async () => {
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
  })

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
