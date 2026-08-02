import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'
import { seedConsolidatedHoldingsFixture } from './helpers/consolidatedHoldingsTestHelpers.js'
import { plaidRepository } from '../src/modules/plaid/plaid.repository.js'

const seedOwnedAccounts = (fixture: TestFixture) => {
  plaidRepository._debugReset()
  plaidRepository.createConnectionFromPublicToken({
    ownerUserId: fixture.admin.id,
    plaidItemId: 'admin-item',
    accessToken: 'admin-access-token',
    institutionId: 'admin-institution',
    institutionName: 'Admin Brokerage',
    metadataAccounts: [
      { id: 'admin-account', name: 'Admin Account', type: 'investment' },
    ],
  })
  plaidRepository.createConnectionFromPublicToken({
    ownerUserId: fixture.user.id,
    plaidItemId: 'user-item',
    accessToken: 'user-access-token',
    institutionId: 'user-institution',
    institutionName: 'User Brokerage',
    metadataAccounts: [
      { id: 'user-account', name: 'User Account', type: 'investment' },
    ],
  })
}

describe('Plaid investment accounts contract', () => {
  let fixture: TestFixture

  beforeEach(async () => {
    fixture = await createTestFixture()
    seedConsolidatedHoldingsFixture()
  })

  afterEach(async () => {
    await fixture.app.close()
  })

  it('lists connected investment accounts', async () => {
    const response = await fixture.app.inject({
      method: 'GET',
      url: '/v1/plaid/investment-accounts',
      headers: { cookie: fixture.cookie },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.accounts).toHaveLength(2)
    expect(body.accounts[0]).toHaveProperty('custodianName')
    expect(body.accounts[0]).toHaveProperty('selectedForHoldingsReport')
  })

  it('updates selected accounts', async () => {
    const response = await fixture.app.inject({
      method: 'POST',
      url: '/v1/plaid/investment-accounts/selection',
      headers: { cookie: fixture.cookie },
      payload: {
        selectedAccountIds: ['11111111-1111-4111-8111-111111111111'],
      },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    const selected = body.accounts.filter(
      (account: { selectedForHoldingsReport: boolean }) =>
        account.selectedForHoldingsReport,
    )
    expect(selected).toHaveLength(1)
    expect(selected[0].id).toBe('11111111-1111-4111-8111-111111111111')
  })

  it('clears connected investment accounts and liquidity holdings', async () => {
    const clearResponse = await fixture.app.inject({
      method: 'DELETE',
      url: '/v1/plaid/investment-accounts',
      headers: { cookie: fixture.cookie },
    })

    expect(clearResponse.statusCode).toBe(200)
    expect(clearResponse.json()).toEqual({ accounts: [] })

    const accountsResponse = await fixture.app.inject({
      method: 'GET',
      url: '/v1/plaid/investment-accounts',
      headers: { cookie: fixture.cookie },
    })
    expect(accountsResponse.json().accounts).toHaveLength(0)

    const holdingsResponse = await fixture.app.inject({
      method: 'GET',
      url: '/v1/reports/consolidated-holdings',
      headers: { cookie: fixture.cookie },
    })
    expect(holdingsResponse.statusCode).toBe(200)
    const holdings = holdingsResponse.json()
    expect(holdings.rows).toHaveLength(0)
    expect(holdings.kpis.selectedAccountCount).toBe(0)
    expect(holdings.sync.status).toBe('never_synced')
  })

  it('isolates account reads and selection updates by connection owner', async () => {
    seedOwnedAccounts(fixture)

    const userList = await fixture.app.inject({
      method: 'GET',
      url: '/v1/plaid/investment-accounts',
      headers: { cookie: fixture.userCookie },
    })
    expect(userList.statusCode).toBe(200)
    expect(userList.json().accounts.map((account: { id: string }) => account.id)).toEqual([
      'user-account',
    ])

    const update = await fixture.app.inject({
      method: 'POST',
      url: '/v1/plaid/investment-accounts/selection',
      headers: { cookie: fixture.userCookie },
      payload: { selectedAccountIds: ['admin-account'] },
    })
    expect(update.statusCode).toBe(200)
    expect(update.json().accounts).toMatchObject([
      { id: 'user-account', selectedForHoldingsReport: false },
    ])

    const adminAccounts = plaidRepository.listInvestmentAccounts({
      actorUserId: fixture.admin.id,
      isAdmin: true,
    })
    expect(adminAccounts.find((account) => account.id === 'admin-account'))
      .toMatchObject({ selectedForHoldingsReport: true })
  })

  it('clears only the caller-owned Plaid data for non-admin users', async () => {
    seedOwnedAccounts(fixture)

    const clearResponse = await fixture.app.inject({
      method: 'DELETE',
      url: '/v1/plaid/investment-accounts',
      headers: { cookie: fixture.userCookie },
    })
    expect(clearResponse.statusCode).toBe(200)
    expect(clearResponse.json()).toEqual({ accounts: [] })

    const adminList = await fixture.app.inject({
      method: 'GET',
      url: '/v1/plaid/investment-accounts',
      headers: { cookie: fixture.cookie },
    })
    expect(adminList.json().accounts.map((account: { id: string }) => account.id)).toEqual([
      'admin-account',
    ])
  })

  it('refreshes only accounts visible to the requesting non-admin user', async () => {
    seedOwnedAccounts(fixture)
    const now = new Date().toISOString()
    plaidRepository.createSyncSnapshot({
      requestedByUserId: fixture.user.id,
      selectedAccountIds: ['user-account'],
      status: 'success',
      startedAt: now,
      completedAt: now,
      fetchedAt: now,
      dataAsOfDate: now.slice(0, 10),
      dashboardEligible: true,
      holdingsCount: 1,
    })

    const response = await fixture.app.inject({
      method: 'POST',
      url: '/v1/reports/consolidated-holdings/refresh',
      headers: { cookie: fixture.userCookie },
      payload: {},
    })
    expect(response.statusCode).toBe(202)
    expect(response.json().selectedAccountIds).toEqual(['user-account'])
  })

  it('does not allow a Plaid Item to be reassigned across owners', () => {
    seedOwnedAccounts(fixture)

    expect(() =>
      plaidRepository.createConnectionFromPublicToken({
        ownerUserId: fixture.user.id,
        plaidItemId: 'admin-item',
        accessToken: 'replacement-access-token',
        institutionId: 'admin-institution',
        institutionName: 'Admin Brokerage',
        metadataAccounts: [],
      }),
    ).toThrow('PLAID_CONNECTION_OWNERSHIP_CONFLICT')
  })
})
