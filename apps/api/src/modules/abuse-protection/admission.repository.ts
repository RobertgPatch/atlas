import { randomUUID } from 'node:crypto'

import { withTransaction } from '../../infra/db/client.js'

export const RATE_WINDOW_SCOPE_KINDS = [
  'account',
  'user',
  'session',
  'tenant',
  'operation',
  'global',
] as const

export const QUOTA_SCOPE_KINDS = [
  'user',
  'entity',
  'account',
  'provider',
  'global',
] as const

export const LEASE_SCOPE_KINDS = [
  'user',
  'entity',
  'provider',
  'global',
] as const

export const QUOTA_PERIOD_KINDS = [
  'rolling_hour',
  'utc_day',
  'billing_month',
] as const

export type RateWindowScopeKind = (typeof RATE_WINDOW_SCOPE_KINDS)[number]
export type QuotaScopeKind = (typeof QUOTA_SCOPE_KINDS)[number]
export type LeaseScopeKind = (typeof LEASE_SCOPE_KINDS)[number]
export type QuotaPeriodKind = (typeof QUOTA_PERIOD_KINDS)[number]
export type AdmissionUnitValue = number | bigint

export interface RateWindowReservation {
  readonly policyKey: string
  readonly scopeKind: RateWindowScopeKind
  readonly scopeHash: Uint8Array
  readonly windowStartedAt: Date
  readonly windowSeconds: number
  readonly units: AdmissionUnitValue
  readonly limit: AdmissionUnitValue
  readonly expiresAt: Date
}

export interface WorkloadQuotaReservation {
  readonly workloadKey: string
  readonly scopeKind: QuotaScopeKind
  readonly scopeHash: Uint8Array
  readonly periodKind: QuotaPeriodKind
  readonly periodStartedAt: Date
  readonly units: AdmissionUnitValue
  readonly limit: AdmissionUnitValue
  readonly expiresAt: Date
}

export interface WorkloadCapacityReservation {
  readonly leaseId?: string
  readonly operationId: string
  readonly workloadKey: string
  readonly scopeKind: LeaseScopeKind
  readonly scopeHash: Uint8Array
  readonly concurrencyLimit: number
  readonly backlogLimit: number
  readonly expiresAt: Date
}

export interface AtomicAdmissionReservation {
  readonly rateWindows?: readonly RateWindowReservation[]
  readonly quotas?: readonly WorkloadQuotaReservation[]
  readonly capacity?: WorkloadCapacityReservation
  readonly now?: Date
}

export interface ReservedRateWindow {
  readonly policyKey: string
  readonly scopeKind: RateWindowScopeKind
  readonly consumedUnits: bigint
}

export interface ReservedWorkloadQuota {
  readonly workloadKey: string
  readonly scopeKind: QuotaScopeKind
  readonly periodKind: QuotaPeriodKind
  readonly reservedUnits: bigint
}

export interface ReservedWorkloadLease {
  readonly leaseId: string
  readonly operationId: string
  readonly fencingToken: bigint
}

export interface AtomicAdmissionResult {
  readonly rateWindows: readonly ReservedRateWindow[]
  readonly quotas: readonly ReservedWorkloadQuota[]
  readonly lease: ReservedWorkloadLease | null
}

export interface CleanupExpiredInput {
  readonly now?: Date
  /** Maximum rows deleted from each table in one transaction. */
  readonly batchSize?: number
  /** Released/expired leases remain available for reconciliation for this age. */
  readonly leaseRetentionSeconds?: number
  /** Expired/revoked overrides retain their audit link for this age. */
  readonly overrideRetentionSeconds?: number
}

export interface CleanupExpiredResult {
  readonly rateWindows: number
  readonly quotaCounters: number
  readonly leases: number
  readonly operations: number
  readonly overrides: number
}

export interface AdmissionQueryResult<Row extends Record<string, unknown>> {
  readonly rows: readonly Row[]
  readonly rowCount: number | null
}

/** Injectable transaction seam used by repository unit tests and future fault tests. */
export interface AdmissionSqlClient {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: readonly unknown[],
  ): Promise<AdmissionQueryResult<Row>>
}

