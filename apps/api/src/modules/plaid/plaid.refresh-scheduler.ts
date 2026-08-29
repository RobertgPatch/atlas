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
import { plaidHoldingsSync, RefreshAlreadyRunningError } from './plaid.holdings-sync.js'

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

export interface ScheduledRefreshRunInput {
  scheduledFor?: string | Date
  force?: boolean
  now?: Date
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
    warnings.push('PROJECT_JACKSON_SCHEDULER_TOKEN is not configured.')
  }
  return warnings
}

const logRefreshEvent = (
  event: string,
  payload: Record<string, string | number | boolean | null | undefined>,
) => {
  if (config.nodeEnv === 'test') return
  console.info(JSON.stringify({ event, ...payload }))
}

export const plaidRefreshScheduler = {
  getSchedulerWarnings(): string[] {
    return schedulerWarnings()
  },

  async evaluateScheduledRefresh(input?: {
    scheduledFor?: string | Date
    now?: Date
  }): Promise<ScheduledRefreshShellResult> {
    const scheduledFor =
      input?.scheduledFor instanceof Date
        ? input.scheduledFor
        : input?.scheduledFor
          ? new Date(input.scheduledFor)
          : new Date()
    const now = input?.now ?? scheduledFor
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

  async runScheduledRefresh(
    input: ScheduledRefreshRunInput = {},
  ): Promise<HoldingsRefreshAttempt> {
    const scheduledFor =
      input.scheduledFor instanceof Date
        ? input.scheduledFor.toISOString()
        : input.scheduledFor ?? new Date().toISOString()

    try {
      const attempt = await plaidHoldingsSync.syncSelectedHoldings({
        requestedByUserId: null,
        triggerSource: 'scheduled',
        force: input.force ?? false,
        scheduledFor,
        now: input.now ?? new Date(scheduledFor),
      })
      logRefreshEvent('plaid_refresh_scheduled_finished', {
        attemptId: attempt.id,
        status: attempt.status,
        refreshReason: attempt.refreshReason,
        selectedAccountCount: attempt.selectedAccountIds.length,
        scheduledFor,
        dataAsOfDate: attempt.dataAsOfDate,
      })
      return attempt
    } catch (error) {
      if (error instanceof RefreshAlreadyRunningError) {
        logRefreshEvent('plaid_refresh_scheduled_conflict', {
          activeRefreshId: error.activeRefreshId,
          scheduledFor,
        })
      } else {
        logRefreshEvent('plaid_refresh_scheduled_error', {
          scheduledFor,
          errorName: error instanceof Error ? error.name : 'UnknownError',
        })
      }
      throw error
    }
  },
}
