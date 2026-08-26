import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'

import { buildAbuseProtectionConfig } from '../../src/config.js'
import {
  createBoundedExpiringRateStore,
  registerLocalRateLimiter,
} from '../../src/modules/abuse-protection/localRateLimiter.plugin.js'
import { MAX_PROTECTION_ERROR_BODY_BYTES } from '../../src/modules/abuse-protection/protection.errors.js'
import {
  defineRouteProtectionPolicy,
  registerRoutePolicyCoverage,
} from '../../src/modules/abuse-protection/routePolicy.registry.js'
import type { RouteProtectionPolicy } from '../../src/modules/abuse-protection/protection.types.js'

const fingerprintKey = 'local-rate-limiter-test-hmac-key-material-v1'

const policy = (
  routePattern = '/items/:itemId',
  requests = 1,
): RouteProtectionPolicy => defineRouteProtectionPolicy({
  policyKey: 'items.read',
  routeClass: 'AUTHENTICATED_READ',
  method: 'GET',
  routePattern,
  authentication: 'session',
  scopeDimensions: ['source_prefix', 'user'],
  localRate: { scope: 'source_prefix', requests, windowSeconds: 60 },
  durableRates: [],
  payloadLimits: { queryParameters: 30, pageSize: 250 },
  concurrencyLimit: null,
  backlogLimit: null,
  idempotency: 'none',
  killSwitch: null,
  failureMode: 'low_cost_degraded_read',
  costUnits: ['request'],
  costDrivers: ['ecs'],
  owner: 'platform-security',
})

const injectOptions = (url: string, remoteAddress: string) => ({
  method: 'GET' as const,
  url,
  remoteAddress,
})

