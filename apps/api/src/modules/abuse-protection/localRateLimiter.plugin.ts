import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

import { config } from '../../config.js'
import { cloudWatchAbuseObservability } from './abuseObservability.js'
import { buildRateLimitedResponse } from './protection.errors.js'
import { fingerprintSubject, normalizeSourcePrefix } from './subjectFingerprint.js'
import type {
  LocalRateLimit,
  LocalRatePartition,
  RouteProtectionPolicy,
} from './protection.types.js'

interface RateBucket {
  count: number
  expiresAt: number
}

interface RateStoreResult {
  current: number
  ttl: number
}

type RateStoreCallback = (error: Error | null, result?: RateStoreResult) => void

interface PartitionState {
  readonly buckets: Map<string, RateBucket>
  evictions: number
  expirations: number
}

interface SharedStoreState {
  readonly partitions: Record<LocalRatePartition, PartitionState>
}

export interface BoundedRateStorePartitionStats {
  readonly size: number
  readonly maximumEntries: number
  readonly evictions: number
  readonly expirations: number
}

export interface BoundedRateStoreStats {
  readonly size: number
  readonly maximumEntries: number
  readonly evictions: number
  readonly expirations: number
  readonly partitions: Readonly<Record<LocalRatePartition, BoundedRateStorePartitionStats>>
}

export interface BoundedRateStore {
  incr(
    key: string,
    callback: RateStoreCallback,
    timeWindow: number,
    max: number,
  ): void
  read(
    key: string,
    callback: RateStoreCallback,
    timeWindow: number,
    max: number,
  ): void
  child(): BoundedRateStore
  stats(): BoundedRateStoreStats
}

export interface BoundedRateStoreOptions {
  readonly maximumEntries: number
  readonly maximumTtlMs: number
  readonly partitionMaximumEntries?: Readonly<Record<LocalRatePartition, number>>
  readonly cleanupBatchSize?: number
  readonly now?: () => number
}

export type BoundedRateStoreConstructor = new (options?: unknown) => BoundedRateStore

const partitions: readonly LocalRatePartition[] = [
  'pinned_global',
  'authenticated',
  'source',
]

const partitionForKey = (key: string): LocalRatePartition => {
  const candidate = key.split('|', 1)[0] as LocalRatePartition
  return partitions.includes(candidate) ? candidate : 'source'
}

/**
 * Creates one shared, bounded store with isolated budgets. Source churn can
 * evict only source entries; it can never authorize work by evicting a pinned
 * global/class counter or a validated user/session counter.
 */
