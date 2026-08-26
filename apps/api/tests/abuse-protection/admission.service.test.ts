import { randomUUID } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

import {
  AdmissionLimitExceededError,
  AdmissionStoreUnavailableError,
  type AdmissionSqlClient,
  type AtomicAdmissionResult,
} from '../../src/modules/abuse-protection/admission.repository.js'
import {
  AdmissionService,
  type AdmissionRequest,
} from '../../src/modules/abuse-protection/admission.service.js'
import type { IdempotencyReservation } from '../../src/modules/abuse-protection/idempotency.service.js'
import type { RouteProtectionPolicy } from '../../src/modules/abuse-protection/protection.types.js'

const hash = (value: number) => Buffer.alloc(32, value)
const now = new Date('2026-08-25T12:00:00.000Z')
const client = {} as AdmissionSqlClient

const policy = (overrides: Partial<RouteProtectionPolicy> = {}): RouteProtectionPolicy => ({
  policyKey: 'market.refresh',
  routeClass: 'EXTERNAL_PROVIDER',
  method: 'POST',
  routePattern: '/v1/reports/consolidated-holdings/refresh',
  authentication: 'session',
  scopeDimensions: ['user', 'global'],
  localRate: null,
  durableRates: [
    {
      policyLimitKey: 'market.refresh.user',
      scope: 'user',
      requests: 5,
      windowSeconds: 3_600,
    },
  ],
  payloadLimits: {},
  concurrencyLimit: 2,
  backlogLimit: 4,
  idempotency: 'required',
  killSwitch: 'market_data_refresh',
  failureMode: 'fail_closed',
  costUnits: ['provider_call'],
  costDrivers: ['market_api'],
  owner: 'platform-security',
  ...overrides,
})

const request = (): AdmissionRequest => ({
  policy: policy(),
  requestId: 'req_test_12345678',
  subjectHashes: { user: hash(1), global: hash(2) },
  workload: {
    workloadKey: 'market_provider_call',
    idempotency: {
      principalHash: hash(1),
      canonicalRequest: {
        policyKey: 'market.refresh',
        method: 'POST',
        routePattern: '/v1/reports/consolidated-holdings/refresh',
        inputs: { accountIds: ['account-1'] },
      },
      reservedUnits: { provider_call: 1 },
    },
    quotas: [
      {
        scopeKind: 'global',
        scopeHash: hash(2),
        periodKind: 'utc_day',
        units: 1,
        limit: 24,
      },
      {
        workloadKey: 'cost-budget:paid-workload-cents',
        scopeKind: 'global',
        scopeHash: hash(2),
        periodKind: 'billing_month',
        units: 5,
        limit: 2_500,
      },
    ],
    leaseScopeKind: 'global',
    leaseScopeHash: hash(2),
    leaseTtlSeconds: 60,
  },
  now,
})

const operation = (state: 'reserved' | 'running' = 'reserved') => ({
  operationId: randomUUID(),
  workloadKey: 'market_provider_call',
  principalHash: hash(1),
  requestFingerprint: hash(3),
  clientKeyHash: null,
  state,
  reservedUnits: { provider_call: 1 },
  providerToken: 'atlas-v1-provider-token',
  providerReference: null,
  resultReference: null,
  requestId: 'req_test_12345678',
  failureCode: null,
  reconciliationRequired: false,
  createdAt: now,
  updatedAt: now,
  expiresAt: new Date('2026-09-25T12:00:00.000Z'),
})

const harness = (options: {
  idempotency?: IdempotencyReservation
  reserve?: AtomicAdmissionResult | Error
  controlEnabled?: boolean
  hardDisabled?: boolean
} = {}) => {
  const reserveInTransaction = vi.fn(async () => {
    if (options.reserve instanceof Error) throw options.reserve
    return options.reserve ?? { rateWindows: [], quotas: [], lease: null }
  })
  const repository = {
    withTransaction: vi.fn(async <T>(callback: (nextClient: AdmissionSqlClient) => Promise<T>) =>
      callback(client)),
    reserveInTransaction,
  }
  const reserveIdempotency = vi.fn(async () =>
    options.idempotency ?? ({ disposition: 'created', operation: operation() } as const))
  const controls = {
    resolveInTransaction: vi.fn(async () => ({
      enabled: options.controlEnabled ?? true,
      source: 'configured_default' as const,
    })),
  }
  const service = new AdmissionService({
    repository,
    idempotency: { reserveInTransaction: reserveIdempotency },
    controls,
    hardDisabledControls: options.hardDisabled
      ? new Set(['market_data_refresh'])
      : new Set(),
  })
  return { service, repository, reserveInTransaction, reserveIdempotency, controls }
}

