import type {
  AdmissionSqlClient,
  AtomicAdmissionReservation,
  AtomicAdmissionResult,
  QuotaPeriodKind,
  QuotaScopeKind,
  RateWindowScopeKind,
} from './admission.repository.js'
import {
  AdmissionLimitExceededError,
  AdmissionRepository,
  AdmissionStoreUnavailableError,
  admissionRepository,
} from './admission.repository.js'
import {
  IdempotencyConflictError,
  IdempotencyService,
  IdempotencyStoreUnavailableError,
  idempotencyService,
  type IdempotencyReservation,
  type ReserveIdempotentOperationInput,
} from './idempotency.service.js'
import type {
  AdmissionDecision,
  CostUnitReservation,
  RouteProtectionPolicy,
  ScopeDimension,
} from './protection.types.js'
import {
  configuredHardDisabledControls,
  protectionOverrideService,
} from './protectionOverride.service.js'

export interface EffectiveProtectionControl {
  readonly enabled: boolean
  readonly source: 'environment_hard_disable' | 'configured_default' | 'runtime_override'
  readonly expiresAt?: Date | null
  readonly lowerLimits?: Readonly<Record<string, number>>
}

export interface AdmissionControlResolver {
  resolveInTransaction(
    client: AdmissionSqlClient,
    input: {
      readonly controlKey: string
      readonly now: Date
      readonly subjectHashes: Readonly<Partial<Record<ScopeDimension, Uint8Array>>>
    },
  ): Promise<EffectiveProtectionControl>
}

export interface WorkloadQuotaLimit {
  /** Optional shared counter key for family-wide or cross-workload budgets. */
  readonly workloadKey?: string
  readonly scopeKind: QuotaScopeKind
  readonly scopeHash: Uint8Array
  readonly periodKind: QuotaPeriodKind
  readonly units: number
  readonly limit: number
  readonly periodStartedAt?: Date
  readonly expiresAt?: Date
}

export interface WorkloadAdmissionInput {
  readonly workloadKey: string
  readonly idempotency: Omit<
    ReserveIdempotentOperationInput,
    'workloadKey' | 'requestId' | 'now'
  >
  readonly quotas: readonly WorkloadQuotaLimit[]
  readonly leaseScopeKind: 'user' | 'entity' | 'provider' | 'global'
  readonly leaseScopeHash: Uint8Array
  readonly leaseTtlSeconds: number
  readonly backlogLimit?: number
}

export interface AdmissionRequest {
  readonly policy: RouteProtectionPolicy
  readonly requestId: string
  readonly subjectHashes: Readonly<Partial<Record<ScopeDimension, Uint8Array>>>
  readonly workload?: WorkloadAdmissionInput
  readonly now?: Date
}

export interface AdmissionServiceOptions {
  readonly repository?: Pick<
    AdmissionRepository,
    'withTransaction' | 'reserveInTransaction'
  >
  readonly idempotency?: Pick<IdempotencyService, 'reserveInTransaction'>
  readonly controls?: AdmissionControlResolver
  readonly hardDisabledControls?: ReadonlySet<string>
}

export class AdmissionServiceInputError extends Error {
  readonly code = 'INVALID_ADMISSION_REQUEST'

  constructor(message: string) {
    super(message)
    this.name = 'AdmissionServiceInputError'
  }
}

const supportedRateScopes = new Set<RateWindowScopeKind>([
  'account',
  'user',
  'session',
  'tenant',
  'operation',
  'global',
])

const finiteDate = (value: Date, name: string): Date => {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new AdmissionServiceInputError(`${name} must be a finite date.`)
  }
  return new Date(value)
}

const positiveInteger = (value: number, name: string): number => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new AdmissionServiceInputError(`${name} must be a positive safe integer.`)
  }
  return value
}

const hashFor = (
  values: Readonly<Partial<Record<ScopeDimension, Uint8Array>>>,
  scope: ScopeDimension,
): Uint8Array => {
  const value = values[scope]
  if (!value || value.byteLength !== 32) {
    throw new AdmissionServiceInputError(`A 32-byte ${scope} subject hash is required.`)
  }
  return value
}

const fixedWindow = (now: Date, seconds: number): { start: Date; end: Date } => {
  positiveInteger(seconds, 'windowSeconds')
  const milliseconds = seconds * 1_000
  const startedAt = Math.floor(now.getTime() / milliseconds) * milliseconds
  return {
    start: new Date(startedAt),
    end: new Date(startedAt + milliseconds),
  }
}

const quotaPeriod = (
  now: Date,
  kind: QuotaPeriodKind,
): { start: Date; end: Date } => {
  if (kind === 'rolling_hour') return fixedWindow(now, 3_600)
  if (kind === 'utc_day') {
    const start = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    ))
    return { start, end: new Date(start.getTime() + 86_400_000) }
  }
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  return { start, end }
}

