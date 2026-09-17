import { randomUUID } from 'node:crypto'

import type { LightMyRequestResponse } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { config } from '../../src/config.js'
import { pool } from '../../src/infra/db/client.js'
import { auditRepository } from '../../src/modules/audit/audit.repository.js'
import { authRepository } from '../../src/modules/auth/auth.repository.js'
import { lockoutService } from '../../src/modules/auth/lockout.service.js'
import {
  passwordService,
  type PasswordVerification,
} from '../../src/modules/auth/password.service.js'
import { totpService } from '../../src/modules/auth/totp.service.js'
import { createTestFixture, type TestFixture } from '../helpers/testApp.js'
import {
  AuthCostAdmissionService,
  createInMemoryAuthAdmissionStore,
  type AuthAdmissionStore,
} from '../../src/modules/auth/authAdmission.service.js'
import { TEST_FINGERPRINT_KEYRING } from '../helpers/abuseProtectionTestHelpers.js'

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
    await pool?.query(`truncate table
      abuse_rate_windows,
      workload_quota_counters,
      workload_leases,
      idempotent_operations,
      protection_overrides
      restart identity cascade`)
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

    const waitDeadline = Date.now() + 5_000
    while (passwordVerify.mock.calls.length < concurrency && Date.now() < waitDeadline) {
      await new Promise<void>((resolve) => setTimeout(resolve, 10))
    }
    await new Promise<void>((resolve) => setImmediate(resolve))
    const hashesStartedBeforeRelease = passwordVerify.mock.calls.length
    for (const resolve of resolvers) resolve(invalidVerification)
    const responses = await Promise.all(pending)

    expect(hashesStartedBeforeRelease).toBe(concurrency)
    expect(passwordVerify).toHaveBeenCalledTimes(concurrency)
    expect(responses.filter((response) => response.statusCode === 401)).toHaveLength(concurrency)
    expect(responses.filter((response) => response.statusCode === 429)).toHaveLength(1)
  }, 15_000)

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

describe('durable authentication admission dimensions', () => {
  const limits = {
    global: { requests: 3, seconds: 300 },
    globalDaily: { requests: 5, seconds: 86_400 },
    source: { requests: 2, seconds: 300 },
    account: { requests: 2, seconds: 900 },
  }
  const now = () => new Date('2026-08-29T12:00:00.000Z')

  const service = (
    store: AuthAdmissionStore,
    configuredLimits: typeof limits = limits,
  ) => new AuthCostAdmissionService({
    fingerprintKeyring: TEST_FINGERPRINT_KEYRING,
    environment: 'test',
    limits: configuredLimits,
    admissionStore: store,
    now,
  })

  it('reserves global, daily-global, source, then account atomically', async () => {
    const reserve = vi.fn<AuthAdmissionStore['reserve']>(async (input) => ({
      allowed: true,
      reservedScopes: input.rates.map((rate) => rate.scope),
    }))
    const result = await service({ reserve }).admit({
      sourcePrefix: '198.51.100.0/24',
      accountIdentifier: 'owner@example.test',
    })

    expect(result.allowed).toBe(true)
    expect(reserve.mock.calls[0]?.[0].rates.map((rate) => rate.scope)).toEqual([
      'global',
      'global',
      'source_prefix',
      'account',
    ])
  })

  it('shares restart/two-process state and bounds rotating source/account rows by the global cap', async () => {
    const store = createInMemoryAuthAdmissionStore({ now })
    const first = service(store)
    const second = service(store)
    const results = []
    for (let index = 0; index < 100; index += 1) {
      results.push(await (index % 2 === 0 ? first : second).admit({
        sourcePrefix: `198.51.${index}.0/24`,
        accountIdentifier: `rotating-${index}@example.test`,
      }))
    }

    expect(results.filter((result) => result.allowed)).toHaveLength(3)
    expect(results.at(-1)).toMatchObject({
      allowed: false,
      reasonCode: 'AUTH_GLOBAL_RATE',
    })
    expect(store.stats().subjectRows).toBeLessThanOrEqual(8)
  })

  it('enforces the independent daily global ceiling', async () => {
    const store = createInMemoryAuthAdmissionStore({ now })
    const admission = service(store, {
      ...limits,
      global: { requests: 100, seconds: 300 },
      globalDaily: { requests: 5, seconds: 86_400 },
      source: { requests: 100, seconds: 300 },
      account: { requests: 100, seconds: 900 },
    })
    const results = []
    for (let index = 0; index < 6; index += 1) {
      results.push(await admission.admit({
        sourcePrefix: `203.0.113.${index}/32`,
        accountIdentifier: `daily-${index}@example.test`,
      }))
    }

    expect(results.slice(0, 5).every((result) => result.allowed)).toBe(true)
    expect(results[5]).toMatchObject({
      allowed: false,
      reasonCode: 'AUTH_GLOBAL_RATE',
    })
  })

  it('enforces the daily cap and uses a deny-only local global-exhaustion circuit', async () => {
    let calls = 0
    const rejectingStore: AuthAdmissionStore = {
      async reserve() {
        calls += 1
        return {
          allowed: false,
          reasonCode: 'AUTH_GLOBAL_RATE',
          retryAfterSeconds: 120,
        }
      },
    }
    const admission = service(rejectingStore)
    const input = { sourcePrefix: '203.0.113.0/24', accountIdentifier: 'owner@example.test' }

    expect(await admission.admit(input)).toMatchObject({ reasonCode: 'AUTH_GLOBAL_RATE' })
    expect(await admission.admit(input)).toMatchObject({ reasonCode: 'AUTH_GLOBAL_RATE' })
    expect(calls).toBe(1)
  })

  it('fails closed with a fixed store reason and creates no workload/idempotency state', async () => {
    const admission = service({ reserve: async () => { throw new Error('offline') } })
    await expect(admission.admit({
      sourcePrefix: '203.0.113.0/24',
      accountIdentifier: 'owner@example.test',
    })).resolves.toEqual({
      allowed: false,
      reasonCode: 'AUTH_STORE_UNAVAILABLE',
      retryAfterSeconds: 30,
    })
  })
})
