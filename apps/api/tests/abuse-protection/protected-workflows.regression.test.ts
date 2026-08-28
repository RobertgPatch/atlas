import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { defaultRouteProtectionPolicy } from '../../src/modules/abuse-protection/policy.defaults.js'
import { registerLocalRateLimiter } from '../../src/modules/abuse-protection/localRateLimiter.plugin.js'

describe('below-limit protected workflow regressions', () => {
  const apps: FastifyInstance[] = []

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()))
  })

  it('allows representative auth, K-1, reporting, partnership, review, and admin requests below local limits', async () => {
    const app = Fastify({ logger: false })
    apps.push(app)
    registerLocalRateLimiter(app, {
      enabled: true,
      maximumBuckets: 128,
      bucketTtlSeconds: 300,
      fingerprintKey: 'workflow-regression-test-hmac-key-v1',
      ipv6PrefixLength: 64,
      sessionCookieName: 'atlas_session',
    })
    const calls = vi.fn()
    const routes = [
      ['POST', '/v1/auth/login'],
      ['POST', '/v1/k1-ingestion-batches'],
      ['GET', '/v1/reports/portfolio'],
      ['GET', '/v1/partnerships'],
      ['GET', '/v1/k1-documents/:k1DocumentId/review-session'],
      ['PATCH', '/v1/admin/plaid-investment-accounts'],
    ] as const
    for (const [method, route] of routes) {
      app.route({
        method,
        url: route,
        config: { abuseProtection: defaultRouteProtectionPolicy(method, route) },
        handler: async () => {
          calls(method, route)
          return { ok: true }
        },
      })
    }

    const urls = [
      '/v1/auth/login',
      '/v1/k1-ingestion-batches',
      '/v1/reports/portfolio',
      '/v1/partnerships',
      '/v1/k1-documents/00000000-0000-4000-8000-000000000001/review-session',
      '/v1/admin/plaid-investment-accounts',
    ]
    for (let index = 0; index < routes.length; index += 1) {
      const response = await app.inject({
        method: routes[index]![0],
        url: urls[index]!,
        remoteAddress: '192.0.2.9',
        headers: { cookie: 'atlas_session=legitimate-session' },
      })
      expect(response.statusCode).toBe(200)
    }
    expect(calls).toHaveBeenCalledTimes(routes.length)
  })
})
