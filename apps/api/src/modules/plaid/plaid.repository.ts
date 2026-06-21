import { randomUUID } from 'node:crypto'
import { pool } from '../../infra/db/client.js'
import { decryptSecret, encryptSecret } from '../../infra/crypto/secretCodec.js'

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
  sector: string | null
  industry: string | null
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

export interface ClearConnectedAccountsResult {
  connectionCount: number
  accountCount: number
  holdingCount: number
  snapshotCount: number
}

export interface PlaidConnectionRecord {
  id: string
  ownerUserId: string
  plaidItemId: string
  institutionId: string | null
  institutionName: string
  accessToken: string
  status: 'connected' | 'needs_update' | 'disconnected'
  lastSuccessfulSyncAt: string | null
}

interface AccountRow {
  id: string
  plaid_connection_id: string
  plaid_account_id: string
  name: string
  official_name: string | null
  mask: string | null
  account_type: string
  account_subtype: string | null
  custodian_name: string
  selected_for_holdings_report: boolean
  sync_status: PlaidInvestmentAccountSyncStatus
  last_synced_at: Date | null
}

interface ConnectionRow {
  id: string
  owner_user_id: string
  plaid_item_id: string
  institution_id: string | null
  institution_name: string
  access_token_ciphertext: string
  status: 'connected' | 'needs_update' | 'disconnected'
  last_successful_sync_at: Date | null
}

interface SnapshotRow {
  id: string
  status: HoldingsSyncSnapshot['status']
  started_at: Date
  completed_at: Date | null
  error_message: string | null
}

interface HoldingRow {
  id: string
  sync_snapshot_id: string
  plaid_account_id: string
  plaid_security_id: string | null
  symbol: string | null
  description: string
  security_type: string
  sector: string | null
  industry: string | null
  cusip: string | null
  isin: string | null
  currency_code: string | null
  quantity: string | null
  cost_basis_amount: string | null
  institution_price: string | null
  market_value_amount: string | null
  unrealized_gain_loss_amount: string | null
  as_of_date: Date | null
}

const nowIso = () => new Date().toISOString()
const toNumber = (value: string | null) => (value == null ? null : Number(value))

const connections: PlaidConnectionRecord[] = []
const accounts: PlaidInvestmentAccount[] = []
const sourceHoldings: SourceHoldingRecord[] = []
const snapshots: HoldingsSyncSnapshot[] = []
const dbAccountIdsByPlaidAccountId = new Map<string, string>()

let dbWriteQueue = Promise.resolve()

const enqueueDbWrite = (task: () => Promise<void>) => {
  if (!pool) return
  dbWriteQueue = dbWriteQueue
    .then(task)
    .catch((error) => {
      console.error('[persistence] plaid write failed', error)
    })
}

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

const mapAccountRow = (row: AccountRow): PlaidInvestmentAccount => {
  dbAccountIdsByPlaidAccountId.set(row.plaid_account_id, row.id)
  return {
    id: row.plaid_account_id,
    connectionId: row.plaid_connection_id,
    custodianName: row.custodian_name,
    name: row.name,
    officialName: row.official_name,
    mask: row.mask,
    type: row.account_type,
    subtype: row.account_subtype,
    selectedForHoldingsReport: row.selected_for_holdings_report,
    syncStatus: row.sync_status,
    lastSyncedAt: row.last_synced_at?.toISOString() ?? null,
  }
}

const mapConnectionRow = (row: ConnectionRow): PlaidConnectionRecord => ({
  id: row.id,
  ownerUserId: row.owner_user_id,
  plaidItemId: row.plaid_item_id,
  institutionId: row.institution_id,
  institutionName: row.institution_name,
  accessToken: decryptSecret(row.access_token_ciphertext),
  status: row.status,
  lastSuccessfulSyncAt: row.last_successful_sync_at?.toISOString() ?? null,
})

const mapSnapshotRow = (row: SnapshotRow): HoldingsSyncSnapshot => ({
  id: row.id,
  status: row.status,
  startedAt: row.started_at.toISOString(),
  completedAt: row.completed_at?.toISOString() ?? null,
  errorMessage: row.error_message,
})

const mapHoldingRow = (row: HoldingRow): SourceHoldingRecord => ({
  id: row.id,
  syncSnapshotId: row.sync_snapshot_id,
  accountId: row.plaid_account_id,
  plaidAccountId: row.plaid_account_id,
  plaidSecurityId: row.plaid_security_id,
  symbol: row.symbol,
  description: row.description,
  type: row.security_type,
  sector: row.sector,
  industry: row.industry,
  cusip: row.cusip,
  isin: row.isin,
  currencyCode: row.currency_code,
  quantity: toNumber(row.quantity),
  costBasis: toNumber(row.cost_basis_amount),
  institutionPrice: toNumber(row.institution_price),
  marketValue: toNumber(row.market_value_amount),
  unrealizedGainLoss: toNumber(row.unrealized_gain_loss_amount),
  asOfDate: row.as_of_date?.toISOString().slice(0, 10) ?? null,
})