/** The callback must commit on success and roll back on every thrown error. */
export interface AdmissionDatabase {
  transaction<T>(callback: (client: AdmissionSqlClient) => Promise<T>): Promise<T>
}

export const postgresAdmissionDatabase: AdmissionDatabase = {
  transaction: (callback) => withTransaction(async (client) => callback({
    async query<Row extends Record<string, unknown>>(
      text: string,
      params: readonly unknown[] = [],
    ): Promise<AdmissionQueryResult<Row>> {
      const result = await client.query(text, [...params])
      return {
        rows: result.rows as Row[],
        rowCount: result.rowCount,
      }
    },
  })),
}

export class AdmissionRepositoryInputError extends Error {
  readonly code = 'INVALID_ADMISSION_RESERVATION'

  constructor(message: string) {
    super(message)
    this.name = 'AdmissionRepositoryInputError'
  }
}

export class AdmissionStoreUnavailableError extends Error {
  readonly code = 'PROTECTION_UNAVAILABLE'

  constructor(cause: unknown) {
    super('The durable admission store is unavailable.', { cause })
    this.name = 'AdmissionStoreUnavailableError'
  }
}

export class AdmissionLimitExceededError extends Error {
  readonly code: 'RATE_LIMITED' | 'QUOTA_EXCEEDED'
  readonly retryAfterSeconds: number
  readonly reasonCode: string

  constructor(input: {
    code: 'RATE_LIMITED' | 'QUOTA_EXCEEDED'
    reasonCode: string
    retryAfterSeconds: number
  }) {
    super(input.reasonCode)
    this.name = 'AdmissionLimitExceededError'
    this.code = input.code
    this.reasonCode = input.reasonCode
    this.retryAfterSeconds = Math.max(1, Math.min(86_400, Math.ceil(input.retryAfterSeconds)))
  }
}

const ACTIVE_OPERATION_STATES = ['reserved', 'queued', 'running'] as const
const TERMINAL_OPERATION_STATES = ['succeeded', 'failed', 'cancelled', 'expired'] as const
const DEFAULT_CLEANUP_BATCH_SIZE = 500
const DEFAULT_LEASE_RETENTION_SECONDS = 7 * 24 * 60 * 60
const DEFAULT_OVERRIDE_RETENTION_SECONDS = 365 * 24 * 60 * 60
const MAX_CLEANUP_BATCH_SIZE = 5_000

interface NormalizedRateWindow extends Omit<RateWindowReservation, 'scopeHash' | 'units' | 'limit'> {
  readonly scopeHash: Buffer
  readonly units: bigint
  readonly limit: bigint
}

interface NormalizedQuota extends Omit<WorkloadQuotaReservation, 'scopeHash' | 'units' | 'limit'> {
  readonly scopeHash: Buffer
  readonly units: bigint
  readonly limit: bigint
}

interface NormalizedCapacity extends Omit<WorkloadCapacityReservation, 'scopeHash' | 'leaseId'> {
  readonly leaseId: string
  readonly scopeHash: Buffer
}

const nonEmpty = (value: string, field: string, maximum = 128): string => {
  const normalized = value.trim()
  if (!normalized || normalized.length > maximum) {
    throw new AdmissionRepositoryInputError(`${field} must contain 1-${maximum} characters.`)
  }
  return normalized
}

const validDate = (value: Date, field: string): Date => {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new AdmissionRepositoryInputError(`${field} must be a finite Date.`)
  }
  return new Date(value.getTime())
}

const positiveInteger = (value: number, field: string, maximum = Number.MAX_SAFE_INTEGER): number => {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new AdmissionRepositoryInputError(`${field} must be a finite positive integer.`)
  }
  return value
}

const positiveUnits = (value: AdmissionUnitValue, field: string): bigint => {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new AdmissionRepositoryInputError(`${field} must be a positive safe integer.`)
    }
    return BigInt(value)
  }
  if (value <= 0n) throw new AdmissionRepositoryInputError(`${field} must be positive.`)
  return value
}

