import rateLimit from '@fastify/rate-limit'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

import { buildRateLimitedResponse } from './protection.errors.js'
import { fingerprintSubject, normalizeSourcePrefix } from './subjectFingerprint.js'
import type { RouteProtectionPolicy } from './protection.types.js'

interface RateBucket {
  count: number
  expiresAt: number
}

interface RateStoreResult {
  current: number
  ttl: number
}

type RateStoreCallback = (error: Error | null, result?: RateStoreResult) => void

interface SharedStoreState {
  readonly buckets: Map<string, RateBucket>
  evictions: number
  expirations: number
}

export interface BoundedRateStoreStats {
  readonly size: number
  readonly maximumEntries: number
  readonly evictions: number
  readonly expirations: number
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
  readonly cleanupBatchSize?: number
  readonly now?: () => number
}

export type BoundedRateStoreConstructor = new (options?: unknown) => BoundedRateStore

/**
 * Store constructor for @fastify/rate-limit. Every child shares one bounded
 * LRU-like map so adding route classes cannot multiply the memory ceiling.
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
  const now = options.now ?? Date.now

  class Store implements BoundedRateStore {
    readonly #state: SharedStoreState

    constructor(candidate?: unknown) {
      const state = candidate as Partial<SharedStoreState> | undefined
      this.#state = state?.buckets instanceof Map
        ? state as SharedStoreState
        : {
            buckets: new Map<string, RateBucket>(),
            evictions: 0,
            expirations: 0,
          }
    }

    #pruneExpired(at: number): void {
      let inspected = 0
      for (const [key, bucket] of this.#state.buckets) {
        if (inspected >= cleanupBatchSize) break
        inspected += 1
        if (bucket.expiresAt > at) continue
        this.#state.buckets.delete(key)
        this.#state.expirations += 1
      }
    }

    #result(key: string, increment: boolean, timeWindow: number): RateStoreResult {
      const at = now()
      this.#pruneExpired(at)
      const existing = this.#state.buckets.get(key)
      if (!existing || existing.expiresAt <= at) {
        if (!increment) return { current: 0, ttl: 0 }
        if (this.#state.buckets.size >= options.maximumEntries) {
          const oldestKey = this.#state.buckets.keys().next().value as string | undefined
          if (oldestKey !== undefined) {
            this.#state.buckets.delete(oldestKey)
            this.#state.evictions += 1
          }
        }
        const bucket = {
          count: 1,
          expiresAt: at + Math.min(timeWindow, options.maximumTtlMs),
        }
        this.#state.buckets.set(key, bucket)
        return { current: bucket.count, ttl: bucket.expiresAt - at }
      }

      if (increment) existing.count += 1
      // Moving a touched key to the end makes the bounded eviction policy LRU.
      this.#state.buckets.delete(key)
      this.#state.buckets.set(key, existing)
      return { current: existing.count, ttl: Math.max(0, existing.expiresAt - at) }
    }

    incr(
      key: string,
      callback: RateStoreCallback,
      timeWindow: number,
      _max: number,
    ): void {
      try {
        callback(null, this.#result(key, true, timeWindow))
      } catch (error) {
        callback(error instanceof Error ? error : new Error(String(error)))
      }
    }

    read(
      key: string,
      callback: RateStoreCallback,
      timeWindow: number,
      _max: number,
    ): void {
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
      return {
        size: this.#state.buckets.size,
        maximumEntries: options.maximumEntries,
        evictions: this.#state.evictions,
        expirations: this.#state.expirations,
      }
    }
  }

  return Store
}

export interface LocalRateLimiterOptions {
  readonly enabled: boolean
  readonly maximumBuckets: number
  readonly bucketTtlSeconds: number
  readonly cleanupBatchSize?: number
  readonly fingerprintKey: string | Buffer | Uint8Array
  readonly ipv6PrefixLength: number
  readonly sessionCookieName?: string
}

const policyFor = (request: FastifyRequest): RouteProtectionPolicy | null =>
  request.routeOptions.config?.abuseProtection ?? null

const sessionTokenFor = (
  request: FastifyRequest,
  cookieName: string,
): string | null => {
  const parsed = request.cookies?.[cookieName]
  if (parsed && parsed.length <= 4_096) return parsed
  const header = request.headers.cookie
  if (!header || header.length > 16_384) return null
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator < 1 || part.slice(0, separator).trim() !== cookieName) continue
    const value = part.slice(separator + 1).trim()
    return value.length > 0 && value.length <= 4_096 ? value : null
  }
  return null
}

const sendRateLimitResponse = async (
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

/**
 * Registers one bounded process-local shedding layer. Exact paid-work limits
 * remain the responsibility of durable admission; this hook only rejects
 * obvious excess before authentication or business handlers run.
 */
export const registerLocalRateLimiter = (
  app: FastifyInstance,
  options: LocalRateLimiterOptions,
): void => {
  if (!options.enabled) return
  const Store = createBoundedExpiringRateStore({
    maximumEntries: options.maximumBuckets,
    maximumTtlMs: options.bucketTtlSeconds * 1_000,
    cleanupBatchSize: options.cleanupBatchSize,
  })
  const sessionCookieName = options.sessionCookieName ?? 'atlas_session'

  app.register(rateLimit, {
    global: false,
    store: Store,
    skipOnError: false,
    ipv6Subnet: options.ipv6PrefixLength,
    cache: options.maximumBuckets,
  })

  type Limiter = ReturnType<FastifyInstance['createRateLimit']>
  let limiter: Limiter | null = null
  app.addHook('onRequest', async (request, reply) => {
    const policy = policyFor(request)
    if (!policy?.localRate) return
    limiter ??= request.server.createRateLimit({
      max: (nextRequest) => policyFor(nextRequest)?.localRate?.requests ?? 1,
      timeWindow: (nextRequest) =>
        (policyFor(nextRequest)?.localRate?.windowSeconds ?? 1) * 1_000,
      keyGenerator: (nextRequest) => {
        const nextPolicy = policyFor(nextRequest)
        if (!nextPolicy) throw new Error('LOCAL_RATE_POLICY_MISSING')
        const authenticated = nextPolicy.authentication === 'session'
          || nextPolicy.authentication === 'admin'
        const sessionToken = authenticated
          ? sessionTokenFor(nextRequest, sessionCookieName)
          : null
        if (sessionToken) {
          const digest = fingerprintSubject(options.fingerprintKey, {
            scope: 'session',
            value: sessionToken,
          }).toString('base64url')
          return `${nextPolicy.policyKey}:session:${digest}`
        }
        const normalizedSource = normalizeSourcePrefix(
          nextRequest.ip,
          options.ipv6PrefixLength,
        )
        const digest = fingerprintSubject(options.fingerprintKey, {
          scope: 'source_prefix',
          value: normalizedSource,
        }).toString('base64url')
        return `${nextPolicy.policyKey}:source:${digest}`
      },
    })

    const decision = await limiter(request)
    if (decision.isAllowed || !decision.isExceeded) return
    await sendRateLimitResponse(request, reply, decision.ttlInSeconds)
  })
}