describe('atomic admission service', () => {
  it('stops a hard-disabled workload before opening a transaction', async () => {
    const test = harness({ hardDisabled: true })

    await expect(test.service.admit(request())).resolves.toMatchObject({
      decision: 'disabled',
      error: 'WORKLOAD_DISABLED',
    })
    expect(test.repository.withTransaction).not.toHaveBeenCalled()
    expect(test.reserveIdempotency).not.toHaveBeenCalled()
  })

  it('returns an existing operation without reserving another quota or lease', async () => {
    const reused = operation('running')
    const test = harness({
      idempotency: { disposition: 'reused', operation: reused },
    })

    await expect(test.service.admit(request())).resolves.toMatchObject({
      decision: 'deduplicated',
      operationId: reused.operationId,
      operationState: 'running',
    })
    expect(test.reserveInTransaction).not.toHaveBeenCalled()
  })

  it('reserves all exact units and the lease in the same transaction', async () => {
    const created = operation()
    const test = harness({
      idempotency: { disposition: 'created', operation: created },
      reserve: {
        rateWindows: [],
        quotas: [],
        lease: {
          leaseId: randomUUID(),
          operationId: created.operationId,
          fencingToken: 7n,
        },
      },
    })

    await expect(test.service.admit(request())).resolves.toMatchObject({
      decision: 'allowed',
      operationId: created.operationId,
      fencingToken: 7n,
      reservations: [{ unit: 'provider_call', units: 1 }],
    })
    expect(test.reserveInTransaction).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        rateWindows: [expect.objectContaining({ scopeKind: 'user', limit: 5 })],
        quotas: [
          expect.objectContaining({ workloadKey: 'market_provider_call', scopeKind: 'global', limit: 24 }),
          expect.objectContaining({
            workloadKey: 'cost-budget:paid-workload-cents',
            periodKind: 'billing_month',
            units: 5,
            limit: 2_500,
          }),
        ],
        capacity: expect.objectContaining({
          operationId: created.operationId,
          concurrencyLimit: 2,
          backlogLimit: 4,
        }),
      }),
    )
  })

  it('counts non-idempotent download quotas without deduplicating repeated reads', async () => {
    const test = harness()
    const base = request()
    const download: AdmissionRequest = {
      ...base,
      policy: policy({
        policyKey: 'document.download',
        routeClass: 'DOCUMENT_DOWNLOAD',
        method: 'GET',
        routePattern: '/v1/k1-documents/:k1DocumentId/pdf',
        idempotency: 'none',
        killSwitch: null,
        concurrencyLimit: 4,
        costUnits: ['output_byte'],
        costDrivers: ['object_read'],
      }),
      workload: {
        ...base.workload!,
        workloadKey: 'k1_document_download',
        quotas: [{
          scopeKind: 'user',
          scopeHash: hash(1),
          periodKind: 'rolling_hour',
          units: 1,
          limit: 120,
        }],
      },
    }

    await expect(test.service.admit(download)).resolves.toMatchObject({
      decision: 'allowed',
    })
    expect(test.reserveIdempotency).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        canonicalRequest: expect.objectContaining({
          inputs: expect.objectContaining({ requestId: download.requestId }),
        }),
      }),
    )
    expect(test.reserveInTransaction).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        quotas: [expect.objectContaining({
          workloadKey: 'k1_document_download',
          periodKind: 'rolling_hour',
          limit: 120,
        })],
        capacity: expect.objectContaining({
          operationId: expect.any(String),
          concurrencyLimit: 4,
        }),
      }),
    )
  })

  it('maps exact quota rejection and store outage to bounded decisions', async () => {
    const limited = harness({
      reserve: new AdmissionLimitExceededError({
        code: 'QUOTA_EXCEEDED',
        reasonCode: 'WORKLOAD_QUOTA_LIMIT',
        retryAfterSeconds: 60,
      }),
    })
    await expect(limited.service.admit(request())).resolves.toMatchObject({
      decision: 'quota_rejected',
      error: 'QUOTA_EXCEEDED',
      retryAfterSeconds: 60,
    })

    const unavailable = harness({
      reserve: new AdmissionStoreUnavailableError(new Error('offline')),
    })
    await expect(unavailable.service.admit(request())).resolves.toMatchObject({
      decision: 'protection_unavailable',
      error: 'PROTECTION_UNAVAILABLE',
    })
  })
})