describe('bounded local rate limiter', () => {
  const openApps: FastifyInstance[] = []

  afterEach(async () => {
    await Promise.all(openApps.splice(0).map((app) => app.close().catch(() => undefined)))
  })

  const rateLimitedApp = (routePolicy = policy()): FastifyInstance => {
    const app = Fastify({ logger: false })
    openApps.push(app)
    registerLocalRateLimiter(app, {
      enabled: true,
      maximumBuckets: 32,
      bucketTtlSeconds: 60,
      cleanupBatchSize: 8,
      fingerprintKey,
      ipv6PrefixLength: 64,
    })
    app.get(
      routePolicy.routePattern,
      { config: { abuseProtection: routePolicy } },
      async () => ({ ok: true }),
    )
    return app
  }

  it('uses the canonical policy/template bucket for every concrete parameter value', async () => {
    const app = rateLimitedApp()

    const first = await app.inject(injectOptions('/items/first', '192.0.2.10'))
    const changedParameter = await app.inject(injectOptions('/items/second', '192.0.2.10'))

    expect(first.statusCode).toBe(200)
    expect(changedParameter.statusCode).toBe(429)
  })

  it('bounds storage, evicts the least-recently-used bucket, and expires entries', async () => {
    let currentTime = 1_000
    const Store = createBoundedExpiringRateStore({
      maximumEntries: 2,
      maximumTtlMs: 1_000,
      cleanupBatchSize: 2,
      now: () => currentTime,
    })
    const store = new Store()
    const call = (
      action: 'incr' | 'read',
      key: string,
    ): Promise<{ current: number; ttl: number }> => new Promise((resolve, reject) => {
      store[action](key, (error, result) => {
        if (error) reject(error)
        else resolve(result!)
      }, 1_000, 10)
    })

    await call('incr', 'oldest')
    await call('incr', 'recent')
    await call('read', 'oldest')
    await call('incr', 'new')

    expect(store.stats()).toMatchObject({
      size: 2,
      maximumEntries: 2,
      evictions: 1,
    })
    expect(await call('read', 'recent')).toEqual({ current: 0, ttl: 0 })
    expect((await call('read', 'oldest')).current).toBe(1)

    currentTime = 2_001
    await call('incr', 'after-expiry')
    expect(store.stats()).toMatchObject({ size: 1, expirations: 2 })
  })

  it('keys by source and collapses IPv6 addresses to the configured /64 prefix', async () => {
    const app = rateLimitedApp()

    const firstInPrefix = await app.inject(
      injectOptions('/items/one', '2001:db8:abcd:12::1'),
    )
    const secondInPrefix = await app.inject(
      injectOptions('/items/two', '2001:db8:abcd:12::ffff'),
    )
    const differentIpv6Prefix = await app.inject(
      injectOptions('/items/three', '2001:db8:abcd:13::1'),
    )
    const differentIpv4Source = await app.inject(
      injectOptions('/items/four', '192.0.2.44'),
    )

    expect(firstInPrefix.statusCode).toBe(200)
    expect(secondInPrefix.statusCode).toBe(429)
    expect(differentIpv6Prefix.statusCode).toBe(200)
    expect(differentIpv4Source.statusCode).toBe(200)
  })

  it('returns the exact bounded 429 headers and body without running the handler', async () => {
    const app = Fastify({ logger: false })
    openApps.push(app)
    registerLocalRateLimiter(app, {
      enabled: true,
      maximumBuckets: 8,
      bucketTtlSeconds: 60,
      fingerprintKey,
      ipv6PrefixLength: 64,
    })
    let handlerCalls = 0
    app.get('/items/:itemId', { config: { abuseProtection: policy() } }, async () => {
      handlerCalls += 1
      return { ok: true }
    })

    await app.inject(injectOptions('/items/first', '198.51.100.9'))
    const response = await app.inject(injectOptions('/items/second', '198.51.100.9'))
    const body = response.json()

    expect(response.statusCode).toBe(429)
    expect(response.headers['retry-after']).toBe('60')
    expect(response.headers['x-request-id']).toBeTruthy()
    expect(body).toEqual({
      error: 'RATE_LIMITED',
      message: 'Request limit reached. Retry later.',
      requestId: response.headers['x-request-id'],
      retryAfterSeconds: 60,
    })
    expect(Buffer.byteLength(response.body, 'utf8')).toBeLessThanOrEqual(
      MAX_PROTECTION_ERROR_BODY_BYTES,
    )
    expect(handlerCalls).toBe(1)
  })

  it('rejects every request above the configured threshold in a bounded 100-request burst', async () => {
    const app = rateLimitedApp(policy('/items/:itemId', 1))
    const responses = []
    for (let index = 0; index < 100; index += 1) {
      responses.push(await app.inject(injectOptions(`/items/${index}`, '203.0.113.15')))
    }
    expect(responses[0]!.statusCode).toBe(200)
    expect(responses.slice(1).filter((response) => response.statusCode === 429)).toHaveLength(99)
  })

  it('fails startup when production route coverage or finite configuration is missing', async () => {
    const app = Fastify({ logger: false })
    openApps.push(app)
    registerRoutePolicyCoverage(app, { enforceAtStartup: true })
    app.get('/v1/unclassified', async () => ({ ok: true }))

    await expect(app.ready()).rejects.toThrow(
      'ABUSE_PROTECTION_ROUTE_COVERAGE_FAILED:missing_policy:GET /v1/unclassified',
    )
    expect(() => buildAbuseProtectionConfig({
      NODE_ENV: 'production',
      ABUSE_HMAC_ACTIVE_KEY: fingerprintKey,
    }, 'production')).toThrow(/ABUSE_WORKBOOK_USER_PER_DAY.*explicit finite production value/)
    expect(() => buildAbuseProtectionConfig({
      ABUSE_LOCAL_MAX_BUCKETS: 'Infinity',
    }, 'test')).toThrow(/ABUSE_LOCAL_MAX_BUCKETS.*base-10 integer/)
    expect(() => createBoundedExpiringRateStore({
      maximumEntries: 0,
      maximumTtlMs: 1_000,
    })).toThrow('INVALID_LOCAL_RATE_STORE_MAXIMUM_ENTRIES')
  })
})