const hash32 = (value: Uint8Array, field: string): Buffer => {
  const hash = Buffer.from(value)
  if (hash.byteLength !== 32) {
    throw new AdmissionRepositoryInputError(`${field} must be a 32-byte HMAC digest.`)
  }
  return hash
}

const validUuid = (value: string, field: string): string => {
  const normalized = value.trim().toLowerCase()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)) {
    throw new AdmissionRepositoryInputError(`${field} must be a UUID.`)
  }
  return normalized
}

// A binary total order cannot collapse distinct keys as locale collation can.
// Every process therefore acquires rows/advisory locks in exactly the same order.
const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0
const compareDate = (left: Date, right: Date): number => left.getTime() - right.getTime()

const normalizeRateWindows = (
  values: readonly RateWindowReservation[],
): NormalizedRateWindow[] => {
  const normalized = values.map((value) => {
    const windowStartedAt = validDate(value.windowStartedAt, 'windowStartedAt')
    const expiresAt = validDate(value.expiresAt, 'expiresAt')
    const units = positiveUnits(value.units, 'rate units')
    const limit = positiveUnits(value.limit, 'rate limit')
    if (units > limit) {
      throw new AdmissionLimitExceededError({
        code: 'RATE_LIMITED',
        reasonCode: 'RATE_WINDOW_LIMIT',
        retryAfterSeconds: value.windowSeconds,
      })
    }
    if (expiresAt <= windowStartedAt) {
      throw new AdmissionRepositoryInputError('Rate-window expiration must follow its boundary.')
    }
    return {
      ...value,
      policyKey: nonEmpty(value.policyKey, 'policyKey'),
      scopeHash: hash32(value.scopeHash, 'scopeHash'),
      windowStartedAt,
      windowSeconds: positiveInteger(value.windowSeconds, 'windowSeconds'),
      units,
      limit,
      expiresAt,
    }
  })

  normalized.sort((left, right) =>
    compareText(left.policyKey, right.policyKey)
    || compareText(left.scopeKind, right.scopeKind)
    || Buffer.compare(left.scopeHash, right.scopeHash)
    || compareDate(left.windowStartedAt, right.windowStartedAt)
    || left.windowSeconds - right.windowSeconds)

  const keys = new Set<string>()
  for (const value of normalized) {
    const key = [
      value.policyKey,
      value.scopeKind,
      value.scopeHash.toString('hex'),
      value.windowStartedAt.toISOString(),
      value.windowSeconds,
    ].join(':')
    if (keys.has(key)) {
      throw new AdmissionRepositoryInputError('Duplicate rate-window reservation key.')
    }
    keys.add(key)
  }
  return normalized
}

const normalizeQuotas = (
  values: readonly WorkloadQuotaReservation[],
): NormalizedQuota[] => {
  const normalized = values.map((value) => {
    const periodStartedAt = validDate(value.periodStartedAt, 'periodStartedAt')
    const expiresAt = validDate(value.expiresAt, 'expiresAt')
    const units = positiveUnits(value.units, 'quota units')
    const limit = positiveUnits(value.limit, 'quota limit')
    if (units > limit) {
      throw new AdmissionLimitExceededError({
        code: 'QUOTA_EXCEEDED',
        reasonCode: 'WORKLOAD_QUOTA_LIMIT',
        retryAfterSeconds: 60,
      })
    }
    if (expiresAt <= periodStartedAt) {
      throw new AdmissionRepositoryInputError('Quota expiration must follow its period boundary.')
    }
    return {
      ...value,
      workloadKey: nonEmpty(value.workloadKey, 'workloadKey'),
      scopeHash: hash32(value.scopeHash, 'scopeHash'),
      periodStartedAt,
      units,
      limit,
      expiresAt,
    }
  })

  normalized.sort((left, right) =>
    compareText(left.workloadKey, right.workloadKey)
    || compareText(left.scopeKind, right.scopeKind)
    || Buffer.compare(left.scopeHash, right.scopeHash)
    || compareText(left.periodKind, right.periodKind)
    || compareDate(left.periodStartedAt, right.periodStartedAt))

  const keys = new Set<string>()
  for (const value of normalized) {
    const key = [
      value.workloadKey,
      value.scopeKind,
      value.scopeHash.toString('hex'),
      value.periodKind,
      value.periodStartedAt.toISOString(),
    ].join(':')
    if (keys.has(key)) {
      throw new AdmissionRepositoryInputError('Duplicate workload-quota reservation key.')
    }
    keys.add(key)
  }
  return normalized
}

