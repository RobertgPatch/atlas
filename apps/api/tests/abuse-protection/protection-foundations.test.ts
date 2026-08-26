import Fastify from 'fastify'
import { describe, expect, it, vi } from 'vitest'

import {
  buildProtectionUnavailableResponse,
  buildRateLimitedResponse,
  MAX_PROTECTION_ERROR_BODY_BYTES,
} from '../../src/modules/abuse-protection/protection.errors.js'
import {
  fingerprintCanonicalRequest,
  fingerprintSubject,
  normalizeSourcePrefix,
  SUBJECT_FINGERPRINT_BYTES,
} from '../../src/modules/abuse-protection/subjectFingerprint.js'
import {
  RoutePolicyRegistry,
  assertRoutePolicyCoverage,
  canonicalRouteKey,
  defineRouteProtectionPolicy,
} from '../../src/modules/abuse-protection/routePolicy.registry.js'
import type { RouteProtectionPolicy } from '../../src/modules/abuse-protection/protection.types.js'
import {
  createBoundedExpiringRateStore,
  registerLocalRateLimiter,
} from '../../src/modules/abuse-protection/localRateLimiter.plugin.js'
import {
  createAbuseObservability,
  redactAbuseEventDetails,
} from '../../src/modules/abuse-protection/abuseObservability.js'

const fingerprintKey = 'test-only-abuse-protection-key-32-bytes-minimum'

describe('subject fingerprints', () => {
  it('normalizes IPv4 and IPv4-mapped addresses to one source identity', () => {
    expect(normalizeSourcePrefix('192.0.2.7')).toBe('192.0.2.7/32')
    expect(normalizeSourcePrefix('::ffff:192.0.2.7')).toBe('192.0.2.7/32')
  })

  it('normalizes IPv6 sources to a configurable network prefix', () => {
    expect(normalizeSourcePrefix('2001:0DB8:abcd:12:1234:5678:90ab:cdef')).toBe(
      '2001:db8:abcd:12::/64',
    )
    expect(normalizeSourcePrefix('2001:db8:abcd:12:ffff::1', 48)).toBe(
      '2001:db8:abcd::/48',
    )
  })

  it('returns only fixed-length HMAC digests for persisted subjects', () => {
    const digest = fingerprintSubject(fingerprintKey, {
      scope: 'account',
      value: 'owner@example.test',
    })

    expect(digest).toBeInstanceOf(Buffer)
    expect(digest.byteLength).toBe(SUBJECT_FINGERPRINT_BYTES)
    expect(digest.toString('hex')).not.toContain('owner')
  })

  it('makes request fingerprints independent of object key order', () => {
    const first = fingerprintCanonicalRequest(fingerprintKey, {
      policyKey: 'k1.retry-extraction',
      method: 'POST',
      routePattern: '/v1/k1-documents/:k1DocumentId/retry-extraction',
      inputs: { expectedVersion: 4, documentId: 'doc-123' },
      resourceVersion: 4,
    })
    const second = fingerprintCanonicalRequest(fingerprintKey, {
      policyKey: 'k1.retry-extraction',
      method: 'POST',
      routePattern: '/v1/k1-documents/:k1DocumentId/retry-extraction',
      inputs: { documentId: 'doc-123', expectedVersion: 4 },
      resourceVersion: 4,
    })
    const changed = fingerprintCanonicalRequest(fingerprintKey, {
      policyKey: 'k1.retry-extraction',
      method: 'POST',
      routePattern: '/v1/k1-documents/:k1DocumentId/retry-extraction',
      inputs: { documentId: 'doc-456', expectedVersion: 4 },
      resourceVersion: 4,
    })

    expect(first.equals(second)).toBe(true)
    expect(first.equals(changed)).toBe(false)
    expect(first.byteLength).toBe(SUBJECT_FINGERPRINT_BYTES)
  })
})