export const createBoundedExpiringRateStore = (
  options: BoundedRateStoreOptions,
): BoundedRateStoreConstructor => {
  if (!Number.isSafeInteger(options.maximumEntries) || options.maximumEntries <= 0) {
    throw new Error('INVALID_LOCAL_RATE_STORE_MAXIMUM_ENTRIES')
  }
  if (!Number.isSafeInteger(options.maximumTtlMs) || options.maximumTtlMs <= 0) {
    throw new Error('INVALID_LOCAL_RATE_STORE_MAXIMUM_TTL')
  }
  const cleanupBatchSize = options.cleanupBatchSize ?? 100
  if (!Number.isSafeInteger(cleanupBatchSize) || cleanupBatchSize <= 0) {
    throw new Error('INVALID_LOCAL_RATE_STORE_CLEANUP_BATCH')
  }
  const maximums: Record<LocalRatePartition, number> = options.partitionMaximumEntries
    ? { ...options.partitionMaximumEntries }
    : { pinned_global: 0, authenticated: 0, source: options.maximumEntries }
  if (
    partitions.some((partition) =>
      !Number.isSafeInteger(maximums[partition]) || maximums[partition] < 0)
    || partitions.reduce((sum, partition) => sum + maximums[partition], 0)
      !== options.maximumEntries
  ) {
    throw new Error('INVALID_LOCAL_RATE_STORE_PARTITIONS')
  }
  const now = options.now ?? Date.now
  const sharedState: SharedStoreState = {
    partitions: {
      pinned_global: { buckets: new Map(), evictions: 0, expirations: 0 },
      authenticated: { buckets: new Map(), evictions: 0, expirations: 0 },
      source: { buckets: new Map(), evictions: 0, expirations: 0 },
    },
  }

  class Store implements BoundedRateStore {
    readonly #state: SharedStoreState

    constructor(candidate?: unknown) {
      const state = candidate as Partial<SharedStoreState> | undefined
      this.#state = state?.partitions ? state as SharedStoreState : sharedState
    }

    #pruneExpired(state: PartitionState, at: number): void {
      let inspected = 0
      for (const [key, bucket] of state.buckets) {
        if (inspected >= cleanupBatchSize) break
        inspected += 1
        if (bucket.expiresAt > at) continue
        state.buckets.delete(key)
        state.expirations += 1
      }
    }

    #result(key: string, increment: boolean, timeWindow: number): RateStoreResult {
      const partition = partitionForKey(key)
      const state = this.#state.partitions[partition]
      const maximum = maximums[partition]
      if (maximum <= 0) throw new Error(`LOCAL_RATE_PARTITION_DISABLED:${partition}`)
      const at = now()
      this.#pruneExpired(state, at)
      const existing = state.buckets.get(key)
      if (!existing || existing.expiresAt <= at) {
        if (!increment) return { current: 0, ttl: 0 }
        if (state.buckets.size >= maximum) {
          const oldestKey = state.buckets.keys().next().value as string | undefined
          if (oldestKey !== undefined) {
            state.buckets.delete(oldestKey)
            state.evictions += 1
          }
        }
        const bucket = {
          count: 1,
          expiresAt: at + Math.min(timeWindow, options.maximumTtlMs),
        }
        state.buckets.set(key, bucket)
        return { current: bucket.count, ttl: bucket.expiresAt - at }
      }

      if (increment) existing.count += 1
      state.buckets.delete(key)
      state.buckets.set(key, existing)
      return { current: existing.count, ttl: Math.max(0, existing.expiresAt - at) }
    }

    incr(key: string, callback: RateStoreCallback, timeWindow: number, _max: number): void {
      try {
        callback(null, this.#result(key, true, timeWindow))
      } catch (error) {
        callback(error instanceof Error ? error : new Error(String(error)))
      }
    }

    read(key: string, callback: RateStoreCallback, timeWindow: number, _max: number): void {
      try {
        callback(null, this.#result(key, false, timeWindow))
      } catch (error) {
        callback(error instanceof Error ? error : new Error(String(error)))
      }
    }

    child(): BoundedRateStore {
      return new Store(this.#state)
    }

    stats(): BoundedRateStoreStats {
      const result = Object.fromEntries(partitions.map((partition) => {
        const state = this.#state.partitions[partition]
        return [partition, {
          size: state.buckets.size,
          maximumEntries: maximums[partition],
          evictions: state.evictions,
          expirations: state.expirations,
        }]
      })) as Record<LocalRatePartition, BoundedRateStorePartitionStats>
      return {
        size: partitions.reduce((sum, partition) => sum + result[partition].size, 0),
        maximumEntries: options.maximumEntries,
        evictions: partitions.reduce((sum, partition) => sum + result[partition].evictions, 0),
        expirations: partitions.reduce((sum, partition) => sum + result[partition].expirations, 0),
        partitions: result,
      }
    }
  }

  return Store
}

export interface LocalRateLimiterOptions {
  readonly enabled: boolean
  readonly maximumBuckets: number
  readonly partitions?: Readonly<{
    readonly pinnedGlobal: number
    readonly authenticated: number
    readonly source: number
  }>
  readonly bucketTtlSeconds: number
  readonly cleanupBatchSize?: number
  readonly fingerprintKey: string | Buffer | Uint8Array
  readonly ipv6PrefixLength: number
  readonly sessionCookieName?: string
}

const policyFor = (request: FastifyRequest): RouteProtectionPolicy | null =>
  request.routeOptions.config?.abuseProtection ?? null

export const incrementBoundedRate = (
  store: BoundedRateStore,
  key: string,
  windowSeconds: number,
  maximum: number,
): Promise<RateStoreResult> => new Promise((resolve, reject) => {
  store.incr(key, (error, result) => {
    if (error) reject(error)
    else resolve(result!)
  }, windowSeconds * 1_000, maximum)
})

export const sendLocalRateLimitResponse = async (
  request: FastifyRequest,
  reply: FastifyReply,
  retryAfterSeconds: number,
): Promise<void> => {
  const response = buildRateLimitedResponse({
    code: 'RATE_LIMITED',
    requestId: request.id,
    retryAfterSeconds,
  })
  reply.status(response.statusCode)
  for (const [name, value] of Object.entries(response.headers)) reply.header(name, value)
  await reply.send(response.body)
}

const keyForPreAuthRate = (
  rate: LocalRateLimit,
  request: FastifyRequest,
  options: LocalRateLimiterOptions,
): string => {
  const value = rate.scope === 'global'
    ? `local:${rate.limitKey}`
    : request.abuseProtectionSourcePrefix
      ?? normalizeSourcePrefix(request.ip, options.ipv6PrefixLength)
  const digest = fingerprintSubject(options.fingerprintKey, {
    scope: rate.scope,
    value,
  }).toString('base64url')
  return `${rate.partition}|${rate.limitKey}|${rate.scope}|${digest}`
}

/** Registers unconditional source/global shedding before authentication. */
export const registerLocalRateLimiter = (
  app: FastifyInstance,
  options: LocalRateLimiterOptions,
): BoundedRateStore | null => {
  if (!options.enabled) return null
  const partitionMaximumEntries = options.partitions
    ? {
        pinned_global: options.partitions.pinnedGlobal,
        authenticated: options.partitions.authenticated,
        source: options.partitions.source,
      }
    : options.maximumBuckets >= 3
      ? {
          pinned_global: 1,
          authenticated: Math.max(1, Math.floor(options.maximumBuckets * 0.3)),
          source: options.maximumBuckets - 1 - Math.max(
            1,
            Math.floor(options.maximumBuckets * 0.3),
          ),
        }
      : { pinned_global: 0, authenticated: 0, source: options.maximumBuckets }
  const Store = createBoundedExpiringRateStore({
    maximumEntries: options.maximumBuckets,
    maximumTtlMs: options.bucketTtlSeconds * 1_000,
    partitionMaximumEntries,
    cleanupBatchSize: options.cleanupBatchSize,
  })
  const store = new Store()

  app.addHook('onRequest', async (request, reply) => {
    const policy = policyFor(request)
    if (!policy) return
    const configuredRates = policy.localRates.length > 0
      ? policy.localRates
      : policy.localRate
        ? [{
            ...policy.localRate,
            limitKey: `${policy.policyKey}.${policy.localRate.scope}`,
            partition: policy.localRate.scope === 'source_prefix'
              ? 'source' as const
              : 'authenticated' as const,
          }]
        : []
    const rates = configuredRates
      .filter((rate) => rate.scope === 'global' || rate.scope === 'source_prefix')
      .sort((left, right) => left.scope === 'global' && right.scope !== 'global' ? -1 : 1)
    for (const rate of rates) {
      const evictionsBefore = store.stats().partitions[rate.partition].evictions
      const decision = await incrementBoundedRate(
        store,
        keyForPreAuthRate(rate, request, options),
        rate.windowSeconds,
        rate.requests,
      )
      const evictionsAfter = store.stats().partitions[rate.partition].evictions
      if (evictionsAfter > evictionsBefore) {
        cloudWatchAbuseObservability.record({
          decision: 'failed',
          policyKey: policy.policyKey,
          routeClass: policy.routeClass,
          scopeKind: rate.scope,
          reasonCode: 'LOCAL_SOURCE_EVICTION',
          environment: config.nodeEnv,
          units: evictionsAfter - evictionsBefore,
          requestId: request.id,
        })
      }
      const allowed = decision.current <= rate.requests
      cloudWatchAbuseObservability.record({
        decision: allowed ? 'allowed' : 'throttled',
        policyKey: policy.policyKey,
        routeClass: policy.routeClass,
        scopeKind: rate.scope,
        reasonCode: rate.scope === 'global' ? 'LOCAL_GLOBAL_RATE' : 'LOCAL_SOURCE_RATE',
        environment: config.nodeEnv,
        requestId: request.id,
      })
      if (allowed) continue
      await sendLocalRateLimitResponse(request, reply, Math.ceil(decision.ttl / 1_000))
      return
    }
  })

  return store
}
