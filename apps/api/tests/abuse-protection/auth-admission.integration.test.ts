import { randomUUID } from 'node:crypto'

import type { LightMyRequestResponse } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { config } from '../../src/config.js'
import { auditRepository } from '../../src/modules/audit/audit.repository.js'
import { authRepository } from '../../src/modules/auth/auth.repository.js'
import { lockoutService } from '../../src/modules/auth/lockout.service.js'
import {
  passwordService,
  type PasswordVerification,
} from '../../src/modules/auth/password.service.js'
import { totpService } from '../../src/modules/auth/totp.service.js'
import { createTestFixture, type TestFixture } from '../helpers/testApp.js'

const INVALID_PASSWORD = 'not-the-right-password'
const invalidVerification: PasswordVerification = {
  valid: false,
  needsUpgrade: false,
}

const login = (
  fixture: TestFixture,
  email: string,
  password = INVALID_PASSWORD,
  remoteAddress = '198.51.100.20',
) => fixture.app.inject({
  method: 'POST',
  url: '/v1/auth/login',
  remoteAddress,
  payload: { email, password },
})

const publicOutcome = (response: LightMyRequestResponse) => ({
  statusCode: response.statusCode,
  error: response.json<{ error?: string }>().error,
  retryAfter: response.headers['retry-after'] !== undefined,
})

