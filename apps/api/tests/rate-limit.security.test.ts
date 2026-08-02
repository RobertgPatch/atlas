import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { config } from '../src/config.js'

describe('API rate-limit security', () => {
  const original = {
    nodeEnv: config.nodeEnv,
    enabled: config.security.rateLimitEnabled,
    maxRequests: config.security.rateLimitMaxRequests,
    windowSeconds: config.security.rateLimitWindowSeconds,
  }

  afterEach(() => {
    config.nodeEnv = original.nodeEnv
    config.security.rateLimitEnabled = original.enabled
    config.security.rateLimitMaxRequests = original.maxRequests
    config.security.rateLimitWindowSeconds = original.windowSeconds
  })

  it('does not allow arbitrary raw paths to create independent buckets', async () => {
    config.nodeEnv = 'production'
    config.security.rateLimitEnabled = true
    config.security.rateLimitMaxRequests = 2
    config.security.rateLimitWindowSeconds = 60
    const app = buildApp()
    await app.ready()

    try {
      await app.inject({ method: 'GET', url: '/v1/not-a-route-1' })
      await app.inject({ method: 'GET', url: '/v1/not-a-route-2' })
      const response = await app.inject({ method: 'GET', url: '/v1/not-a-route-3' })

      expect(response.statusCode).toBe(429)
      expect(response.json()).toEqual({ error: 'RATE_LIMIT_EXCEEDED' })
    } finally {
      await app.close()
    }
  })
})
