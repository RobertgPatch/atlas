import type { TestFixture } from './testApp.js'
import { plaidRepository } from '../../src/modules/plaid/plaid.repository.js'
import type { PlaidInvestmentAccount } from '../../../../packages/types/src/plaid.js'

export const seedConsolidatedHoldingsFixture = () => {
  const accounts: PlaidInvestmentAccount[] = [
    {
      id: '11111111-1111-4111-8111-111111111111',
      connectionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      custodianName: 'Brokerage A',
      name: 'Taxable',
      officialName: 'Taxable Brokerage',
      mask: '1111',
      type: 'investment',
      subtype: 'brokerage',
      selectedForHoldingsReport: true,
      syncStatus: 'success',
      lastSyncedAt: '2026-05-11T08:00:00.000Z',
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      connectionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      custodianName: 'Brokerage B',
      name: 'IRA',
      officialName: 'IRA Brokerage',
      mask: '2222',
      type: 'investment',
      subtype: 'ira',
      selectedForHoldingsReport: true,
      syncStatus: 'success',
      lastSyncedAt: '2026-05-11T08:00:00.000Z',
    },
  ]

  plaidRepository._debugSeed({
    accounts,
    holdings: [
      {
        id: '33333333-3333-4333-8333-333333333333',
        accountId: accounts[0].id,
        plaidAccountId: accounts[0].id,
        plaidSecurityId: 'sec-googl-a',
        symbol: 'GOOGL',
        description: 'Alphabet Inc. Class A',
        type: 'Stock',
        cusip: '02079K305',
        isin: null,
        currencyCode: 'USD',
        quantity: 20,
        costBasis: 2_000,
        institutionPrice: 175,
        marketValue: 3_500,
        unrealizedGainLoss: 1_500,
        asOfDate: '2026-05-11',
      },
      {
        id: '44444444-4444-4444-8444-444444444444',
        accountId: accounts[1].id,
        plaidAccountId: accounts[1].id,
        plaidSecurityId: 'sec-googl-b',
        symbol: 'GOOGL',
        description: 'Alphabet Inc. Class A',
        type: 'Stock',
        cusip: '02079K305',
        isin: null,
        currencyCode: 'USD',
        quantity: 50,
        costBasis: 6_000,
        institutionPrice: 175,
        marketValue: 8_750,
        unrealizedGainLoss: 2_750,
        asOfDate: '2026-05-11',
      },
    ],
  })

  return { accounts }
}

export const getConsolidatedHoldingsViaApi = async (
  fixture: TestFixture,
  query = '',
  cookie = fixture.cookie,
) =>
  fixture.app.inject({
    method: 'GET',
    url: `/v1/reports/consolidated-holdings${query ? `?${query}` : ''}`,
    headers: { cookie },
  })
