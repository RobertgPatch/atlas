import { describe, expect, it } from 'vitest'

import {
  IdempotencyConflictError,
  IdempotencyInputError,
  IdempotencyService,
  IdempotencyStateTransitionError,
  InMemoryIdempotencyStore,
  UNKNOWN_PROVIDER_OUTCOME_FAILURE_CODE,
  type ReserveIdempotentOperationInput,
} from '../../src/modules/abuse-protection/idempotency.service.js'

const activeKey = 'active-idempotency-hmac-key-material-v1'
const previousKey = 'previous-idempotency-hmac-key-material-v1'
const principalHash = Buffer.alloc(32, 7)
const now = new Date('2026-08-25T12:00:00.000Z')

const reservation = (
  overrides: Partial<ReserveIdempotentOperationInput> = {},
): ReserveIdempotentOperationInput => ({
  workloadKey: 'k1_bda_document',
  principalHash,
  canonicalRequest: {
    policyKey: 'k1.retry-extraction',
    method: 'POST',
    routePattern: '/v1/k1-documents/:k1DocumentId/retry-extraction',
    inputs: { k1DocumentId: 'document-1', reason: 'retry' },
    contentSha256: 'a'.repeat(64),
    resourceVersion: 3,
  },
  clientKey: 'browser-key-1',
  reservedUnits: { documents: 1, pages: 20 },
  requestId: 'req-idempotency-1',
  now,
  ...overrides,
})

const serviceWith = (
  store = new InMemoryIdempotencyStore(),
  options: { activeKey?: string; previousKeys?: readonly string[] } = {},
): IdempotencyService => new IdempotencyService(store, {
  activeKey: options.activeKey ?? activeKey,
  previousKeys: options.previousKeys,
  maximumClientKeyCharacters: 128,
  retentionDays: 30,
})

