import { config } from '../../config.js'
import { plaidRepository } from './plaid.repository.js'
import {
  evaluateSnapshotFreshness,
  getRefreshCutoffAt,
  type PlaidFreshnessEvaluation,
} from './plaid.refresh-policy.js'
import type {
  HoldingsRefreshAttempt,
  PlaidRefreshPolicy,
} from './plaid.repository.js'

export type ScheduledRefreshDecision =
  | 'ready'
  | 'already_running'
  | 'already_fresh'
  | 'disabled'
  | 'no_selected_accounts'

export interface ScheduledRefreshShellResult {
  decision: ScheduledRefreshDecision
  policy: PlaidRefreshPolicy
  selectedAccountIds: string[]
  freshness: PlaidFreshnessEvaluation
  activeAttempt: HoldingsRefreshAttempt | null
  scheduledFor: string
  warnings: string[]
}

const schedulerWarnings = () => {
  const warnings: string[] = []
  if (!config.plaidRefresh.schedulerEnabled) {
    warnings.push('PLAID_REFRESH_SCHEDULER_ENABLED is not true.')
  }
  if (config.plaidRefresh.schedulerMode === 'none') {
    warnings.push('PLAID_REFRESH_SCHEDULER_MODE is not configured.')
  }
  if (!config.plaidRefresh.schedulerToken) {
    warnings.push('ATLAS_SCHEDULER_TOKEN is not configured.')
  }
  return warnings
}

export const plaidRefreshScheduler = {
  getSchedulerWarnings(): string[] {
    return schedulerWarnings()
  },

  async evaluateScheduledRefresh(input?: {
    scheduledFor?: string | Date
    now?: Date
  }): Promise<ScheduledRefreshShellResult> {
    const now = input?.now ?? new Date()
    const scheduledFor =
      input?.scheduledFor instanceof Date
        ? input.scheduledFor
        : input?.scheduledFor
          ? new Date(input.scheduledFor)
          : now
    const policy = await plaidRepository.getRefreshPolicy()
    const selectedAccountIds = plaidRepository
      .getSelectedInvestmentAccounts()
      .map((account) => account.id)
    const activeAttempt =
      await plaidRepository.getActiveRefreshAttempt(selectedAccountIds)
    const latestSnapshot =
      await plaidRepository.getLatestHoldingsSnapshotMetadata({
        dashboardEligible: true,
        selectedAccountIds,
        successfulOnly: true,
      })
    const freshness = evaluateSnapshotFreshness({
      policy,
      snapshot: latestSnapshot,
      activeAttempt,
      now,
    })
    const warnings = [...schedulerWarnings(), ...freshness.warnings]

    if (!policy.automaticRefreshEnabled || !config.plaidRefresh.schedulerEnabled) {
      return {
        decision: 'disabled',
        policy,
        selectedAccountIds,
        freshness,
        activeAttempt,
        scheduledFor: scheduledFor.toISOString(),
        warnings,
      }
    }

    if (activeAttempt) {
      return {
        decision: 'already_running',
        policy,
        selectedAccountIds,
        freshness,
        activeAttempt,
        scheduledFor: scheduledFor.toISOString(),
        warnings,
      }
    }

    if (selectedAccountIds.length === 0) {
      return {
        decision: 'no_selected_accounts',
        policy,
        selectedAccountIds,
        freshness,
        activeAttempt,
        scheduledFor: scheduledFor.toISOString(),
        warnings,
      }
    }

    if (freshness.status === 'fresh') {
      return {
        decision: 'already_fresh',
        policy,
        selectedAccountIds,
        freshness,
        activeAttempt,
        scheduledFor: scheduledFor.toISOString(),
        warnings,
      }
    }

    return {
      decision: 'ready',
      policy,
      selectedAccountIds,
      freshness,
      activeAttempt,
      scheduledFor: scheduledFor.toISOString(),
      warnings,
    }
  },

  async createScheduledAttemptShell(input?: {
    scheduledFor?: string | Date
    now?: Date
  }): Promise<HoldingsRefreshAttempt | null> {
    const evaluation = await this.evaluateScheduledRefresh(input)
    if (evaluation.decision !== 'ready') return null

    return plaidRepository.createRefreshAttempt({
      policyId: evaluation.policy.id,
      triggerSource: 'scheduled',
      refreshReason: 'daily_cutoff',
      scheduledFor: evaluation.scheduledFor,
      freshnessCutoffAt: getRefreshCutoffAt(
        evaluation.policy,
        input?.now ?? new Date(),
      ).toISOString(),
      selectedAccountIds: evaluation.selectedAccountIds,
    })
  },
}
