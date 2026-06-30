import type { TestFixture } from './testApp.js'
import { plaidRepository } from '../../src/modules/plaid/plaid.repository.js'
import type { PlaidInvestmentAccount } from '../../../../packages/types/src/plaid.js'
import type { HoldingsSyncSnapshot } from '../../src/modules/plaid/plaid.repository.js'

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
        sector: null,
        industry: null,
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
        sector: null,
        industry: null,
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

export const seedDatedConsolidatedHoldingsFixture = (input?: {
  dataAsOfDate?: string
  fetchedAt?: string
  dashboardEligible?: boolean
}) => {
  const dataAsOfDate = input?.dataAsOfDate ?? '2026-05-11'
  const fetchedAt = input?.fetchedAt ?? `${dataAsOfDate}T12:00:00.000Z`
  const accounts: PlaidInvestmentAccount[] = [
    {
      id: '55555555-5555-4555-8555-555555555555',
      connectionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      custodianName: 'Brokerage C',
      name: 'Liquidity',
      officialName: 'Liquidity Brokerage',
      mask: '5555',
      type: 'investment',
      subtype: 'brokerage',
      selectedForHoldingsReport: true,
      syncStatus: 'success',
      lastSyncedAt: fetchedAt,
    },
  ]
  const snapshot: HoldingsSyncSnapshot = {
    id: '66666666-6666-4666-8666-666666666666',
    status: 'success',
    startedAt: fetchedAt,
    completedAt: fetchedAt,
    errorMessage: null,
    dataAsOfDate,
    dataAsOfMinDate: dataAsOfDate,
    dataAsOfMaxDate: dataAsOfDate,
    fetchedAt,
    dashboardEligible: input?.dashboardEligible ?? true,
    holdingsCount: 1,
    selectedAccountIds: accounts.map((account) => account.id),
  }

  plaidRepository._debugSeed({
    accounts,
    snapshot,
    holdings: [
      {
        id: '77777777-7777-4777-8777-777777777777',
        accountId: accounts[0]!.id,
        plaidAccountId: accounts[0]!.id,
        plaidSecurityId: 'sec-msft',
        symbol: 'MSFT',
        description: 'Microsoft Corporation',
        type: 'Stock',
        sector: 'Technology',
        industry: 'Software',
        cusip: '594918104',
        isin: null,
        currencyCode: 'USD',
        quantity: 10,
        costBasis: 2_500,
        institutionPrice: 450,
        marketValue: 4_500,
        unrealizedGainLoss: 2_000,
        asOfDate: dataAsOfDate,
      },
    ],
  })

  return { accounts, snapshot }
}
