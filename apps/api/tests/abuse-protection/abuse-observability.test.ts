import { describe, expect, it, vi } from 'vitest'

import {
  ABUSE_EVENT_DECISIONS,
  abuseMetricEnvelope,
  abuseRetentionHealthEnvelope,
  createAbuseObservability,
  redactAbuseEventDetails,
  type AbuseMetric,
  type AbuseSuppressionSummary,
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

  it('publishes only actionable environment-level CloudWatch metrics', () => {
    const routineHealthMetric: AbuseMetric = {
      name: 'AbuseProtectionDecision',
      value: 120,
      dimensions: {
        decision: 'allowed',
        policyKey: 'health.get',
        routeClass: 'PUBLIC_HEALTH',
        scopeKind: 'global',
        workloadKey: 'none',
        reasonCode: 'LOCAL_GLOBAL_RATE',
        environment: 'production',
      },
      units: 120,
      latencyMs: 1,
    }
    expect(abuseMetricEnvelope(routineHealthMetric, 1_000)).toBeNull()

    const paidEnvelope = abuseMetricEnvelope({
      ...routineHealthMetric,
      value: 1,
      dimensions: {
        ...routineHealthMetric.dimensions,
        routeClass: 'EXTERNAL_PROVIDER',
        workloadKey: 'market_data_closing_prices',
        reasonCode: 'none',
      },
      units: 25,
    }, 2_000)
    expect(paidEnvelope).toMatchObject({
      Environment: 'production',
      ProviderCalls: 25,
      CostUnits: 25,
      _aws: {
        Timestamp: 2_000,
        CloudWatchMetrics: [{
          Namespace: 'ProjectJackson/AbuseProtection',
          Dimensions: [['Environment']],
          Metrics: [
            { Name: 'ProviderCalls', Unit: 'Count' },
            { Name: 'CostUnits', Unit: 'Count' },
          ],
        }],
      },
    })
    expect(JSON.stringify(paidEnvelope)).not.toContain('AbuseProtectionDecision')
    expect(JSON.stringify(paidEnvelope)).not.toContain('DecisionLatency')
    expect(JSON.stringify(paidEnvelope)).not.toContain('RouteClass')
    expect(JSON.stringify(paidEnvelope)).not.toContain('WorkloadKey')
    expect(abuseMetricEnvelope({
      ...routineHealthMetric,
      dimensions: {
        ...routineHealthMetric.dimensions,
        routeClass: 'EXTERNAL_PROVIDER',
        workloadKey: 'market_data_closing_prices',
        reasonCode: 'none',
      },
      units: 0,
    })).toBeNull()

    const criticalEnvelope = abuseMetricEnvelope({
      ...routineHealthMetric,
      dimensions: {
        ...routineHealthMetric.dimensions,
        decision: 'failed',
        routeClass: 'AUTH_ATTEMPT',
        reasonCode: 'AUTH_HASH_SATURATED',
      },
    })
    const retryEnvelope = abuseMetricEnvelope({
      ...routineHealthMetric,
      dimensions: {
        ...routineHealthMetric.dimensions,
        decision: 'retried',
        routeClass: 'PAID_EXTRACTION',
        workloadKey: 'k1_bda_document',
        reasonCode: 'PROVIDER_RETRYABLE',
      },
    })
    const metricNames = [paidEnvelope, criticalEnvelope, retryEnvelope]
      .flatMap((envelope) => {
        const metadata = envelope?._aws as {
          CloudWatchMetrics: Array<{ Metrics: Array<{ Name: string }> }>
        } | undefined
        return metadata?.CloudWatchMetrics.flatMap((directive) =>
          directive.Metrics.map(({ Name }) => Name)) ?? []
      })
    expect(new Set(metricNames)).toEqual(new Set([
      'AbuseProtectionCritical',
      'ProviderCalls',
      'RetryAttempts',
      'CostUnits',
    ]))
  })

  it('keeps cleanup detail in logs and creates one metric only on failure', () => {
    const successful = abuseRetentionHealthEnvelope({
      environment: 'production',
      store: 'rate_windows',
      deletedRows: 12,
      retainedRows: 7,
      storageBytes: 1_024,
      failures: 0,
      timestamp: 1_000,
    })
    expect(successful).toMatchObject({
      event: 'abuse_protection_retention_cleanup',
      Environment: 'production',
      Store: 'rate_windows',
      CleanupDeletedRows: 12,
      RetainedRows: 7,
      RetentionStorageBytes: 1_024,
      CleanupFailures: 0,
    })
    expect(successful).not.toHaveProperty('_aws')

    const failed = abuseRetentionHealthEnvelope({
      environment: 'production',
      store: 'operations',
      deletedRows: 0,
      failures: 1,
      timestamp: 2_000,
    })
    expect(failed).toMatchObject({
      Environment: 'production',
      Store: 'operations',
      CleanupFailures: 1,
      _aws: {
        Timestamp: 2_000,
        CloudWatchMetrics: [{
          Namespace: 'ProjectJackson/AbuseProtection',
          Dimensions: [['Environment']],
          Metrics: [{ Name: 'CleanupFailures', Unit: 'Count' }],
        }],
      },
    })
    expect(JSON.stringify(failed)).not.toContain('Environment,Store')
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

  it('aggregates fixed series for 60 seconds and emits one bounded suppression summary', () => {
    let now = 1_000
    const metrics: AbuseMetric[] = []
    const summaries: AbuseSuppressionSummary[] = []
    const observability = createAbuseObservability({
      emitMetric: (metric) => metrics.push(metric),
      emitSuppressionSummary: (summary) => summaries.push(summary),
      aggregateMetrics: true,
      autoFlush: false,
      maximumMetricSeries: 8,
      sampleRate: 0,
      windowMs: 60_000,
      now: () => now,
    })
    const fixedEvents = [
      ['local.store', 'AUTHENTICATED_READ', 'source_prefix', 'LOCAL_SOURCE_EVICTION'],
      ['auth.password', 'AUTH_ATTEMPT', 'account', 'AUTH_HASH_SATURATED'],
      ['admission.hmac', 'PAID_EXTRACTION', 'operation', 'HMAC_ALIAS_FAILURE'],
      ['k1.upload', 'K1_UPLOAD_ADMISSION', 'document', 'CAPABILITY_REPLAY'],
    ] as const

    for (const [policyKey, routeClass, scopeKind, reasonCode] of fixedEvents) {
      observability.record({
        decision: 'blocked',
        policyKey,
        routeClass,
        scopeKind,
        reasonCode,
        environment: 'test',
        details: {
          safeContext: 'owner@example.test from 203.0.113.9',
          presigned: 'https://example.test/key?X-Amz-Signature=secret',
        },
      })
      observability.record({
        decision: 'blocked',
        policyKey,
        routeClass,
        scopeKind,
        reasonCode,
        environment: 'test',
      })
    }

    expect.soft(metrics).toHaveLength(0)
    expect.soft(observability.bufferedSeries()).toBe(4)
    now += 60_000
    observability.flush()
    expect.soft(metrics).toHaveLength(4)
    expect.soft(metrics.every((metric) => metric.value === 2)).toBe(true)
    expect.soft(summaries).toEqual([{
      event: 'abuse_protection_suppression_summary',
      environment: 'test',
      windowMs: 60_000,
      suppressedLogs: 8,
    }])
    expect.soft(new Set(metrics.map((metric) => JSON.stringify(metric.dimensions))).size).toBe(4)
    expect.soft(JSON.stringify({ metrics, summaries })).not.toContain('owner@example.test')
    expect.soft(JSON.stringify({ metrics, summaries })).not.toContain('203.0.113.9')
    expect.soft(JSON.stringify({ metrics, summaries })).not.toContain('secret')
    observability.shutdown()
  })

  it('fails closed when code attempts to exceed the reviewed metric-series vocabulary', () => {
    const observability = createAbuseObservability({
      aggregateMetrics: true,
      autoFlush: false,
      maximumMetricSeries: 1,
      sampleRate: 0,
    })
    observability.record({
      decision: 'allowed',
      policyKey: 'auth.login',
      routeClass: 'AUTH_ATTEMPT',
      environment: 'test',
    })
    expect(() => observability.record({
      decision: 'blocked',
      policyKey: 'auth.login',
      routeClass: 'AUTH_ATTEMPT',
      environment: 'test',
    })).toThrow('ABUSE_METRIC_SERIES_LIMIT_EXCEEDED')
    observability.shutdown()
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
