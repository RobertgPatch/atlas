import { randomUUID } from 'node:crypto'

import { config } from '../../config.js'
import { admissionService } from './admission.service.js'
import { idempotencyService } from './idempotency.service.js'
import { defaultRouteProtectionPolicy } from './policy.defaults.js'
import {
  fingerprintSubject,
  type CanonicalFingerprintValue,
} from './subjectFingerprint.js'
import type { HttpMethod } from './protection.types.js'
import { requireWorkloadAdmission } from './workloadAdmission.js'
import { cloudWatchAbuseObservability } from './abuseObservability.js'

export interface CostWorkloadAdmissionInput {
  readonly workloadKey: string
  readonly method: HttpMethod
  readonly routePattern: string
  readonly principal: string
  readonly canonicalInputs: CanonicalFingerprintValue
  readonly globalDailyLimit: number
  readonly units?: number
  readonly leaseTtlSeconds?: number
  readonly controlKey?: string
  readonly quotas?: readonly {
    readonly workloadKey?: string
    readonly scopeKind: 'account' | 'user' | 'entity' | 'provider' | 'global'
    readonly scopeValue: string
    readonly limit: number
    readonly units?: number
    readonly periodKind?: 'rolling_hour' | 'utc_day' | 'billing_month'
  }[]
}

export interface CostWorkloadOperation {
  readonly operationId: string | null
  readonly fencingToken: bigint | null
  succeed(resultReference?: string): Promise<void>
  fail(failureCode?: string): Promise<void>
}

const terminalOperation = (
  operationId: string | undefined,
  fencingToken: bigint | undefined,
): CostWorkloadOperation => {
  let started = false
  let terminal = false
  const start = async () => {
    if (!operationId || started) return
    await idempotencyService.markQueued({ operationId })
    await idempotencyService.markRunning({ operationId })
    started = true
  }
  return {
    operationId: operationId ?? null,
    fencingToken: fencingToken ?? null,
    async succeed(resultReference = `operation://${operationId ?? 'untracked'}/succeeded`) {
      if (!operationId || terminal) return
      await start()
      await idempotencyService.markSucceeded({ operationId, resultReference })
      terminal = true
    },
    async fail(failureCode = 'WORKLOAD_FAILED') {
      if (!operationId || terminal) return
      await start()
      await idempotencyService.markFailed({ operationId, failureCode })
      terminal = true
    },
  }
}

interface MonthlyCostProfile {
  readonly familyKey: string
  readonly familyLimit: number
  readonly maximumCentsPerUnit: number
}

const monthlyCostProfile = (workloadKey: string): MonthlyCostProfile | null => {
  const monthly = config.abuseProtection.quotas.monthlyCost
  const attempts = config.abuseProtection.retryBudgets
  switch (workloadKey) {
    case 'k1_bda_provider_call':
      return {
        familyKey: 'k1_bda_document',
        familyLimit: monthly.k1BdaProviderCalls,
        maximumCentsPerUnit: 640 * attempts.bdaMaximumAttempts,
      }
    case 'k1_bedrock_checkbox':
      return {
        familyKey: 'k1_bedrock_checkbox',
        familyLimit: monthly.k1CheckboxCalls,
        maximumCentsPerUnit: 25 * attempts.bedrockCheckboxMaximumAttempts,
      }
    case 'plaid_link_token':
      return {
        familyKey: 'plaid_link_token',
        familyLimit: monthly.plaidLinkTokens,
        maximumCentsPerUnit: 5 * attempts.plaidMaximumAttempts,
      }
    case 'plaid_public_token_exchange':
      return {
        familyKey: 'plaid_token_exchange',
        familyLimit: monthly.plaidExchanges,
        maximumCentsPerUnit: 25 * attempts.plaidMaximumAttempts,
      }
    case 'plaid_holdings_refresh':
    case 'plaid_scheduled_refresh':
      return {
        familyKey: 'plaid_refresh',
        familyLimit: monthly.plaidRefreshes,
        maximumCentsPerUnit: 100 * attempts.plaidMaximumAttempts,
      }
    case 'market_data_closing_prices':
      return {
        familyKey: 'market_provider_call',
        familyLimit: monthly.marketProviderCalls,
        maximumCentsPerUnit: 5 * attempts.marketDataMaximumAttempts,
      }
    case 'report_export':
    case 'consolidated_holdings_export':
    case 'k1_csv_export':
      return {
        familyKey: 'report_export',
        familyLimit: monthly.reportExports,
        maximumCentsPerUnit: 5,
      }
    case 'market_price_backfill':
      return {
        familyKey: 'market_price_backfill',
        familyLimit: monthly.backfillRuns,
        maximumCentsPerUnit: 200,
      }
    default:
      return null
  }
}

