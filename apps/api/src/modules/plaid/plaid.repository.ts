import { randomUUID } from 'node:crypto'
import { pool, withTransaction } from '../../infra/db/client.js'
import { decryptSecret, encryptSecret } from '../../infra/crypto/secretCodec.js'
import { config } from '../../config.js'

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
  refreshAttemptId?: string | null
  dataAsOfDate?: string | null
  dataAsOfMinDate?: string | null
  dataAsOfMaxDate?: string | null
  fetchedAt?: string | null
  dashboardEligible?: boolean
  holdingsCount?: number
  selectedAccountIds?: string[]
}

export type PlaidRefreshCadence = 'daily'

export interface PlaidRefreshPolicy {
  id: string
  name: string
  cadence: PlaidRefreshCadence
  refreshTimeLocal: string
  timezone: string
  staleAfterCutoff: boolean
  manualRefreshEnabled: boolean
  automaticRefreshEnabled: boolean
  createdAt: string
  updatedAt: string
}

export type HoldingsRefreshTriggerSource = 'scheduled' | 'manual' | 'system'

export type HoldingsRefreshReason =
  | 'daily_cutoff'
  | 'manual'
  | 'missing_snapshot'
  | 'stale_snapshot'
  | 'forced'
  | 'already_fresh'

export type HoldingsRefreshAttemptStatus =
  | 'pending'
  | 'success'
  | 'partial_success'
  | 'failed'
  | 'skipped'

export interface HoldingsRefreshAttempt {
  id: string
  policyId: string | null
  requestedByUserId: string | null
  triggerSource: HoldingsRefreshTriggerSource
  refreshReason: HoldingsRefreshReason
  status: HoldingsRefreshAttemptStatus
  startedAt: string
  completedAt: string | null
  scheduledFor: string | null
  freshnessCutoffAt: string | null
  selectedAccountIds: string[]
  plaidRequestIds: string[]
  dataAsOfDate: string | null
  errorType: string | null
  errorCode: string | null
  errorMessage: string | null
}

export interface HoldingsSnapshotMetadata extends HoldingsSyncSnapshot {
  requestedByUserId: string | null
  selectedAccountIds: string[]
}

export interface ProductionReadinessDiagnostic {
  key: string
  status: 'pass' | 'warning' | 'fail' | 'unknown'
  safeValue: string | boolean | number | null
  warning: string | null
  checkedAt: string
}

export interface RefreshLockResult<T> {
  acquired: boolean
  result?: T
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

interface PlaidAccountVisibility {
  actorUserId?: string
  isAdmin?: boolean
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
  requested_by_user_id?: string | null
  status: HoldingsSyncSnapshot['status']
  started_at: Date
  completed_at: Date | null
  error_message: string | null
  selected_account_ids?: unknown
  refresh_attempt_id?: string | null
  data_as_of_date?: Date | string | null
  data_as_of_min_date?: Date | string | null
  data_as_of_max_date?: Date | string | null
  fetched_at?: Date | null
  dashboard_eligible?: boolean
  holdings_count?: number
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

interface RefreshPolicyRow {
  id: string
  name: string
  cadence: PlaidRefreshCadence
  refresh_time_local: string
  timezone: string
  stale_after_cutoff: boolean
  manual_refresh_enabled: boolean
  automatic_refresh_enabled: boolean
  created_at: Date
  updated_at: Date
}

interface RefreshAttemptRow {
  id: string
  policy_id: string | null
  requested_by_user_id: string | null
  trigger_source: HoldingsRefreshTriggerSource
  refresh_reason: HoldingsRefreshReason
  status: HoldingsRefreshAttemptStatus
  started_at: Date
  completed_at: Date | null
  scheduled_for: Date | null
  freshness_cutoff_at: Date | null
  selected_account_ids: string[] | null
  plaid_request_ids: string[] | null
  data_as_of_date: Date | string | null
  error_type: string | null
  error_code: string | null
  error_message: string | null
}

interface ProductionReadinessDiagnosticRow {
  key: string
  status: ProductionReadinessDiagnostic['status']
  safe_value: string | boolean | number | null
  warning: string | null
  checked_at: Date
}

const nowIso = () => new Date().toISOString()
const toNumber = (value: string | null) => (value == null ? null : Number(value))
const DEFAULT_REFRESH_POLICY_NAME = 'liquidity_default'

const toIsoOrNull = (value: Date | string | null | undefined) => {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

const toDateStringOrNull = (value: Date | string | null | undefined) => {
  if (!value) return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return value.slice(0, 10)
}

const normalizeAccountIds = (accountIds: string[]) =>
  [...new Set(accountIds)].sort((a, b) => a.localeCompare(b))

const sameAccountSelection = (left: string[], right: string[]) => {
  const normalizedLeft = normalizeAccountIds(left)
  const normalizedRight = normalizeAccountIds(right)
  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((value, index) => value === normalizedRight[index])
  )
}

const accountSelectionsOverlap = (left: string[], right: string[]) => {
  if (left.length === 0 || right.length === 0) return true
  const rightSet = new Set(right)
  return left.some((accountId) => rightSet.has(accountId))
}

const snapshotSortTime = (snapshot: HoldingsSyncSnapshot) =>
  new Date(
    snapshot.fetchedAt ??
      snapshot.completedAt ??
      snapshot.startedAt,
  ).getTime()

const isDashboardEligibleSnapshot = (snapshot: HoldingsSyncSnapshot) =>
  (snapshot.status === 'success' || snapshot.status === 'partial_success') &&
  snapshot.dashboardEligible !== false &&
  (snapshot.holdingsCount ?? 1) > 0

const defaultDashboardEligible = (
  status: HoldingsSyncSnapshot['status'],
  holdingsCount: number | null | undefined,
) =>
  (status === 'success' || status === 'partial_success') &&
  (holdingsCount ?? 0) > 0

const latestDashboardSnapshotIdByAccount = (selectedAccountIds: string[]) => {
  const selected = new Set(selectedAccountIds)
  const latestByAccount = new Map<string, string>()
  const orderedSnapshots = [...snapshots].sort(
    (left, right) => snapshotSortTime(right) - snapshotSortTime(left),
  )

  for (const snapshot of orderedSnapshots) {
    if (!isDashboardEligibleSnapshot(snapshot)) continue

    const snapshotAccountIds = parseStringArray(snapshot.selectedAccountIds)
    for (const accountId of snapshotAccountIds) {
      if (!selected.has(accountId) || latestByAccount.has(accountId)) continue
      latestByAccount.set(accountId, snapshot.id)
    }
  }

  return latestByAccount
}

const accountIsVisible = (
  account: PlaidInvestmentAccount,
  visibility?: PlaidAccountVisibility,
) => {
  if (!visibility?.actorUserId || visibility.isAdmin) return true
  const connection = connections.find((item) => item.id === account.connectionId)
  return !connection || connection.ownerUserId === visibility.actorUserId
}

const parseStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string')
  }
  if (typeof value !== 'string') return []

  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : []
  } catch {
    return []
  }
}

