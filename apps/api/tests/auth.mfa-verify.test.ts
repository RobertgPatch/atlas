import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { config } from '../src/config.js'
import { auditRepository } from '../src/modules/audit/audit.repository.js'
import { authRepository } from '../src/modules/auth/auth.repository.js'
import { lockoutService } from '../src/modules/auth/lockout.service.js'
import { totpService } from '../src/modules/auth/totp.service.js'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'

describe('MFA challenge verification', () => {
  let fixture: TestFixture

  beforeEach(async () => {
    fixture = await createTestFixture()
    authRepository.completeMfaEnrollment(fixture.admin.id, totpService.generateSecret())
    vi.spyOn(lockoutService, 'getLockout').mockResolvedValue(null)
    vi.spyOn(lockoutService, 'clear').mockResolvedValue()
    vi.spyOn(lockoutService, 'recordFailure').mockResolvedValue(null)
  })

  afterEach(async () => {
    await fixture.app.close()
    vi.restoreAllMocks()
  })

  it('creates a session after valid TOTP verification and rejects replay', async () => {
    const challenge = authRepository.createMfaChallenge(fixture.admin.id)
    vi.spyOn(totpService, 'verify').mockReturnValue(true)

    const response = await fixture.app.inject({
      method: 'POST',
      url: '/v1/auth/mfa/verify',
      payload: { challengeId: challenge.id, code: '123456' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ user: { id: fixture.admin.id }, role: 'Admin' })
    expect(response.headers['set-cookie']).toContain(`${config.sessionCookieName}=`)
    expect(authRepository.getChallenge(challenge.id)).toBeUndefined()
    expect(auditRepository.getInMemoryEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventName: 'auth.mfa.verify.succeeded' }),
      ]),
    )

    const replay = await fixture.app.inject({
      method: 'POST',
      url: '/v1/auth/mfa/verify',
      payload: { challengeId: challenge.id, code: '123456' },
    })
    expect(replay.statusCode).toBe(401)
    expect(replay.headers['set-cookie']).toBeUndefined()
  })

  it('rejects an unknown challenge without creating a session', async () => {
    const response = await fixture.app.inject({
      method: 'POST',
      url: '/v1/auth/mfa/verify',
      payload: { challengeId: randomUUID(), code: '123456' },
    })

    expect(response.statusCode).toBe(401)
    expect(response.headers['set-cookie']).toBeUndefined()
  })

  it('records an invalid TOTP and keeps the challenge available for retry', async () => {
    const challenge = authRepository.createMfaChallenge(fixture.admin.id)
    vi.spyOn(totpService, 'verify').mockReturnValue(false)

    const response = await fixture.app.inject({
      method: 'POST',
      url: '/v1/auth/mfa/verify',
      payload: { challengeId: challenge.id, code: '000000' },
    })

    expect(response.statusCode).toBe(401)
    expect(response.headers['set-cookie']).toBeUndefined()
    expect(authRepository.getChallenge(challenge.id)).toBeDefined()
    expect(auditRepository.getInMemoryEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventName: 'auth.mfa.verify.failed' }),
      ]),
    )
  })
})
