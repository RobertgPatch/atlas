import { describe, expect, it, vi } from 'vitest'

import {
  AdmissionLimitExceededError,
  AdmissionRepository,
  type AdmissionDatabase,
} from '../../src/modules/abuse-protection/admission.repository.js'
import { AdmissionService } from '../../src/modules/abuse-protection/admission.service.js'
import { createBoundedExpiringRateStore } from '../../src/modules/abuse-protection/localRateLimiter.plugin.js'
import { defineRouteProtectionPolicy } from '../../src/modules/abuse-protection/routePolicy.registry.js'
import { createSubjectFixture } from '../helpers/abuseProtectionTestHelpers.js'

describe('partitioned local rate state', () => {
  it('confines source churn to its partition and preserves pinned/authenticated state', async () => {
    const Store = createBoundedExpiringRateStore({
      maximumEntries: 4,
      maximumTtlMs: 60_000,
      partitionMaximumEntries: { pinned_global: 1, authenticated: 1, source: 2 },
    })
    const store = new Store()
    const increment = (key: string) => new Promise<void>((resolve, reject) => {
      store.incr(key, (error) => error ? reject(error) : resolve(), 60_000, 100)
    })
    const read = (key: string) => new Promise<number>((resolve, reject) => {
      store.read(key, (error, result) => error ? reject(error) : resolve(result!.current), 60_000, 100)
    })

    await increment('pinned_global|general_api.global|global|fixed')
    await increment('authenticated|general_api.user|user|known')
    for (let index = 0; index < 100; index += 1) {
      await increment(`source|general_api.source|source_prefix|${index}`)
    }

    expect(store.stats().partitions).toMatchObject({
      pinned_global: { size: 1, evictions: 0 },
      authenticated: { size: 1, evictions: 0 },
      source: { size: 2, evictions: 98 },
    })
    expect(await read('pinned_global|general_api.global|global|fixed')).toBe(1)
    expect(await read('authenticated|general_api.user|user|known')).toBe(1)
  })

  it('cannot turn local source eviction into durable paid-work admission', async () => {
    const database: AdmissionDatabase = {
      transaction: async (callback) => callback({
        query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
      }),
    }
    const repository = new AdmissionRepository(database)
    vi.spyOn(repository, 'reserveInTransaction').mockRejectedValue(new AdmissionLimitExceededError({
      code: 'RATE_LIMITED', reasonCode: 'RATE_WINDOW_LIMIT', retryAfterSeconds: 60,
    }))
    const service = new AdmissionService({ repository })
    const subjects = createSubjectFixture()
    const paidPolicy = defineRouteProtectionPolicy({
      policyKey: 'paid.test', routeClass: 'EXTERNAL_PROVIDER', method: 'POST',
      routePattern: '/v1/paid', authentication: 'session',
      scopeDimensions: ['source_prefix', 'user', 'session', 'global'], localRate: null,
      localRates: [
        { limitKey: 'paid.source', scope: 'source_prefix', partition: 'source', requests: 10, windowSeconds: 60 },
        { limitKey: 'paid.user', scope: 'user', partition: 'authenticated', requests: 10, windowSeconds: 60 },
        { limitKey: 'paid.session', scope: 'session', partition: 'authenticated', requests: 10, windowSeconds: 60 },
      ],
      durableRates: [{ policyLimitKey: 'paid.global', scope: 'global', requests: 1, windowSeconds: 60 }],
      payloadLimits: {}, concurrencyLimit: 1, concurrencyClass: 'workload.paid', backlogLimit: 1,
      idempotency: 'optional', killSwitch: 'paid_test', failureMode: 'fail_closed',
      costUnits: ['provider_call'], costDrivers: ['provider'], owner: 'security',
    })

    const decision = await service.admit({
      policy: paidPolicy,
      requestId: 'request-paid-1',
      subjectHashes: { global: subjects.global[0]!.digest },
    })
    expect(decision).toMatchObject({ decision: 'throttled' })
  })
})
