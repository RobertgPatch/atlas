export const HTTP_METHODS = [
  'DELETE',
  'GET',
  'HEAD',
  'OPTIONS',
  'PATCH',
  'POST',
  'PUT',
] as const

export type HttpMethod = (typeof HTTP_METHODS)[number]

export const AUTHENTICATION_BOUNDARIES = [
  'public',
  'session',
  'admin',
  'scheduler',
] as const

export type AuthenticationBoundary = (typeof AUTHENTICATION_BOUNDARIES)[number]

export const ROUTE_CLASSES = [
  'PUBLIC_HEALTH',
  'AUTH_ATTEMPT',
  'AUTHENTICATED_READ',
  'DATABASE_HEAVY_READ',
  'BUSINESS_WRITE',
  'ADMIN_WRITE',
  'DOCUMENT_DOWNLOAD',
  'K1_UPLOAD_ADMISSION',
  'PAID_EXTRACTION',
  'EXTERNAL_PROVIDER',
  'EXPORT_DOWNLOAD',
  'INTERNAL_SCHEDULER',
] as const

export type RouteClass = (typeof ROUTE_CLASSES)[number]

export const SCOPE_DIMENSIONS = [
  'source_prefix',
  'account',
  'user',
  'session',
  'tenant',
  'entity',
  'provider',
  'operation',
  'global',
] as const

export type ScopeDimension = (typeof SCOPE_DIMENSIONS)[number]

export const COST_UNIT_NAMES = [
  'request',
  'password_hash',
  'file',
  'byte',
  'page',
  'document',
  'queue_message',
  'provider_call',
  'export_row',
  'output_byte',
  'storage_byte_day',
] as const

export type CostUnitName = (typeof COST_UNIT_NAMES)[number]

export const OPERATION_STATES = [
  'reserved',
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
  'expired',
] as const

export type OperationState = (typeof OPERATION_STATES)[number]

export const FAILURE_MODES = ['fail_closed', 'low_cost_degraded_read'] as const

export type FailureMode = (typeof FAILURE_MODES)[number]

export const IDEMPOTENCY_MODES = [
  'none',
  'optional',
  'required',
  'server_content',
] as const

export type IdempotencyMode = (typeof IDEMPOTENCY_MODES)[number]

export interface LocalRateLimit {
  readonly scope: ScopeDimension
  readonly requests: number
  readonly windowSeconds: number
}

export interface DurableRateLimit extends LocalRateLimit {
  readonly policyLimitKey: string
  readonly units?: number
}

/**
 * The common request envelope. Route-specific schemas remain authoritative for
 * field semantics, while this object supplies finite resource bounds.
 */
export interface PayloadLimits {
  readonly bodyBytes?: number
  readonly files?: number
  readonly fileBytes?: number
  readonly multipartFields?: number
  readonly multipartParts?: number
  readonly rows?: number
  readonly queryParameters?: number
  readonly pageSize?: number
  readonly maxDateRangeDays?: number
  readonly maxJsonDepth?: number
  readonly maxProperties?: number
  readonly responseBytes?: number
}

export interface CostUnitReservation {
  readonly unit: CostUnitName
  readonly units: number
}

export interface RouteProtectionPolicy {
  readonly policyKey: string
  readonly routeClass: RouteClass
  readonly method: HttpMethod
  /** Canonical Fastify template. A concrete request URL is never valid here. */
  readonly routePattern: string
  readonly authentication: AuthenticationBoundary
  readonly scopeDimensions: readonly ScopeDimension[]
  readonly localRate: LocalRateLimit | null
  readonly durableRates: readonly DurableRateLimit[]
  readonly payloadLimits: PayloadLimits
  readonly concurrencyLimit: number | null
  readonly backlogLimit: number | null
  readonly idempotency: IdempotencyMode
  readonly killSwitch: string | null
  readonly failureMode: FailureMode
  readonly costUnits: readonly CostUnitName[]
  readonly costDrivers: readonly string[]
  readonly owner: string
}

export const ADMISSION_DECISION_KINDS = [
  'allowed',
  'deduplicated',
  'throttled',
  'quota_rejected',
  'disabled',
  'protection_unavailable',
] as const

export type AdmissionDecisionKind = (typeof ADMISSION_DECISION_KINDS)[number]

export const ADMISSION_REJECTION_CODES = [
  'RATE_LIMITED',
  'QUOTA_EXCEEDED',
  'WORKLOAD_DISABLED',
  'PROTECTION_UNAVAILABLE',
] as const

export type AdmissionRejectionCode = (typeof ADMISSION_REJECTION_CODES)[number]

interface AdmissionDecisionBase {
  readonly policyKey: string
  readonly requestId: string
}

export interface AdmissionAllowed extends AdmissionDecisionBase {
  readonly decision: 'allowed'
  readonly operationId?: string
  readonly reservations: readonly CostUnitReservation[]
  readonly fencingToken?: bigint
}

export interface AdmissionDeduplicated extends AdmissionDecisionBase {
  readonly decision: 'deduplicated'
  readonly operationId: string
  readonly operationState: OperationState
  readonly resultReference: string | null
}

export interface AdmissionRejected extends AdmissionDecisionBase {
  readonly decision:
    | 'throttled'
    | 'quota_rejected'
    | 'disabled'
    | 'protection_unavailable'
  readonly error: AdmissionRejectionCode
  /** Low-cardinality code suitable for a metric dimension. */
  readonly reasonCode: string
  readonly retryAfterSeconds: number
  readonly workloadKey?: string
}

export type AdmissionDecision =
  | AdmissionAllowed
  | AdmissionDeduplicated
  | AdmissionRejected