describe('IdempotencyService', () => {
  it('reuses a server-canonical operation and its provider token independently of object order or a new client key', async () => {
    const service = serviceWith()
    const created = await service.reserve(reservation())
    const reused = await service.reserve(reservation({
      clientKey: 'a-different-advisory-key',
      canonicalRequest: {
        policyKey: 'k1.retry-extraction',
        method: 'POST',
        routePattern: '/v1/k1-documents/:k1DocumentId/retry-extraction',
        inputs: { reason: 'retry', k1DocumentId: 'document-1' },
        contentSha256: 'a'.repeat(64),
        resourceVersion: 3,
      },
    }))

    expect(created.disposition).toBe('created')
    expect(reused.disposition).toBe('reused')
    expect(reused.operation.operationId).toBe(created.operation.operationId)
    expect(reused.operation.providerToken).toBe(created.operation.providerToken)
    expect(created.operation.providerToken).toMatch(/^atlas-v1-[A-Za-z0-9_-]{43}$/)
    expect(created.operation.requestFingerprint).toHaveLength(32)
    expect(created.operation.clientKeyHash).toHaveLength(32)
  })

  it('rejects reuse of a client key for a different canonical request', async () => {
    const service = serviceWith()
    const created = await service.reserve(reservation())

    await expect(service.reserve(reservation({
      canonicalRequest: {
        ...reservation().canonicalRequest,
        inputs: { k1DocumentId: 'document-2', reason: 'retry' },
      },
    }))).rejects.toMatchObject<Partial<IdempotencyConflictError>>({
      code: 'IDEMPOTENCY_KEY_CONFLICT',
      operationId: created.operation.operationId,
      operationState: 'reserved',
    })
  })

  it('finds an existing operation across a server HMAC key rotation', async () => {
    const store = new InMemoryIdempotencyStore()
    const beforeRotation = serviceWith(store, { activeKey: previousKey })
    const original = await beforeRotation.reserve(reservation())
    const afterRotation = serviceWith(store, {
      activeKey,
      previousKeys: [previousKey],
    })

    const reused = await afterRotation.reserve(reservation())

    expect(reused.disposition).toBe('reused')
    expect(reused.operation.operationId).toBe(original.operation.operationId)
  })

  it('persists success and failure details only through legal lifecycle transitions', async () => {
    const service = serviceWith()
    const successful = await service.reserve(reservation())

    await expect(service.markSucceeded({
      operationId: successful.operation.operationId,
      resultReference: 'result-before-running',
      now,
    })).rejects.toBeInstanceOf(IdempotencyStateTransitionError)

    await service.markQueued({ operationId: successful.operation.operationId, now })
    await service.markRunning({
      operationId: successful.operation.operationId,
      providerReference: 'provider-job-1',
      now,
    })
    const completed = await service.markSucceeded({
      operationId: successful.operation.operationId,
      resultReference: 'internal-result-1',
      now,
    })
    expect(completed).toMatchObject({
      state: 'succeeded',
      providerReference: 'provider-job-1',
      resultReference: 'internal-result-1',
      failureCode: null,
    })

    const failed = await service.reserve(reservation({
      clientKey: 'browser-key-failure',
      canonicalRequest: {
        ...reservation().canonicalRequest,
        inputs: { k1DocumentId: 'document-failure' },
      },
    }))
    await service.markQueued({ operationId: failed.operation.operationId, now })
    await service.markRunning({ operationId: failed.operation.operationId, now })
    const terminalFailure = await service.markFailed({
      operationId: failed.operation.operationId,
      failureCode: 'PROVIDER_REJECTED',
      now,
    })
    expect(terminalFailure).toMatchObject({
      state: 'failed',
      resultReference: null,
      failureCode: 'PROVIDER_REJECTED',
    })
  })

  it('marks an unknown provider outcome for reconciliation and never admits a replacement', async () => {
    const service = serviceWith()
    const created = await service.reserve(reservation())
    await service.markQueued({ operationId: created.operation.operationId, now })

    const unknown = await service.markProviderOutcomeUnknown({
      operationId: created.operation.operationId,
      providerReference: 'provider-job-maybe-created',
      now,
    })
    expect(unknown).toMatchObject({
      state: 'running',
      reconciliationRequired: true,
      failureCode: UNKNOWN_PROVIDER_OUTCOME_FAILURE_CODE,
    })

    const retry = await service.reserve(reservation())
    expect(retry.disposition).toBe('reused')
    expect(retry.operation.operationId).toBe(created.operation.operationId)
    expect(retry.operation.reconciliationRequired).toBe(true)

    const reconciled = await service.markSucceeded({
      operationId: created.operation.operationId,
      resultReference: 'reconciled-result',
      now,
    })
    expect(reconciled.reconciliationRequired).toBe(false)
    expect(reconciled.failureCode).toBeNull()
  })

  it('supports queued cancellation and permits expiry only before a side effect', async () => {
    const service = serviceWith()
    const cancelled = await service.reserve(reservation())
    await service.markQueued({ operationId: cancelled.operation.operationId, now })
    expect(await service.markCancelled({
      operationId: cancelled.operation.operationId,
      now,
    })).toMatchObject({ state: 'cancelled' })

    const expiring = await service.reserve(reservation({
      clientKey: 'browser-key-expiring',
      canonicalRequest: {
        ...reservation().canonicalRequest,
        inputs: { k1DocumentId: 'document-expiring' },
      },
    }))
    expect(await service.markExpired({
      operationId: expiring.operation.operationId,
      now,
    })).toMatchObject({ state: 'expired' })

    await expect(service.markQueued({
      operationId: expiring.operation.operationId,
      now,
    })).rejects.toBeInstanceOf(IdempotencyStateTransitionError)
  })

  it('bounds client keys and validates small integer reservation maps before storage', async () => {
    const service = new IdempotencyService(new InMemoryIdempotencyStore(), {
      activeKey,
      maximumClientKeyCharacters: 8,
      retentionDays: 30,
    })

    await expect(service.reserve(reservation({ clientKey: '123456789' })))
      .rejects.toBeInstanceOf(IdempotencyInputError)
    await expect(service.reserve(reservation({ reservedUnits: { pages: 1.5 } })))
      .rejects.toBeInstanceOf(IdempotencyInputError)
  })
})
