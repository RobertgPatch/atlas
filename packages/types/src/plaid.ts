export type PlaidConnectionStatus = 'connected' | 'needs_update' | 'disconnected'

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

export interface PlaidConnectionResponse {
  connectionId: string
  institutionName: string
  accounts: PlaidInvestmentAccount[]
}

export interface PlaidLinkTokenRequest {
  mode?: 'create' | 'update'
  connectionId?: string | null
}

export interface PlaidLinkTokenResponse {
  linkToken: string
  expiration: string
}

export interface PlaidExchangePublicTokenRequest {
  publicToken: string
  metadata?: Record<string, unknown>
}

export interface PlaidInvestmentAccountsResponse {
  accounts: PlaidInvestmentAccount[]
}

export interface UpdatePlaidInvestmentAccountsRequest {
  selectedAccountIds: string[]
}

export type PlaidRefreshCadence = 'daily'

export interface PlaidRefreshPolicy {
  cadence: PlaidRefreshCadence
  refreshTimeLocal: string
  timezone: string
  automaticRefreshEnabled: boolean
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
  triggerSource: HoldingsRefreshTriggerSource
  refreshReason: HoldingsRefreshReason
  status: HoldingsRefreshAttemptStatus
  startedAt: string
  completedAt: string | null
  dataAsOfDate?: string | null
  selectedAccountIds: string[]
  errorMessage?: string | null
}

export type PlaidRefreshFreshnessStatus =
  | 'fresh'
  | 'stale'
  | 'refreshing'
  | 'failed'
  | 'unavailable'

export type PlaidRefreshSchedulerMode =
  | 'none'
  | 'external_cron'
  | 'in_process'
  | 'eventbridge'
  | 'manual'

export interface PlaidRefreshDiagnostic {
  refreshPolicy: PlaidRefreshPolicy
  schedulerConfigured: boolean
  schedulerMode: PlaidRefreshSchedulerMode
  freshnessStatus: PlaidRefreshFreshnessStatus
  lastAttemptedRefreshAt: string | null
  lastSuccessfulRefreshAt: string | null
  nextRefreshAt: string | null
  activeRefreshId?: string | null
  warnings: string[]
  checkedAt: string
}

export interface ProductionReadinessDurablePersistence {
  databaseConfigured: boolean
  mode: 'durable' | 'temporary' | 'mixed' | 'unavailable'
}

export interface ProductionReadinessSecretsConfigured {
  persistenceSecretKey: boolean
  sessionSecret: boolean
  plaidCredentials: boolean
  schedulerToken: boolean
}

export interface ProductionReadinessSecureCookies {
  secure: boolean
  sameSite: 'lax' | 'strict' | 'none'
}

export interface ProductionReadinessScopingStatus {
  apiRepositoryScoping: 'required_passed' | 'required_failed' | 'unknown'
  postgresRls: 'deferred_hardening' | 'enabled' | 'not_planned'
}

export interface ProductionReadinessDiagnostic {
  environment: string
  durablePersistence: ProductionReadinessDurablePersistence
  schedulerConfigured: boolean
  secretsConfigured: ProductionReadinessSecretsConfigured
  secureCookies: ProductionReadinessSecureCookies
  allowedOrigin: string
  rateLimitConfigured: boolean
  apiCachingPolicy: 'no_shared_cache' | 'private_only' | 'unknown'
  scopingStatus: ProductionReadinessScopingStatus
  warnings: string[]
  checkedAt: string
}

export interface RefreshConflict {
  error: 'REFRESH_ALREADY_RUNNING'
  activeRefreshId: string
}