const defaultRefreshPolicyFromConfig = (): PlaidRefreshPolicy => {
  const timestamp = nowIso()
  return {
    id: '00000000-0000-4000-8000-000000000014',
    name: DEFAULT_REFRESH_POLICY_NAME,
    cadence: 'daily',
    refreshTimeLocal: config.plaidRefresh.timeLocal,
    timezone: config.plaidRefresh.timezone,
    staleAfterCutoff: true,
    manualRefreshEnabled: true,
    automaticRefreshEnabled: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

const connections: PlaidConnectionRecord[] = []
const accounts: PlaidInvestmentAccount[] = []
const sourceHoldings: SourceHoldingRecord[] = []
const snapshots: HoldingsSyncSnapshot[] = []
const refreshPolicies = new Map<string, PlaidRefreshPolicy>()
const refreshAttempts: HoldingsRefreshAttempt[] = []
const activeRefreshLocks = new Set<string>()
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

const mapConnectionRow = (row: ConnectionRow): PlaidConnectionRecord => {
  try {
    return {
      id: row.id,
      ownerUserId: row.owner_user_id,
      plaidItemId: row.plaid_item_id,
      institutionId: row.institution_id,
      institutionName: row.institution_name,
      accessToken: decryptSecret(row.access_token_ciphertext),
      status: row.status,
      lastSuccessfulSyncAt: row.last_successful_sync_at?.toISOString() ?? null,
    }
  } catch (error) {
    if (config.nodeEnv === 'production') throw error

    console.warn(
      `[persistence] unable to decrypt Plaid access token for connection ${row.id}; ` +
        'marking it needs_update. Check PERSISTENCE_SECRET_KEY or reconnect Plaid.',
    )

    return {
      id: row.id,
      ownerUserId: row.owner_user_id,
      plaidItemId: row.plaid_item_id,
      institutionId: row.institution_id,
      institutionName: row.institution_name,
      accessToken: '',
      status: 'needs_update',
      lastSuccessfulSyncAt: row.last_successful_sync_at?.toISOString() ?? null,
    }
  }
}

const mapSnapshotRow = (row: SnapshotRow): HoldingsSyncSnapshot => ({
  id: row.id,
  status: row.status,
  startedAt: row.started_at.toISOString(),
  completedAt: row.completed_at?.toISOString() ?? null,
  errorMessage: row.error_message,
  refreshAttemptId: row.refresh_attempt_id ?? null,
  dataAsOfDate: toDateStringOrNull(row.data_as_of_date),
  dataAsOfMinDate: toDateStringOrNull(row.data_as_of_min_date),
  dataAsOfMaxDate: toDateStringOrNull(row.data_as_of_max_date),
  fetchedAt: row.fetched_at?.toISOString() ?? null,
  dashboardEligible: row.dashboard_eligible ?? false,
  holdingsCount: row.holdings_count ?? 0,
  selectedAccountIds: parseStringArray(row.selected_account_ids),
})

const mapSnapshotMetadataRow = (row: SnapshotRow): HoldingsSnapshotMetadata => ({
  ...mapSnapshotRow(row),
  requestedByUserId: row.requested_by_user_id ?? null,
  selectedAccountIds: parseStringArray(row.selected_account_ids),
})

const mapRefreshPolicyRow = (row: RefreshPolicyRow): PlaidRefreshPolicy => ({
  id: row.id,
  name: row.name,
  cadence: row.cadence,
  refreshTimeLocal: row.refresh_time_local,
  timezone: row.timezone,
  staleAfterCutoff: row.stale_after_cutoff,
  manualRefreshEnabled: row.manual_refresh_enabled,
  automaticRefreshEnabled: row.automatic_refresh_enabled,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
})

const mapRefreshAttemptRow = (row: RefreshAttemptRow): HoldingsRefreshAttempt => ({
  id: row.id,
  policyId: row.policy_id,
  requestedByUserId: row.requested_by_user_id,
  triggerSource: row.trigger_source,
  refreshReason: row.refresh_reason,
  status: row.status,
  startedAt: row.started_at.toISOString(),
  completedAt: row.completed_at?.toISOString() ?? null,
  scheduledFor: row.scheduled_for?.toISOString() ?? null,
  freshnessCutoffAt: row.freshness_cutoff_at?.toISOString() ?? null,
  selectedAccountIds: normalizeAccountIds(row.selected_account_ids ?? []),
  plaidRequestIds: row.plaid_request_ids ?? [],
  dataAsOfDate: toDateStringOrNull(row.data_as_of_date),
  errorType: row.error_type,
  errorCode: row.error_code,
  errorMessage: row.error_message,
})

const mapProductionReadinessDiagnosticRow = (
  row: ProductionReadinessDiagnosticRow,
): ProductionReadinessDiagnostic => ({
  key: row.key,
  status: row.status,
  safeValue: row.safe_value,
  warning: row.warning,
  checkedAt: row.checked_at.toISOString(),
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

const markAccountsForUnavailableConnections = () => {
  const unavailableConnectionIds = new Set(
    connections
      .filter((connection) => connection.status !== 'connected' || !connection.accessToken)
      .map((connection) => connection.id),
  )

  if (unavailableConnectionIds.size === 0) return

  for (const account of accounts) {
    if (unavailableConnectionIds.has(account.connectionId)) {
      account.syncStatus = 'needs_user_action'
    }
  }
}

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

const persistSnapshot = (
  snapshot: HoldingsSyncSnapshot,
  selectedAccountIds: string[],
  requestedByUserId: string | null,
) => {
  enqueueDbWrite(async () => {
    await pool!.query(
      `
        insert into holdings_sync_snapshots (
          id, requested_by_user_id, status, started_at, completed_at,
          selected_account_ids, error_message, refresh_attempt_id, data_as_of_date,
          data_as_of_min_date, data_as_of_max_date, fetched_at, dashboard_eligible,
          holdings_count
        )
        values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13, $14)
        on conflict (id) do update
        set status = excluded.status,
            completed_at = excluded.completed_at,
            selected_account_ids = excluded.selected_account_ids,
            error_message = excluded.error_message,
            refresh_attempt_id = excluded.refresh_attempt_id,
            data_as_of_date = excluded.data_as_of_date,
            data_as_of_min_date = excluded.data_as_of_min_date,
            data_as_of_max_date = excluded.data_as_of_max_date,
            fetched_at = excluded.fetched_at,
            dashboard_eligible = excluded.dashboard_eligible,
            holdings_count = excluded.holdings_count
      `,
      [
        snapshot.id,
        requestedByUserId,
        snapshot.status,
        snapshot.startedAt,
        snapshot.completedAt,
        JSON.stringify(selectedAccountIds),
        snapshot.errorMessage,
        snapshot.refreshAttemptId ?? null,
        snapshot.dataAsOfDate ?? null,
        snapshot.dataAsOfMinDate ?? null,
        snapshot.dataAsOfMaxDate ?? null,
        snapshot.fetchedAt ?? snapshot.completedAt,
        snapshot.dashboardEligible ??
          defaultDashboardEligible(snapshot.status, snapshot.holdingsCount),
        snapshot.holdingsCount ?? 0,
      ],
    )
  })
}

const persistSourceHoldings = (syncSnapshotId: string, holdings: SourceHoldingRecord[]) => {
  enqueueDbWrite(async () => {
    await pool!.query(
      `
        delete from source_holdings
        where sync_snapshot_id = $1
      `,
      [syncSnapshotId],
    )

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
  refreshPolicies.clear()
  refreshAttempts.length = 0
  activeRefreshLocks.clear()
  dbAccountIdsByPlaidAccountId.clear()
}

const clearPersistedState = async () => {
  if (!pool) return

  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query('delete from source_holdings')
    await client.query('delete from holdings_sync_snapshots')
    await client.query('delete from holdings_refresh_attempts')
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
    const policyRows = await pool.query<RefreshPolicyRow>(
      `
        select id, name, cadence, refresh_time_local, timezone, stale_after_cutoff,
          manual_refresh_enabled, automatic_refresh_enabled, created_at, updated_at
        from plaid_refresh_policies
        order by name
      `,
    )
    const attemptRows = await pool.query<RefreshAttemptRow>(
      `
        select id, policy_id, requested_by_user_id, trigger_source, refresh_reason,
          status, started_at, completed_at, scheduled_for, freshness_cutoff_at,
          selected_account_ids, plaid_request_ids, data_as_of_date, error_type,
          error_code, error_message
        from holdings_refresh_attempts
        order by started_at desc
        limit 100
      `,
    )
    const snapshotRows = await pool.query<SnapshotRow>(
      `
        select id, requested_by_user_id, status, started_at, completed_at,
          selected_account_ids, error_message, refresh_attempt_id, data_as_of_date,
          data_as_of_min_date, data_as_of_max_date, fetched_at, dashboard_eligible,
          holdings_count
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
    refreshPolicies.clear()
    refreshAttempts.length = 0
    dbAccountIdsByPlaidAccountId.clear()

    connections.push(...connectionRows.rows.map(mapConnectionRow))
    accounts.push(...accountRows.rows.map(mapAccountRow))
    markAccountsForUnavailableConnections()
    for (const policy of policyRows.rows.map(mapRefreshPolicyRow)) {
      refreshPolicies.set(policy.name, policy)
    }
    refreshAttempts.push(...attemptRows.rows.map(mapRefreshAttemptRow))
    snapshots.push(...snapshotRows.rows.map(mapSnapshotRow))
    sourceHoldings.push(...holdingRows.rows.map(mapHoldingRow))
  },

  getDefaultRefreshPolicy(): PlaidRefreshPolicy {
    return defaultRefreshPolicyFromConfig()
  },

  async getRefreshPolicy(
    name = DEFAULT_REFRESH_POLICY_NAME,
  ): Promise<PlaidRefreshPolicy> {
    if (!pool) {
      const existing = refreshPolicies.get(name)
      if (existing) return existing

      const fallback = {
        ...defaultRefreshPolicyFromConfig(),
        name,
      }
      refreshPolicies.set(name, fallback)
      return fallback
    }

    const fallback = defaultRefreshPolicyFromConfig()
    await pool.query(
      `
        insert into plaid_refresh_policies (
          name, cadence, refresh_time_local, timezone, stale_after_cutoff,
          manual_refresh_enabled, automatic_refresh_enabled
        )
        values ($1, $2, $3, $4, $5, $6, $7)
        on conflict (name) do nothing
      `,
      [
        name,
        fallback.cadence,
        fallback.refreshTimeLocal,
        fallback.timezone,
        fallback.staleAfterCutoff,
        fallback.manualRefreshEnabled,
        fallback.automaticRefreshEnabled,
      ],
    )

    const result = await pool.query<RefreshPolicyRow>(
      `
        select id, name, cadence, refresh_time_local, timezone, stale_after_cutoff,
          manual_refresh_enabled, automatic_refresh_enabled, created_at, updated_at
        from plaid_refresh_policies
        where name = $1
      `,
      [name],
    )

    const policy = result.rows[0]
      ? mapRefreshPolicyRow(result.rows[0])
      : {
          ...fallback,
          name,
        }
    refreshPolicies.set(policy.name, policy)
    return policy
  },

  async updateRefreshPolicy(
    input: Partial<
      Pick<
        PlaidRefreshPolicy,
        | 'cadence'
        | 'refreshTimeLocal'
        | 'timezone'
        | 'staleAfterCutoff'
        | 'manualRefreshEnabled'
        | 'automaticRefreshEnabled'
      >
    > & { name?: string },
  ): Promise<PlaidRefreshPolicy> {
    const name = input.name ?? DEFAULT_REFRESH_POLICY_NAME
    const current = await this.getRefreshPolicy(name)
    const next: PlaidRefreshPolicy = {
      ...current,
      cadence: input.cadence ?? current.cadence,
      refreshTimeLocal: input.refreshTimeLocal ?? current.refreshTimeLocal,
      timezone: input.timezone ?? current.timezone,
      staleAfterCutoff: input.staleAfterCutoff ?? current.staleAfterCutoff,
      manualRefreshEnabled:
        input.manualRefreshEnabled ?? current.manualRefreshEnabled,
      automaticRefreshEnabled:
        input.automaticRefreshEnabled ?? current.automaticRefreshEnabled,
      updatedAt: nowIso(),
    }

    if (!pool) {
      refreshPolicies.set(name, next)
      return next
    }

    const result = await pool.query<RefreshPolicyRow>(
      `
        update plaid_refresh_policies
        set cadence = $2,
            refresh_time_local = $3,
            timezone = $4,
            stale_after_cutoff = $5,
            manual_refresh_enabled = $6,
            automatic_refresh_enabled = $7,
            updated_at = now()
        where name = $1
        returning id, name, cadence, refresh_time_local, timezone,
          stale_after_cutoff, manual_refresh_enabled, automatic_refresh_enabled,
          created_at, updated_at
      `,
      [
        name,
        next.cadence,
        next.refreshTimeLocal,
        next.timezone,
        next.staleAfterCutoff,
        next.manualRefreshEnabled,
        next.automaticRefreshEnabled,
      ],
    )

    const policy = result.rows[0] ? mapRefreshPolicyRow(result.rows[0]) : next
    refreshPolicies.set(policy.name, policy)
    return policy
  },

  async createRefreshAttempt(input: {
    policyId?: string | null
    requestedByUserId?: string | null
    triggerSource: HoldingsRefreshTriggerSource
    refreshReason: HoldingsRefreshReason
    status?: HoldingsRefreshAttemptStatus
    scheduledFor?: string | null
    freshnessCutoffAt?: string | null
    selectedAccountIds: string[]
    plaidRequestIds?: string[]
    dataAsOfDate?: string | null
    errorType?: string | null
    errorCode?: string | null
    errorMessage?: string | null
  }): Promise<HoldingsRefreshAttempt> {
    const attempt: HoldingsRefreshAttempt = {
      id: randomUUID(),
      policyId: input.policyId ?? null,
      requestedByUserId: input.requestedByUserId ?? null,
      triggerSource: input.triggerSource,
      refreshReason: input.refreshReason,
      status: input.status ?? 'pending',
      startedAt: nowIso(),
      completedAt:
        input.status && input.status !== 'pending' ? nowIso() : null,
      scheduledFor: input.scheduledFor ?? null,
      freshnessCutoffAt: input.freshnessCutoffAt ?? null,
      selectedAccountIds: normalizeAccountIds(input.selectedAccountIds),
      plaidRequestIds: input.plaidRequestIds ?? [],
      dataAsOfDate: input.dataAsOfDate ?? null,
      errorType: input.errorType ?? null,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
    }

    if (pool) {
      const result = await pool.query<RefreshAttemptRow>(
        `
          insert into holdings_refresh_attempts (
            id, policy_id, requested_by_user_id, trigger_source, refresh_reason,
            status, started_at, completed_at, scheduled_for, freshness_cutoff_at,
            selected_account_ids, plaid_request_ids, data_as_of_date, error_type,
            error_code, error_message
          )
          values (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9, $10,
            $11::text[], $12::text[], $13, $14,
            $15, $16
          )
          returning id, policy_id, requested_by_user_id, trigger_source,
            refresh_reason, status, started_at, completed_at, scheduled_for,
            freshness_cutoff_at, selected_account_ids, plaid_request_ids,
            data_as_of_date, error_type, error_code, error_message
        `,
        [
          attempt.id,
          attempt.policyId,
          attempt.requestedByUserId,
          attempt.triggerSource,
          attempt.refreshReason,
          attempt.status,
          attempt.startedAt,
          attempt.completedAt,
          attempt.scheduledFor,
          attempt.freshnessCutoffAt,
          attempt.selectedAccountIds,
          attempt.plaidRequestIds,
          attempt.dataAsOfDate,
          attempt.errorType,
          attempt.errorCode,
          attempt.errorMessage,
        ],
      )
      const persisted = mapRefreshAttemptRow(result.rows[0]!)
      refreshAttempts.unshift(persisted)
      return persisted
    }

    refreshAttempts.unshift(attempt)
    return attempt
  },

  async finalizeRefreshAttempt(
    attemptId: string,
    input: {
      status: Exclude<HoldingsRefreshAttemptStatus, 'pending'>
      plaidRequestIds?: string[]
      dataAsOfDate?: string | null
      errorType?: string | null
      errorCode?: string | null
      errorMessage?: string | null
      completedAt?: string | null
    },
  ): Promise<HoldingsRefreshAttempt | null> {
    const completedAt = input.completedAt ?? nowIso()

    if (pool) {
      const result = await pool.query<RefreshAttemptRow>(
        `
          update holdings_refresh_attempts
          set status = $2,
              completed_at = $3,
              plaid_request_ids = coalesce($4::text[], plaid_request_ids),
              data_as_of_date = coalesce($5, data_as_of_date),
              error_type = $6,
              error_code = $7,
              error_message = $8
          where id = $1
          returning id, policy_id, requested_by_user_id, trigger_source,
            refresh_reason, status, started_at, completed_at, scheduled_for,
            freshness_cutoff_at, selected_account_ids, plaid_request_ids,
            data_as_of_date, error_type, error_code, error_message
        `,
        [
          attemptId,
          input.status,
          completedAt,
          input.plaidRequestIds ?? null,
          input.dataAsOfDate ?? null,
          input.errorType ?? null,
          input.errorCode ?? null,
          input.errorMessage ?? null,
        ],
      )
      if (!result.rows[0]) return null
      const updated = mapRefreshAttemptRow(result.rows[0])
      const index = refreshAttempts.findIndex((attempt) => attempt.id === attemptId)
      if (index >= 0) refreshAttempts.splice(index, 1, updated)
      else refreshAttempts.unshift(updated)
      return updated
    }

    const existing = refreshAttempts.find((attempt) => attempt.id === attemptId)
    if (!existing) return null

    Object.assign(existing, {
      status: input.status,
      completedAt,
      plaidRequestIds: input.plaidRequestIds ?? existing.plaidRequestIds,
      dataAsOfDate: input.dataAsOfDate ?? existing.dataAsOfDate,
      errorType: input.errorType ?? null,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
    })
    return existing
  },

  async getLatestRefreshAttempt(input?: {
    status?: HoldingsRefreshAttemptStatus
    successfulOnly?: boolean
  }): Promise<HoldingsRefreshAttempt | null> {
    if (pool) {
      const params: unknown[] = []
      const conditions: string[] = []
      if (input?.status) {
        params.push(input.status)
        conditions.push(`status = $${params.length}`)
      }
      if (input?.successfulOnly) {
        conditions.push(`status in ('success', 'partial_success')`)
      }
      const result = await pool.query<RefreshAttemptRow>(
        `
          select id, policy_id, requested_by_user_id, trigger_source,
            refresh_reason, status, started_at, completed_at, scheduled_for,
            freshness_cutoff_at, selected_account_ids, plaid_request_ids,
            data_as_of_date, error_type, error_code, error_message
          from holdings_refresh_attempts
          ${conditions.length > 0 ? `where ${conditions.join(' and ')}` : ''}
          order by started_at desc
          limit 1
        `,
        params,
      )
      return result.rows[0] ? mapRefreshAttemptRow(result.rows[0]) : null
    }

    return (
      refreshAttempts.find((attempt) => {
        if (input?.status && attempt.status !== input.status) return false
        if (
          input?.successfulOnly &&
          attempt.status !== 'success' &&
          attempt.status !== 'partial_success'
        ) {
          return false
        }
        return true
      }) ?? null
    )
  },

  async getActiveRefreshAttempt(
    selectedAccountIds?: string[],
  ): Promise<HoldingsRefreshAttempt | null> {
    const normalizedAccountIds = selectedAccountIds
      ? normalizeAccountIds(selectedAccountIds)
      : []

    if (pool) {
      const params: unknown[] = []
      const conditions = [`status = 'pending'`]
      if (normalizedAccountIds.length > 0) {
        params.push(normalizedAccountIds)
        conditions.push(`selected_account_ids && $${params.length}::text[]`)
      }
      const result = await pool.query<RefreshAttemptRow>(
        `
          select id, policy_id, requested_by_user_id, trigger_source,
            refresh_reason, status, started_at, completed_at, scheduled_for,
            freshness_cutoff_at, selected_account_ids, plaid_request_ids,
            data_as_of_date, error_type, error_code, error_message
          from holdings_refresh_attempts
          where ${conditions.join(' and ')}
          order by started_at desc
          limit 1
        `,
        params,
      )
      return result.rows[0] ? mapRefreshAttemptRow(result.rows[0]) : null
    }

    return (
      refreshAttempts.find(
        (attempt) =>
          attempt.status === 'pending' &&
          (!selectedAccountIds ||
            accountSelectionsOverlap(
              attempt.selectedAccountIds,
              normalizedAccountIds,
            )),
      ) ?? null
    )
  },

  async listRefreshAttemptsForSelectedAccounts(
    selectedAccountIds: string[],
    limit = 20,
  ): Promise<HoldingsRefreshAttempt[]> {
    const normalizedAccountIds = normalizeAccountIds(selectedAccountIds)

    if (pool) {
      const result = await pool.query<RefreshAttemptRow>(
        `
          select id, policy_id, requested_by_user_id, trigger_source,
            refresh_reason, status, started_at, completed_at, scheduled_for,
            freshness_cutoff_at, selected_account_ids, plaid_request_ids,
            data_as_of_date, error_type, error_code, error_message
          from holdings_refresh_attempts
          where cardinality($1::text[]) = 0
             or selected_account_ids && $1::text[]
          order by started_at desc
          limit $2
        `,
        [normalizedAccountIds, limit],
      )
      return result.rows.map(mapRefreshAttemptRow)
    }

    return refreshAttempts
      .filter((attempt) =>
        accountSelectionsOverlap(attempt.selectedAccountIds, normalizedAccountIds),
      )
      .slice(0, limit)
  },

  async createHoldingsSnapshotMetadata(input: {
    id?: string
    requestedByUserId?: string | null
    refreshAttemptId?: string | null
    selectedAccountIds: string[]
    status?: HoldingsSyncSnapshot['status']
    startedAt?: string
    completedAt?: string | null
    errorMessage?: string | null
    dataAsOfDate?: string | null
    dataAsOfMinDate?: string | null
    dataAsOfMaxDate?: string | null
    fetchedAt?: string | null
    dashboardEligible?: boolean
    holdingsCount?: number
  }): Promise<HoldingsSnapshotMetadata> {
    const status = input.status ?? 'success'
    const completedAt =
      input.completedAt ?? (status === 'pending' ? null : nowIso())
    const metadata: HoldingsSnapshotMetadata = {
      id: input.id ?? randomUUID(),
      requestedByUserId: input.requestedByUserId ?? null,
      status,
      startedAt: input.startedAt ?? nowIso(),
      completedAt,
      errorMessage: input.errorMessage ?? null,
      refreshAttemptId: input.refreshAttemptId ?? null,
      selectedAccountIds: normalizeAccountIds(input.selectedAccountIds),
      dataAsOfDate: input.dataAsOfDate ?? null,
      dataAsOfMinDate: input.dataAsOfMinDate ?? input.dataAsOfDate ?? null,
      dataAsOfMaxDate: input.dataAsOfMaxDate ?? input.dataAsOfDate ?? null,
      fetchedAt: input.fetchedAt ?? completedAt,
      dashboardEligible:
        input.dashboardEligible ??
        defaultDashboardEligible(status, input.holdingsCount),
      holdingsCount: input.holdingsCount ?? 0,
    }

    const existingIndex = snapshots.findIndex((snapshot) => snapshot.id === metadata.id)
    if (existingIndex >= 0) snapshots.splice(existingIndex, 1)
    snapshots.unshift(metadata)

    if (pool) {
      await pool.query(
        `
          insert into holdings_sync_snapshots (
            id, requested_by_user_id, status, started_at, completed_at,
            selected_account_ids, error_message, refresh_attempt_id,
            data_as_of_date, data_as_of_min_date, data_as_of_max_date,
            fetched_at, dashboard_eligible, holdings_count
          )
          values (
            $1, $2, $3, $4, $5,
            $6::jsonb, $7, $8,
            $9, $10, $11,
            $12, $13, $14
          )
          on conflict (id) do update
          set status = excluded.status,
              completed_at = excluded.completed_at,
              selected_account_ids = excluded.selected_account_ids,
              error_message = excluded.error_message,
              refresh_attempt_id = excluded.refresh_attempt_id,
              data_as_of_date = excluded.data_as_of_date,
              data_as_of_min_date = excluded.data_as_of_min_date,
              data_as_of_max_date = excluded.data_as_of_max_date,
              fetched_at = excluded.fetched_at,
              dashboard_eligible = excluded.dashboard_eligible,
              holdings_count = excluded.holdings_count
        `,
        [
          metadata.id,
          metadata.requestedByUserId,
          metadata.status,
          metadata.startedAt,
          metadata.completedAt,
          JSON.stringify(metadata.selectedAccountIds),
          metadata.errorMessage,
          metadata.refreshAttemptId,
          metadata.dataAsOfDate,
          metadata.dataAsOfMinDate,
          metadata.dataAsOfMaxDate,
          metadata.fetchedAt,
          metadata.dashboardEligible,
          metadata.holdingsCount,
        ],
      )
    }

    return metadata
  },

  async getHoldingsSnapshotMetadata(
    snapshotId: string,
  ): Promise<HoldingsSnapshotMetadata | null> {
    if (pool) {
      const result = await pool.query<SnapshotRow>(
        `
          select id, requested_by_user_id, status, started_at, completed_at,
            selected_account_ids, error_message, refresh_attempt_id, data_as_of_date,
            data_as_of_min_date, data_as_of_max_date, fetched_at,
            dashboard_eligible, holdings_count
          from holdings_sync_snapshots
          where id = $1
        `,
        [snapshotId],
      )
      return result.rows[0] ? mapSnapshotMetadataRow(result.rows[0]) : null
    }

    const snapshot = snapshots.find((item) => item.id === snapshotId)
    if (!snapshot) return null
    return {
      ...snapshot,
      requestedByUserId: null,
      selectedAccountIds: parseStringArray(snapshot.selectedAccountIds),
    }
  },

  async getLatestHoldingsSnapshotMetadata(input?: {
    dashboardEligible?: boolean
    selectedAccountIds?: string[]
    successfulOnly?: boolean
  }): Promise<HoldingsSnapshotMetadata | null> {
    const normalizedAccountIds = input?.selectedAccountIds
      ? normalizeAccountIds(input.selectedAccountIds)
      : []

    if (pool) {
      const params: unknown[] = []
      const conditions: string[] = []
      if (input?.dashboardEligible !== undefined) {
        params.push(input.dashboardEligible)
        conditions.push(`dashboard_eligible = $${params.length}`)
      }
      if (input?.successfulOnly) {
        conditions.push(`status in ('success', 'partial_success')`)
      }
      if (normalizedAccountIds.length > 0) {
        params.push(JSON.stringify(normalizedAccountIds))
        conditions.push(
          `selected_account_ids @> $${params.length}::jsonb and selected_account_ids <@ $${params.length}::jsonb`,
        )
      }

      const result = await pool.query<SnapshotRow>(
        `
          select id, requested_by_user_id, status, started_at, completed_at,
            selected_account_ids, error_message, refresh_attempt_id, data_as_of_date,
            data_as_of_min_date, data_as_of_max_date, fetched_at,
            dashboard_eligible, holdings_count
          from holdings_sync_snapshots
          ${conditions.length > 0 ? `where ${conditions.join(' and ')}` : ''}
          order by coalesce(completed_at, started_at) desc
          limit 1
        `,
        params,
      )
      return result.rows[0] ? mapSnapshotMetadataRow(result.rows[0]) : null
    }

    return (
      snapshots.find((snapshot) => {
        if (
          input?.dashboardEligible !== undefined &&
          snapshot.dashboardEligible !== input.dashboardEligible
        ) {
          return false
        }
        if (
          input?.successfulOnly &&
          snapshot.status !== 'success' &&
          snapshot.status !== 'partial_success'
        ) {
          return false
        }
        if (
          normalizedAccountIds.length > 0 &&
          !sameAccountSelection(
            (snapshot as HoldingsSnapshotMetadata).selectedAccountIds ?? [],
            normalizedAccountIds,
          )
        ) {
          return false
        }
        return true
      }) as HoldingsSnapshotMetadata | undefined
    ) ?? null
  },

  async listHoldingsSnapshotsByAccount(
    accountId: string,
    input?: { fromDate?: string; toDate?: string; limit?: number },
  ): Promise<HoldingsSnapshotMetadata[]> {
    if (pool) {
      const params: unknown[] = [accountId]
      const conditions = [`selected_account_ids ? $1`]
      if (input?.fromDate) {
        params.push(input.fromDate)
        conditions.push(`data_as_of_date >= $${params.length}`)
      }
      if (input?.toDate) {
        params.push(input.toDate)
        conditions.push(`data_as_of_date <= $${params.length}`)
      }
      params.push(input?.limit ?? 50)
      const limitParam = params.length

      const result = await pool.query<SnapshotRow>(
        `
          select id, requested_by_user_id, status, started_at, completed_at,
            selected_account_ids, error_message, refresh_attempt_id, data_as_of_date,
            data_as_of_min_date, data_as_of_max_date, fetched_at,
            dashboard_eligible, holdings_count
          from holdings_sync_snapshots
          where ${conditions.join(' and ')}
          order by coalesce(data_as_of_date, completed_at::date, started_at::date) desc
          limit $${limitParam}
        `,
        params,
      )
      return result.rows.map(mapSnapshotMetadataRow)
    }

    return (snapshots as HoldingsSnapshotMetadata[])
      .filter((snapshot) => snapshot.selectedAccountIds?.includes(accountId))
      .filter(
        (snapshot) =>
          !input?.fromDate ||
          !snapshot.dataAsOfDate ||
          snapshot.dataAsOfDate >= input.fromDate,
      )
      .filter(
        (snapshot) =>
          !input?.toDate ||
          !snapshot.dataAsOfDate ||
          snapshot.dataAsOfDate <= input.toDate,
      )
      .slice(0, input?.limit ?? 50)
  },

  async listDashboardHoldingsSnapshots(input: {
    accountIds: string[]
    fromDate?: string
    toDate?: string
    limit?: number
  }): Promise<HoldingsSnapshotMetadata[]> {
    const accountIds = normalizeAccountIds(input.accountIds)
    if (accountIds.length === 0) return []

    const limit = Math.min(Math.max(input.limit ?? 5_000, 1), 5_000)
    if (pool) {
      const params: unknown[] = [JSON.stringify(accountIds)]
      const conditions = [
        `selected_account_ids @> $1::jsonb`,
        `dashboard_eligible = true`,
        `status = 'success'`,
      ]
      if (input.fromDate) {
        params.push(input.fromDate)
        conditions.push(
          `coalesce(data_as_of_date, completed_at::date, started_at::date) >= $${params.length}`,
        )
      }
      if (input.toDate) {
        params.push(input.toDate)
        conditions.push(
          `coalesce(data_as_of_date, completed_at::date, started_at::date) <= $${params.length}`,
        )
      }
      params.push(limit)

      const result = await pool.query<SnapshotRow>(
        `
          select id, requested_by_user_id, status, started_at, completed_at,
            selected_account_ids, error_message, refresh_attempt_id, data_as_of_date,
            data_as_of_min_date, data_as_of_max_date, fetched_at,
            dashboard_eligible, holdings_count
          from holdings_sync_snapshots
          where ${conditions.join(' and ')}
          order by coalesce(data_as_of_date, completed_at::date, started_at::date) desc,
            coalesce(completed_at, started_at) desc
          limit $${params.length}
        `,
        params,
      )
      return result.rows.map(mapSnapshotMetadataRow)
    }

    return (snapshots as HoldingsSnapshotMetadata[])
      .filter(
        (snapshot) =>
          snapshot.dashboardEligible === true &&
          snapshot.status === 'success' &&
          accountIds.every((accountId) => snapshot.selectedAccountIds?.includes(accountId)),
      )
      .filter((snapshot) => {
        const date =
          snapshot.dataAsOfDate ??
          snapshot.completedAt?.slice(0, 10) ??
          snapshot.startedAt.slice(0, 10)
        if (input.fromDate && date < input.fromDate) return false
        if (input.toDate && date > input.toDate) return false
        return true
      })
      .sort((left, right) => {
        const leftDate =
          left.dataAsOfDate ?? left.completedAt?.slice(0, 10) ?? left.startedAt.slice(0, 10)
        const rightDate =
          right.dataAsOfDate ?? right.completedAt?.slice(0, 10) ?? right.startedAt.slice(0, 10)
        return rightDate.localeCompare(leftDate) || right.startedAt.localeCompare(left.startedAt)
      })
      .slice(0, limit)
  },

  async withSelectedAccountsRefreshLock<T>(
    selectedAccountIds: string[],
    task: () => Promise<T>,
  ): Promise<RefreshLockResult<T>> {
    const normalizedAccountIds = normalizeAccountIds(selectedAccountIds)
    const lockKey =
      normalizedAccountIds.length > 0 ? normalizedAccountIds.join('|') : 'all'

    if (pool) {
      return withTransaction(async (client) => {
        const result = await client.query<{ acquired: boolean }>(
          `
            select pg_try_advisory_xact_lock(
              hashtext('plaid-refresh'),
              hashtext($1)
            ) as acquired
          `,
          [lockKey],
        )

        if (!result.rows[0]?.acquired) {
          return { acquired: false }
        }

        return {
          acquired: true,
          result: await task(),
        }
      })
    }

    if (activeRefreshLocks.has(lockKey)) {
      return { acquired: false }
    }

    activeRefreshLocks.add(lockKey)
    try {
      return {
        acquired: true,
        result: await task(),
      }
    } finally {
      activeRefreshLocks.delete(lockKey)
    }
  },

  getProductionReadinessDiagnostics(): ProductionReadinessDiagnostic[] {
    const checkedAt = new Date()
    const rows: ProductionReadinessDiagnosticRow[] = [
      {
        key: 'database_configured',
        status: pool ? 'pass' : 'warning',
        safe_value: Boolean(pool),
        warning: pool ? null : 'DATABASE_URL is not configured.',
        checked_at: checkedAt,
      },
      {
        key: 'refresh_policy_configured',
        status: 'pass',
        safe_value: `${config.plaidRefresh.timeLocal} ${config.plaidRefresh.timezone}`,
        warning: null,
        checked_at: checkedAt,
      },
      {
        key: 'scheduler_token_configured',
        status: config.plaidRefresh.schedulerToken ? 'pass' : 'warning',
        safe_value: Boolean(config.plaidRefresh.schedulerToken),
        warning: config.plaidRefresh.schedulerToken
          ? null
          : 'ATLAS_SCHEDULER_TOKEN is not configured.',
        checked_at: checkedAt,
      },
      {
        key: 'plaid_credentials_configured',
        status: config.plaid.clientId && config.plaid.secret ? 'pass' : 'warning',
        safe_value: Boolean(config.plaid.clientId && config.plaid.secret),
        warning:
          config.plaid.clientId && config.plaid.secret
            ? null
            : 'Plaid credentials are not fully configured.',
        checked_at: checkedAt,
      },
    ]

    return rows.map(mapProductionReadinessDiagnosticRow)
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

  getSelectedInvestmentAccounts(
    visibility?: PlaidAccountVisibility,
  ): PlaidInvestmentAccount[] {
    return accounts.filter(
      (account) =>
        account.selectedForHoldingsReport &&
        accountIsVisible(account, visibility),
    )
  },

  getSelectedInvestmentAccountsByConnection(): Array<{
    connection: PlaidConnectionRecord
    accounts: PlaidInvestmentAccount[]
  }> {
    const selectedAccounts = this.getSelectedInvestmentAccounts()
    return connections
      .filter((connection) => connection.status === 'connected' && connection.accessToken)
      .map((connection) => ({
        connection,
        accounts: selectedAccounts.filter(
          (account) => account.connectionId === connection.id,
        ),
      }))
      .filter((entry) => entry.accounts.length > 0)
  },

  createSyncSnapshot(input: {
    id?: string
    requestedByUserId?: string | null
    selectedAccountIds: string[]
    status?: HoldingsSyncSnapshot['status']
    startedAt?: string
    completedAt?: string | null
    errorMessage?: string | null
    refreshAttemptId?: string | null
    dataAsOfDate?: string | null
    dataAsOfMinDate?: string | null
    dataAsOfMaxDate?: string | null
    fetchedAt?: string | null
    dashboardEligible?: boolean
    holdingsCount?: number
  }): HoldingsSyncSnapshot {
    const status = input.status ?? 'success'
    const completedAt = input.completedAt ?? (status === 'pending' ? null : nowIso())
    const snapshot: HoldingsSyncSnapshot = {
      id: input.id ?? randomUUID(),
      status,
      startedAt: input.startedAt ?? nowIso(),
      completedAt,
      errorMessage: input.errorMessage ?? null,
      refreshAttemptId: input.refreshAttemptId ?? null,
      dataAsOfDate: input.dataAsOfDate ?? null,
      dataAsOfMinDate: input.dataAsOfMinDate ?? input.dataAsOfDate ?? null,
      dataAsOfMaxDate: input.dataAsOfMaxDate ?? input.dataAsOfDate ?? null,
      fetchedAt: input.fetchedAt ?? completedAt,
      dashboardEligible:
        input.dashboardEligible ??
        defaultDashboardEligible(status, input.holdingsCount),
      holdingsCount: input.holdingsCount ?? 0,
      selectedAccountIds: normalizeAccountIds(input.selectedAccountIds),
    }
    const existingIndex = snapshots.findIndex((item) => item.id === snapshot.id)
    if (existingIndex >= 0) snapshots.splice(existingIndex, 1)
    snapshots.unshift(snapshot)
    persistSnapshot(snapshot, input.selectedAccountIds, input.requestedByUserId ?? null)

    for (const account of accounts) {
      if (input.selectedAccountIds.includes(account.id)) {
        account.syncStatus =
          snapshot.status === 'pending'
            ? 'pending'
            : snapshot.status === 'failed'
              ? 'failed'
              : 'success'
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
    for (let index = sourceHoldings.length - 1; index >= 0; index -= 1) {
      if (sourceHoldings[index]!.syncSnapshotId === syncSnapshotId) {
        sourceHoldings.splice(index, 1)
      }
    }
    sourceHoldings.push(...holdings.map((holding) => ({ ...holding, syncSnapshotId })))
    persistSourceHoldings(syncSnapshotId, holdings)
    return holdings
  },

  listSourceHoldingsForSnapshot(syncSnapshotId: string): SourceHoldingRecord[] {
    return sourceHoldings
      .filter((holding) => holding.syncSnapshotId === syncSnapshotId)
      .map((holding) => ({ ...holding }))
  },

  listSourceHoldingsForSelectedAccounts(
    visibility?: PlaidAccountVisibility,
  ): SourceHoldingRecord[] {
    const selectedAccountIds = this.getSelectedInvestmentAccounts(visibility).map(
      (account) => account.id,
    )
    const selected = new Set(selectedAccountIds)
    const latestSnapshotByAccount =
      latestDashboardSnapshotIdByAccount(selectedAccountIds)

    return sourceHoldings.filter(
      (holding) =>
        selected.has(holding.accountId) &&
        latestSnapshotByAccount.get(holding.accountId) === holding.syncSnapshotId,
    )
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
    snapshot.selectedAccountIds ??= normalizeAccountIds(
      input.accounts
        .filter((account) => account.selectedForHoldingsReport)
        .map((account) => account.id),
    )
    snapshot.dashboardEligible ??=
      defaultDashboardEligible(snapshot.status, input.holdings.length)
    snapshot.holdingsCount ??= input.holdings.length
    snapshot.fetchedAt ??= snapshot.completedAt
    snapshot.dataAsOfDate ??=
      input.holdings
        .map((holding) => holding.asOfDate)
        .filter((value): value is string => Boolean(value))
        .sort((a, b) => b.localeCompare(a))[0] ?? null
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

  async flushPersistenceWrites(): Promise<void> {
    await dbWriteQueue
  },

  async _flushPersistenceWrites(): Promise<void> {
    await this.flushPersistenceWrites()
  },
}