describe('bounded protection errors', () => {
  it('builds the stable 429 contract and clamps retry time', () => {
    const response = buildRateLimitedResponse({
      code: 'QUOTA_EXCEEDED',
      requestId: 'req_test_12345678',
      retryAfterSeconds: 100_000,
    })

    expect(response).toEqual({
      statusCode: 429,
      headers: {
        'Retry-After': '86400',
        'X-Request-Id': 'req_test_12345678',
      },
      body: {
        error: 'QUOTA_EXCEEDED',
        message: 'Workload quota reached. Retry later.',
        requestId: 'req_test_12345678',
        retryAfterSeconds: 86400,
      },
    })
  })

  it('builds a bounded 503 contract and replaces invalid request IDs', () => {
    const response = buildProtectionUnavailableResponse({
      code: 'WORKLOAD_DISABLED',
      requestId: 'short',
      retryAfterSeconds: 0,
    })

    expect(response.statusCode).toBe(503)
    expect(response.headers['Retry-After']).toBe('1')
    expect(response.headers['X-Request-Id']).toMatch(/^req_[0-9a-f-]{36}$/)
    expect(response.body.requestId).toBe(response.headers['X-Request-Id'])
    expect(response.body.error).toBe('WORKLOAD_DISABLED')
    expect(Buffer.byteLength(JSON.stringify(response.body), 'utf8')).toBeLessThanOrEqual(
      MAX_PROTECTION_ERROR_BODY_BYTES,
    )
  })
})

const validPolicy = (
  overrides: Partial<RouteProtectionPolicy> = {},
): RouteProtectionPolicy =>
  defineRouteProtectionPolicy({
    policyKey: 'reports.portfolio-summary',
    routeClass: 'DATABASE_HEAVY_READ',
    method: 'GET',
    routePattern: '/v1/reports/portfolio-summary',
    authentication: 'session',
    scopeDimensions: ['user', 'global'],
    localRate: null,
    durableRates: [
      {
        policyLimitKey: 'reports-heavy-user',
        scope: 'user',
        requests: 30,
        windowSeconds: 60,
      },
    ],
    payloadLimits: { pageSize: 1_000 },
    concurrencyLimit: 8,
    backlogLimit: null,
    idempotency: 'none',
    killSwitch: null,
    failureMode: 'fail_closed',
    costUnits: ['request'],
    costDrivers: ['postgres'],
    owner: 'platform-security',
    ...overrides,
  })

describe('route policy registry', () => {
  it('keys policies by the canonical Fastify template', () => {
    const registry = new RoutePolicyRegistry()
    const policy = validPolicy()
    registry.register(policy)

    expect(canonicalRouteKey('get', '/v1/reports/portfolio-summary/')).toBe(
      'GET /v1/reports/portfolio-summary',
    )
    expect(registry.getByRoute('GET', '/v1/reports/portfolio-summary')).toBe(policy)
    expect(() => canonicalRouteKey('GET', '/v1/reports?id=raw')).toThrow(
      'INVALID_CANONICAL_ROUTE_PATTERN',
    )
  })

  it('fails coverage for an external route without policy metadata', () => {
    expect(() =>
      assertRoutePolicyCoverage([
        {
          method: 'POST',
          routePattern: '/v1/k1-documents/:k1DocumentId/reparse',
          policy: null,
        },
      ]),
    ).toThrow(/missing_policy:POST \/v1\/k1-documents\/:k1DocumentId\/reparse/)
  })

  it('rejects paid policies without a global finite limit', () => {
    expect(() =>
      validPolicy({
        policyKey: 'market.refresh',
        routeClass: 'EXTERNAL_PROVIDER',
        method: 'POST',
        routePattern: '/v1/reports/consolidated-holdings/refresh',
        idempotency: 'required',
        killSwitch: 'market_data_refresh',
        durableRates: [],
        costUnits: ['provider_call'],
      }),
    ).toThrow('PAID_ROUTE_MISSING_GLOBAL_LIMIT')
  })
})

