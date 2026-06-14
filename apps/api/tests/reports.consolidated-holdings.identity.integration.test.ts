import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'
import { getConsolidatedHoldingsViaApi } from './helpers/consolidatedHoldingsTestHelpers.js'
import { plaidRepository } from '../src/modules/plaid/plaid.repository.js'

describe('Consolidated holdings identity confidence', () => {
  let fixture: TestFixture

  beforeEach(async () => {
    fixture = await createTestFixture()
    plaidRepository._debugSeed({
      accounts: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          connectionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          custodianName: 'Brokerage A',
          name: 'Taxable',
          officialName: null,
          mask: '1111',
          type: 'investment',
          subtype: 'brokerage',
          selectedForHoldingsReport: true,
          syncStatus: 'success',
          lastSyncedAt: '2026-05-11T08:00:00.000Z',
        },
      ],
      holdings: [
        {
          id: '55555555-5555-4555-8555-555555555555',
          accountId: '11111111-1111-4111-8111-111111111111',
          plaidAccountId: '11111111-1111-4111-8111-111111111111',
          plaidSecurityId: null,
          symbol: null,
          description: 'Private Holding',
          type: 'Unknown',
          cusip: null,
          isin: null,
          currencyCode: 'USD',
          quantity: 1,
          costBasis: null,
          institutionPrice: null,
          marketValue: null,
          unrealizedGainLoss: null,
          asOfDate: '2026-05-11',
        },
      ],
    })
  })

  afterEach(async () => {
    await fixture.app.close()
  })

  it('surfaces low confidence for name-only holdings', async () => {
    const response = await getConsolidatedHoldingsViaApi(fixture)

    expect(response.statusCode).toBe(200)
    expect(response.json().rows[0].identityConfidence).toBe('low')
  })
})
