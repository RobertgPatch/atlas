import { randomUUID } from 'node:crypto'
import type { Holding, InvestmentAccount, Security } from 'plaid'
import { auditRepository } from '../audit/audit.repository.js'
import { PARTNERSHIP_AUDIT_EVENTS } from '../audit/audit.events.js'
import { callPlaidWithRetry, plaidApi, isPlaidConfigured } from './plaid.client.js'
import {
  evaluateSnapshotFreshness,
  getRefreshCutoffAt,
} from './plaid.refresh-policy.js'
import {
  plaidRepository,
  type HoldingsRefreshAttempt,
  type HoldingsRefreshReason,
  type HoldingsRefreshTriggerSource,
  type HoldingsSyncSnapshot,
  type PlaidInvestmentAccount,
  type SourceHoldingRecord,
} from './plaid.repository.js'

export class RefreshAlreadyRunningError extends Error {
  constructor(public readonly activeRefreshId: string) {
    super('REFRESH_ALREADY_RUNNING')
  }
}

export interface SyncSelectedHoldingsInput {
  requestedByUserId?: string | null
  triggerSource?: HoldingsRefreshTriggerSource
  force?: boolean
  scheduledFor?: string | Date | null
  now?: Date
}

const typeLabel = (type: string | null | undefined): string => {
  switch (type?.toLowerCase()) {
    case 'etf':
      return 'ETF'
    case 'equity':
      return 'Stock'
    case 'mutual fund':
      return 'Mutual Fund'
    case 'cash':
      return 'Cash'
    case 'cryptocurrency':
      return 'Crypto'
    case 'fixed income':
      return 'Fixed Income'
    default:
      return type || 'Other'
  }
}

const mapPlaidAccount = (
  connectionId: string,
  custodianName: string,
  selected: boolean,
  existing: PlaidInvestmentAccount | undefined,
  account: InvestmentAccount,
): PlaidInvestmentAccount => ({
  id: account.account_id,
  connectionId,
  custodianName,
  name: account.name,
  officialName: account.official_name ?? null,
  mask: account.mask ?? null,
  type: String(account.type ?? 'investment'),
  subtype: account.subtype ? String(account.subtype) : null,
  selectedForHoldingsReport: selected,
  syncStatus: existing?.syncStatus ?? 'never_synced',
  lastSyncedAt: existing?.lastSyncedAt ?? null,
})

const mapHolding = (
  snapshotId: string,
  holding: Holding,
  security: Security | undefined,
): SourceHoldingRecord => {
  const marketValue = holding.institution_value ?? null
  const costBasis = holding.cost_basis ?? null
  const unrealizedGainLoss =
    marketValue != null && costBasis != null ? marketValue - costBasis : null

  return {
    id: randomUUID(),
    syncSnapshotId: snapshotId,
    accountId: holding.account_id,
    plaidAccountId: holding.account_id,
    plaidSecurityId: holding.security_id ?? null,
    symbol: security?.ticker_symbol ?? null,
    description: security?.name ?? security?.ticker_symbol ?? 'Unidentified holding',
    type: typeLabel(security?.type),
    sector: security?.sector ?? null,
    industry: security?.industry ?? null,
    cusip: security?.cusip ?? null,
    isin: security?.isin ?? null,
    currencyCode: holding.iso_currency_code ?? security?.iso_currency_code ?? null,
    quantity: holding.quantity ?? null,
    costBasis,
    institutionPrice: holding.institution_price ?? security?.close_price ?? null,
    marketValue,
    unrealizedGainLoss,
    asOfDate:
      holding.institution_price_as_of ??
      security?.close_price_as_of ??
      security?.update_datetime ??
      null,
  }
}

const dateOnly = (value: string | null): string | null => value?.slice(0, 10) ?? null

const holdingDateRange = (holdings: SourceHoldingRecord[], fallbackDate: string) => {
  const dates = holdings
    .map((holding) => dateOnly(holding.asOfDate))
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => left.localeCompare(right))

  const earliest = dates[0] ?? fallbackDate
  const latest = dates.length > 0 ? dates[dates.length - 1]! : fallbackDate

  return {
    dataAsOfDate: latest,
    dataAsOfMinDate: earliest,
    dataAsOfMaxDate: latest,
  }
}