describe('bounded local rate limiter', () => {
  it('evicts least-recently-used keys and expires buckets in finite batches', () => {
    let now = 1_000
    const Store = createBoundedExpiringRateStore({
      maximumEntries: 2,
      maximumTtlMs: 1_000,
      cleanupBatchSize: 2,
      now: () => now,
    })
    const store = new Store()
    const increment = (key: string) =>
      new Promise<{ current: number; ttl: number }>((resolve, reject) =>
        store.incr(key, (error, result) => {
          if (error) reject(error)
          else resolve(result!)
        }, 1_000, 1),
      )

    return increment('first')
      .then(() => increment('second'))
      .then(() => increment('third'))
      .then(() => {
        expect(store.stats()).toMatchObject({ size: 2, evictions: 1 })
        now = 2_001
        return increment('fourth')
      })
      .then(() => {
        expect(store.stats().size).toBe(1)
        expect(store.stats().expirations).toBe(2)
      })
  })

  it('uses a canonical policy key so rotating path parameters share a bucket', async () => {
    const app = Fastify({ logger: false })
    registerLocalRateLimiter(app, {
      enabled: true,
      maximumBuckets: 10,
      bucketTtlSeconds: 60,
      fingerprintKey,
      ipv6PrefixLength: 64,
    })
    const policy = validPolicy({
      policyKey: 'items.read',
      routeClass: 'AUTHENTICATED_READ',
      method: 'GET',
      routePattern: '/items/:itemId',
      localRate: { scope: 'source_prefix', requests: 1, windowSeconds: 60 },
      failureMode: 'low_cost_degraded_read',
      concurrencyLimit: null,
    })
    app.get(
      '/items/:itemId',
      { config: { abuseProtection: policy } },
      async () => ({ ok: true }),
    )

    const first = await app.inject({ method: 'GET', url: '/items/first' })
    const second = await app.inject({ method: 'GET', url: '/items/second' })

    expect(first.statusCode).toBe(200)
    expect(second.statusCode).toBe(429)
    expect(second.headers['retry-after']).toBe('60')
    expect(second.headers['x-request-id']).toBeTruthy()
    expect(second.json()).toMatchObject({ error: 'RATE_LIMITED' })
    await app.close()
  })
})

describe('abuse observability', () => {
  it('redacts secrets and bounds nested attacker-controlled detail', () => {
    expect(
      redactAbuseEventDetails({
        authorization: 'Bearer secret',
        nested: { email: 'owner@example.test', safe: 'ok' },
        queryString: 'token=secret',
      }),
    ).toEqual({
      authorization: '[REDACTED]',
      nested: { email: '[REDACTED]', safe: 'ok' },
      queryString: '[REDACTED]',
    })
  })

  it('always emits low-cardinality metrics while sampling and capping logs', () => {
    const emitMetric = vi.fn()
    const emitLog = vi.fn()
    const observability = createAbuseObservability({
      emitMetric,
      emitLog,
      sampleRate: 1,
      maximumLogsPerWindow: 1,
      random: () => 0,
    })
    const event = {
      decision: 'throttled' as const,
      policyKey: 'auth.login',
      routeClass: 'AUTH_ATTEMPT' as const,
      scopeKind: 'source_prefix' as const,
      reasonCode: 'local_rate',
      environment: 'test',
      requestId: 'req_test_12345678',
    }

    observability.record(event)
    observability.record(event)

    expect(emitMetric).toHaveBeenCalledTimes(2)
    expect(emitMetric.mock.calls[0]?.[0].dimensions).not.toHaveProperty('requestId')
    expect(emitLog).toHaveBeenCalledTimes(1)
    expect(observability.snapshot()).toEqual({
      emittedMetrics: 2,
      emittedLogs: 1,
      suppressedLogs: 1,
    })
  })
})
