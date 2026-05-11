import { randomUUID } from 'node:crypto'

export type PlaidInvestmentAccountSyncStatus =
  | 'never_synced'
  | 'pending'
  | 'success'
  | 'failed'
  | 'needs_user_action'

export interface PlaidInvestmentAccount {
  id: string
  connectionId: string
  custodianName: string
  name: string
  officialName: string | null
  mask: string | null
  type: string
  subtype: string | null
  selectedForHoldingsReport: boolean
  syncStatus: PlaidInvestmentAccountSyncStatus
  lastSyncedAt: string | null
}

interface PlaidConnectionResponse {
  connectionId: string
  institutionName: string
  accounts: PlaidInvestmentAccount[]
}

export interface HoldingsSyncSnapshot {
  id: string
  status: 'pending' | 'success' | 'partial_success' | 'failed'
  startedAt: string
  completedAt: string | null
  errorMessage: string | null
}

export interface SourceHoldingRecord {
  id: string
  syncSnapshotId: string
  accountId: string
  plaidAccountId: string
  plaidSecurityId: string | null
  symbol: string | null
  description: string
  type: string
  cusip: string | null
  isin: string | null
  currencyCode: string | null
  quantity: number | null
  costBasis: number | null
  institutionPrice: number | null
  marketValue: number | null
  unrealizedGainLoss: number | null
  asOfDate: string | null
}

interface PlaidConnectionRecord {
  id: string
  ownerUserId: string
  plaidItemId: string
  institutionId: string | null
  institutionName: string
  accessToken: string
  status: 'connected' | 'needs_update' | 'disconnected'
  lastSuccessfulSyncAt: string | null
}

const nowIso = () => new Date().toISOString()

const connections: PlaidConnectionRecord[] = []
const accounts: PlaidInvestmentAccount[] = []
const sourceHoldings: SourceHoldingRecord[] = []
const snapshots: HoldingsSyncSnapshot[] = []

const accountFromMetadata = (
  connectionId: string,
  institutionName: string,
  account: Record<string, unknown>,
): PlaidInvestmentAccount => ({
  id: randomUUID(),
  connectionId,
  custodianName: institutionName,
  name: String(account.name ?? account.official_name ?? 'Investment Account'),
  officialName:
    typeof account.official_name === 'string' ? account.official_name : null,
  mask: typeof account.mask === 'string' ? account.mask : null,
  type: String(account.type ?? 'investment'),
  subtype: typeof account.subtype === 'string' ? account.subtype : null,
  selectedForHoldingsReport: true,
  syncStatus: 'never_synced',
  lastSyncedAt: null,
})

export const plaidRepository = {
  createConnectionFromPublicToken(input: {
    ownerUserId: string
    plaidItemId: string
    accessToken: string
    institutionId: string | null
    institutionName: string
    metadataAccounts: Array<Record<string, unknown>>
  }): PlaidConnectionResponse {
    const existing = connections.find((item) => item.plaidItemId === input.plaidItemId)
    const connection =
      existing ??
      ({
        id: randomUUID(),
        ownerUserId: input.ownerUserId,
        plaidItemId: input.plaidItemId,
        institutionId: input.institutionId,
        institutionName: input.institutionName,
        accessToken: input.accessToken,
        status: 'connected',
        lastSuccessfulSyncAt: null,
      } satisfies PlaidConnectionRecord)

    if (!existing) connections.push(connection)

    const incomingAccounts =
      input.metadataAccounts.length > 0
        ? input.metadataAccounts
        : [
            {
              name: 'Investment Account',
              type: 'investment',
            },
          ]

    for (const metadataAccount of incomingAccounts) {
      const plaidAccountId =
        typeof metadataAccount.id === 'string'
          ? metadataAccount.id
          : typeof metadataAccount.account_id === 'string'
            ? metadataAccount.account_id
            : randomUUID()

      const alreadyExists = accounts.some(
        (account) =>
          account.connectionId === connection.id && account.id === plaidAccountId,
      )
      if (alreadyExists) continue

      const account = accountFromMetadata(
        connection.id,
        input.institutionName,
        metadataAccount,
      )
      account.id = plaidAccountId
      accounts.push(account)
    }

    return {
      connectionId: connection.id,
      institutionName: connection.institutionName,
      accounts: accounts.filter((account) => account.connectionId === connection.id),
    }
  },

  listInvestmentAccounts(): PlaidInvestmentAccount[] {
    return [...accounts].sort((a, b) =>
      `${a.custodianName} ${a.name}`.localeCompare(`${b.custodianName} ${b.name}`),
    )
  },

  updateSelectedInvestmentAccounts(selectedAccountIds: string[]): PlaidInvestmentAccount[] {
    const selected = new Set(selectedAccountIds)
    for (const account of accounts) {
      account.selectedForHoldingsReport = selected.has(account.id)
    }
    return this.listInvestmentAccounts()
  },

  getSelectedInvestmentAccounts(): PlaidInvestmentAccount[] {
    return accounts.filter((account) => account.selectedForHoldingsReport)
  },

  createSyncSnapshot(input: {
    requestedByUserId: string
    selectedAccountIds: string[]
    status?: HoldingsSyncSnapshot['status']
    errorMessage?: string | null
  }): HoldingsSyncSnapshot {
    const snapshot: HoldingsSyncSnapshot = {
      id: randomUUID(),
      status: input.status ?? 'success',
      startedAt: nowIso(),
      completedAt: nowIso(),
      errorMessage: input.errorMessage ?? null,
    }
    snapshots.unshift(snapshot)

    for (const account of accounts) {
      if (input.selectedAccountIds.includes(account.id)) {
        account.syncStatus = snapshot.status === 'failed' ? 'failed' : 'success'
        account.lastSyncedAt = snapshot.completedAt
      }
    }

    return snapshot
  },

  replaceSourceHoldingsForSnapshot(
    syncSnapshotId: string,
    holdings: SourceHoldingRecord[],
  ): SourceHoldingRecord[] {
    sourceHoldings.push(...holdings.map((holding) => ({ ...holding, syncSnapshotId })))
    return holdings
  },

  listSourceHoldingsForSelectedAccounts(): SourceHoldingRecord[] {
    const selected = new Set(
      accounts
        .filter((account) => account.selectedForHoldingsReport)
        .map((account) => account.id),
    )
    return sourceHoldings.filter((holding) => selected.has(holding.accountId))
  },

  getLatestSync() {
    return snapshots[0] ?? null
  },

  markAccountStatus(accountId: string, status: PlaidInvestmentAccountSyncStatus): void {
    const account = accounts.find((row) => row.id === accountId)
    if (account) account.syncStatus = status
  },

  _debugSeed(input: {
    accounts: PlaidInvestmentAccount[]
    holdings: Omit<SourceHoldingRecord, 'syncSnapshotId'>[]
    snapshot?: HoldingsSyncSnapshot
  }): void {
    accounts.length = 0
    sourceHoldings.length = 0
    snapshots.length = 0
    accounts.push(...input.accounts)
    const snapshot =
      input.snapshot ??
      ({
        id: randomUUID(),
        status: 'success',
        startedAt: nowIso(),
        completedAt: nowIso(),
        errorMessage: null,
      } satisfies HoldingsSyncSnapshot)
    snapshots.push(snapshot)
    sourceHoldings.push(
      ...input.holdings.map((holding) => ({
        ...holding,
        syncSnapshotId: snapshot.id,
      })),
    )
  },

  _debugReset(): void {
    connections.length = 0
    accounts.length = 0
    sourceHoldings.length = 0
    snapshots.length = 0
  },
}