const normalizeCapacity = (
  value: WorkloadCapacityReservation | undefined,
  now: Date,
): NormalizedCapacity | undefined => {
  if (!value) return undefined
  const expiresAt = validDate(value.expiresAt, 'lease expiresAt')
  if (expiresAt <= now) {
    throw new AdmissionRepositoryInputError('Lease expiration must be in the future.')
  }
  return {
    ...value,
    leaseId: value.leaseId ? validUuid(value.leaseId, 'leaseId') : randomUUID(),
    operationId: validUuid(value.operationId, 'operationId'),
    workloadKey: nonEmpty(value.workloadKey, 'workloadKey'),
    scopeHash: hash32(value.scopeHash, 'scopeHash'),
    concurrencyLimit: positiveInteger(value.concurrencyLimit, 'concurrencyLimit', 100_000),
    backlogLimit: positiveInteger(value.backlogLimit, 'backlogLimit', 1_000_000),
    expiresAt,
  }
}

const retryAfter = (expiresAt: Date | string | undefined, now: Date): number => {
  if (!expiresAt) return 60
  const milliseconds = new Date(expiresAt).getTime() - now.getTime()
  return Number.isFinite(milliseconds) ? Math.max(1, Math.ceil(milliseconds / 1_000)) : 60
}

const asBigInt = (value: unknown, field: string): bigint => {
  try {
    return BigInt(value as string | number | bigint)
  } catch {
    throw new Error(`INVALID_DATABASE_${field.toUpperCase()}`)
  }
}

const reserveRateWindow = async (
  client: AdmissionSqlClient,
  value: NormalizedRateWindow,
  now: Date,
): Promise<ReservedRateWindow> => {
  const result = await client.query<{ consumed_units: string | bigint }>(
    `insert into abuse_rate_windows (
       policy_key, scope_kind, scope_hash, window_started_at, window_seconds,
       consumed_units, expires_at, updated_at
     ) values ($1, $2, $3, $4, $5, $6::bigint, $7, $8)
     on conflict (policy_key, scope_kind, scope_hash, window_started_at, window_seconds)
     do update set
       consumed_units = abuse_rate_windows.consumed_units + excluded.consumed_units,
       expires_at = greatest(abuse_rate_windows.expires_at, excluded.expires_at),
       updated_at = excluded.updated_at
     where abuse_rate_windows.consumed_units + excluded.consumed_units <= $9::bigint
     returning consumed_units`,
    [
      value.policyKey,
      value.scopeKind,
      value.scopeHash,
      value.windowStartedAt,
      value.windowSeconds,
      value.units.toString(),
      value.expiresAt,
      now,
      value.limit.toString(),
    ],
  )
  const row = result.rows[0]
  if (!row) {
    const existing = await client.query<{ expires_at: Date | string }>(
      `select expires_at
         from abuse_rate_windows
        where policy_key = $1
          and scope_kind = $2
          and scope_hash = $3
          and window_started_at = $4
          and window_seconds = $5
        for update`,
      [value.policyKey, value.scopeKind, value.scopeHash, value.windowStartedAt, value.windowSeconds],
    )
    throw new AdmissionLimitExceededError({
      code: 'RATE_LIMITED',
      reasonCode: 'RATE_WINDOW_LIMIT',
      retryAfterSeconds: retryAfter(existing.rows[0]?.expires_at, now),
    })
  }
  return {
    policyKey: value.policyKey,
    scopeKind: value.scopeKind,
    consumedUnits: asBigInt(row.consumed_units, 'consumed_units'),
  }
}