const configuredControlResolver: AdmissionControlResolver = {
  async resolveInTransaction() {
    return { enabled: true, source: 'configured_default' }
  },
}

const rateReservationsFor = (
  request: AdmissionRequest,
  now: Date,
): NonNullable<AtomicAdmissionReservation['rateWindows']> =>
  request.policy.durableRates.map((rate) => {
    if (!supportedRateScopes.has(rate.scope as RateWindowScopeKind)) {
      throw new AdmissionServiceInputError(
        `Durable request rate scope ${rate.scope} is not supported by the repository.`,
      )
    }
    const window = fixedWindow(now, rate.windowSeconds)
    return {
      policyKey: rate.policyLimitKey,
      scopeKind: rate.scope as RateWindowScopeKind,
      scopeHash: hashFor(request.subjectHashes, rate.scope),
      windowStartedAt: window.start,
      windowSeconds: rate.windowSeconds,
      units: rate.units ?? 1,
      limit: rate.requests,
      expiresAt: window.end,
    }
  })

const quotaReservationsFor = (
  workload: WorkloadAdmissionInput,
  now: Date,
): NonNullable<AtomicAdmissionReservation['quotas']> =>
  workload.quotas.map((quota) => {
    const period = quotaPeriod(now, quota.periodKind)
    const periodStartedAt = quota.periodStartedAt
      ? finiteDate(quota.periodStartedAt, 'periodStartedAt')
      : period.start
    const expiresAt = quota.expiresAt
      ? finiteDate(quota.expiresAt, 'expiresAt')
      : period.end
    return {
      workloadKey: quota.workloadKey ?? workload.workloadKey,
      scopeKind: quota.scopeKind,
      scopeHash: quota.scopeHash,
      periodKind: quota.periodKind,
      periodStartedAt,
      units: positiveInteger(quota.units, 'quota units'),
      limit: positiveInteger(quota.limit, 'quota limit'),
      expiresAt,
    }
  })

const costReservationsFor = (
  policy: RouteProtectionPolicy,
  workload: WorkloadAdmissionInput | undefined,
): readonly CostUnitReservation[] => {
  const units = workload?.idempotency.reservedUnits ?? {}
  return policy.costUnits.map((unit) => ({
    unit,
    units: positiveInteger(units[unit] ?? 1, `${unit} units`),
  }))
}

const disabledDecision = (
  request: AdmissionRequest,
): AdmissionDecision => ({
  decision: 'disabled',
  error: 'WORKLOAD_DISABLED',
  reasonCode: 'WORKLOAD_DISABLED',
  retryAfterSeconds: 300,
  policyKey: request.policy.policyKey,
  requestId: request.requestId,
  ...(request.workload ? { workloadKey: request.workload.workloadKey } : {}),
})

export class AdmissionService {
  readonly #repository: NonNullable<AdmissionServiceOptions['repository']>
  readonly #idempotency: NonNullable<AdmissionServiceOptions['idempotency']>
  readonly #controls: AdmissionControlResolver
  readonly #hardDisabledControls: ReadonlySet<string>

  constructor(options: AdmissionServiceOptions = {}) {
    this.#repository = options.repository ?? admissionRepository
    this.#idempotency = options.idempotency ?? idempotencyService
    this.#controls = options.controls ?? configuredControlResolver
    this.#hardDisabledControls = options.hardDisabledControls ?? new Set()
  }

  async admit(request: AdmissionRequest): Promise<AdmissionDecision> {
    const now = finiteDate(request.now ?? new Date(), 'now')
    if (!request.requestId.trim() || request.requestId.length > 128) {
      throw new AdmissionServiceInputError('requestId must contain 1-128 characters.')
    }
    const controlKey = request.policy.killSwitch
    if (controlKey && this.#hardDisabledControls.has(controlKey)) {
      return disabledDecision(request)
    }
    if (
      (request.policy.idempotency === 'required'
        || request.policy.idempotency === 'server_content')
      && !request.workload
    ) {
      throw new AdmissionServiceInputError(
        `Policy ${request.policy.policyKey} requires idempotent workload input.`,
      )
    }

    try {
      return await this.#repository.withTransaction(async (client) => {
        let lowerLimits: Readonly<Record<string, number>> = {}
        if (controlKey) {
          const control = await this.#controls.resolveInTransaction(client, {
            controlKey,
            now,
            subjectHashes: request.subjectHashes,
          })
          if (!control.enabled) return disabledDecision(request)
          lowerLimits = control.lowerLimits ?? {}
        }

