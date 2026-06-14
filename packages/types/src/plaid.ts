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