const reserveQuota = async (
  client: AdmissionSqlClient,
  value: NormalizedQuota,
  now: Date,
): Promise<ReservedWorkloadQuota> => {
  const result = await client.query<{ reserved_units: string | bigint }>(
    `insert into workload_quota_counters (
       workload_key, scope_kind, scope_hash, period_kind, period_started_at,
       reserved_units, completed_units, failed_units, expires_at, updated_at
     ) values ($1, $2, $3, $4, $5, $6::bigint, 0, 0, $7, $8)
     on conflict (workload_key, scope_kind, scope_hash, period_kind, period_started_at)
     do update set
       reserved_units = workload_quota_counters.reserved_units + excluded.reserved_units,
       expires_at = greatest(workload_quota_counters.expires_at, excluded.expires_at),
       updated_at = excluded.updated_at
     where workload_quota_counters.reserved_units + excluded.reserved_units <= $9::bigint
     returning reserved_units`,
    [
      value.workloadKey,
      value.scopeKind,
      value.scopeHash,
      value.periodKind,
      value.periodStartedAt,
      value.units.toString(),
      value.expiresAt,
      now,
      value.limit.toString(),
    ],
  )
  const row = result.rows[0]
  if (!row) {
    const existing = await client.query<{ expires_at: Date | string }>(
      `select expires_at
         from workload_quota_counters
        where workload_key = $1
          and scope_kind = $2
          and scope_hash = $3
          and period_kind = $4
          and period_started_at = $5
        for update`,
      [
        value.workloadKey,
        value.scopeKind,
        value.scopeHash,
        value.periodKind,
        value.periodStartedAt,
      ],
    )
    throw new AdmissionLimitExceededError({
      code: 'QUOTA_EXCEEDED',
      reasonCode: 'WORKLOAD_QUOTA_LIMIT',
      retryAfterSeconds: retryAfter(existing.rows[0]?.expires_at, now),
    })
  }
  return {
    workloadKey: value.workloadKey,
    scopeKind: value.scopeKind,
    periodKind: value.periodKind,
    reservedUnits: asBigInt(row.reserved_units, 'reserved_units'),
  }
}

const acquireCapacityLocks = async (
  client: AdmissionSqlClient,
  value: NormalizedCapacity,
): Promise<void> => {
  const scopeKey = [value.workloadKey, value.scopeKind, value.scopeHash.toString('hex')].join(':')
  const lockKeys = [
    `atlas:admission:backlog:${value.workloadKey}`,
    `atlas:admission:lease:${scopeKey}`,
  ].sort(compareText)
  for (const lockKey of lockKeys) {
    await client.query(
      'select pg_advisory_xact_lock(hashtextextended($1, 0))',
      [lockKey],
    )
  }
}

