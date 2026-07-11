import { afterEach, describe, expect, it } from 'vitest'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'
import { config } from '../src/config.js'

describe('Production readiness diagnostics contract', () => {
  let fixture: TestFixture | null = null
  const originalConfig = {
    nodeEnv: config.nodeEnv,
    databaseUrl: config.databaseUrl,
    persistenceSecretKey: config.persistenceSecretKey,
    sessionSecret: config.sessionSecret,
    webOrigin: config.webOrigin,
    sessionCookieSecure: config.sessionCookieSecure,
    sessionCookieSameSite: config.sessionCookieSameSite,
    plaidClientId: config.plaid.clientId,
    plaidSecret: config.plaid.secret,
    schedulerEnabled: config.plaidRefresh.schedulerEnabled,
    schedulerMode: config.plaidRefresh.schedulerMode,
    schedulerToken: config.plaidRefresh.schedulerToken,
    rateLimitEnabled: config.security.rateLimitEnabled,
    apiSharedCachePolicy: config.security.apiSharedCachePolicy,
  }

  afterEach(async () => {
    config.nodeEnv = originalConfig.nodeEnv
    config.databaseUrl = originalConfig.databaseUrl
    config.persistenceSecretKey = originalConfig.persistenceSecretKey
    config.sessionSecret = originalConfig.sessionSecret
    config.webOrigin = originalConfig.webOrigin
    config.sessionCookieSecure = originalConfig.sessionCookieSecure
    config.sessionCookieSameSite = originalConfig.sessionCookieSameSite
    config.plaid.clientId = originalConfig.plaidClientId
    config.plaid.secret = originalConfig.plaidSecret
    config.plaidRefresh.schedulerEnabled = originalConfig.schedulerEnabled
    config.plaidRefresh.schedulerMode = originalConfig.schedulerMode
    config.plaidRefresh.schedulerToken = originalConfig.schedulerToken
    config.security.rateLimitEnabled = originalConfig.rateLimitEnabled
    config.security.apiSharedCachePolicy = originalConfig.apiSharedCachePolicy
    if (fixture) {
      await fixture.app.close()
      fixture = null
    }
  })

  it('returns admin-only production readiness diagnostics', async () => {
    fixture = await createTestFixture()

    const anonymous = await fixture.app.inject({
      method: 'GET',
      url: '/v1/admin/production-readiness',
    })
    const nonAdmin = await fixture.app.inject({
      method: 'GET',
      url: '/v1/admin/production-readiness',
      headers: { cookie: fixture.userCookie },
    })
    const admin = await fixture.app.inject({
      method: 'GET',
      url: '/v1/admin/production-readiness',
      headers: { cookie: fixture.cookie },
    })

    expect(anonymous.statusCode).toBe(401)
    expect(nonAdmin.statusCode).toBe(403)
    expect(admin.statusCode).toBe(200)
    expect(admin.json()).toMatchObject({
      environment: expect.any(String),
      durablePersistence: {
        databaseConfigured: expect.any(Boolean),
        mode: expect.any(String),
      },
      schedulerConfigured: expect.any(Boolean),
      secretsConfigured: {
        persistenceSecretKey: expect.any(Boolean),
        sessionSecret: expect.any(Boolean),
        plaidCredentials: expect.any(Boolean),
        schedulerToken: expect.any(Boolean),
      },
      secureCookies: {
        secure: expect.any(Boolean),
        sameSite: expect.any(String),
      },
      allowedOrigin: expect.any(String),
      rateLimitConfigured: expect.any(Boolean),
      apiCachingPolicy: expect.any(String),
      scopingStatus: {
        apiRepositoryScoping: expect.any(String),
        postgresRls: expect.any(String),
      },
      warnings: expect.any(Array),
      checkedAt: expect.any(String),
    })
  })

  it('reports cache, cookie, origin, rate-limit, and secret presence booleans without leaking values', async () => {
    fixture = await createTestFixture()
    const secretValues = [
      'postgres://atlas_user:super-secret-prod-db@db.example.com:5432/atlas',
      'persist-secret-value-production-readiness',
      'session-secret-value-production-readiness',
      'plaid-secret-value-production-readiness',
      'scheduler-secret-value-production-readiness',
    ]
    config.nodeEnv = 'production'
    config.databaseUrl = secretValues[0]!
    config.persistenceSecretKey = secretValues[1]!
    config.sessionSecret = secretValues[2]!
    config.webOrigin = 'https://app.example.com'
    config.sessionCookieSecure = true
    config.sessionCookieSameSite = 'lax'
    config.plaid.clientId = 'production-readiness-client-id'
    config.plaid.secret = secretValues[3]!
    config.plaidRefresh.schedulerEnabled = true
    config.plaidRefresh.schedulerMode = 'eventbridge'
    config.plaidRefresh.schedulerToken = secretValues[4]!
    config.security.rateLimitEnabled = true
    config.security.apiSharedCachePolicy = 'no_shared_cache'

    const response = await fixture.app.inject({
      method: 'GET',
      url: '/v1/admin/production-readiness',
      headers: { cookie: fixture.cookie },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      durablePersistence: {
        databaseConfigured: true,
      },
      schedulerConfigured: true,
      secretsConfigured: {
        persistenceSecretKey: true,
        sessionSecret: true,
        plaidCredentials: true,
        schedulerToken: true,
      },
      secureCookies: {
        secure: true,
        sameSite: 'lax',
      },
      allowedOrigin: 'https://app.example.com',
      rateLimitConfigured: true,
      apiCachingPolicy: 'no_shared_cache',
    })
    const serialized = JSON.stringify(response.json())
    for (const secret of secretValues) {
      expect(serialized).not.toContain(secret)
    }
  })

  it('reports launch-required scoping and deferred Postgres RLS status', async () => {
    fixture = await createTestFixture()

    const response = await fixture.app.inject({
      method: 'GET',
      url: '/v1/admin/production-readiness',
      headers: { cookie: fixture.cookie },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().scopingStatus).toEqual({
      apiRepositoryScoping: 'required_passed',
      postgresRls: 'deferred_hardening',
    })
  })
})
