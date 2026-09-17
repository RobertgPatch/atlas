import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  createAbuseObservability,
  redactAbuseEventDetails,
  type AbuseMetric,
  type AbuseStructuredLog,
} from '../../src/modules/abuse-protection/abuseObservability.js'
import {
  buildProtectionUnavailableResponse,
  buildRateLimitedResponse,
} from '../../src/modules/abuse-protection/protection.errors.js'

const restricted = {
  ipAddress: '203.0.113.77',
  email: 'owner@example.test',
  cookie: 'atlas_session=opaque-cookie-value',
  sessionId: '00000000-0000-4000-8000-000000000077',
  password: 'correct-horse-battery-staple',
  mfaCode: '123456',
  presignedUrl: 'https://bucket.example/key?X-Amz-Signature=secret-signature',
  schedulerToken: 'scheduler-secret-value',
  csrfHeader: 'csrf-secret-value',
  idempotencyKey: 'idempotency-secret-value',
} as const

describe('cross-artifact security redaction', () => {
  it('removes every Restricted fixture from samples and all metric dimensions', () => {
    const metrics: AbuseMetric[] = []
    const logs: AbuseStructuredLog[] = []
    const observability = createAbuseObservability({
      emitMetric: (metric) => metrics.push(metric),
      emitLog: (event) => logs.push(event),
      sampleRate: 1,
      random: () => 0,
    })
    observability.record({
      decision: 'blocked',
      policyKey: 'auth.login',
      routeClass: 'AUTH_ATTEMPT',
      scopeKind: 'source_prefix',
      reasonCode: 'AUTH_SOURCE_RATE',
      environment: 'test',
      requestId: 'req_safe_correlation_12345',
      details: restricted,
    })

    expect(redactAbuseEventDetails(restricted)).toEqual(Object.fromEntries(
      Object.keys(restricted).map((key) => [key, '[REDACTED]']),
    ))
    for (const raw of Object.values(restricted)) {
      expect.soft(JSON.stringify(metrics)).not.toContain(raw)
      expect.soft(JSON.stringify(logs)).not.toContain(raw)
    }
    expect.soft(Object.keys(metrics[0]!.dimensions)).toEqual([
      'decision',
      'policyKey',
      'routeClass',
      'scopeKind',
      'workloadKey',
      'reasonCode',
      'environment',
    ])
  })

  it('keeps bounded public 429/503 responses independent of Restricted values', () => {
    const responses = [
      buildRateLimitedResponse({
        code: 'RATE_LIMITED',
        requestId: 'req_safe_correlation_12345',
        retryAfterSeconds: 60,
      }),
      buildProtectionUnavailableResponse({
        code: 'PROTECTION_UNAVAILABLE',
        requestId: 'req_safe_correlation_12345',
        retryAfterSeconds: 30,
      }),
    ]
    for (const raw of Object.values(restricted)) {
      expect(JSON.stringify(responses)).not.toContain(raw)
    }
    expect(responses.every((response) => response.headers['Cache-Control'] === 'no-store')).toBe(true)
  })

  it('retains Terraform WAF redaction for every header/query carrier', () => {
    const terraform = fs.readFileSync(path.resolve(
      '../../infra/aws/terraform/modules/security/main.tf',
    ), 'utf8').toLowerCase()
    for (const header of [
      'authorization',
      'cookie',
      'x-scheduler-token',
      'x-csrf-token',
      'x-idempotency-key',
    ]) {
      expect.soft(terraform).toContain(`name = "${header}"`)
    }
    expect.soft(terraform).toContain('query_string {}')
    expect.soft(terraform).not.toContain('sampled_requests_enabled   = true')
  })
})