const reserveCapacity = async (
  client: AdmissionSqlClient,
  value: NormalizedCapacity,
  now: Date,
): Promise<ReservedWorkloadLease> => {
  await acquireCapacityLocks(client, value)

  const operation = await client.query<{ workload_key: string; state: string }>(
    `select workload_key, state
       from idempotent_operations
      where operation_id = $1
      for update`,
    [value.operationId],
  )
  const operationRow = operation.rows[0]
  if (!operationRow || operationRow.workload_key !== value.workloadKey) {
    throw new AdmissionRepositoryInputError('Capacity operation does not exist for the workload.')
  }
  if (!(ACTIVE_OPERATION_STATES as readonly string[]).includes(operationRow.state)) {
    throw new AdmissionRepositoryInputError('Capacity operation is not active.')
  }

  const existingLease = await client.query<{ lease_id: string }>(
    `select lease_id
       from workload_leases
      where operation_id = $1
      for update`,
    [value.operationId],
  )
  if (existingLease.rows.length > 0) {
    throw new AdmissionRepositoryInputError('Capacity operation already has a lease.')
  }

  const activeLeases = await client.query<{ lease_id: string }>(
    `select lease_id
       from workload_leases
      where workload_key = $1
        and scope_kind = $2
        and scope_hash = $3
        and state = 'active'
        and expires_at > $4
      order by lease_id
      limit $5
      for update`,
    [
      value.workloadKey,
      value.scopeKind,
      value.scopeHash,
      now,
      value.concurrencyLimit,
    ],
  )
  if (activeLeases.rows.length >= value.concurrencyLimit) {
    throw new AdmissionLimitExceededError({
      code: 'QUOTA_EXCEEDED',
      reasonCode: 'WORKLOAD_CONCURRENCY_LIMIT',
      retryAfterSeconds: retryAfter(value.expiresAt, now),
    })
  }

  const backlog = await client.query<{ operation_id: string }>(
    `select operation_id
       from idempotent_operations
      where workload_key = $1
        and state = any($2::text[])
      order by operation_id
      limit $3
      for update`,
    [value.workloadKey, [...ACTIVE_OPERATION_STATES], value.backlogLimit + 1],
  )
  if (backlog.rows.length > value.backlogLimit) {
    throw new AdmissionLimitExceededError({
      code: 'QUOTA_EXCEEDED',
      reasonCode: 'WORKLOAD_BACKLOG_LIMIT',
      retryAfterSeconds: 60,
    })
  }

  const inserted = await client.query<{ fencing_token: string | bigint }>(
    `insert into workload_leases (
       lease_id, operation_id, workload_key, scope_kind, scope_hash,
       state, acquired_at, heartbeat_at, expires_at
     ) values ($1, $2, $3, $4, $5, 'active', $6, $6, $7)
     returning fencing_token`,
    [
      value.leaseId,
      value.operationId,
      value.workloadKey,
      value.scopeKind,
      value.scopeHash,
      now,
      value.expiresAt,
    ],
  )
  const row = inserted.rows[0]
  if (!row) throw new Error('LEASE_INSERT_RETURNED_NO_ROW')
  return {
    leaseId: value.leaseId,
    operationId: value.operationId,
    fencingToken: asBigInt(row.fencing_token, 'fencing_token'),
  }
}

const deletionCount = (result: AdmissionQueryResult<Record<string, unknown>>): number =>
  Math.max(0, result.rowCount ?? result.rows.length)

const cleanupExpiredWithinTransaction = async (
  client: AdmissionSqlClient,
  input: Required<CleanupExpiredInput>,
): Promise<CleanupExpiredResult> => {
  const leaseCutoff = new Date(input.now.getTime() - input.leaseRetentionSeconds * 1_000)
  const overrideCutoff = new Date(input.now.getTime() - input.overrideRetentionSeconds * 1_000)

  const rateWindows = await client.query(
    `with candidates as (
       select policy_key, scope_kind, scope_hash, window_started_at, window_seconds
         from abuse_rate_windows
        where expires_at <= $1
        order by expires_at, policy_key, scope_kind, scope_hash, window_started_at, window_seconds
        limit $2
        for update skip locked
     )
     delete from abuse_rate_windows target
      using candidates
      where target.policy_key = candidates.policy_key
        and target.scope_kind = candidates.scope_kind
        and target.scope_hash = candidates.scope_hash
        and target.window_started_at = candidates.window_started_at
        and target.window_seconds = candidates.window_seconds
     returning 1`,
    [input.now, input.batchSize],
  )

  const quotaCounters = await client.query(
    `with candidates as (
       select workload_key, scope_kind, scope_hash, period_kind, period_started_at
         from workload_quota_counters
        where expires_at <= $1
        order by expires_at, workload_key, scope_kind, scope_hash, period_kind, period_started_at
        limit $2
        for update skip locked
     )
     delete from workload_quota_counters target
      using candidates
      where target.workload_key = candidates.workload_key
        and target.scope_kind = candidates.scope_kind
        and target.scope_hash = candidates.scope_hash
        and target.period_kind = candidates.period_kind
        and target.period_started_at = candidates.period_started_at
     returning 1`,
    [input.now, input.batchSize],
  )

  const leases = await client.query(
    `with candidates as (
       select lease_id
         from workload_leases
        where state in ('released', 'expired')
          and released_at <= $1
        order by released_at, lease_id
        limit $2
        for update skip locked
     )
     delete from workload_leases target
      using candidates
      where target.lease_id = candidates.lease_id
     returning 1`,
    [leaseCutoff, input.batchSize],
  )

  const operations = await client.query(
    `with candidates as (
       select operation_id
         from idempotent_operations
        where state = any($1::text[])
          and expires_at <= $2
        order by expires_at, operation_id
        limit $3
        for update skip locked
     )
     delete from idempotent_operations target
      using candidates
      where target.operation_id = candidates.operation_id
     returning 1`,
    [[...TERMINAL_OPERATION_STATES], input.now, input.batchSize],
  )

  const overrides = await client.query(
    `with candidates as (
       select override_id
         from protection_overrides
        where (expires_at is not null and expires_at <= $1)
           or (revoked_at is not null and revoked_at <= $1)
        order by coalesce(revoked_at, expires_at), override_id
        limit $2
        for update skip locked
     )
     delete from protection_overrides target
      using candidates
      where target.override_id = candidates.override_id
     returning 1`,
    [overrideCutoff, input.batchSize],
  )

  return {
    rateWindows: deletionCount(rateWindows),
    quotaCounters: deletionCount(quotaCounters),
    leases: deletionCount(leases),
    operations: deletionCount(operations),
    overrides: deletionCount(overrides),
  }
}

