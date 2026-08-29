import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'
import { getConsolidatedHoldingsViaApi } from './helpers/consolidatedHoldingsTestHelpers.js'
import { config } from '../src/config.js'
import { plaidApi } from '../src/modules/plaid/plaid.client.js'
import {
  plaidRepository,
  type SourceHoldingRecord,
} from '../src/modules/plaid/plaid.repository.js'

const schedulerToken = 'test-scheduler-token-123'
const accountId = 'policy-account-1'

const selectedAccountIds = [accountId]

const originalPlaidConfig = {
  clientId: config.plaid.clientId,
  secret: config.plaid.secret,
}
const originalSchedulerConfig = {
  enabled: config.plaidRefresh.schedulerEnabled,
  mode: config.plaidRefresh.schedulerMode,
  token: config.plaidRefresh.schedulerToken,
}
const originalReadinessConfig = {
  databaseUrl: config.databaseUrl,
  persistenceSecretKey: config.persistenceSecretKey,
  sessionSecret: config.sessionSecret,
}

const configureRuntime = () => {
  config.plaid.clientId = 'test-client-id'
  config.plaid.secret = 'test-secret'
  config.plaidRefresh.schedulerEnabled = true
  config.plaidRefresh.schedulerMode = 'eventbridge'
  config.plaidRefresh.schedulerToken = schedulerToken
}

const restoreRuntime = () => {
  config.plaid.clientId = originalPlaidConfig.clientId
  config.plaid.secret = originalPlaidConfig.secret
  config.plaidRefresh.schedulerEnabled = originalSchedulerConfig.enabled
  config.plaidRefresh.schedulerMode = originalSchedulerConfig.mode
  config.plaidRefresh.schedulerToken = originalSchedulerConfig.token
  config.databaseUrl = originalReadinessConfig.databaseUrl
  config.persistenceSecretKey = originalReadinessConfig.persistenceSecretKey
  config.sessionSecret = originalReadinessConfig.sessionSecret
}

const connectSelectedAccount = (fixture: TestFixture) => {
  plaidRepository.createConnectionFromPublicToken({
    ownerUserId: fixture.admin.id,
    plaidItemId: 'item-policy-refresh',
    accessToken: 'access-policy-refresh',
    institutionId: 'ins_policy_refresh',
    institutionName: 'Policy Refresh Brokerage',
    metadataAccounts: [
      {
        id: accountId,
        name: 'Policy Account',
        official_name: 'Policy Account',
        type: 'investment',
        subtype: 'brokerage',
        mask: '4242',
      },
    ],
  })
  plaidRepository.updateSelectedInvestmentAccounts(selectedAccountIds)
}

const sourceHolding = (input: {
  id: string
  snapshotId: string
  symbol: string
  marketValue: number
  asOfDate: string
}): SourceHoldingRecord => ({
  id: input.id,
  syncSnapshotId: input.snapshotId,
  accountId,
  plaidAccountId: accountId,
  plaidSecurityId: `sec-${input.symbol.toLowerCase()}`,
  symbol: input.symbol,
  description: `${input.symbol} Holding`,
  type: 'Stock',
  sector: null,
  industry: null,
  cusip: null,
  isin: null,
  currencyCode: 'USD',
  quantity: 1,
  costBasis: input.marketValue - 10,
  institutionPrice: input.marketValue,
  marketValue: input.marketValue,
  unrealizedGainLoss: 10,
  asOfDate: input.asOfDate,
})

const seedSnapshot = (input: {
  id: string
  requestedByUserId?: string | null
  fetchedAt: string
  dataAsOfDate: string
  symbol: string
  marketValue: number
}) => {
  const snapshot = plaidRepository.createSyncSnapshot({
    id: input.id,
    requestedByUserId: input.requestedByUserId ?? null,
    selectedAccountIds,
    status: 'success',
    startedAt: input.fetchedAt,
    completedAt: input.fetchedAt,
    fetchedAt: input.fetchedAt,
    dataAsOfDate: input.dataAsOfDate,
    dataAsOfMinDate: input.dataAsOfDate,
    dataAsOfMaxDate: input.dataAsOfDate,
    dashboardEligible: true,
    holdingsCount: 1,
  })
  plaidRepository.replaceSourceHoldingsForSnapshot(snapshot.id, [
    sourceHolding({
      id: randomUUID(),
      snapshotId: snapshot.id,
      symbol: input.symbol,
      marketValue: input.marketValue,
      asOfDate: input.dataAsOfDate,
    }),
  ])
  return snapshot
}

const mockPlaidHoldings = (input: {
  symbol: string
  marketValue: number
  asOfDate: string
}) =>
  vi.spyOn(plaidApi, 'investmentsHoldingsGet').mockResolvedValue({
    data: {
      accounts: [
        {
          account_id: accountId,
          name: 'Policy Account',
          official_name: 'Policy Account',
          mask: '4242',
          type: 'investment',
          subtype: 'brokerage',
        },
      ],
      securities: [
        {
          security_id: `sec-${input.symbol.toLowerCase()}`,
          ticker_symbol: input.symbol,
          name: `${input.symbol} Inc.`,
          type: 'equity',
          close_price: input.marketValue,
          close_price_as_of: input.asOfDate,
          iso_currency_code: 'USD',
          sector: null,
          industry: null,
          cusip: null,
          isin: null,
        },
      ],
      holdings: [
        {
          account_id: accountId,
          security_id: `sec-${input.symbol.toLowerCase()}`,
          quantity: 2,
          institution_value: input.marketValue,
          institution_price: input.marketValue / 2,
          institution_price_as_of: input.asOfDate,
          cost_basis: input.marketValue - 50,
          iso_currency_code: 'USD',
        },
      ],
    },
  } as never)

