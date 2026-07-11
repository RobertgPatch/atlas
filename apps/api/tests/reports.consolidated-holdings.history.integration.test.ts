import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'
import { getConsolidatedHoldingsViaApi } from './helpers/consolidatedHoldingsTestHelpers.js'
import {
  plaidRepository,
  type HoldingsSyncSnapshot,
  type SourceHoldingRecord,
} from '../src/modules/plaid/plaid.repository.js'

const accountId = 'history-account-1'

const connectHistoryAccount = (fixture: TestFixture) => {
  plaidRepository.createConnectionFromPublicToken({
    ownerUserId: fixture.admin.id,
    plaidItemId: 'history-item-1',
    accessToken: 'history-access-token',
    institutionId: 'ins_history',
    institutionName: 'History Brokerage',
    metadataAccounts: [
      {
        id: accountId,
        name: 'History Account',
        official_name: 'History Account',
        type: 'investment',
        subtype: 'brokerage',
        mask: '3030',
      },
    ],
  })
  plaidRepository.updateSelectedInvestmentAccounts([accountId])
}

const makeHolding = (input: {
  snapshotId: string
  symbol: string
  marketValue: number
  asOfDate: string
}): SourceHoldingRecord => ({
  id: randomUUID(),
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
  costBasis: input.marketValue - 25,
  institutionPrice: input.marketValue,
  marketValue: input.marketValue,
  unrealizedGainLoss: 25,
  asOfDate: input.asOfDate,
})

const saveSnapshot = (input: {
  id: string
  status?: HoldingsSyncSnapshot['status']
  dashboardEligible?: boolean
  holdingsCount?: number
  dataAsOfDate: string
  fetchedAt: string
  symbol?: string
  marketValue?: number
}) => {
  const snapshot = plaidRepository.createSyncSnapshot({
    id: input.id,
    requestedByUserId: null,
    selectedAccountIds: [accountId],
    status: input.status ?? 'success',
    startedAt: input.fetchedAt,
    completedAt: input.status === 'failed' ? input.fetchedAt : input.fetchedAt,
    fetchedAt: input.fetchedAt,
    dataAsOfDate: input.dataAsOfDate,
    dataAsOfMinDate: input.dataAsOfDate,
    dataAsOfMaxDate: input.dataAsOfDate,
    dashboardEligible: input.dashboardEligible,
    holdingsCount: input.holdingsCount ?? (input.symbol ? 1 : 0),
  })

  if (input.symbol) {
    plaidRepository.replaceSourceHoldingsForSnapshot(snapshot.id, [
      makeHolding({
        snapshotId: snapshot.id,
        symbol: input.symbol,
        marketValue: input.marketValue ?? 0,
        asOfDate: input.dataAsOfDate,
      }),
    ])
  }

  return snapshot
}

describe('Consolidated holdings history integration', () => {
  let fixture: TestFixture

  beforeEach(async () => {
    fixture = await createTestFixture()
    connectHistoryAccount(fixture)
  })

  afterEach(async () => {
    await fixture.app.close()
  })

  it('preserves source holdings for older snapshots across refreshes', async () => {
    const first = saveSnapshot({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa51',
      dataAsOfDate: '2026-07-01',
      fetchedAt: '2026-07-01T12:05:00.000Z',
      symbol: 'DAY1',
      marketValue: 100,
    })
    const second = saveSnapshot({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb51',
      dataAsOfDate: '2026-07-02',
      fetchedAt: '2026-07-02T12:05:00.000Z',
      symbol: 'DAY2',
      marketValue: 200,
    })

    expect(plaidRepository.listSourceHoldingsForSnapshot(first.id)).toMatchObject([
      { symbol: 'DAY1', marketValue: 100 },
    ])
    expect(plaidRepository.listSourceHoldingsForSnapshot(second.id)).toMatchObject([
      { symbol: 'DAY2', marketValue: 200 },
    ])
  })

  it('uses the latest dashboard-eligible snapshot for current Liquidity', async () => {
    saveSnapshot({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa52',
      dataAsOfDate: '2026-07-01',
      fetchedAt: '2026-07-01T12:05:00.000Z',
      symbol: 'OLD',
      marketValue: 100,
    })
    saveSnapshot({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb52',
      dataAsOfDate: '2026-07-02',
      fetchedAt: '2026-07-02T12:05:00.000Z',
      symbol: 'NEW',
      marketValue: 250,
    })
    saveSnapshot({
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccc52',
      status: 'failed',
      dashboardEligible: false,
      holdingsCount: 0,
      dataAsOfDate: '2026-07-03',
      fetchedAt: '2026-07-03T12:05:00.000Z',
    })

    const response = await getConsolidatedHoldingsViaApi(fixture)

    expect(response.statusCode).toBe(200)
    expect(response.json().rows).toHaveLength(1)
    expect(response.json().rows[0]).toMatchObject({
      symbol: 'NEW',
      marketValue: 250,
    })
    expect(response.json().sync.dataAsOfDate).toBe('2026-07-02')
  })

  it('keeps data-as-of dates distinguishable by historical snapshot', async () => {
    saveSnapshot({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa53',
      dataAsOfDate: '2026-07-01',
      fetchedAt: '2026-07-01T12:05:00.000Z',
      symbol: 'JUL1',
      marketValue: 100,
    })
    saveSnapshot({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb53',
      dataAsOfDate: '2026-07-02',
      fetchedAt: '2026-07-02T12:05:00.000Z',
      symbol: 'JUL2',
      marketValue: 200,
    })

    const julyOne = await plaidRepository.listHoldingsSnapshotsByAccount(accountId, {
      fromDate: '2026-07-01',
      toDate: '2026-07-01',
    })
    const julyTwo = await plaidRepository.listHoldingsSnapshotsByAccount(accountId, {
      fromDate: '2026-07-02',
      toDate: '2026-07-02',
    })

    expect(julyOne.map((snapshot) => snapshot.dataAsOfDate)).toEqual(['2026-07-01'])
    expect(julyTwo.map((snapshot) => snapshot.dataAsOfDate)).toEqual(['2026-07-02'])
  })
})
