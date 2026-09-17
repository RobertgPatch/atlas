import {
  ROUTE_CLASSES,
  SCOPE_DIMENSIONS,
  type RouteClass,
  type ScopeDimension,
} from './protection.types.js'
import { config } from '../../config.js'

export const ABUSE_EVENT_DECISIONS = [
  'allowed',
  'throttled',
  'blocked',
  'deduplicated',
  'quota_rejected',
  'disabled',
  'queued',
  'started',
  'completed',
  'retried',
  'failed',
] as const

export type AbuseEventDecision = (typeof ABUSE_EVENT_DECISIONS)[number]

export interface AbuseEvent {
  readonly decision: AbuseEventDecision
  readonly policyKey: string
  readonly routeClass: RouteClass
  readonly scopeKind?: ScopeDimension
  readonly workloadKey?: string
  readonly reasonCode?: string
  readonly environment: string
  readonly units?: number
  readonly latencyMs?: number
  /** Correlation only; never emitted as a metric dimension. */
  readonly requestId?: string
  /** Sampled log context. Sensitive keys and oversized values are removed. */
  readonly details?: Readonly<Record<string, unknown>>
}

export interface AbuseMetric {
  readonly name: 'AbuseProtectionDecision'
  readonly value: number
  readonly dimensions: Readonly<{
    decision: AbuseEventDecision
    policyKey: string
    routeClass: RouteClass
    scopeKind: ScopeDimension | 'none'
    workloadKey: string
    reasonCode: string
    environment: string
  }>
  readonly units: number
  readonly latencyMs: number | null
}

export interface AbuseStructuredLog {
  readonly event: 'abuse_protection_decision'
  readonly decision: AbuseEventDecision
  readonly policyKey: string
  readonly routeClass: RouteClass
  readonly scopeKind: ScopeDimension | null
  readonly workloadKey: string | null
  readonly reasonCode: string | null
  readonly environment: string
  readonly units: number
  readonly latencyMs: number | null
  readonly requestId: string | null
  readonly details: Readonly<Record<string, unknown>>
}

export interface AbuseSuppressionSummary {
  readonly event: 'abuse_protection_suppression_summary'
  readonly environment: string
  readonly windowMs: number
  readonly suppressedLogs: number
}

export interface AbuseObservabilityOptions {
  readonly emitMetric?: (metric: AbuseMetric) => void
  readonly emitLog?: (event: AbuseStructuredLog) => void
  readonly emitSuppressionSummary?: (event: AbuseSuppressionSummary) => void
  readonly sampleRate?: number
  readonly maximumLogsPerWindow?: number
  readonly maximumMetricSeries?: number
  readonly windowMs?: number
  /** Production enables aggregation; focused unit callers may opt into immediate emission. */
  readonly aggregateMetrics?: boolean
  readonly autoFlush?: boolean
  readonly now?: () => number
  readonly random?: () => number
}

export interface AbuseObservability {
  record(event: AbuseEvent): void
  flush(): void
  shutdown(): void
  bufferedSeries(): number
  snapshot(): Readonly<{
    emittedMetrics: number
    emittedLogs: number
    suppressedLogs: number
  }>
}

type AbuseCloudWatchMetricName =
  | 'AbuseProtectionCritical'
  | 'ProviderCalls'
  | 'RetryAttempts'
  | 'CostUnits'

interface AbuseCloudWatchMeasurement {
  readonly name: AbuseCloudWatchMetricName
  readonly value: number
}

const criticalReason =
  /(?:SATURATED|STORE_UNAVAILABLE|EVICTION|HMAC|CAPABILITY_REPLAY|BACKLOG|QUOTA|DISABLED)/
const providerRouteClasses = new Set<RouteClass>([
  'PAID_EXTRACTION',
  'EXTERNAL_PROVIDER',
  'INTERNAL_SCHEDULER',
])

/**
 * Emit only the environment-level signals that drive an operator alarm.
 * Routine decisions remain available as sampled structured logs. Publishing
 * zero-valued placeholders or request-category dimensions would create paid
 * custom metric series even when no actionable event occurred.
 */