        let idempotency: IdempotencyReservation | null = null
        // Quota-tracked reads (for example PDF byte-range requests) carry a
        // workload so their usage can be counted, but an idempotency policy of
        // `none` must allow every request to execute. Reserving a reusable
        // operation for those reads turns the second browser range request
        // into an IDEMPOTENT_REPLAY JSON response instead of PDF bytes.
        if (request.workload) {
          idempotency = await this.#idempotency.reserveInTransaction(client, {
            ...request.workload.idempotency,
            ...(request.policy.idempotency === 'none'
              ? {
                  canonicalRequest: {
                    ...request.workload.idempotency.canonicalRequest,
                    inputs: {
                      requestId: request.requestId,
                      original: request.workload.idempotency.canonicalRequest.inputs,
                    },
                  },
                }
              : {}),
            workloadKey: request.workload.workloadKey,
            requestId: request.requestId,
            now,
          })
          if (idempotency.disposition === 'reused' && request.policy.idempotency !== 'none') {
            return {
              decision: 'deduplicated',
              policyKey: request.policy.policyKey,
              requestId: request.requestId,
              operationId: idempotency.operation.operationId,
              operationState: idempotency.operation.state,
              resultReference: idempotency.operation.resultReference,
            }
          }
        }

        const operation = idempotency?.operation
        const workload = request.workload
        const configuredConcurrency = request.policy.concurrencyLimit
        const concurrencyLimit = configuredConcurrency === null
          ? null
          : Math.min(configuredConcurrency, lowerLimits.concurrencyLimit ?? configuredConcurrency)
        const configuredBacklog = request.policy.backlogLimit ?? workload?.backlogLimit
        const backlogLimit = configuredBacklog === undefined || configuredBacklog === null
          ? configuredBacklog
          : Math.min(configuredBacklog, lowerLimits.backlogLimit ?? configuredBacklog)
        const quotas = workload ? quotaReservationsFor(workload, now).map((quota) => {
          const override = quota.scopeKind === 'global' && quota.periodKind === 'utc_day'
            ? lowerLimits.globalDailyLimit
            : lowerLimits[`${quota.scopeKind}Limit`]
          if (override === undefined) return quota
          const lowerLimit = typeof quota.limit === 'bigint' ? BigInt(override) : override
          return { ...quota, limit: quota.limit < lowerLimit ? quota.limit : lowerLimit }
        }) : []
        const reservation: AtomicAdmissionReservation = {
          rateWindows: rateReservationsFor(request, now),
          quotas,
          capacity:
            workload && operation && concurrencyLimit !== null
              ? {
                  operationId: operation.operationId,
                  workloadKey: workload.workloadKey,
                  scopeKind: workload.leaseScopeKind,
                  scopeHash: workload.leaseScopeHash,
                  concurrencyLimit,
                  backlogLimit: positiveInteger(
                    backlogLimit ?? concurrencyLimit,
                    'backlogLimit',
                  ),
                  expiresAt: new Date(
                    now.getTime() + positiveInteger(workload.leaseTtlSeconds, 'leaseTtlSeconds') * 1_000,
                  ),
                }
              : undefined,
          now,
        }
        const reserved: AtomicAdmissionResult =
          await this.#repository.reserveInTransaction(client, reservation)
        return {
          decision: 'allowed',
          policyKey: request.policy.policyKey,
          requestId: request.requestId,
          ...(operation ? { operationId: operation.operationId } : {}),
          reservations: costReservationsFor(request.policy, workload),
          ...(reserved.lease ? { fencingToken: reserved.lease.fencingToken } : {}),
        }
      })
    } catch (error) {
      if (error instanceof AdmissionLimitExceededError) {
        return {
          decision: error.code === 'RATE_LIMITED' ? 'throttled' : 'quota_rejected',
          error: error.code,
          reasonCode: error.reasonCode,
          retryAfterSeconds: error.retryAfterSeconds,
          policyKey: request.policy.policyKey,
          requestId: request.requestId,
          ...(request.workload ? { workloadKey: request.workload.workloadKey } : {}),
        }
      }
      if (error instanceof IdempotencyConflictError) throw error
      if (
        error instanceof AdmissionStoreUnavailableError ||
        error instanceof IdempotencyStoreUnavailableError
      ) {
        if (
          request.policy.failureMode === 'low_cost_degraded_read'
          && !request.workload
        ) {
          return {
            decision: 'allowed',
            policyKey: request.policy.policyKey,
            requestId: request.requestId,
            reservations: costReservationsFor(request.policy, undefined),
          }
        }
        return {
          decision: 'protection_unavailable',
          error: 'PROTECTION_UNAVAILABLE',
          reasonCode: 'ADMISSION_STORE_UNAVAILABLE',
          retryAfterSeconds: 30,
          policyKey: request.policy.policyKey,
          requestId: request.requestId,
          ...(request.workload ? { workloadKey: request.workload.workloadKey } : {}),
        }
      }
      throw error
    }
  }
}

export const admissionService = new AdmissionService({
  controls: protectionOverrideService,
  hardDisabledControls: configuredHardDisabledControls(),
})
