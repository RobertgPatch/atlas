import { describe, expect, it, vi } from 'vitest'

import {
  IdempotencyConflictError,
  IdempotencyService,
  InMemoryIdempotencyStore,
} from '../../src/modules/abuse-protection/idempotency.service.js'
import {
  TEST_FINGERPRINT_KEY,
  deterministicSubjectFingerprint,
} from '../helpers/abuseProtectionTestHelpers.js'

const now = new Date('2026-08-25T12:00:00.000Z')

const createService = () =>
  new IdempotencyService(new InMemoryIdempotencyStore(), {
    activeKey: TEST_FINGERPRINT_KEY,
    retentionDays: 30,
  })

const reservationInput = (clientKey: string, reversed = false) => ({
  workloadKey: 'k1_bda_document',
  principalHash: deterministicSubjectFingerprint('user', 'user-123'),
  canonicalRequest: {
    policyKey: 'k1.retry-extraction',
    method: 'POST' as const,
    routePattern: '/v1/k1-documents/:k1DocumentId/retry-extraction',
    inputs: reversed
      ? { expectedVersion: 7, documentId: 'document-123' }
      : { documentId: 'document-123', expectedVersion: 7 },
    resourceVersion: 7,
  },
  clientKey,
  reservedUnits: { document: 1, provider_call: 1 },
  requestId: `req_${clientKey}`,
  now,
})

describe('paid-operation idempotency under duplicate traffic', () => {
  it('normalizes server fingerprints so 100 rotated client keys create one operation', async () => {
    const service = createService()
    const reservations = []

    for (let index = 0; index < 100; index += 1) {
      reservations.push(
        await service.reserve(
          reservationInput(
            `client-key-${String(index).padStart(3, '0')}`,
            index % 2 === 1,
          ),
        ),
      )
    }

    expect(reservations.filter((item) => item.disposition === 'created')).toHaveLength(1)
    expect(reservations.filter((item) => item.disposition === 'reused')).toHaveLength(99)
    expect(new Set(reservations.map((item) => item.operation.operationId))).toHaveLength(1)
    expect(new Set(reservations.map((item) => item.operation.providerToken))).toHaveLength(1)
  })

  it('does not start a second provider call after an unknown timeout outcome', async () => {
    const service = createService()
    const provider = vi.fn(async () => {
      throw new Error('provider timeout after acceptance')
    })
    const first = await service.reserve(reservationInput('first-client-key'))
    expect(first.disposition).toBe('created')
    await service.markQueued({ operationId: first.operation.operationId, now })
    await service.markRunning({ operationId: first.operation.operationId, now })

    try {
      await provider(first.operation.providerToken)
    } catch {
      await service.markProviderOutcomeUnknown({
        operationId: first.operation.operationId,
        now,
      })
    }

    const retries = []
    for (let index = 0; index < 99; index += 1) {
      retries.push(
        await service.reserve(
          reservationInput(`retry-client-key-${String(index).padStart(3, '0')}`),
        ),
      )
    }

    expect(provider).toHaveBeenCalledTimes(1)
    expect(retries.every((item) => item.disposition === 'reused')).toBe(true)
    expect(retries.every((item) => item.operation.operationId === first.operation.operationId)).toBe(
      true,
    )
    expect(retries.every((item) => item.operation.reconciliationRequired)).toBe(true)
  })

  it('returns a completed result on a legitimate retry and conflicts only when the client key changes meaning', async () => {
    const service = createService()
    const first = await service.reserve(reservationInput('stable-client-key'))
    await service.markQueued({ operationId: first.operation.operationId, now })
    await service.markRunning({ operationId: first.operation.operationId, now })
    await service.markSucceeded({
      operationId: first.operation.operationId,
      resultReference: 'result://completed/export-123',
      now,
    })

    await expect(service.reserve(reservationInput('stable-client-key'))).resolves.toMatchObject({
      disposition: 'reused',
      operation: {
        operationId: first.operation.operationId,
        state: 'succeeded',
        resultReference: 'result://completed/export-123',
      },
    })
    await expect(service.reserve({
      ...reservationInput('stable-client-key'),
      canonicalRequest: {
        ...reservationInput('stable-client-key').canonicalRequest,
        inputs: { documentId: 'different-document', expectedVersion: 7 },
      },
    })).rejects.toBeInstanceOf(IdempotencyConflictError)
  })
})