describe('authentication cost admission', () => {
  let fixture: TestFixture

  beforeEach(async () => {
    Object.assign(config, { mfaLoginEnabled: false })
    fixture = await createTestFixture()
    vi.spyOn(lockoutService, 'getLockout').mockResolvedValue(null)
    vi.spyOn(lockoutService, 'recordFailure').mockResolvedValue(null)
    vi.spyOn(lockoutService, 'clear').mockResolvedValue()
  })

  afterEach(async () => {
    Object.assign(config, { mfaLoginEnabled: false })
    await fixture.app.close()
    vi.restoreAllMocks()
  })

  it('rejects a source-prefix flood before extra Argon2, lockout, or audit work', async () => {
    const allowed = config.abuseProtection.localRates.authSource.requests
    const passwordVerify = vi
      .spyOn(passwordService, 'verify')
      .mockResolvedValue(invalidVerification)
    const auditWrite = vi.spyOn(auditRepository, 'record').mockResolvedValue()

    const responses: LightMyRequestResponse[] = []
    for (let index = 0; index <= allowed; index += 1) {
      responses.push(await login(
        fixture,
        `source-${index}-${randomUUID()}@example.com`,
        INVALID_PASSWORD,
        '198.51.100.21',
      ))
    }

    expect(responses.slice(0, allowed).map((response) => response.statusCode))
      .toEqual(Array.from({ length: allowed }, () => 401))
    expect(responses.at(-1)?.statusCode).toBe(429)
    expect(responses.at(-1)?.json()).toMatchObject({ error: 'RATE_LIMITED' })
    expect(responses.at(-1)?.headers['retry-after']).toBeDefined()
    expect(passwordVerify).toHaveBeenCalledTimes(allowed)
    expect(lockoutService.recordFailure).toHaveBeenCalledTimes(allowed)
    expect(auditWrite).toHaveBeenCalledTimes(allowed)
  })

  it('rejects an over-limit account before Argon2, TOTP secret, or QR generation', async () => {
    Object.assign(config, { mfaLoginEnabled: true })
    authRepository.resetUserMfa(fixture.admin.id)
    const allowed = config.abuseProtection.exactRates.knownAccount.requests
    const passwordVerify = vi
      .spyOn(passwordService, 'verify')
      .mockImplementation(async (_hash, password) => ({
        valid: password === config.adminPassword,
        needsUpgrade: false,
      }))
    const generateSecret = vi.spyOn(totpService, 'generateSecret')
    const buildQrCode = vi
      .spyOn(totpService, 'buildQrCodeDataUrl')
      .mockResolvedValue('data:image/png;base64,dGVzdA==')
    const auditWrite = vi.spyOn(auditRepository, 'record').mockResolvedValue()

    for (let index = 0; index < allowed; index += 1) {
      const response = await login(fixture, fixture.admin.email)
      expect(response.statusCode).toBe(401)
    }
    const rejected = await login(
      fixture,
      fixture.admin.email,
      config.adminPassword,
    )

    expect(rejected.statusCode).toBe(429)
    expect(rejected.json()).toMatchObject({ error: 'RATE_LIMITED' })
    expect(passwordVerify).toHaveBeenCalledTimes(allowed)
    expect(generateSecret).not.toHaveBeenCalled()
    expect(buildQrCode).not.toHaveBeenCalled()
    expect(lockoutService.recordFailure).toHaveBeenCalledTimes(allowed)
    expect(auditWrite).toHaveBeenCalledTimes(allowed)
  })

  it('gives known and unknown accounts the same bounded public failure sequence', async () => {
    const allowed = config.abuseProtection.exactRates.knownAccount.requests
    vi.spyOn(passwordService, 'verify').mockResolvedValue(invalidVerification)
    vi.spyOn(auditRepository, 'record').mockResolvedValue()
    const unknownEmail = `unknown-${randomUUID()}@example.com`

    const exerciseAccount = async (email: string, remoteAddress: string) => {
      const outcomes = []
      for (let index = 0; index <= allowed; index += 1) {
        outcomes.push(publicOutcome(await login(
          fixture,
          email,
          INVALID_PASSWORD,
          remoteAddress,
        )))
      }
      return outcomes
    }

    const known = await exerciseAccount(fixture.admin.email, '198.51.100.31')
    const unknown = await exerciseAccount(unknownEmail, '198.51.100.32')

    expect(known).toEqual(unknown)
    expect(known.slice(0, allowed)).toEqual(Array.from(
      { length: allowed },
      () => ({ statusCode: 401, error: 'SIGN_IN_FAILED', retryAfter: false }),
    ))
    expect(known.at(-1)).toEqual({
      statusCode: 429,
      error: 'RATE_LIMITED',
      retryAfter: true,
    })
  })

  it('caps concurrent global password-hash work before starting another hash', async () => {
    const concurrency = config.abuseProtection.exactRates.globalHashConcurrency
    const resolvers: Array<(value: PasswordVerification) => void> = []
    const passwordVerify = vi
      .spyOn(passwordService, 'verify')
      .mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)))
    vi.spyOn(auditRepository, 'record').mockResolvedValue()

    const pending = Array.from({ length: concurrency + 1 }, (_, index) => login(
      fixture,
      `concurrent-${index}-${randomUUID()}@example.com`,
      INVALID_PASSWORD,
      `198.51.100.${50 + index}`,
    ))

    for (let attempt = 0; attempt < 50 && passwordVerify.mock.calls.length < concurrency; attempt += 1) {
      await new Promise<void>((resolve) => setImmediate(resolve))
    }
    await new Promise<void>((resolve) => setImmediate(resolve))
    const hashesStartedBeforeRelease = passwordVerify.mock.calls.length
    for (const resolve of resolvers) resolve(invalidVerification)
    const responses = await Promise.all(pending)

    expect(hashesStartedBeforeRelease).toBe(concurrency)
    expect(passwordVerify).toHaveBeenCalledTimes(concurrency)
    expect(responses.filter((response) => response.statusCode === 401)).toHaveLength(concurrency)
    expect(responses.filter((response) => response.statusCode === 429)).toHaveLength(1)
  })

  it('rejects repeated MFA challenges before extra TOTP and audit writes', async () => {
    authRepository.completeMfaEnrollment(fixture.admin.id, 'TESTTOTPMANUALKEY')
    const challenge = authRepository.createMfaChallenge(fixture.admin.id)
    const allowed = config.abuseProtection.exactRates.knownAccount.requests
    const totpVerify = vi.spyOn(totpService, 'verify').mockReturnValue(false)
    const auditWrite = vi.spyOn(auditRepository, 'record').mockResolvedValue()

    const responses: LightMyRequestResponse[] = []
    for (let index = 0; index <= allowed; index += 1) {
      responses.push(await fixture.app.inject({
        method: 'POST',
        url: '/v1/auth/mfa/verify',
        remoteAddress: '198.51.100.70',
        payload: { challengeId: challenge.id, code: '000000' },
      }))
    }

    expect(responses.slice(0, allowed).map((response) => response.statusCode))
      .toEqual(Array.from({ length: allowed }, () => 401))
    expect(responses.at(-1)?.statusCode).toBe(429)
    expect(totpVerify).toHaveBeenCalledTimes(allowed)
    expect(lockoutService.recordFailure).toHaveBeenCalledTimes(allowed)
    expect(auditWrite).toHaveBeenCalledTimes(allowed)
  })
})
