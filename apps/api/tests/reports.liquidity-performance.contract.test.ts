import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  plaidRepository,
  type SourceHoldingRecord,
} from '../src/modules/plaid/plaid.repository.js'
import { liquidityValuationRepository } from '../src/modules/market-data/liquidity-valuation.repository.js'
import { createTestFixture, type TestFixture } from './helpers/testApp.js'
import { seedDatedConsolidatedHoldingsFixture } from './helpers/consolidatedHoldingsTestHelpers.js'

const endpoint = '/v1/reports/consolidated-holdings/performance'

describe('GET /v1/reports/consolidated-holdings/performance contract', () => {
  let fixture: TestFixture
  let accountId: string

  const savePoint = (date: string, marketValue: number) => {
    const snapshot = plaidRepository.createSyncSnapshot({
      id: randomUUID(),
      requestedByUserId: fixture.admin.id,
      selectedAccountIds: [accountId],
      status: 'success',
      startedAt: `${date}T12:00:00.000Z`,
      completedAt: `${date}T12:05:00.000Z`,
      fetchedAt: `${date}T12:05:00.000Z`,
      dataAsOfDate: date,
      dataAsOfMinDate: date,
      dataAsOfMaxDate: date,
      dashboardEligible: true,
      holdingsCount: 1,
    })
    const holding: SourceHoldingRecord = {
      id: randomUUID(),
      syncSnapshotId: snapshot.id,
      accountId,
      plaidAccountId: accountId,
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
      institutionPrice: marketValue / 10,
      marketValue,
      unrealizedGainLoss: marketValue - 2_500,
      asOfDate: date,
    }
    plaidRepository.replaceSourceHoldingsForSnapshot(snapshot.id, [holding])
  }

  beforeEach(async () => {
    fixture = await createTestFixture()
    const seeded = seedDatedConsolidatedHoldingsFixture({
      dataAsOfDate: '2026-05-11',
    })
    accountId = seeded.accounts[0]!.id
    savePoint('2026-05-01', 4_000)
    savePoint('2026-05-10', 4_400)
  })

  afterEach(async () => {
    await fixture.app.close()
  })

  it('requires an authenticated session', async () => {
    const response = await fixture.app.inject({ method: 'GET', url: endpoint })

    expect(response.statusCode).toBe(401)
  })

  it('returns chronological portfolio totals from saved daily snapshots', async () => {
    const response = await fixture.app.inject({
      method: 'GET',
      url: endpoint,
      headers: { cookie: fixture.cookie },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      points: [
        {
          date: '2026-05-01',
          totalMarketValue: 4_000,
          totalCostBasis: 2_500,
          totalUnrealizedGainLoss: 1_500,
          accountCount: 1,
          source: 'custodian_snapshot',
          capturedAt: '2026-05-01T12:05:00.000Z',
          priceAsOf: '2026-05-01',
          pricedHoldingCount: 0,
          fallbackHoldingCount: 1,
        },
        {
          date: '2026-05-10',
          totalMarketValue: 4_400,
          totalCostBasis: 2_500,
          totalUnrealizedGainLoss: 1_900,
          accountCount: 1,
          source: 'custodian_snapshot',
          capturedAt: '2026-05-10T12:05:00.000Z',
          priceAsOf: '2026-05-10',
          pricedHoldingCount: 0,
          fallbackHoldingCount: 1,
        },
        {
          date: '2026-05-11',
          totalMarketValue: 4_500,
          totalCostBasis: 2_500,
          totalUnrealizedGainLoss: 2_000,
          accountCount: 1,
          source: 'custodian_snapshot',
          capturedAt: '2026-05-11T12:00:00.000Z',
          priceAsOf: '2026-05-11',
          pricedHoldingCount: 0,
          fallbackHoldingCount: 1,
        },
      ],
      availableFrom: '2026-05-01',
      availableTo: '2026-05-11',
      marketCloseAvailableFrom: null,
    })
  })

  it('supports a custom inclusive date range and rejects reversed dates', async () => {
    const ranged = await fixture.app.inject({
      method: 'GET',
      url: `${endpoint}?from=2026-05-10&to=2026-05-11`,
      headers: { cookie: fixture.cookie },
    })
    const invalid = await fixture.app.inject({
      method: 'GET',
      url: `${endpoint}?from=2026-05-11&to=2026-05-01`,
      headers: { cookie: fixture.cookie },
    })

    expect(ranged.statusCode).toBe(200)
    expect(ranged.json().points.map((point: { date: string }) => point.date)).toEqual([
      '2026-05-10',
      '2026-05-11',
    ])
    expect(invalid.statusCode).toBe(400)
  })

  it('prefers a saved market valuation on the same date without dropping later daily history', async () => {
    await liquidityValuationRepository.saveSnapshot({
      tradingDate: '2026-05-10',
      selectedAccountIds: [accountId],
      provider: 'alpaca',
      feed: 'sip',
      priceAsOf: '2026-05-10T20:00:00.000Z',
      capturedAt: '2026-05-10T20:20:00.000Z',
      warnings: [],
      positions: [
        {
          sourceHoldingId: randomUUID(),
          accountId,
          symbol: 'MSFT',
          description: 'Microsoft Corporation',
          securityType: 'Stock',
          currencyCode: 'USD',
          quantity: 10,
          costBasis: 2_500,
          closingPrice: 480,
          marketValue: 4_800,
          unrealizedGainLoss: 2_300,
          valuationSource: 'official_close',
          provider: 'alpaca',
          feed: 'sip',
          priceAsOf: '2026-05-10T20:00:00.000Z',
        },
      ],
    })

    const response = await fixture.app.inject({
      method: 'GET',
      url: endpoint,
      headers: { cookie: fixture.cookie },
    })
    const body = response.json()

    expect(response.statusCode).toBe(200)
    expect(body.points.map((point: { date: string }) => point.date)).toEqual([
      '2026-05-01',
      '2026-05-10',
      '2026-05-11',
    ])
    expect(body.points.find((point: { date: string }) => point.date === '2026-05-10')).toEqual({
      date: '2026-05-10',
      totalMarketValue: 4_800,
      totalCostBasis: 2_500,
      totalUnrealizedGainLoss: 2_300,
      accountCount: 1,
      source: 'market_close',
      capturedAt: '2026-05-10T20:20:00.000Z',
      priceAsOf: '2026-05-10T20:00:00.000Z',
      pricedHoldingCount: 1,
      fallbackHoldingCount: 0,
    })
    expect(body.points.find((point: { date: string }) => point.date === '2026-05-11')).toMatchObject({
      totalMarketValue: 4_500,
      source: 'custodian_snapshot',
    })
    expect(body.marketCloseAvailableFrom).toBe('2026-05-10')
  })
})