const dashboardEligible = (
  status: HoldingsSyncSnapshot['status'],
  holdingsCount: number,
) =>
  (status === 'success' || status === 'partial_success') && holdingsCount > 0

const normalizeSyncInput = (
  input: string | SyncSelectedHoldingsInput,
): Required<Omit<SyncSelectedHoldingsInput, 'now' | 'scheduledFor'>> & {
  now: Date
  scheduledFor: string | null
} => {
  if (typeof input === 'string') {
    return {
      requestedByUserId: input,
      triggerSource: 'manual',
      force: false,
      now: new Date(),
      scheduledFor: null,
    }
  }

  const now = input.now ?? new Date()
  return {
    requestedByUserId: input.requestedByUserId ?? null,
    triggerSource: input.triggerSource ?? 'manual',
    force: input.force ?? false,
    now,
    scheduledFor:
      input.scheduledFor instanceof Date
        ? input.scheduledFor.toISOString()
        : input.scheduledFor ?? null,
  }
}

const refreshReasonFor = (input: {
  triggerSource: HoldingsRefreshTriggerSource
  force: boolean
  hasSnapshot: boolean
  freshnessStatus: string
}): HoldingsRefreshReason => {
  if (input.force) return 'forced'
  if (input.triggerSource === 'scheduled') return 'daily_cutoff'
  if (!input.hasSnapshot) return 'missing_snapshot'
  if (input.freshnessStatus === 'stale') return 'stale_snapshot'
  return 'manual'
}

const auditEventForAttempt = (attempt: HoldingsRefreshAttempt) => {
  if (attempt.status === 'skipped') return PARTNERSHIP_AUDIT_EVENTS.PLAID_REFRESH_SKIPPED
  if (attempt.status === 'failed') return PARTNERSHIP_AUDIT_EVENTS.PLAID_REFRESH_FAILED
  if (attempt.triggerSource === 'scheduled') {
    return PARTNERSHIP_AUDIT_EVENTS.PLAID_REFRESH_SCHEDULED
  }
  return PARTNERSHIP_AUDIT_EVENTS.PLAID_REFRESH_MANUAL
}

const safeAttemptAuditPayload = (attempt: HoldingsRefreshAttempt) => ({
  id: attempt.id,
  triggerSource: attempt.triggerSource,
  refreshReason: attempt.refreshReason,
  status: attempt.status,
  startedAt: attempt.startedAt,
  completedAt: attempt.completedAt,
  scheduledFor: attempt.scheduledFor,
  freshnessCutoffAt: attempt.freshnessCutoffAt,
  selectedAccountCount: attempt.selectedAccountIds.length,
  dataAsOfDate: attempt.dataAsOfDate,
  errorType: attempt.errorType,
  errorCode: attempt.errorCode,
  errorMessage: attempt.errorMessage,
})

const recordRefreshAudit = async (attempt: HoldingsRefreshAttempt) => {
  await auditRepository.record({
    actorUserId: attempt.requestedByUserId ?? undefined,
    eventName: auditEventForAttempt(attempt),
    objectType: 'holdings_refresh_attempt',
    objectId: attempt.id,
    after: safeAttemptAuditPayload(attempt),
  })
}

const recordDuplicateRefreshAudit = async (input: {
  requestedByUserId: string | null
  triggerSource: HoldingsRefreshTriggerSource
  selectedAccountIds: string[]
  activeRefreshId: string
}) => {
  await auditRepository.record({
    actorUserId: input.requestedByUserId ?? undefined,
    eventName: PARTNERSHIP_AUDIT_EVENTS.PLAID_REFRESH_DUPLICATE,
    objectType: 'holdings_refresh_attempt',
    objectId: input.activeRefreshId,
    after: {
      triggerSource: input.triggerSource,
      selectedAccountCount: input.selectedAccountIds.length,
      activeRefreshId: input.activeRefreshId,
    },
  })
}

const finalizeAttempt = async (
  attempt: HoldingsRefreshAttempt,
  input: {
    status: Exclude<HoldingsRefreshAttempt['status'], 'pending'>
    dataAsOfDate?: string | null
    errorType?: string | null
    errorCode?: string | null
    errorMessage?: string | null
    completedAt?: string
  },
) => {
  const updated =
    (await plaidRepository.finalizeRefreshAttempt(attempt.id, input)) ?? {
      ...attempt,
      ...input,
      completedAt: input.completedAt ?? new Date().toISOString(),
    }
  await recordRefreshAudit(updated)
  return updated
}

