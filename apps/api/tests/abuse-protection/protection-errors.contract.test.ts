import { describe, expect, it } from 'vitest'

import { AdmissionStoreUnavailableError, type AdmissionSqlClient } from '../../src/modules/abuse-protection/admission.repository.js'
import { AdmissionService } from '../../src/modules/abuse-protection/admission.service.js'
import { defaultRouteProtectionPolicy } from '../../src/modules/abuse-protection/policy.defaults.js'
import {
  buildProtectionUnavailableResponse,
  buildRateLimitedResponse,
  MAX_PROTECTION_ERROR_BODY_BYTES,
} from '../../src/modules/abuse-protection/protection.errors.js'
import { deterministicSubjectFingerprint } from '../helpers/abuseProtectionTestHelpers.js'

const unavailableService = () => new AdmissionService({
  repository: {
    withTransaction: async <T>(callback: (client: AdmissionSqlClient) => Promise<T>) => callback({
      query: async () => ({ rows: [], rowCount: 0 }),
    }),
    reserveInTransaction: async () => {
      throw new AdmissionStoreUnavailableError(new Error('offline'))
    },
  },
})

describe('protection error contract and failure modes', () => {
  it('returns stable bounded 429 and 503 responses with recovery headers', () => {
    for (const response of [
      buildRateLimitedResponse({ code: 'RATE_LIMITED', requestId: 'request_12345678', retryAfterSeconds: 17 }),
      buildRateLimitedResponse({ code: 'QUOTA_EXCEEDED', requestId: 'request_12345678', retryAfterSeconds: 31 }),
      buildProtectionUnavailableResponse({ code: 'PROTECTION_UNAVAILABLE', requestId: 'request_12345678', retryAfterSeconds: 30 }),
    ]) {
      expect(response.headers['Retry-After']).toBe(String(response.body.retryAfterSeconds))
      expect(response.headers['X-Request-Id']).toBe(response.body.requestId)
      expect(response.headers['Cache-Control']).toBe('no-store')
      expect(Buffer.byteLength(JSON.stringify(response.body))).toBeLessThanOrEqual(MAX_PROTECTION_ERROR_BODY_BYTES)
      expect(JSON.stringify(response.body)).not.toMatch(/ip|email|account|userId|sessionId|cookie|remaining|resetTimestamp/i)
    }
  })

  it('keeps authentication rejection public behavior independent of account existence', () => {
    const known = buildRateLimitedResponse({
      code: 'RATE_LIMITED',
      requestId: 'request_known_123',
      retryAfterSeconds: 60,
    })
    const unknown = buildRateLimitedResponse({
      code: 'RATE_LIMITED',
      requestId: 'request_unknown_1',
      retryAfterSeconds: 60,
    })

    expect({ ...known.body, requestId: '[request]' }).toEqual({
      ...unknown.body,
      requestId: '[request]',
    })
    expect(known.statusCode).toBe(429)
  })

  it('degrades only cheap completed-data reads when the exact store is unavailable', async () => {
    const service = unavailableService()
    const hashes = {
      user: deterministicSubjectFingerprint('user', 'user-a'),
      session: deterministicSubjectFingerprint('session', 'session-a'),
      tenant: deterministicSubjectFingerprint('tenant', 'tenant-a'),
      global: deterministicSubjectFingerprint('global', 'atlas'),
    }
    const cheap = defaultRouteProtectionPolicy('GET', '/v1/partnerships')
    const heavy = defaultRouteProtectionPolicy('GET', '/v1/dashboard')

    await expect(service.admit({ policy: cheap, requestId: 'request_cheap_123', subjectHashes: hashes })).resolves.toMatchObject({ decision: 'allowed' })
    await expect(service.admit({ policy: heavy, requestId: 'request_heavy_123', subjectHashes: hashes })).resolves.toMatchObject({
      decision: 'protection_unavailable',
      error: 'PROTECTION_UNAVAILABLE',
    })
  })
})
