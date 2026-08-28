import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { buildApp } from '../../src/app.js'
import { config } from '../../src/config.js'
import { admissionService } from '../../src/modules/abuse-protection/admission.service.js'
import { authRepository } from '../../src/modules/auth/auth.repository.js'
import { lockoutService } from '../../src/modules/auth/lockout.service.js'
import { plaidRefreshScheduler } from '../../src/modules/plaid/plaid.refresh-scheduler.js'
import { createTestFixture, type TestFixture } from '../helpers/testApp.js'

const WEB_ORIGIN = 'https://app.atlas.example'
const CROSS_SITE_ORIGIN = 'https://attacker.example'
const SCHEDULER_TOKEN = 'test-scheduler-token-000000000075'

const securityHeaders = {
  'cache-control': 'private, no-store, max-age=0, must-revalidate',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'cross-origin-resource-policy': 'same-site',
}

describe('production CORS, CSRF, cookies, and response headers', () => {
  let app: FastifyInstance | undefined
  let fixture: TestFixture | undefined
  let originalConfig: {
    nodeEnv: string
    webOrigin: string
    sessionCookieSecure: boolean
    sessionCookieSameSite: 'lax' | 'strict' | 'none'
    schedulerToken: string
  }

  beforeEach(() => {
    originalConfig = {
      nodeEnv: config.nodeEnv,
      webOrigin: config.webOrigin,
      sessionCookieSecure: config.sessionCookieSecure,
      sessionCookieSameSite: config.sessionCookieSameSite,
      schedulerToken: config.plaidRefresh.schedulerToken,
    }
    Object.assign(config, {
      nodeEnv: 'production',
      webOrigin: WEB_ORIGIN,
      sessionCookieSecure: true,
      sessionCookieSameSite: 'lax',
      mfaLoginEnabled: false,
    })
    Object.assign(config.plaidRefresh, { schedulerToken: SCHEDULER_TOKEN })
  })

  afterEach(async () => {
    await fixture?.app.close()
    if (app && app !== fixture?.app) await app.close()
    Object.assign(config, {
      nodeEnv: originalConfig.nodeEnv,
      webOrigin: originalConfig.webOrigin,
      sessionCookieSecure: originalConfig.sessionCookieSecure,
      sessionCookieSameSite: originalConfig.sessionCookieSameSite,
      mfaLoginEnabled: false,
    })
    Object.assign(config.plaidRefresh, {
      schedulerToken: originalConfig.schedulerToken,
    })
    vi.restoreAllMocks()
  })

  const createProductionFixture = async (): Promise<TestFixture> => {
    fixture = await createTestFixture()
    return fixture
  }

  it('fails production startup without an explicit CORS allowlist', () => {
    Object.assign(config, { webOrigin: ' , ' })

    expect(() => buildApp()).toThrow(/WEB_ORIGIN.*explicit allowlist/i)
  })

  it('allows only the configured credentialed origin and answers its preflight', async () => {
    app = buildApp()
    const simple = await app.inject({
      method: 'GET',
      url: '/v1/auth/session',
      headers: { origin: WEB_ORIGIN },
    })
    const preflight = await app.inject({
      method: 'OPTIONS',
      url: '/v1/auth/logout',
      headers: {
        origin: WEB_ORIGIN,
        'access-control-request-method': 'POST',
      },
    })

    expect.soft(simple.headers['access-control-allow-origin']).toBe(WEB_ORIGIN)
    expect.soft(simple.headers['access-control-allow-credentials']).toBe('true')
    expect.soft(simple.headers.vary).toContain('Origin')
    expect.soft(simple.headers['access-control-allow-origin']).not.toBe('*')
    expect.soft(preflight.statusCode).toBe(204)
    expect.soft(preflight.headers['access-control-allow-origin']).toBe(WEB_ORIGIN)
    expect.soft(preflight.headers['access-control-allow-methods']).toContain('POST')
  })

  it('sets a hardened production session cookie and security headers after login', async () => {
    const current = await createProductionFixture()
    vi.spyOn(lockoutService, 'getLockout').mockResolvedValue(null)
    vi.spyOn(lockoutService, 'clear').mockResolvedValue()
    const response = await current.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      headers: { origin: WEB_ORIGIN },
      payload: {
        email: current.admin.email,
        password: config.adminPassword,
      },
    })
    const rawCookie = response.headers['set-cookie']
    const cookie = Array.isArray(rawCookie) ? rawCookie[0] : rawCookie

    expect.soft(response.statusCode).toBe(200)
    expect.soft(cookie).toContain(`${config.sessionCookieName}=`)
    expect.soft(cookie).toMatch(/; HttpOnly/i)
    expect.soft(cookie).toMatch(/; Secure/i)
    expect.soft(cookie).toMatch(/; SameSite=Lax/i)
    expect.soft(cookie).toMatch(/; Path=\//i)
    expect.soft(response.headers).toMatchObject({
      ...securityHeaders,
      'access-control-allow-origin': WEB_ORIGIN,
      'access-control-allow-credentials': 'true',
    })
  })

  it('rejects missing and cross-site origins before an unsafe cookie handler', async () => {
    const current = await createProductionFixture()
    const revoke = vi.spyOn(authRepository, 'revokeSession')
    const missingOrigin = await current.app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: { cookie: current.cookie },
    })
    const crossSite = await current.app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: {
        cookie: current.userCookie,
        origin: CROSS_SITE_ORIGIN,
      },
    })

    for (const response of [missingOrigin, crossSite]) {
      expect.soft(response.statusCode).toBe(403)
      expect.soft(response.json()).toMatchObject({ error: 'CSRF_ORIGIN_REJECTED' })
      expect.soft(response.headers).toMatchObject(securityHeaders)
      expect.soft(response.headers['access-control-allow-origin']).toBeUndefined()
    }
    expect.soft(revoke).not.toHaveBeenCalled()
  })

  it('allows an unsafe cookie request only from the configured origin', async () => {
    const current = await createProductionFixture()
    const revoke = vi.spyOn(authRepository, 'revokeSession')
    const response = await current.app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: {
        cookie: current.cookie,
        origin: WEB_ORIGIN,
      },
    })

    expect.soft(response.statusCode).toBe(204)
    expect.soft(response.headers['access-control-allow-origin']).toBe(WEB_ORIGIN)
    expect.soft(revoke).toHaveBeenCalledTimes(1)
  })

  it('exempts the authenticated scheduler machine request from browser CSRF checks', async () => {
    vi.spyOn(admissionService, 'admit').mockImplementation(async (request) => ({
      decision: 'allowed',
      policyKey: request.policy.policyKey,
      requestId: request.requestId,
      reservations: [],
    }))
    const run = vi.spyOn(plaidRefreshScheduler, 'runScheduledRefresh')
      .mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000075',
        status: 'success',
      } as never)
    app = buildApp()
    const response = await app.inject({
      method: 'POST',
      url: '/v1/admin/plaid-refresh/run',
      headers: { 'x-atlas-scheduler-token': SCHEDULER_TOKEN },
      payload: { scheduledFor: '2026-08-25T12:00:00.000Z' },
    })

    expect.soft(response.statusCode).toBe(202)
    expect.soft(response.json()).toMatchObject({
      id: '00000000-0000-4000-8000-000000000075',
      status: 'success',
    })
    expect.soft(run).toHaveBeenCalledTimes(1)
  })
})