export const abuseMetricEnvelope = (
  metric: AbuseMetric,
  timestamp = Date.now(),
): Readonly<Record<string, unknown>> | null => {
  const measurements: AbuseCloudWatchMeasurement[] = []
  if (criticalReason.test(metric.dimensions.reasonCode)) {
    measurements.push({ name: 'AbuseProtectionCritical', value: metric.value })
  }
  if (
    metric.dimensions.workloadKey !== 'none'
    && metric.dimensions.decision === 'allowed'
    && providerRouteClasses.has(metric.dimensions.routeClass)
  ) {
    measurements.push({ name: 'ProviderCalls', value: metric.units })
  }
  if (metric.dimensions.decision === 'retried') {
    measurements.push({ name: 'RetryAttempts', value: metric.value })
  }
  if (
    metric.dimensions.workloadKey !== 'none'
    && metric.dimensions.decision === 'allowed'
  ) {
    measurements.push({ name: 'CostUnits', value: metric.units })
  }
  const actionableMeasurements = measurements.filter(({ value }) => value > 0)
  if (actionableMeasurements.length === 0) return null

  return {
    _aws: {
      Timestamp: timestamp,
      CloudWatchMetrics: [{
        Namespace: 'ProjectJackson/AbuseProtection',
        Dimensions: [['Environment']],
        Metrics: actionableMeasurements.map(({ name }) => ({ Name: name, Unit: 'Count' })),
      }],
    },
    Environment: metric.dimensions.environment,
    ...Object.fromEntries(actionableMeasurements.map(({ name, value }) => [name, value])),
  }
}

export const abuseRetentionHealthEnvelope = (input: {
  readonly environment: string
  readonly store: 'rate_windows' | 'quota_counters' | 'operations' | 'leases' | 'overrides'
  readonly deletedRows: number
  readonly retainedRows?: number
  readonly storageBytes?: number
  readonly failures?: number
  readonly timestamp?: number
}): Readonly<Record<string, unknown>> => {
  const environment = boundedDimension(input.environment, 'ENVIRONMENT')
  const failures = boundedNonNegative(input.failures, 0)
  const record = {
    event: 'abuse_protection_retention_cleanup',
    Environment: environment,
    Store: input.store,
    CleanupDeletedRows: boundedNonNegative(input.deletedRows, 0),
    RetainedRows: boundedNonNegative(input.retainedRows, 0),
    RetentionStorageBytes: boundedNonNegative(input.storageBytes, 0),
    CleanupFailures: failures,
  }
  if (failures === 0) return record

  return {
    _aws: {
      Timestamp: input.timestamp ?? Date.now(),
      CloudWatchMetrics: [{
        Namespace: 'ProjectJackson/AbuseProtection',
        Dimensions: [['Environment']],
        Metrics: [{ Name: 'CleanupFailures', Unit: 'Count' }],
      }],
    },
    ...record,
  }
}

const decisions = new Set<string>(ABUSE_EVENT_DECISIONS)
const routeClasses = new Set<string>(ROUTE_CLASSES)
const scopeDimensions = new Set<string>(SCOPE_DIMENSIONS)
const dimensionPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const sensitiveKey =
  /authorization|cookie|password|secret|token|mfa|totp|email|ip(address)?|session|csrf|idempotency|presign|query|string|body|document|file(name)?|credential/i
const sensitiveValue = /(?:\bBearer\s+\S+|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b(?:\d{1,3}\.){3}\d{1,3}\b|\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b|X-Amz-(?:Algorithm|Credential|Date|Expires|Security-Token|Signature)|atlas_session=)/i

const boundedDimension = (value: string, name: string): string => {
  if (!dimensionPattern.test(value)) throw new Error(`INVALID_ABUSE_EVENT_${name}`)
  return value
}