describe('Plaid refresh policy integration', () => {
  let fixture: TestFixture

  beforeEach(async () => {
    configureRuntime()
    fixture = await createTestFixture()
    connectSelectedAccount(fixture)
  })

  afterEach(async () => {
    restoreRuntime()
    vi.restoreAllMocks()
    await fixture.app.close()
  })

  it('creates a new saved snapshot for a stale scheduled refresh', async () => {
    seedSnapshot({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      fetchedAt: '2026-06-30T12:05:00.000Z',
      dataAsOfDate: '2026-06-30',
      symbol: 'OLD',
      marketValue: 100,
    })
    const plaidSpy = mockPlaidHoldings({
      symbol: 'AAPL',
      marketValue: 500,
      asOfDate: '2026-07-01',
    })

    const response = await fixture.app.inject({
      method: 'POST',
      url: '/v1/admin/plaid-refresh/run',
      headers: { 'x-atlas-scheduler-token': schedulerToken },
      payload: { scheduledFor: '2026-07-01T12:00:00.000Z' },
    })
    const holdings = await getConsolidatedHoldingsViaApi(fixture)

    expect(response.statusCode).toBe(202)
    expect(response.json()).toMatchObject({
      triggerSource: 'scheduled',
      refreshReason: 'daily_cutoff',
      status: 'success',
      dataAsOfDate: '2026-07-01',
      selectedAccountIds,
    })
    expect(plaidSpy).toHaveBeenCalledTimes(1)
    expect(holdings.json().rows[0]).toMatchObject({
      symbol: 'AAPL',
      marketValue: 500,
    })
  })

  it('skips scheduled refresh and Plaid calls when the saved snapshot is fresh', async () => {
    const now = new Date().toISOString()
    seedSnapshot({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
      fetchedAt: now,
      dataAsOfDate: now.slice(0, 10),
      symbol: 'FRESH',
      marketValue: 200,
    })
    const plaidSpy = mockPlaidHoldings({
      symbol: 'SHOULD_NOT_LOAD',
      marketValue: 999,
      asOfDate: now.slice(0, 10),
    })

    const response = await fixture.app.inject({
      method: 'POST',
      url: '/v1/admin/plaid-refresh/run',
      headers: { 'x-atlas-scheduler-token': schedulerToken },
    })

    expect(response.statusCode).toBe(202)
    expect(response.json()).toMatchObject({
      triggerSource: 'scheduled',
      refreshReason: 'already_fresh',
      status: 'skipped',
      selectedAccountIds,
    })
    expect(plaidSpy).not.toHaveBeenCalled()
  })

  it('keeps the previous saved snapshot visible when a refresh fails', async () => {
    seedSnapshot({
      id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
      fetchedAt: '2026-06-30T12:05:00.000Z',
      dataAsOfDate: '2026-06-30',
      symbol: 'KEEP',
      marketValue: 300,
    })
    vi.spyOn(plaidApi, 'investmentsHoldingsGet').mockRejectedValue(
      new Error('Plaid sandbox is unavailable'),
    )

    const response = await fixture.app.inject({
      method: 'POST',
      url: '/v1/reports/consolidated-holdings/refresh',
      headers: { cookie: fixture.cookie },
      payload: { force: true },
    })
    const holdings = await getConsolidatedHoldingsViaApi(fixture)

    expect(response.statusCode).toBe(202)
    expect(response.json()).toMatchObject({
      triggerSource: 'manual',
      refreshReason: 'forced',
      status: 'failed',
      selectedAccountIds,
    })
    expect(holdings.statusCode).toBe(200)
    expect(holdings.json().rows[0]).toMatchObject({
      symbol: 'KEEP',
      marketValue: 300,
    })
  })

  it('reports a missing scheduler warning in admin diagnostics', async () => {
    config.plaidRefresh.schedulerEnabled = false
    config.plaidRefresh.schedulerMode = 'none'
    config.plaidRefresh.schedulerToken = ''

    const response = await fixture.app.inject({
      method: 'GET',
      url: '/v1/admin/plaid-refresh-status',
      headers: { cookie: fixture.cookie },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().schedulerConfigured).toBe(false)
    expect(response.json().warnings.join(' ')).toMatch(/scheduler|PROJECT_JACKSON_SCHEDULER_TOKEN/i)
  })

  it('does not expose secret runtime values in refresh diagnostics', async () => {
    const sentinelSecrets = [
      'postgres://atlas_user:super-secret-db-pass@db.example.com:5432/atlas',
      'persist-secret-value-refresh-diagnostics',
      'session-secret-value-refresh-diagnostics',
      'plaid-secret-value-refresh-diagnostics',
      'scheduler-secret-value-refresh-diagnostics',
    ]
    config.databaseUrl = sentinelSecrets[0]!
    config.persistenceSecretKey = sentinelSecrets[1]!
    config.sessionSecret = sentinelSecrets[2]!
    config.plaid.secret = sentinelSecrets[3]!
    config.plaidRefresh.schedulerToken = sentinelSecrets[4]!

    const response = await fixture.app.inject({
      method: 'GET',
      url: '/v1/admin/plaid-refresh-status',
      headers: { cookie: fixture.cookie },
    })

    expect(response.statusCode).toBe(200)
    const serialized = JSON.stringify(response.json())
    for (const secret of sentinelSecrets) {
      expect(serialized).not.toContain(secret)
    }
  })
})