const normalizeCleanupInput = (input: CleanupExpiredInput): Required<CleanupExpiredInput> => ({
  now: validDate(input.now ?? new Date(), 'cleanup now'),
  batchSize: positiveInteger(
    input.batchSize ?? DEFAULT_CLEANUP_BATCH_SIZE,
    'cleanup batchSize',
    MAX_CLEANUP_BATCH_SIZE,
  ),
  leaseRetentionSeconds: positiveInteger(
    input.leaseRetentionSeconds ?? DEFAULT_LEASE_RETENTION_SECONDS,
    'leaseRetentionSeconds',
  ),
  overrideRetentionSeconds: positiveInteger(
    input.overrideRetentionSeconds ?? DEFAULT_OVERRIDE_RETENTION_SECONDS,
    'overrideRetentionSeconds',
  ),
})

const isExpectedError = (error: unknown): boolean =>
  error instanceof AdmissionRepositoryInputError
  || error instanceof AdmissionLimitExceededError
  || error instanceof AdmissionStoreUnavailableError

export class AdmissionRepository {
  constructor(private readonly database: AdmissionDatabase = postgresAdmissionDatabase) {}

  /**
   * Composition boundary for idempotency/override services that must share the
   * same PostgreSQL commit as the counter and lease reservation.
   */
  async withTransaction<T>(
    callback: (client: AdmissionSqlClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.database.transaction(callback)
    } catch (error) {
      if (isExpectedError(error)) throw error
      throw new AdmissionStoreUnavailableError(error)
    }
  }

  async reserveInTransaction(
    client: AdmissionSqlClient,
    input: AtomicAdmissionReservation,
  ): Promise<AtomicAdmissionResult> {
    const now = validDate(input.now ?? new Date(), 'admission now')
    const rateWindows = normalizeRateWindows(input.rateWindows ?? [])
    const quotas = normalizeQuotas(input.quotas ?? [])
    const capacity = normalizeCapacity(input.capacity, now)

    try {
      const reservedRateWindows: ReservedRateWindow[] = []
      const reservedQuotas: ReservedWorkloadQuota[] = []
      for (const value of rateWindows) {
        reservedRateWindows.push(await reserveRateWindow(client, value, now))
      }
      for (const value of quotas) {
        reservedQuotas.push(await reserveQuota(client, value, now))
      }
      const lease = capacity ? await reserveCapacity(client, capacity, now) : null
      return { rateWindows: reservedRateWindows, quotas: reservedQuotas, lease }
    } catch (error) {
      if (isExpectedError(error)) throw error
      throw new AdmissionStoreUnavailableError(error)
    }
  }

  async reserve(input: AtomicAdmissionReservation): Promise<AtomicAdmissionResult> {
    return this.withTransaction((client) => this.reserveInTransaction(client, input))
  }

  async cleanupExpired(input: CleanupExpiredInput = {}): Promise<CleanupExpiredResult> {
    const normalized = normalizeCleanupInput(input)
    return this.withTransaction((client) =>
      cleanupExpiredWithinTransaction(client, normalized))
  }
}

export const admissionRepository = new AdmissionRepository()
