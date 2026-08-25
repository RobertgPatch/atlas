import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { config } from '../src/config.js'
import { auditRepository } from '../src/modules/audit/audit.repository.js'
import { authRepository } from '../src/modules/auth/auth.repository.js'
import { lockoutService } from '../src/modules/auth/lockout.service.js'
import { totpService } from '../src/modules/auth/totp.service.js'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'

const setMfaLoginEnabled = (enabled: boolean) => {
  Object.assign(config, { mfaLoginEnabled: enabled })
}

describe('MFA enrollment completion', () => {
  let fixture: TestFixture

  beforeEach(async () => {
    setMfaLoginEnabled(false)
    fixture = await createTestFixture()
    authRepository.resetUserMfa(fixture.admin.id)
    vi.spyOn(lockoutService, 'getLockout').mockResolvedValue(null)
    vi.spyOn(lockoutService, 'clear').mockResolvedValue()
    vi.spyOn(lockoutService, 'recordFailure').mockResolvedValue(null)
  })

  afterEach(async () => {
    setMfaLoginEnabled(false)
    await fixture.app.close()
    vi.restoreAllMocks()
  })

  it.each([false, true])(
    'creates a session only after valid TOTP confirmation when MFA=%s',
    async (mfaEnabled) => {
      setMfaLoginEnabled(mfaEnabled)
      const secret = totpService.generateSecret()
      const enrollment = authRepository.createMfaEnrollment(fixture.admin.id, secret)
      vi.spyOn(totpService, 'verify').mockReturnValue(true)

      const response = await fixture.app.inject({
        method: 'POST',
        url: '/v1/auth/mfa/enroll/complete',
        payload: { enrollmentToken: enrollment.id, code: '123456' },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toMatchObject({ user: { id: fixture.admin.id }, role: 'Admin' })
      expect(response.headers['set-cookie']).toContain(`${config.sessionCookieName}=`)
      expect(authRepository.getMfaEnrollment(enrollment.id)).toBeUndefined()
      expect(authRepository.isMfaEnrollmentRequired(authRepository.getUserById(fixture.admin.id)!)).toBe(false)
      expect(auditRepository.getInMemoryEvents()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ eventName: 'auth.mfa.enroll.succeeded' }),
        ]),
      )
    },
  )

  it('rejects an unknown enrollment token without creating a session', async () => {
    const response = await fixture.app.inject({
      method: 'POST',
      url: '/v1/auth/mfa/enroll/complete',
      payload: { enrollmentToken: randomUUID(), code: '123456' },
    })

    expect(response.statusCode).toBe(401)
    expect(response.headers['set-cookie']).toBeUndefined()
  })

  it('records an invalid TOTP and keeps the enrollment available for retry', async () => {
    const enrollment = authRepository.createMfaEnrollment(
      fixture.admin.id,
      totpService.generateSecret(),
    )
    vi.spyOn(totpService, 'verify').mockReturnValue(false)

    const response = await fixture.app.inject({
      method: 'POST',
      url: '/v1/auth/mfa/enroll/complete',
      payload: { enrollmentToken: enrollment.id, code: '000000' },
    })

    expect(response.statusCode).toBe(401)
    expect(response.headers['set-cookie']).toBeUndefined()
    expect(authRepository.getMfaEnrollment(enrollment.id)).toBeDefined()
    expect(auditRepository.getInMemoryEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventName: 'auth.mfa.enroll.failed' }),
      ]),
    )
  })
})
