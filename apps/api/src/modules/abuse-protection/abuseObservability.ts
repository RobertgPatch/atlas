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

export interface AbuseObservabilityOptions {
  readonly emitMetric?: (metric: AbuseMetric) => void
  readonly emitLog?: (event: AbuseStructuredLog) => void
  readonly sampleRate?: number
  readonly maximumLogsPerWindow?: number
  readonly windowMs?: number
  readonly now?: () => number
  readonly random?: () => number
}

export interface AbuseObservability {
  record(event: AbuseEvent): void
  snapshot(): Readonly<{
    emittedMetrics: number
    emittedLogs: number
    suppressedLogs: number
  }>
}

export const abuseMetricEnvelope = (metric: AbuseMetric, timestamp = Date.now()) => ({
  _aws: {
    Timestamp: timestamp,
    CloudWatchMetrics: [{
      Namespace: 'Atlas/AbuseProtection',
      Dimensions: [[
        'Environment',
        'Decision',
        'RouteClass',
        'WorkloadKey',
      ]],
      Metrics: [
        { Name: metric.name, Unit: 'Count' },
        { Name: 'ProviderCalls', Unit: 'Count' },
        { Name: 'RetryAttempts', Unit: 'Count' },
        { Name: 'CostUnits', Unit: 'Count' },
        { Name: 'DecisionLatency', Unit: 'Milliseconds' },
      ],
    }, {
      Namespace: 'Atlas/AbuseProtection',
      Dimensions: [['Environment']],
      Metrics: [
        { Name: metric.name, Unit: 'Count' },
        { Name: 'ProviderCalls', Unit: 'Count' },
        { Name: 'RetryAttempts', Unit: 'Count' },
        { Name: 'CostUnits', Unit: 'Count' },
      ],
    }],
  },
  Environment: metric.dimensions.environment,
  Decision: metric.dimensions.decision,
  RouteClass: metric.dimensions.routeClass,
  WorkloadKey: metric.dimensions.workloadKey,
  PolicyKey: metric.dimensions.policyKey,
  ScopeKind: metric.dimensions.scopeKind,
  ReasonCode: metric.dimensions.reasonCode,
  [metric.name]: metric.value,
  ProviderCalls: metric.dimensions.workloadKey !== 'none'
    && metric.dimensions.decision === 'allowed'
    && ['PAID_EXTRACTION', 'EXTERNAL_PROVIDER', 'INTERNAL_SCHEDULER'].includes(metric.dimensions.routeClass)
    ? metric.units
    : 0,
  RetryAttempts: metric.dimensions.decision === 'retried' ? metric.value : 0,
  CostUnits: metric.units,
  DecisionLatency: metric.latencyMs ?? 0,
})

export const abuseRetentionHealthEnvelope = (input: {
  readonly environment: string
  readonly store: 'rate_windows' | 'quota_counters' | 'operations' | 'leases' | 'overrides'
  readonly deletedRows: number
  readonly retainedRows?: number
  readonly storageBytes?: number
  readonly failures?: number
  readonly timestamp?: number
}) => ({
  _aws: {
    Timestamp: input.timestamp ?? Date.now(),
    CloudWatchMetrics: [{
      Namespace: 'Atlas/AbuseProtection',
      Dimensions: [['Environment', 'Store']],
      Metrics: [
        { Name: 'CleanupDeletedRows', Unit: 'Count' },
        { Name: 'RetainedRows', Unit: 'Count' },
        { Name: 'RetentionStorageBytes', Unit: 'Bytes' },
        { Name: 'CleanupFailures', Unit: 'Count' },
      ],
    }, {
      Namespace: 'Atlas/AbuseProtection',
      Dimensions: [['Environment']],
      Metrics: [{ Name: 'CleanupFailures', Unit: 'Count' }],
    }],
  },
  Environment: boundedDimension(input.environment, 'ENVIRONMENT'),
  Store: input.store,
  CleanupDeletedRows: boundedNonNegative(input.deletedRows, 0),
  RetainedRows: boundedNonNegative(input.retainedRows, 0),
  RetentionStorageBytes: boundedNonNegative(input.storageBytes, 0),
  CleanupFailures: boundedNonNegative(input.failures, 0),
})

const decisions = new Set<string>(ABUSE_EVENT_DECISIONS)
const routeClasses = new Set<string>(ROUTE_CLASSES)
const scopeDimensions = new Set<string>(SCOPE_DIMENSIONS)
const dimensionPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const sensitiveKey =
  /authorization|cookie|password|secret|token|mfa|totp|email|ip(address)?|query|string|body|document|file(name)?|credential/i

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
  if (typeof value === 'string') return value.slice(0, 256)
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
  const windowMs = options.windowMs ?? 60_000
  if (!Number.isFinite(sampleRate) || sampleRate < 0 || sampleRate > 1) {
    throw new Error('INVALID_ABUSE_LOG_SAMPLE_RATE')
  }
  if (!Number.isSafeInteger(maximumLogsPerWindow) || maximumLogsPerWindow < 0) {
    throw new Error('INVALID_ABUSE_LOG_WINDOW_LIMIT')
  }
  if (!Number.isSafeInteger(windowMs) || windowMs <= 0) {
    throw new Error('INVALID_ABUSE_LOG_WINDOW')
  }

  const now = options.now ?? Date.now
  const random = options.random ?? Math.random
  const emitMetric = options.emitMetric ?? (() => undefined)
  const emitLog = options.emitLog ?? (() => undefined)
  let windowStartedAt = now()
  let logsInWindow = 0
  let emittedMetrics = 0
  let emittedLogs = 0
  let suppressedLogs = 0

  return {
    record(event) {
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

      emitMetric({
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
      })
      emittedMetrics += 1

      const at = now()
      if (at - windowStartedAt >= windowMs) {
        windowStartedAt = at
        logsInWindow = 0
      }
      if (logsInWindow >= maximumLogsPerWindow || random() >= sampleRate) {
        suppressedLogs += 1
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
    snapshot: () => ({ emittedMetrics, emittedLogs, suppressedLogs }),
  }
}

export const cloudWatchAbuseObservability = createAbuseObservability({
  sampleRate: config.nodeEnv === 'test' ? 0 : 0.05,
  maximumLogsPerWindow: 100,
  emitMetric: config.nodeEnv === 'test'
    ? () => undefined
    : (metric) => console.info(JSON.stringify(abuseMetricEnvelope(metric))),
  emitLog: config.nodeEnv === 'test'
    ? () => undefined
    : (event) => console.info(JSON.stringify(event)),
})
