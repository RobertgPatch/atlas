import {
  evaluateSnapshotFreshness,
  getNextRefreshAt,
  getRefreshCutoffAt,
} from '../../src/modules/plaid/plaid.refresh-policy.js'
import type {
  HoldingsRefreshAttempt,
  HoldingsSnapshotMetadata,
  PlaidRefreshPolicy,
  RefreshLockResult,
} from '../../src/modules/plaid/plaid.repository.js'

export const buildRefreshPolicyFixture = (
  overrides: Partial<PlaidRefreshPolicy> = {},
): PlaidRefreshPolicy => ({
  id: '88888888-8888-4888-8888-888888888888',
  name: 'liquidity_default',
  cadence: 'daily',
  refreshTimeLocal: '05:00',
  timezone: 'America/Los_Angeles',
  staleAfterCutoff: true,
  manualRefreshEnabled: true,
  automaticRefreshEnabled: true,
  createdAt: '2026-05-10T12:00:00.000Z',
  updatedAt: '2026-05-10T12:00:00.000Z',
  ...overrides,
})

export const createPolicyClock = (isoTimestamp: string) => {
  const now = new Date(isoTimestamp)
  const policy = buildRefreshPolicyFixture()

  return {
    now,
    cutoffAt: getRefreshCutoffAt(policy, now),
    nextRefreshAt: getNextRefreshAt(policy, now),
    evaluate(snapshot: HoldingsSnapshotMetadata | null, activeAttempt?: HoldingsRefreshAttempt | null) {
      return evaluateSnapshotFreshness({
        policy,
        snapshot,
        activeAttempt,
        now,
      })
    },
  }
}

export const createRefreshLockSimulator = () => {
  const activeLocks = new Set<string>()
  const lockKey = (selectedAccountIds: string[]) =>
    selectedAccountIds.length > 0
      ? [...new Set(selectedAccountIds)].sort().join('|')
      : 'all'

  return {
    activeLocks,
    async withLock<T>(
      selectedAccountIds: string[],
      task: () => Promise<T>,
    ): Promise<RefreshLockResult<T>> {
      const key = lockKey(selectedAccountIds)
      if (activeLocks.has(key)) return { acquired: false }

      activeLocks.add(key)
      try {
        return {
          acquired: true,
          result: await task(),
        }
      } finally {
        activeLocks.delete(key)
      }
    },
  }
}

export const createPlaidCallSpy = <TArgs extends unknown[], TResult>(
  implementation: (...args: TArgs) => Promise<TResult>,
) => {
  const calls: TArgs[] = []

  return {
    calls,
    get callCount() {
      return calls.length
    },
    async call(...args: TArgs): Promise<TResult> {
      calls.push(args)
      return implementation(...args)
    },
  }
}
