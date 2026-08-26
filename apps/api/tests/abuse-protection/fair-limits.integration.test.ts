import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'

import { defaultRouteProtectionPolicy } from '../../src/modules/abuse-protection/policy.defaults.js'
import { registerLocalRateLimiter } from '../../src/modules/abuse-protection/localRateLimiter.plugin.js'

const fingerprintKey = 'fair-limit-test-hmac-key-material-v1'

describe('fair abuse-protection limits', () => {
  const apps: FastifyInstance[] = []

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()))
  })

  it('isolates authenticated sessions sharing one NAT address', async () => {
    const app = Fastify({ logger: false })
    apps.push(app)
    const policy = {
      ...defaultRouteProtectionPolicy('GET', '/v1/partnerships'),
      localRate: { scope: 'user' as const, requests: 1, windowSeconds: 60 },
    }
    registerLocalRateLimiter(app, {
      enabled: true,
      maximumBuckets: 32,
      bucketTtlSeconds: 60,
      fingerprintKey,
      ipv6PrefixLength: 64,
      sessionCookieName: 'atlas_session',
    })
    app.get('/v1/partnerships', { config: { abuseProtection: policy } }, async () => ({ ok: true }))

    const inject = (session: string) => app.inject({
      method: 'GET',
      url: '/v1/partnerships',
      remoteAddress: '198.51.100.20',
      headers: { cookie: `atlas_session=${session}` },
    })
    expect((await inject('session-a')).statusCode).toBe(200)
    expect((await inject('session-a')).statusCode).toBe(429)
    expect((await inject('session-b')).statusCode).toBe(200)
  })

  it('keeps exact heavy-read and write ceilings scoped by user, session, tenant, and global identity', () => {
    for (const [method, route] of [
      ['GET', '/v1/dashboard'],
      ['POST', '/v1/partnerships'],
      ['PATCH', '/v1/entities/:entityId'],
    ] as const) {
      const policy = defaultRouteProtectionPolicy(method, route)
      expect(new Set(policy.scopeDimensions)).toEqual(
        expect.objectContaining(new Set(['user', 'session', 'tenant', 'global'])),
      )
      expect(new Set(policy.durableRates.map((rate) => rate.scope))).toEqual(
        new Set(['user', 'session', 'tenant', 'global']),
      )
      expect(policy.durableRates.every((rate) => Number.isSafeInteger(rate.requests) && rate.requests > 0)).toBe(true)
    }
  })

  it('normalizes anonymous IPv6 rotation while preserving capacity for a different prefix', async () => {
    const app = Fastify({ logger: false })
    apps.push(app)
    const policy = {
      ...defaultRouteProtectionPolicy('POST', '/v1/auth/login'),
      localRate: { scope: 'source_prefix' as const, requests: 1, windowSeconds: 60 },
    }
    registerLocalRateLimiter(app, {
      enabled: true,
      maximumBuckets: 32,
      bucketTtlSeconds: 60,
      fingerprintKey,
      ipv6PrefixLength: 64,
    })
    app.post('/v1/auth/login', { config: { abuseProtection: policy } }, async () => ({ ok: true }))

    const inject = (remoteAddress: string) => app.inject({ method: 'POST', url: '/v1/auth/login', remoteAddress })
    expect((await inject('2001:db8:100:1::1')).statusCode).toBe(200)
    expect((await inject('2001:db8:100:1::ffff')).statusCode).toBe(429)
    expect((await inject('2001:db8:100:2::1')).statusCode).toBe(200)
  })
})
