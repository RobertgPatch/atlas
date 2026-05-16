import { randomUUID } from 'node:crypto'
import type { Holding, InvestmentAccount, Security } from 'plaid'
import { plaidApi, isPlaidConfigured } from './plaid.client.js'
import {
  plaidRepository,
  type HoldingsSyncSnapshot,
  type PlaidInvestmentAccount,
  type SourceHoldingRecord,
} from './plaid.repository.js'

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

export const plaidHoldingsSync = {
  async syncSelectedHoldings(requestedByUserId: string): Promise<HoldingsSyncSnapshot> {
    const selectedAccounts = plaidRepository.getSelectedInvestmentAccounts()
    const selectedByConnection = plaidRepository.getSelectedInvestmentAccountsByConnection()
    const selectedAccountIds = selectedAccounts.map((account) => account.id)

    if (!isPlaidConfigured()) {
      return plaidRepository.createSyncSnapshot({
        requestedByUserId,
        selectedAccountIds,
        status: selectedAccountIds.length === 0 ? 'failed' : 'success',
        errorMessage:
          selectedAccountIds.length === 0 ? 'No Plaid investment accounts selected.' : null,
      })
    }

    if (selectedByConnection.length === 0) {
      return plaidRepository.createSyncSnapshot({
        requestedByUserId,
        selectedAccountIds,
        status: 'failed',
        errorMessage: 'No connected Plaid Items found for selected accounts.',
      })
    }

    const snapshot = plaidRepository.createSyncSnapshot({
      requestedByUserId,
      selectedAccountIds,
      status: 'pending',
    })

    const sourceHoldings: SourceHoldingRecord[] = []
    const warnings: string[] = []

    for (const { connection, accounts } of selectedByConnection) {
      try {
        const response = await plaidApi.investmentsHoldingsGet({
          access_token: connection.accessToken,
          options: {
            account_ids: accounts.map((account) => account.id),
          },
        })
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
          plaidRepository.markAccountStatus(account.id, 'failed')
        }
      }
    }

    plaidRepository.replaceSourceHoldingsForSnapshot(snapshot.id, sourceHoldings)

    return plaidRepository.createSyncSnapshot({
      requestedByUserId,
      selectedAccountIds,
      status:
        warnings.length === 0
          ? 'success'
          : sourceHoldings.length > 0
            ? 'partial_success'
            : 'failed',
      errorMessage: warnings.join('; ') || null,
    })
  },
}
