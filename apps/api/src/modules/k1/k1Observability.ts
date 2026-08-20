export type K1ErrorClass =
  | 'AUTHORIZATION'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'PROVIDER_RETRYABLE'
  | 'PROVIDER_TERMINAL'
  | 'STORAGE'
  | 'INTERNAL'

export interface K1WorkflowMetadata {
  batchId?: string
  itemId?: string
  k1DocumentId?: string
  extractionAttemptId?: string
  applicationId?: string
  entityId?: string
  status?: string
  errorCode?: string
  retryable?: boolean
  durationMs?: number
  pageCount?: number
  count?: number
}

const SAFE_ID = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i
const SAFE_ENUM = /^[A-Z][A-Z0-9_]{0,79}$/

/** Build an IDs/status/counts-only record; unknown keys and free text never enter logs. */
export const sanitizeK1WorkflowMetadata = (metadata: K1WorkflowMetadata & Record<string, unknown>): K1WorkflowMetadata => {
  const clean: K1WorkflowMetadata = {}
  for (const key of ['batchId', 'itemId', 'k1DocumentId', 'extractionAttemptId', 'applicationId', 'entityId'] as const) {
    const value = metadata[key]
    if (typeof value === 'string' && SAFE_ID.test(value)) clean[key] = value
  }
  if (typeof metadata.status === 'string' && SAFE_ENUM.test(metadata.status)) clean.status = metadata.status
  if (typeof metadata.errorCode === 'string' && SAFE_ENUM.test(metadata.errorCode)) clean.errorCode = metadata.errorCode
  if (typeof metadata.retryable === 'boolean') clean.retryable = metadata.retryable
  for (const key of ['durationMs', 'pageCount', 'count'] as const) {
    const value = metadata[key]
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) clean[key] = value
  }
  return clean
}

export const classifyK1Error = (code: string): { errorClass: K1ErrorClass; retryable: boolean } => {
  if (/FORBIDDEN|UNAUTHORIZED|ROLE_REQUIRED/.test(code)) return { errorClass: 'AUTHORIZATION', retryable: false }
  if (/INVALID|VALIDATION|UNSUPPORTED|ENCRYPTED|CORRUPT/.test(code)) return { errorClass: 'VALIDATION', retryable: false }
  if (/STALE|CONFLICT|DUPLICATE|INCOMPLETE|CANCELLED|ALREADY/.test(code)) return { errorClass: 'CONFLICT', retryable: false }
  if (/THROTTL|TIMEOUT|UNAVAILABLE|QUEUE/.test(code)) return { errorClass: 'PROVIDER_RETRYABLE', retryable: true }
  if (/BDA_|EXTRACTION|PROVIDER/.test(code)) return { errorClass: 'PROVIDER_TERMINAL', retryable: false }
  if (/S3|OBJECT|UPLOAD|STORAGE|KMS/.test(code)) return { errorClass: 'STORAGE', retryable: /NOT_FOUND|INCOMPLETE|TIMEOUT/.test(code) }
  return { errorClass: 'INTERNAL', retryable: true }
}

export const k1WorkflowLogRecord = (event: string, metadata: K1WorkflowMetadata & Record<string, unknown>) => ({
  event,
  feature: 'k1_ingestion',
  ...sanitizeK1WorkflowMetadata(metadata),
})

export const logK1Workflow = (
  logger: { info: (record: object, message?: string) => unknown },
  event: string,
  metadata: K1WorkflowMetadata & Record<string, unknown>,
) => logger.info(k1WorkflowLogRecord(event, metadata), 'K-1 workflow event')

export type K1MetricName =
  | 'QueueDepth'
  | 'QueueAgeSeconds'
  | 'WorkerErrors'
  | 'ExtractionFailures'
  | 'ReconciliationLagSeconds'
  | 'ApplyFailures'
  | 'PagesProcessed'
  | 'DocumentsProcessed'

/** CloudWatch Embedded Metric Format envelope suitable for structured stdout. */
export const k1MetricEnvelope = (args: {
  metric: K1MetricName
  value: number
  unit: 'Count' | 'Seconds' | 'Milliseconds'
  environment: string
  status?: string
}) => ({
  _aws: {
    Timestamp: Date.now(),
    CloudWatchMetrics: [{
      Namespace: 'Atlas/K1Ingestion', Dimensions: [['Environment']],
      Metrics: [{ Name: args.metric, Unit: args.unit }],
    }],
  },
  Environment: args.environment,
  [args.metric]: Math.max(0, args.value),
  ...(args.status && SAFE_ENUM.test(args.status) ? { Status: args.status } : {}),
})
