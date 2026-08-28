import { describe, expect, it, vi } from 'vitest'

import {
  ABUSE_EVENT_DECISIONS,
  createAbuseObservability,
  redactAbuseEventDetails,
  type AbuseMetric,
  type AbuseStructuredLog,
} from '../../src/modules/abuse-protection/abuseObservability.js'

const expectedDecisions = [
  'allowed',
  'throttled',
  'blocked',
  'deduplicated',
  'quota_rejected',
  'disabled',
  'queued',
  'started',
  'retried',
  'completed',
  'failed',
] as const

describe('abuse-protection observability', () => {
  it('emits one low-cardinality metric for every admission and workload lifecycle decision', () => {
    const metrics: AbuseMetric[] = []
    const observability = createAbuseObservability({
      emitMetric: (metric) => metrics.push(metric),
      sampleRate: 0,
    })

    for (const decision of expectedDecisions) {
      observability.record({
        decision,
        policyKey: 'reports.export',
        routeClass: 'EXPORT_DOWNLOAD',
        scopeKind: 'user',
        workloadKey: 'report_export',
        reasonCode: decision === 'quota_rejected' ? 'DAILY_LIMIT' : 'none',
        environment: 'test',
        units: 2,
        latencyMs: 12,
        requestId: `req_${decision}_12345678`,
        details: { email: `${decision}@example.test` },
      })
    }

    expect(ABUSE_EVENT_DECISIONS).toHaveLength(expectedDecisions.length)
    expect(ABUSE_EVENT_DECISIONS).toEqual(expect.arrayContaining(expectedDecisions))
    expect(metrics.map((metric) => metric.dimensions.decision)).toEqual(expectedDecisions)
    expect(metrics).toHaveLength(expectedDecisions.length)
    for (const metric of metrics) {
      expect.soft(metric).toMatchObject({
        name: 'AbuseProtectionDecision',
        value: 1,
        units: 2,
        latencyMs: 12,
        dimensions: {
          policyKey: 'reports.export',
          routeClass: 'EXPORT_DOWNLOAD',
          scopeKind: 'user',
          workloadKey: 'report_export',
          environment: 'test',
        },
      })
      expect.soft(Object.keys(metric.dimensions).sort()).toEqual([
        'decision',
        'environment',
        'policyKey',
        'reasonCode',
        'routeClass',
        'scopeKind',
        'workloadKey',
      ])
      expect.soft(metric.dimensions).not.toHaveProperty('requestId')
      expect.soft(JSON.stringify(metric)).not.toContain('@example.test')
    }
  })

  it('keeps correlation in sampled logs while redacting secrets and attacker-controlled identity', () => {
    const logs: AbuseStructuredLog[] = []
    const observability = createAbuseObservability({
      emitLog: (event) => logs.push(event),
      sampleRate: 1,
      maximumLogsPerWindow: 10,
      random: () => 0,
    })

    observability.record({
      decision: 'blocked',
      policyKey: 'auth.login',
      routeClass: 'AUTH_ATTEMPT',
      scopeKind: 'source_prefix',
      reasonCode: 'SOURCE_RATE',
      environment: 'test',
      requestId: 'req_correlation_12345678',
      details: {
        authorization: 'Bearer super-secret',
        cookie: 'atlas_session=secret',
        email: 'owner@example.test',
        sourceIp: '203.0.113.9',
        queryString: 'token=secret',
        fileName: 'private-tax-return.pdf',
        nested: {
          mfaCode: '123456',
          providerCredential: 'credential',
          safeReason: 'rate threshold crossed',
        },
      },
    })

    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({
      decision: 'blocked',
      requestId: 'req_correlation_12345678',
      details: {
        authorization: '[REDACTED]',
        cookie: '[REDACTED]',
        email: '[REDACTED]',
        sourceIp: '[REDACTED]',
        queryString: '[REDACTED]',
        fileName: '[REDACTED]',
        nested: {
          mfaCode: '[REDACTED]',
          providerCredential: '[REDACTED]',
          safeReason: 'rate threshold crossed',
        },
      },
    })
    expect(JSON.stringify(logs[0])).not.toContain('super-secret')
    expect(JSON.stringify(logs[0])).not.toContain('owner@example.test')
    expect(JSON.stringify(logs[0])).not.toContain('203.0.113.9')
  })

  it('bounds nested depth, collection sizes, keys, and values before logging', () => {
    const redacted = redactAbuseEventDetails({
      oversized: 'x'.repeat(500),
      array: Array.from({ length: 30 }, (_, index) => index),
      object: Object.fromEntries(
        Array.from({ length: 40 }, (_, index) => [`safe_${index}`, index]),
      ),
      deep: { one: { two: { three: { four: 'not logged' } } } },
    }) as Record<string, unknown>

    expect(redacted.oversized).toBe('x'.repeat(256))
    expect(redacted.array).toHaveLength(20)
    expect(Object.keys(redacted.object as object)).toHaveLength(30)
    expect(redacted.deep).toEqual({
      one: { two: { three: '[TRUNCATED]' } },
    })
  })

  it('always counts metrics but samples and caps equivalent rejection logs per window', () => {
    let now = 1_000
    const emitMetric = vi.fn()
    const emitLog = vi.fn()
    const observability = createAbuseObservability({
      emitMetric,
      emitLog,
      sampleRate: 1,
      maximumLogsPerWindow: 2,
      windowMs: 60_000,
      now: () => now,
      random: () => 0,
    })
    const event = {
      decision: 'throttled' as const,
      policyKey: 'auth.login',
      routeClass: 'AUTH_ATTEMPT' as const,
      scopeKind: 'source_prefix' as const,
      reasonCode: 'SOURCE_RATE',
      environment: 'test',
    }

    for (let count = 0; count < 5; count += 1) observability.record(event)
    expect.soft(emitMetric).toHaveBeenCalledTimes(5)
    expect.soft(emitLog).toHaveBeenCalledTimes(2)
    expect.soft(observability.snapshot()).toEqual({
      emittedMetrics: 5,
      emittedLogs: 2,
      suppressedLogs: 3,
    })

    now += 60_001
    observability.record(event)
    expect.soft(emitMetric).toHaveBeenCalledTimes(6)
    expect.soft(emitLog).toHaveBeenCalledTimes(3)
  })

  it('rejects attacker-controlled values as metric dimensions', () => {
    const observability = createAbuseObservability()

    expect(() => observability.record({
      decision: 'failed',
      policyKey: '/v1/items/a-user-controlled-id?token=secret',
      routeClass: 'EXTERNAL_PROVIDER',
      environment: 'test',
    })).toThrow('INVALID_ABUSE_EVENT_POLICY_KEY')
    expect(() => observability.record({
      decision: 'failed',
      policyKey: 'provider.refresh',
      routeClass: 'EXTERNAL_PROVIDER',
      workloadKey: 'x'.repeat(129),
      environment: 'test',
    })).toThrow('INVALID_ABUSE_EVENT_WORKLOAD_KEY')
  })
})