export const plaidHoldingsSync = {
  async syncSelectedHoldings(
    input: string | SyncSelectedHoldingsInput,
  ): Promise<HoldingsRefreshAttempt> {
    const request = normalizeSyncInput(input)
    const selectedAccounts = plaidRepository.getSelectedInvestmentAccounts()
    const selectedByConnection = plaidRepository.getSelectedInvestmentAccountsByConnection()
    const selectedAccountIds = selectedAccounts.map((account) => account.id)
    const activeAttempt =
      await plaidRepository.getActiveRefreshAttempt(selectedAccountIds)

    if (activeAttempt) {
      await recordDuplicateRefreshAudit({
        requestedByUserId: request.requestedByUserId,
        triggerSource: request.triggerSource,
        selectedAccountIds,
        activeRefreshId: activeAttempt.id,
      })
      throw new RefreshAlreadyRunningError(activeAttempt.id)
    }

    const locked = await plaidRepository.withSelectedAccountsRefreshLock(
      selectedAccountIds,
      async () => {
        const policy = await plaidRepository.getRefreshPolicy()
        const latestSnapshot =
          selectedAccountIds.length > 0
            ? await plaidRepository.getLatestHoldingsSnapshotMetadata({
                dashboardEligible: true,
                selectedAccountIds,
                successfulOnly: true,
              })
            : null
        const freshness = evaluateSnapshotFreshness({
          policy,
          snapshot: latestSnapshot,
          now: request.now,
        })

        if (!request.force && freshness.status === 'fresh') {
          const skipped = await plaidRepository.createRefreshAttempt({
            policyId: policy.id,
            requestedByUserId: request.requestedByUserId,
            triggerSource: request.triggerSource,
            refreshReason: 'already_fresh',
            status: 'skipped',
            scheduledFor: request.scheduledFor,
            freshnessCutoffAt: freshness.cutoffAt,
            selectedAccountIds,
            dataAsOfDate: latestSnapshot?.dataAsOfDate ?? null,
          })
          await recordRefreshAudit(skipped)
          return skipped
        }

        const refreshReason = refreshReasonFor({
          triggerSource: request.triggerSource,
          force: request.force,
          hasSnapshot: Boolean(latestSnapshot),
          freshnessStatus: freshness.status,
        })
        const attempt = await plaidRepository.createRefreshAttempt({
          policyId: policy.id,
          requestedByUserId: request.requestedByUserId,
          triggerSource: request.triggerSource,
          refreshReason,
          scheduledFor: request.scheduledFor,
          freshnessCutoffAt: getRefreshCutoffAt(policy, request.now).toISOString(),
          selectedAccountIds,
        })

        const snapshot = plaidRepository.createSyncSnapshot({
          requestedByUserId: request.requestedByUserId,
          selectedAccountIds,
          status: 'pending',
          refreshAttemptId: attempt.id,
        })

        if (selectedAccountIds.length === 0) {
          plaidRepository.createSyncSnapshot({
            id: snapshot.id,
            requestedByUserId: request.requestedByUserId,
            selectedAccountIds,
            status: 'failed',
            startedAt: snapshot.startedAt,
            completedAt: new Date().toISOString(),
            refreshAttemptId: attempt.id,
            errorMessage: 'No Plaid investment accounts selected.',
          })
          await plaidRepository.flushPersistenceWrites()
          return finalizeAttempt(attempt, {
            status: 'failed',
            errorType: 'NO_SELECTED_ACCOUNTS',
            errorMessage: 'No Plaid investment accounts selected.',
          })
        }

        if (!isPlaidConfigured()) {
          plaidRepository.createSyncSnapshot({
            id: snapshot.id,
            requestedByUserId: request.requestedByUserId,
            selectedAccountIds,
            status: 'failed',
            startedAt: snapshot.startedAt,
            completedAt: new Date().toISOString(),
            refreshAttemptId: attempt.id,
            errorMessage: 'Plaid credentials are not configured.',
          })
          await plaidRepository.flushPersistenceWrites()
          return finalizeAttempt(attempt, {
            status: 'failed',
            errorType: 'PLAID_UNAVAILABLE',
            errorMessage: 'Plaid credentials are not configured.',
          })
        }

        if (selectedByConnection.length === 0) {
          plaidRepository.createSyncSnapshot({
            id: snapshot.id,
            requestedByUserId: request.requestedByUserId,
            selectedAccountIds,
            status: 'failed',
            startedAt: snapshot.startedAt,
            completedAt: new Date().toISOString(),
            refreshAttemptId: attempt.id,
            errorMessage: 'No connected Plaid Items found for selected accounts.',
          })
          await plaidRepository.flushPersistenceWrites()
          return finalizeAttempt(attempt, {
            status: 'failed',
            errorType: 'NO_CONNECTED_ITEMS',
            errorMessage: 'No connected Plaid Items found for selected accounts.',
          })
        }

        const sourceHoldings: SourceHoldingRecord[] = []
        const warnings: string[] = []
        const failedAccountIds = new Set<string>()

        for (const { connection, accounts } of selectedByConnection) {
          try {
            const response = await callPlaidWithRetry((signal) => plaidApi.investmentsHoldingsGet({
              access_token: connection.accessToken,
              options: {
                account_ids: accounts.map((account) => account.id),
              },
            }, { signal }))
            const securitiesById = new Map(
              response.data.securities.map((security) => [security.security_id, security]),
            )

            for (const plaidAccount of response.data.accounts) {
              const existing = plaidRepository
                .listInvestmentAccounts()
                .find((account) => account.id === plaidAccount.account_id)
              const selected = selectedAccountIds.includes(plaidAccount.account_id)
              Object.assign(
                existing ?? {},
                mapPlaidAccount(
                  connection.id,
                  connection.institutionName,
                  selected,
                  existing,
                  plaidAccount,
                ),
              )
            }

            sourceHoldings.push(
              ...response.data.holdings.map((holding) =>
                mapHolding(snapshot.id, holding, securitiesById.get(holding.security_id)),
              ),
            )
          } catch (error) {
            warnings.push(
              `${connection.institutionName}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            )
            for (const account of accounts) {
              failedAccountIds.add(account.id)
              plaidRepository.markAccountStatus(account.id, 'failed')
            }
          }
        }

        const status: HoldingsSyncSnapshot['status'] =
          sourceHoldings.length === 0
            ? 'failed'
            : warnings.length === 0
              ? 'success'
              : 'partial_success'
        const completedAt = new Date().toISOString()
        const dateRange =
          sourceHoldings.length > 0
            ? holdingDateRange(sourceHoldings, completedAt.slice(0, 10))
            : {
                dataAsOfDate: null,
                dataAsOfMinDate: null,
                dataAsOfMaxDate: null,
              }
        const errorMessage =
          warnings.join('; ') ||
          (sourceHoldings.length === 0 ? 'No holdings were saved from Plaid.' : null)

        if (sourceHoldings.length > 0) {
          plaidRepository.replaceSourceHoldingsForSnapshot(snapshot.id, sourceHoldings)
        }

        plaidRepository.createSyncSnapshot({
          id: snapshot.id,
          requestedByUserId: request.requestedByUserId,
          selectedAccountIds,
          status,
          startedAt: snapshot.startedAt,
          completedAt,
          refreshAttemptId: attempt.id,
          errorMessage,
          ...dateRange,
          fetchedAt: completedAt,
          dashboardEligible: dashboardEligible(status, sourceHoldings.length),
          holdingsCount: sourceHoldings.length,
        })

        for (const accountId of failedAccountIds) {
          plaidRepository.markAccountStatus(accountId, 'failed')
        }
        await plaidRepository.flushPersistenceWrites()

        return finalizeAttempt(attempt, {
          status,
          dataAsOfDate: dateRange.dataAsOfDate,
          errorType: status === 'failed' ? 'PLAID_REFRESH_FAILED' : null,
          errorMessage,
          completedAt,
        })
      },
    )

    if (!locked.acquired || !locked.result) {
      const active = await plaidRepository.getActiveRefreshAttempt(selectedAccountIds)
      const activeRefreshId = active?.id ?? randomUUID()
      await recordDuplicateRefreshAudit({
        requestedByUserId: request.requestedByUserId,
        triggerSource: request.triggerSource,
        selectedAccountIds,
        activeRefreshId,
      })
      throw new RefreshAlreadyRunningError(activeRefreshId)
    }

    return locked.result
  },
}
