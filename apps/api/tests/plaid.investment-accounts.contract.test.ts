import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'
import { seedConsolidatedHoldingsFixture } from './helpers/consolidatedHoldingsTestHelpers.js'

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
})
