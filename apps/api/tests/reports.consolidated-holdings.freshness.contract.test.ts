import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'
import {
  getConsolidatedHoldingsViaApi,
  seedDatedConsolidatedHoldingsFixture,
} from './helpers/consolidatedHoldingsTestHelpers.js'
import { plaidHoldingsSync } from '../src/modules/plaid/plaid.holdings-sync.js'
import { config } from '../src/config.js'
import { plaidApi } from '../src/modules/plaid/plaid.client.js'
import { plaidRepository } from '../src/modules/plaid/plaid.repository.js'

const originalPlaidConfig = {
  clientId: config.plaid.clientId,
  secret: config.plaid.secret,
}

describe('GET /v1/reports/consolidated-holdings freshness contract', () => {
  let fixture: TestFixture

  beforeEach(async () => {
    fixture = await createTestFixture()
  })

  afterEach(async () => {
    config.plaid.clientId = originalPlaidConfig.clientId
    config.plaid.secret = originalPlaidConfig.secret
    vi.restoreAllMocks()
    await fixture.app.close()
  })

  it('returns saved snapshot metadata with consolidated holdings', async () => {
    const { snapshot } = seedDatedConsolidatedHoldingsFixture({
      dataAsOfDate: '2026-05-11',
      fetchedAt: '2026-05-11T12:00:00.000Z',
    })

    const response = await getConsolidatedHoldingsViaApi(fixture)

    expect(response.statusCode).toBe(200)
    expect(response.json().sync).toMatchObject({
      status: 'success',
      freshnessStatus: expect.stringMatching(/fresh|stale/),
      dataAsOfDate: '2026-05-11',
      dataFetchedAt: '2026-05-11T12:00:00.000Z',
      lastSuccessfulSyncAt: snapshot.completedAt,
      nextRefreshAt: expect.any(String),
      refreshing: false,
      activeRefreshId: null,
      warnings: [],
      refreshPolicy: {
        cadence: 'daily',
        refreshTimeLocal: '05:00',
        timezone: 'America/Los_Angeles',
        automaticRefreshEnabled: true,
      },
    })
  })

  it('does not call Plaid refresh work during repeated ordinary reads', async () => {
    seedDatedConsolidatedHoldingsFixture()
    const syncSpy = vi.spyOn(plaidHoldingsSync, 'syncSelectedHoldings')

    const first = await getConsolidatedHoldingsViaApi(fixture)
    const second = await getConsolidatedHoldingsViaApi(fixture)

    expect(first.statusCode).toBe(200)
    expect(second.statusCode).toBe(200)
    expect(syncSpy).not.toHaveBeenCalled()
  })

  it('honors manual refresh force mode when saved data is already fresh', async () => {
    config.plaid.clientId = 'test-client-id'
    config.plaid.secret = 'test-secret'
    plaidRepository.createConnectionFromPublicToken({
      ownerUserId: fixture.admin.id,
      plaidItemId: 'item-manual-force',
      accessToken: 'access-manual-force',
      institutionId: 'ins_manual_force',
      institutionName: 'Manual Force Brokerage',
      metadataAccounts: [
        {
          id: 'manual-force-account-1',
          name: 'Manual Force Account',
          type: 'investment',
          subtype: 'brokerage',
          mask: '5151',
        },
      ],
    })
    plaidRepository.updateSelectedInvestmentAccounts(['manual-force-account-1'])
    const freshSnapshot = plaidRepository.createSyncSnapshot({
      id: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
      requestedByUserId: fixture.admin.id,
      selectedAccountIds: ['manual-force-account-1'],
      status: 'success',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
      dataAsOfDate: new Date().toISOString().slice(0, 10),
      dataAsOfMinDate: new Date().toISOString().slice(0, 10),
      dataAsOfMaxDate: new Date().toISOString().slice(0, 10),
      dashboardEligible: true,
      holdingsCount: 1,
    })
    plaidRepository.replaceSourceHoldingsForSnapshot(freshSnapshot.id, [
      {
        id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1',
        syncSnapshotId: freshSnapshot.id,
        accountId: 'manual-force-account-1',
        plaidAccountId: 'manual-force-account-1',
        plaidSecurityId: 'sec-force',
        symbol: 'FORCE',
        description: 'Force Holding',
        type: 'Stock',
        sector: null,
        industry: null,
        cusip: null,
        isin: null,
        currencyCode: 'USD',
        quantity: 1,
        costBasis: 90,
        institutionPrice: 100,
        marketValue: 100,
        unrealizedGainLoss: 10,
        asOfDate: new Date().toISOString().slice(0, 10),
      },
    ])
    const plaidSpy = vi.spyOn(plaidApi, 'investmentsHoldingsGet').mockResolvedValue({
      data: {
        accounts: [
          {
            account_id: 'manual-force-account-1',
            name: 'Manual Force Account',
            official_name: 'Manual Force Account',
            mask: '5151',
            type: 'investment',
            subtype: 'brokerage',
          },
        ],
        securities: [
          {
            security_id: 'sec-forced',
            ticker_symbol: 'FORCED',
            name: 'Forced Holding',
            type: 'equity',
            close_price: 200,
            close_price_as_of: new Date().toISOString().slice(0, 10),
            iso_currency_code: 'USD',
            sector: null,
            industry: null,
            cusip: null,
            isin: null,
          },
        ],
        holdings: [
          {
            account_id: 'manual-force-account-1',
            security_id: 'sec-forced',
            quantity: 1,
            institution_value: 200,
            institution_price: 200,
            institution_price_as_of: new Date().toISOString().slice(0, 10),
            cost_basis: 150,
            iso_currency_code: 'USD',
          },
        ],
      },
    } as never)

    const skipped = await fixture.app.inject({
      method: 'POST',
      url: '/v1/reports/consolidated-holdings/refresh',
      headers: { cookie: fixture.cookie },
    })
    const forced = await fixture.app.inject({
      method: 'POST',
      url: '/v1/reports/consolidated-holdings/refresh',
      headers: { cookie: fixture.cookie },
      payload: { force: true },
    })

    expect(skipped.statusCode).toBe(202)
    expect(skipped.json()).toMatchObject({
      status: 'skipped',
      refreshReason: 'already_fresh',
    })
    expect(forced.statusCode).toBe(202)
    expect(forced.json()).toMatchObject({
      status: 'success',
      refreshReason: 'forced',
      dataAsOfDate: expect.any(String),
    })
    expect(plaidSpy).toHaveBeenCalledTimes(1)
  })
})