const persistConnection = (connection: PlaidConnectionRecord) => {
  enqueueDbWrite(async () => {
    await pool!.query(
      `
        insert into plaid_connections (
          id, owner_user_id, plaid_item_id, institution_id, institution_name,
          access_token_ciphertext, status, last_successful_sync_at, updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, now())
        on conflict (plaid_item_id) do update
        set owner_user_id = excluded.owner_user_id,
            institution_id = excluded.institution_id,
            institution_name = excluded.institution_name,
            access_token_ciphertext = excluded.access_token_ciphertext,
            status = excluded.status,
            updated_at = now()
      `,
      [
        connection.id,
        connection.ownerUserId,
        connection.plaidItemId,
        connection.institutionId,
        connection.institutionName,
        encryptSecret(connection.accessToken),
        connection.status,
        connection.lastSuccessfulSyncAt,
      ],
    )
  })
}

const persistAccount = (account: PlaidInvestmentAccount) => {
  enqueueDbWrite(async () => {
    const dbId = dbAccountIdsByPlaidAccountId.get(account.id) ?? randomUUID()
    dbAccountIdsByPlaidAccountId.set(account.id, dbId)
    await pool!.query(
      `
        insert into plaid_investment_accounts (
          id, plaid_connection_id, plaid_account_id, name, official_name, mask,
          account_type, account_subtype, custodian_name, selected_for_holdings_report,
          sync_status, last_synced_at, updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
        on conflict (plaid_connection_id, plaid_account_id) do update
        set name = excluded.name,
            official_name = excluded.official_name,
            mask = excluded.mask,
            account_type = excluded.account_type,
            account_subtype = excluded.account_subtype,
            custodian_name = excluded.custodian_name,
            selected_for_holdings_report = excluded.selected_for_holdings_report,
            sync_status = excluded.sync_status,
            last_synced_at = excluded.last_synced_at,
            updated_at = now()
      `,
      [
        dbId,
        account.connectionId,
        account.id,
        account.name,
        account.officialName,
        account.mask,
        account.type,
        account.subtype,
        account.custodianName,
        account.selectedForHoldingsReport,
        account.syncStatus,
        account.lastSyncedAt,
      ],
    )
  })
}

const persistSnapshot = (snapshot: HoldingsSyncSnapshot, selectedAccountIds: string[], requestedByUserId: string) => {
  enqueueDbWrite(async () => {
    await pool!.query(
      `
        insert into holdings_sync_snapshots (
          id, requested_by_user_id, status, started_at, completed_at,
          selected_account_ids, error_message
        )
        values ($1, $2, $3, $4, $5, $6::jsonb, $7)
        on conflict (id) do update
        set status = excluded.status,
            completed_at = excluded.completed_at,
            selected_account_ids = excluded.selected_account_ids,
            error_message = excluded.error_message
      `,
      [
        snapshot.id,
        requestedByUserId,
        snapshot.status,
        snapshot.startedAt,
        snapshot.completedAt,
        JSON.stringify(selectedAccountIds),
        snapshot.errorMessage,
      ],
    )
  })
}

const persistSourceHoldings = (syncSnapshotId: string, holdings: SourceHoldingRecord[]) => {
  enqueueDbWrite(async () => {
    const accountIds = [...new Set(holdings.map((holding) => holding.accountId))]
    if (accountIds.length > 0) {
      await pool!.query(
        `
          delete from source_holdings
          where plaid_account_id = any($1::text[])
        `,
        [accountIds],
      )
    }

    for (const holding of holdings) {
      const dbAccountId = dbAccountIdsByPlaidAccountId.get(holding.accountId)
      if (!dbAccountId) continue
      await pool!.query(
        `
          insert into source_holdings (
            id, sync_snapshot_id, plaid_investment_account_id, plaid_account_id,
            plaid_security_id, symbol, description, security_type, sector, industry,
            cusip, isin, currency_code, quantity, cost_basis_amount, institution_price,
            market_value_amount, unrealized_gain_loss_amount, as_of_date
          )
          values (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17, $18, $19
          )
        `,
        [
          holding.id,
          syncSnapshotId,
          dbAccountId,
          holding.accountId,
          holding.plaidSecurityId,
          holding.symbol,
          holding.description,
          holding.type,
          holding.sector,
          holding.industry,
          holding.cusip,
          holding.isin,
          holding.currencyCode,
          holding.quantity,
          holding.costBasis,
          holding.institutionPrice,
          holding.marketValue,
          holding.unrealizedGainLoss,
          holding.asOfDate?.slice(0, 10) ?? null,
        ],
      )
    }
  })
}

const clearLocalState = () => {
  connections.length = 0
  accounts.length = 0
  sourceHoldings.length = 0
  snapshots.length = 0
  dbAccountIdsByPlaidAccountId.clear()
}

