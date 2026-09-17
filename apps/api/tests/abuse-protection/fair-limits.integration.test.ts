import Fastify from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'

import {
  registerLocalRateLimiter,
} from '../../src/modules/abuse-protection/localRateLimiter.plugin.js'
import { PrincipalRateLimiter } from '../../src/modules/abuse-protection/principalRateLimiter.js'
import { defineRouteProtectionPolicy } from '../../src/modules/abuse-protection/routePolicy.registry.js'
import { createValidatedSubjectContext } from '../../src/modules/abuse-protection/subjectContext.js'
import type { RouteProtectionPolicy } from '../../src/modules/abuse-protection/protection.types.js'
import { TEST_FINGERPRINT_KEY, TEST_FINGERPRINT_KEYRING } from '../helpers/abuseProtectionTestHelpers.js'

const policy = (
  userRequests = 3,
  sourceRequests = 100,
): RouteProtectionPolicy => defineRouteProtectionPolicy({
  policyKey: 'route.fair.read',
  routeClass: 'AUTHENTICATED_READ',
  method: 'GET',
  routePattern: '/v1/fair',
  authentication: 'session',
  scopeDimensions: ['source_prefix', 'user', 'session', 'tenant', 'global'],
  localRate: null,
  localRates: [{
    limitKey: 'general_api.source', scope: 'source_prefix', partition: 'source',
    requests: sourceRequests, windowSeconds: 60,
  }, {
    limitKey: 'general_api.user', scope: 'user', partition: 'authenticated',
    requests: userRequests, windowSeconds: 60,
  }, {
    limitKey: 'general_api.session', scope: 'session', partition: 'authenticated',
    requests: 100, windowSeconds: 60,
  }],
  durableRates: [],
  payloadLimits: {},
  concurrencyLimit: null,
  concurrencyClass: null,
  backlogLimit: null,
  idempotency: 'none',
  killSwitch: null,
  failureMode: 'low_cost_degraded_read',
  costUnits: ['request'],
  costDrivers: ['database_read'],
  owner: 'platform-security',
})

const context = (userId: string, sessionId: string) => createValidatedSubjectContext({
  userId,
  sessionId,
  deploymentTenantId: 'family-office',
  environment: 'test',
  keyring: TEST_FINGERPRINT_KEYRING,
})

describe('independent source, user, and session fairness', () => {
  const apps: ReturnType<typeof Fastify>[] = []
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close().catch(() => undefined)))
  })

  it('holds one user to one ceiling across 10 sessions and 10 networks', async () => {
    const app = Fastify({ logger: false })
    apps.push(app)
    const routePolicy = policy(3, 100)
    const store = registerLocalRateLimiter(app, {
      enabled: true,
      maximumBuckets: 64,
      partitions: { pinnedGlobal: 4, authenticated: 40, source: 20 },
      bucketTtlSeconds: 60,
      fingerprintKey: TEST_FINGERPRINT_KEY,
      ipv6PrefixLength: 64,
    })!
    const limiter = new PrincipalRateLimiter(store)
    app.get('/v1/fair', {
      config: { abuseProtection: routePolicy },
      preHandler: async (request, reply) => {
        const decision = await limiter.admit(routePolicy, context(
          '00000000-0000-4000-8000-000000000001',
          String(request.headers['x-test-session']),
        ))
        if (!decision.allowed) await reply.status(429).send({ error: decision.code })
      },
    }, async () => ({ ok: true }))

    const results = []
    for (let index = 0; index < 10; index += 1) {
      results.push(await app.inject({
        method: 'GET',
        url: '/v1/fair',
        remoteAddress: `198.51.${index}.10`,
        headers: { 'x-test-session': `session-${index}` },
      }))
    }

    expect(results.filter((response) => response.statusCode === 200)).toHaveLength(3)
    expect(results.slice(3).every((response) => response.statusCode === 429)).toBe(true)
  })

  it('does not accept request-shaped tenant/resource fallbacks in validated context', () => {
    const trusted = createValidatedSubjectContext({
      userId: 'user-1',
      sessionId: 'session-1',
      deploymentTenantId: 'family-office',
      environment: 'test',
      keyring: TEST_FINGERPRINT_KEYRING,
      authorizedResources: { entity: 'authorized-entity' },
    })
    expect(trusted.deploymentTenantId).toBe('family-office')
    expect(trusted.aliases.tenant?.[0]?.digest).toHaveLength(32)
    expect(trusted.aliases.entity?.[0]?.digest).toHaveLength(32)
    expect(trusted.aliases.account).toBeUndefined()
  })

  it('keeps shared-NAT source pressure separate from per-user fairness', async () => {
    const app = Fastify({ logger: false })
    apps.push(app)
    const routePolicy = policy(10, 2)
    const store = registerLocalRateLimiter(app, {
      enabled: true,
      maximumBuckets: 32,
      partitions: { pinnedGlobal: 2, authenticated: 20, source: 10 },
      bucketTtlSeconds: 60,
      fingerprintKey: TEST_FINGERPRINT_KEY,
      ipv6PrefixLength: 64,
    })!
    const principal = new PrincipalRateLimiter(store)
    app.get('/v1/fair', {
      config: { abuseProtection: routePolicy },
      preHandler: async (request, reply) => {
        const userId = String(request.headers['x-test-user'])
        const sessionId = String(request.headers['x-test-session'])
        const decision = await principal.admit(routePolicy, context(userId, sessionId))
        if (!decision.allowed) await reply.status(429).send({ error: decision.code })
      },
    }, async () => ({ ok: true }))

    const inject = (user: string, session: string, remoteAddress: string) => app.inject({
      method: 'GET',
      url: '/v1/fair',
      remoteAddress,
      headers: { 'x-test-user': user, 'x-test-session': session },
    })
    expect((await inject('user-a', 'session-a1', '198.51.100.10')).statusCode).toBe(200)
    expect((await inject('user-b', 'session-b1', '198.51.100.10')).statusCode).toBe(200)
    expect((await inject('user-c', 'session-c1', '198.51.100.10')).statusCode).toBe(429)
    expect((await inject('user-c', 'session-c2', '198.51.100.11')).statusCode).toBe(200)
  })
})