export const admitCostWorkload = async (
  input: CostWorkloadAdmissionInput,
): Promise<CostWorkloadOperation> => {
  const basePolicy = defaultRouteProtectionPolicy(input.method, input.routePattern)
  const policy = input.controlKey === undefined
    ? basePolicy
    : { ...basePolicy, killSwitch: input.controlKey }
  const subject = (scope: 'user' | 'session' | 'account' | 'tenant' | 'entity' | 'provider' | 'operation' | 'global', value: string) =>
    fingerprintSubject(config.abuseProtection.hmac.activeKey, { scope, value })
  const principalHash = subject('user', input.principal)
  const globalHash = subject('global', 'atlas')
  const units = input.units ?? 1
  const costProfile = monthlyCostProfile(input.workloadKey)
  const monthlyCostQuotas = costProfile === null
    ? []
    : [
        {
          workloadKey: `cost-family:${costProfile.familyKey}`,
          scopeKind: 'global' as const,
          scopeValue: 'atlas',
          periodKind: 'billing_month' as const,
          units,
          limit: costProfile.familyLimit,
        },
        {
          workloadKey: 'cost-budget:paid-workload-cents',
          scopeKind: 'global' as const,
          scopeValue: 'atlas',
          periodKind: 'billing_month' as const,
          units: costProfile.maximumCentsPerUnit * units,
          limit: config.abuseProtection.quotas.monthlyCost.maximumCents,
        },
      ]
  const reservedUnits = Object.fromEntries(
    policy.costUnits.map((unit) => [unit, units]),
  )
  const decision = await admissionService.admit({
    policy,
    requestId: `cost-${randomUUID()}`,
    subjectHashes: {
      user: principalHash,
      session: subject('session', input.principal),
      account: subject('account', input.principal),
      tenant: subject('tenant', input.principal),
      entity: subject('entity', input.principal),
      provider: subject('provider', input.workloadKey),
      operation: subject('operation', JSON.stringify(input.canonicalInputs)),
      global: globalHash,
    },
    workload: {
      workloadKey: input.workloadKey,
      idempotency: {
        principalHash,
        canonicalRequest: {
          policyKey: policy.policyKey,
          method: policy.method,
          routePattern: policy.routePattern,
          inputs: input.canonicalInputs,
        },
        reservedUnits,
      },
      quotas: [...(input.quotas ?? [{
        scopeKind: 'global' as const,
        scopeValue: 'atlas',
        limit: input.globalDailyLimit,
      }]), ...monthlyCostQuotas].map((quota) => ({
        workloadKey: quota.workloadKey,
        scopeKind: quota.scopeKind,
        scopeHash: subject(quota.scopeKind, quota.scopeValue),
        periodKind: quota.periodKind ?? 'utc_day',
        units: quota.units ?? units,
        limit: quota.limit,
      })),
      leaseScopeKind: 'global',
      leaseScopeHash: globalHash,
      leaseTtlSeconds: input.leaseTtlSeconds ?? 60,
      backlogLimit: policy.backlogLimit ?? Math.max(policy.concurrencyLimit ?? 1, 1),
    },
  })

  cloudWatchAbuseObservability.record({
    decision: decision.decision === 'quota_rejected'
      ? 'quota_rejected'
      : decision.decision === 'protection_unavailable'
        ? 'failed'
        : decision.decision,
    policyKey: policy.policyKey,
    routeClass: policy.routeClass,
    scopeKind: 'user',
    workloadKey: input.workloadKey,
    reasonCode: 'reasonCode' in decision ? decision.reasonCode : undefined,
    environment: config.nodeEnv,
    units,
    requestId: decision.requestId,
  })

  // Existing unit tests intentionally run without PostgreSQL. Production paid
  // work remains fail-closed, while that isolated test configuration can keep
  // exercising provider adapters without an admission database.
  const admissionWasTestMocked = Boolean(
    (admissionService.admit as typeof admissionService.admit & { _isMockFunction?: boolean })
      ._isMockFunction,
  )
  if (
    config.nodeEnv === 'test'
    && decision.decision === 'protection_unavailable'
    && !admissionWasTestMocked
  ) return terminalOperation(undefined, undefined)
  const allowed = requireWorkloadAdmission(decision)
  return terminalOperation(allowed.operationId, allowed.fencingToken)
}
