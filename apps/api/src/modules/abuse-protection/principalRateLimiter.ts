import type { RouteProtectionPolicy } from './protection.types.js'
import type { ValidatedSubjectContext } from './subjectContext.js'
import {
  incrementBoundedRate,
  type BoundedRateStore,
} from './localRateLimiter.plugin.js'

export type PrincipalRateDecision =
  | { readonly allowed: true }
  | {
      readonly allowed: false
      readonly code: 'RATE_LIMITED' | 'PROTECTION_UNAVAILABLE'
      readonly retryAfterSeconds: number
    }

export class PrincipalRateLimiter {
  constructor(private readonly store: BoundedRateStore | null) {}

  async admit(
    policy: RouteProtectionPolicy,
    context: ValidatedSubjectContext,
  ): Promise<PrincipalRateDecision> {
    if (!this.store) return { allowed: true }
    const rates = policy.localRates.filter((rate) =>
      rate.scope === 'user' || rate.scope === 'session')
    try {
      for (const rate of rates) {
        const digest = context.aliases[rate.scope]?.[0]?.digest
        if (!digest) {
          cloudWatchAbuseObservability.record({
            decision: 'failed',
            policyKey: policy.policyKey,
            routeClass: policy.routeClass,
            scopeKind: rate.scope,
            reasonCode: 'HMAC_SUBJECT_MISSING',
            environment: config.nodeEnv,
          })
          return {
            allowed: false,
            code: 'PROTECTION_UNAVAILABLE',
            retryAfterSeconds: 30,
          }
        }
        const key = [
          rate.partition,
          rate.limitKey,
          rate.scope,
          digest.toString('base64url'),
        ].join('|')
        const decision = await incrementBoundedRate(
          this.store,
          key,
          rate.windowSeconds,
          rate.requests,
        )
        cloudWatchAbuseObservability.record({
          decision: decision.current > rate.requests ? 'throttled' : 'allowed',
          policyKey: policy.policyKey,
          routeClass: policy.routeClass,
          scopeKind: rate.scope,
          reasonCode: rate.scope === 'user' ? 'LOCAL_USER_RATE' : 'LOCAL_SESSION_RATE',
          environment: config.nodeEnv,
        })
        if (decision.current > rate.requests) {
          return {
            allowed: false,
            code: 'RATE_LIMITED',
            retryAfterSeconds: Math.max(1, Math.ceil(decision.ttl / 1_000)),
          }
        }
      }
      return { allowed: true }
    } catch {
      cloudWatchAbuseObservability.record({
        decision: 'failed',
        policyKey: policy.policyKey,
        routeClass: policy.routeClass,
        reasonCode: 'LOCAL_RATE_STORE_UNAVAILABLE',
        environment: config.nodeEnv,
      })
      return {
        allowed: false,
        code: 'PROTECTION_UNAVAILABLE',
        retryAfterSeconds: 30,
      }
    }
  }
}
import { config } from '../../config.js'
import { cloudWatchAbuseObservability } from './abuseObservability.js'