const clearPersistedState = async () => {
  if (!pool) return

  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query('delete from source_holdings')
    await client.query('delete from holdings_sync_snapshots')
    await client.query('delete from plaid_connections')
    await client.query('commit')
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export const plaidRepository = {
  async bootstrapFromDatabase(): Promise<void> {
    if (!pool) return

    const connectionRows = await pool.query<ConnectionRow>(
      `
        select id, owner_user_id, plaid_item_id, institution_id, institution_name,
          access_token_ciphertext, status, last_successful_sync_at
        from plaid_connections
        order by created_at
      `,
    )
    const accountRows = await pool.query<AccountRow>(
      `
        select id, plaid_connection_id, plaid_account_id, name, official_name, mask,
          account_type, account_subtype, custodian_name, selected_for_holdings_report,
          sync_status, last_synced_at
        from plaid_investment_accounts
        order by custodian_name, name
      `,
    )
    const snapshotRows = await pool.query<SnapshotRow>(
      `
        select id, status, started_at, completed_at, error_message
        from holdings_sync_snapshots
        order by created_at desc
        limit 50
      `,
    )
    const holdingRows = await pool.query<HoldingRow>(
      `
        select id, sync_snapshot_id, plaid_account_id, plaid_security_id, symbol,
          description, security_type, sector, industry, cusip, isin, currency_code, quantity,
          cost_basis_amount, institution_price, market_value_amount,
          unrealized_gain_loss_amount, as_of_date
        from source_holdings
        order by created_at desc
      `,
    )

    connections.length = 0
    accounts.length = 0
    snapshots.length = 0
    sourceHoldings.length = 0
    dbAccountIdsByPlaidAccountId.clear()

    connections.push(...connectionRows.rows.map(mapConnectionRow))
    accounts.push(...accountRows.rows.map(mapAccountRow))
    snapshots.push(...snapshotRows.rows.map(mapSnapshotRow))
    sourceHoldings.push(...holdingRows.rows.map(mapHoldingRow))
  },

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

    connection.ownerUserId = input.ownerUserId
    connection.institutionId = input.institutionId
    connection.institutionName = input.institutionName
    connection.accessToken = input.accessToken
    connection.status = 'connected'

    if (!existing) connections.push(connection)
    persistConnection(connection)

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
      persistAccount(account)
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
      persistAccount(account)
    }
    return this.listInvestmentAccounts()
  },

  async clearConnectedAccounts(): Promise<ClearConnectedAccountsResult> {
    const result = {
      connectionCount: connections.length,
      accountCount: accounts.length,
      holdingCount: sourceHoldings.length,
      snapshotCount: snapshots.length,
    }

    if (pool) {
      const clearWrite = dbWriteQueue.then(clearPersistedState)
      dbWriteQueue = clearWrite.catch((error) => {
        console.error('[persistence] plaid clear failed', error)
      })
      await clearWrite
    }

    clearLocalState()
    return result
  },

  getSelectedInvestmentAccounts(): PlaidInvestmentAccount[] {
    return accounts.filter((account) => account.selectedForHoldingsReport)
  },

  getSelectedInvestmentAccountsByConnection(): Array<{
    connection: PlaidConnectionRecord
    accounts: PlaidInvestmentAccount[]
  }> {
    const selectedAccounts = this.getSelectedInvestmentAccounts()
    return connections
      .map((connection) => ({
        connection,
        accounts: selectedAccounts.filter(
          (account) => account.connectionId === connection.id,
        ),
      }))
      .filter((entry) => entry.accounts.length > 0)
  },

  createSyncSnapshot(input: {
    requestedByUserId: string
    selectedAccountIds: string[]
    status?: HoldingsSyncSnapshot['status']
    errorMessage?: string | null
  }): HoldingsSyncSnapshot {
    const completedAt = input.status === 'pending' ? null : nowIso()
    const snapshot: HoldingsSyncSnapshot = {
      id: randomUUID(),
      status: input.status ?? 'success',
      startedAt: nowIso(),
      completedAt,
      errorMessage: input.errorMessage ?? null,
    }
    snapshots.unshift(snapshot)
    persistSnapshot(snapshot, input.selectedAccountIds, input.requestedByUserId)

    for (const account of accounts) {
      if (input.selectedAccountIds.includes(account.id)) {
        account.syncStatus = snapshot.status === 'failed' ? 'failed' : 'success'
        account.lastSyncedAt = snapshot.completedAt
        persistAccount(account)
      }
    }

    return snapshot
  },

  replaceSourceHoldingsForSnapshot(
    syncSnapshotId: string,
    holdings: SourceHoldingRecord[],
  ): SourceHoldingRecord[] {
    const accountIds = new Set(holdings.map((holding) => holding.accountId))
    for (let index = sourceHoldings.length - 1; index >= 0; index -= 1) {
      if (accountIds.has(sourceHoldings[index]!.accountId)) {
        sourceHoldings.splice(index, 1)
      }
    }
    sourceHoldings.push(...holdings.map((holding) => ({ ...holding, syncSnapshotId })))
    persistSourceHoldings(syncSnapshotId, holdings)
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
    if (!account) return
    account.syncStatus = status
    persistAccount(account)
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
    clearLocalState()
  },

  async _flushPersistenceWrites(): Promise<void> {
    await dbWriteQueue
  },
}
