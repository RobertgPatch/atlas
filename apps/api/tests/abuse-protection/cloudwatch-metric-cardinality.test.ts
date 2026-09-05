import { describe, expect, it } from 'vitest'

import {
  abuseMetricEnvelope,
  abuseRetentionHealthEnvelope,
  type AbuseMetric,
} from '../../src/modules/abuse-protection/abuseObservability.js'

const routineHealthMetric: AbuseMetric = {
  name: 'AbuseProtectionDecision',
  value: 1,
  dimensions: {
    decision: 'allowed',
    policyKey: 'health.get',
    routeClass: 'PUBLIC_HEALTH',
    scopeKind: 'global',
    workloadKey: 'none',
    reasonCode: 'LOCAL_GLOBAL_RATE',
    environment: 'production',
  },
  units: 1,
  latencyMs: 1,
}

describe('CloudWatch metric cardinality', () => {
  it('does not create custom metrics for routine health traffic', () => {
    expect(abuseMetricEnvelope(routineHealthMetric, 1_000)).toBeNull()
  })

  it('uses only actionable environment-level metric series', () => {
    const envelope = abuseMetricEnvelope({
      ...routineHealthMetric,
      dimensions: {
        ...routineHealthMetric.dimensions,
        routeClass: 'EXTERNAL_PROVIDER',
        workloadKey: 'market_data_closing_prices',
        reasonCode: 'none',
      },
      units: 25,
    }, 2_000)

    expect(envelope).toEqual({
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
    expect(JSON.stringify(envelope)).not.toContain('RouteClass')
    expect(JSON.stringify(envelope)).not.toContain('WorkloadKey')
    expect(JSON.stringify(envelope)).not.toContain('AbuseProtectionDecision')
  })

  it('does not publish zero-valued placeholders', () => {
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
  })

  it('keeps successful cleanup details in logs and metrics only failures', () => {
    const successful = abuseRetentionHealthEnvelope({
      environment: 'production',
      store: 'rate_windows',
      deletedRows: 12,
      retainedRows: 7,
      storageBytes: 1_024,
      failures: 0,
      timestamp: 1_000,
    })
    expect(successful).not.toHaveProperty('_aws')

    const failed = abuseRetentionHealthEnvelope({
      environment: 'production',
      store: 'rate_windows',
      deletedRows: 0,
      failures: 1,
      timestamp: 2_000,
    })
    expect(failed).toMatchObject({
      Environment: 'production',
      Store: 'rate_windows',
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
  })
})