const boundedNonNegative = (value: number | undefined, fallback: number): number => {
  if (value === undefined) return fallback
  if (!Number.isFinite(value) || value < 0) throw new Error('INVALID_ABUSE_EVENT_NUMBER')
  return Math.min(Number.MAX_SAFE_INTEGER, value)
}

const redactValue = (value: unknown, depth: number): unknown => {
  if (depth >= 4) return '[TRUNCATED]'
  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    return value
  }
  if (typeof value === 'string') {
    return sensitiveValue.test(value) ? '[REDACTED]' : value.slice(0, 256)
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => redactValue(item, depth + 1))
  }
  if (typeof value !== 'object') return String(value).slice(0, 256)
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 30)
      .map(([key, nextValue]) => [
        key.slice(0, 64),
        sensitiveKey.test(key) ? '[REDACTED]' : redactValue(nextValue, depth + 1),
      ]),
  )
}

export const redactAbuseEventDetails = (
  details: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> =>
  (redactValue(details ?? {}, 0) as Readonly<Record<string, unknown>>)

export const createAbuseObservability = (
  options: AbuseObservabilityOptions = {},
): AbuseObservability => {
  const sampleRate = options.sampleRate ?? 0.05
  const maximumLogsPerWindow = options.maximumLogsPerWindow ?? 100
  const maximumMetricSeries = options.maximumMetricSeries ?? 256
  const windowMs = options.windowMs ?? 60_000
  const aggregateMetrics = options.aggregateMetrics ?? false
  const autoFlush = options.autoFlush ?? aggregateMetrics
  if (!Number.isFinite(sampleRate) || sampleRate < 0 || sampleRate > 1) {
    throw new Error('INVALID_ABUSE_LOG_SAMPLE_RATE')
  }
  if (!Number.isSafeInteger(maximumLogsPerWindow) || maximumLogsPerWindow < 0) {
    throw new Error('INVALID_ABUSE_LOG_WINDOW_LIMIT')
  }
  if (!Number.isSafeInteger(maximumMetricSeries) || maximumMetricSeries <= 0) {
    throw new Error('INVALID_ABUSE_METRIC_SERIES_LIMIT')
  }
  if (!Number.isSafeInteger(windowMs) || windowMs <= 0) {
    throw new Error('INVALID_ABUSE_LOG_WINDOW')
  }

  const now = options.now ?? Date.now
  const random = options.random ?? Math.random
  const emitMetric = options.emitMetric ?? (() => undefined)
  const emitLog = options.emitLog ?? (() => undefined)
  const emitSuppressionSummary = options.emitSuppressionSummary ?? (() => undefined)
  let windowStartedAt = now()
  let logsInWindow = 0
  let emittedMetrics = 0
  let emittedLogs = 0
  let suppressedLogs = 0
  let suppressedLogsInWindow = 0
  let stopped = false
  const bufferedMetrics = new Map<string, AbuseMetric>()

  const flush = (): void => {
    if (aggregateMetrics) {
      for (const metric of bufferedMetrics.values()) {
        emitMetric(metric)
        emittedMetrics += 1
      }
      bufferedMetrics.clear()
    }
    if (suppressedLogsInWindow > 0) {
      emitSuppressionSummary({
        event: 'abuse_protection_suppression_summary',
        environment: boundedDimension(config.nodeEnv, 'ENVIRONMENT'),
        windowMs,
        suppressedLogs: suppressedLogsInWindow,
      })
    }
    suppressedLogsInWindow = 0
    logsInWindow = 0
    windowStartedAt = now()
  }

  const timer = autoFlush
    ? setInterval(flush, windowMs)
    : null
  timer?.unref?.()

  const observability: AbuseObservability = {
    record(event) {
      if (stopped) throw new Error('ABUSE_OBSERVABILITY_SHUT_DOWN')
      if (!decisions.has(event.decision)) throw new Error('INVALID_ABUSE_EVENT_DECISION')
      if (!routeClasses.has(event.routeClass)) throw new Error('INVALID_ABUSE_EVENT_ROUTE_CLASS')
      if (event.scopeKind && !scopeDimensions.has(event.scopeKind)) {
        throw new Error('INVALID_ABUSE_EVENT_SCOPE')
      }
      const policyKey = boundedDimension(event.policyKey, 'POLICY_KEY')
      const workloadKey = event.workloadKey
        ? boundedDimension(event.workloadKey, 'WORKLOAD_KEY')
        : 'none'
      const reasonCode = event.reasonCode
        ? boundedDimension(event.reasonCode, 'REASON_CODE')
        : 'none'
      const environment = boundedDimension(event.environment, 'ENVIRONMENT')
      const units = boundedNonNegative(event.units, 1)
      const latencyMs = event.latencyMs === undefined
        ? null
        : boundedNonNegative(event.latencyMs, 0)

      const at = now()
      if (at - windowStartedAt >= windowMs) {
        flush()
        windowStartedAt = at
      }

      const metric: AbuseMetric = {
        name: 'AbuseProtectionDecision',
        value: 1,
        dimensions: {
          decision: event.decision,
          policyKey,
          routeClass: event.routeClass,
          scopeKind: event.scopeKind ?? 'none',
          workloadKey,
          reasonCode,
          environment,
        },
        units,
        latencyMs,
      }
      if (aggregateMetrics) {
        const seriesKey = JSON.stringify(metric.dimensions)
        const current = bufferedMetrics.get(seriesKey)
        if (current) {
          bufferedMetrics.set(seriesKey, {
            ...current,
            value: current.value + 1,
            units: current.units + units,
            latencyMs: Math.max(current.latencyMs ?? 0, latencyMs ?? 0),
          })
        } else {
          if (bufferedMetrics.size >= maximumMetricSeries) {
            throw new Error('ABUSE_METRIC_SERIES_LIMIT_EXCEEDED')
          }
          bufferedMetrics.set(seriesKey, metric)
        }
      } else {
        emitMetric(metric)
        emittedMetrics += 1
      }

      if (logsInWindow >= maximumLogsPerWindow || random() >= sampleRate) {
        suppressedLogs += 1
        suppressedLogsInWindow += 1
        return
      }
      emitLog({
        event: 'abuse_protection_decision',
        decision: event.decision,
        policyKey,
        routeClass: event.routeClass,
        scopeKind: event.scopeKind ?? null,
        workloadKey: event.workloadKey ?? null,
        reasonCode: event.reasonCode ?? null,
        environment,
        units,
        latencyMs,
        requestId:
          event.requestId && event.requestId.length >= 8 && event.requestId.length <= 128
            ? event.requestId
            : null,
        details: redactAbuseEventDetails(event.details),
      })
      logsInWindow += 1
      emittedLogs += 1
    },
    flush,
    shutdown() {
      if (stopped) return
      stopped = true
      if (timer) clearInterval(timer)
      flush()
    },
    bufferedSeries: () => bufferedMetrics.size,
    snapshot: () => ({ emittedMetrics, emittedLogs, suppressedLogs }),
  }
  return observability
}

const isVitestRuntime = process.env.VITEST === 'true'

export const cloudWatchAbuseObservability = createAbuseObservability({
  sampleRate: config.nodeEnv === 'test' || isVitestRuntime ? 0 : 0.05,
  maximumLogsPerWindow: 100,
  maximumMetricSeries: 256,
  aggregateMetrics: config.nodeEnv !== 'test' && !isVitestRuntime,
  autoFlush: config.nodeEnv !== 'test' && !isVitestRuntime,
  emitMetric: config.nodeEnv === 'test' || isVitestRuntime
    ? () => undefined
    : (metric) => {
        const envelope = abuseMetricEnvelope(metric)
        if (envelope) console.info(JSON.stringify(envelope))
      },
  emitLog: config.nodeEnv === 'test' || isVitestRuntime
    ? () => undefined
    : (event) => console.info(JSON.stringify(event)),
  emitSuppressionSummary: config.nodeEnv === 'test' || isVitestRuntime
    ? () => undefined
    : (event) => console.info(JSON.stringify(event)),
})
