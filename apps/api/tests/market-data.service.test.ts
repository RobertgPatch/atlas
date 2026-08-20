import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { AlpacaMarketDataProvider } from '../src/modules/market-data/alpaca-market-data.provider.js'
import { FallbackMarketDataProvider } from '../src/modules/market-data/fallback-market-data.provider.js'
import { createInMemoryMarketPriceStore } from '../src/modules/market-data/market-data.repository.js'
import { createMarketDataService } from '../src/modules/market-data/market-data.service.js'
import { MassiveMarketDataProvider } from '../src/modules/market-data/massive-market-data.provider.js'
import type {
  MarketDataProvider,
  MarketPriceObservation,
} from '../src/modules/market-data/market-data.types.js'
import type { SourceHoldingRecord } from '../src/modules/plaid/plaid.repository.js'

const holding = (overrides: Partial<SourceHoldingRecord> = {}): SourceHoldingRecord => ({
  id: randomUUID(),
  syncSnapshotId: randomUUID(),
  accountId: randomUUID(),
  plaidAccountId: 'plaid-account',
  plaidSecurityId: 'plaid-security',
  symbol: 'AAPL',
  description: 'Apple Inc.',
  type: 'equity',
  sector: 'Technology',
  industry: 'Consumer Electronics',
  cusip: null,
  isin: null,
  currencyCode: 'USD',
  quantity: 10,
  costBasis: 1_000,
  institutionPrice: 150,
  marketValue: 1_500,
  unrealizedGainLoss: 500,
  asOfDate: '2026-08-14',
  ...overrides,
})

const quote = (
  overrides: Partial<MarketPriceObservation> = {},
): MarketPriceObservation => ({
  id: randomUUID(),
  provider: 'alpaca',
  symbol: 'AAPL',
  price: 200,
  currencyCode: 'USD',
  priceType: 'midpoint',
  marketSession: 'regular',
  providerTimestamp: '2026-08-15T18:00:00.000Z',
  receivedAt: '2026-08-15T18:00:01.000Z',
  tradingDate: '2026-08-15',
  isDelayed: false,
  feed: 'sip',
  ...overrides,
})

describe('market data pricing service', () => {
  it('returns the saved database price immediately and persists a later live update', async () => {
    const store = createInMemoryMarketPriceStore()
    await store.savePrices([quote({ price: 180, receivedAt: '2026-08-15T17:00:00.000Z' })])
    const getLatestPrices = vi.fn(async () => [quote({ price: 205 })])
    const provider: MarketDataProvider = {
      id: 'alpaca',
      feed: 'sip',
      isDelayed: false,
      getLatestPrices,
      getClosingPrices: vi.fn(async () => []),
    }
    const service = createMarketDataService({
      provider,
      store,
      refreshOnRead: true,
      maxAgeSeconds: 60,
      now: () => new Date('2026-08-15T18:00:10.000Z'),
    })

    const saved = await service.priceHoldingsForRead([holding()], { refreshStale: false })
    expect(saved.holdings[0]?.marketValue).toBe(1_800)
    expect(getLatestPrices).not.toHaveBeenCalled()

    const refreshed = await service.priceHoldingsForRead([holding()])
    expect(refreshed.holdings[0]?.marketValue).toBe(2_050)
    expect(getLatestPrices).toHaveBeenCalledTimes(1)

    const persisted = await service.priceHoldingsForRead([holding()], { refreshStale: false })
    expect(persisted.holdings[0]?.marketValue).toBe(2_050)
    expect(getLatestPrices).toHaveBeenCalledTimes(1)
  })

  it('reprices holdings on read and reuses a fresh server-side quote', async () => {
    const getLatestPrices = vi.fn(async () => [quote()])
    const provider: MarketDataProvider = {
      id: 'alpaca',
      feed: 'sip',
      isDelayed: false,
      getLatestPrices,
      getClosingPrices: vi.fn(async () => []),
    }
    const service = createMarketDataService({
      provider,
      store: createInMemoryMarketPriceStore(),
      refreshOnRead: true,
      maxAgeSeconds: 60,
      now: () => new Date('2026-08-15T18:00:10.000Z'),
    })

    const first = await service.priceHoldingsForRead([holding()])
    const second = await service.priceHoldingsForRead([holding()])

    expect(first.holdings[0]).toMatchObject({
      institutionPrice: 200,
      marketValue: 2_000,
      unrealizedGainLoss: 1_000,
      asOfDate: '2026-08-15T18:00:00.000Z',
    })
    expect(first.pricing).toMatchObject({
      status: 'live',
      provider: 'alpaca',
      feed: 'sip',
      pricedHoldingCount: 1,
      fallbackHoldingCount: 0,
    })
    expect(second.holdings[0]?.marketValue).toBe(2_000)
    expect(getLatestPrices).toHaveBeenCalledTimes(1)
  })

  it('keeps custodian values when the provider cannot return a price', async () => {
    const provider: MarketDataProvider = {
      id: 'alpaca',
      feed: 'sip',
      isDelayed: false,
      getLatestPrices: vi.fn(async () => {
        throw new Error('provider unavailable')
      }),
      getClosingPrices: vi.fn(async () => []),
    }
    const service = createMarketDataService({
      provider,
      store: createInMemoryMarketPriceStore(),
      refreshOnRead: true,
      maxAgeSeconds: 60,
      now: () => new Date('2026-08-15T18:00:10.000Z'),
    })

    const result = await service.priceHoldingsForRead([holding()])

    expect(result.holdings[0]?.marketValue).toBe(1_500)
    expect(result.pricing.status).toBe('fallback')
    expect(result.pricing.fallbackHoldingCount).toBe(1)
    expect(result.pricing.warnings.join(' ')).toMatch(/live price service was unavailable/i)
  })

  it('reuses fresh prices cached under both composite provider sources', async () => {
    const primaryLatest = vi.fn(async () => [quote()])
    const fallbackLatest = vi.fn(async () => [
      quote({
        provider: 'massive',
        symbol: 'ENLAY',
        price: 10.98,
        priceType: 'official_close',
        marketSession: 'closed',
        providerTimestamp: '2026-08-14T04:00:00.000Z',
        tradingDate: '2026-08-14',
        isDelayed: true,
        feed: 'otc-eod',
      }),
    ])
    const provider = new FallbackMarketDataProvider(
      {
        id: 'alpaca',
        feed: 'sip',
        isDelayed: false,
        getLatestPrices: primaryLatest,
        getClosingPrices: vi.fn(async () => []),
      },
      {
        id: 'massive',
        feed: 'otc-eod',
        isDelayed: true,
        getLatestPrices: fallbackLatest,
        getClosingPrices: vi.fn(async () => []),
      },
    )
    const service = createMarketDataService({
      provider,
      store: createInMemoryMarketPriceStore(),
      refreshOnRead: true,
      maxAgeSeconds: 60,
      now: () => new Date('2026-08-15T18:00:10.000Z'),
    })
    const holdings = [
      holding(),
      holding({ symbol: 'ENLAY', description: 'Enel S.p.A. ADR', quantity: 100 }),
    ]

    const first = await service.priceHoldingsForRead(holdings)
    const second = await service.priceHoldingsForRead(holdings)

    expect(first.holdings[1]).toMatchObject({
      institutionPrice: 10.98,
      marketValue: 1_098,
      asOfDate: '2026-08-14T04:00:00.000Z',
    })
    expect(first.pricing).toMatchObject({
      provider: 'alpaca+massive',
      pricedHoldingCount: 2,
      fallbackHoldingCount: 0,
    })
    expect(second.holdings[1]?.marketValue).toBe(1_098)
    expect(primaryLatest).toHaveBeenCalledTimes(1)
    expect(fallbackLatest).toHaveBeenCalledTimes(1)
    expect(fallbackLatest).toHaveBeenCalledWith(['ENLAY'])
  })
})

describe('fallback market data provider', () => {
  it('sends only symbols left unpriced by Alpaca to the OTC fallback', async () => {
    const primaryLatest = vi.fn(async () => [quote()])
    const fallbackLatest = vi.fn(async () => [
      quote({
        provider: 'massive',
        symbol: 'ENLAY',
        price: 10.98,
        priceType: 'official_close',
        feed: 'otc-eod',
      }),
    ])
    const provider = new FallbackMarketDataProvider(
      {
        id: 'alpaca',
        feed: 'sip',
        isDelayed: false,
        getLatestPrices: primaryLatest,
        getClosingPrices: vi.fn(async () => []),
      },
      {
        id: 'massive',
        feed: 'otc-eod',
        isDelayed: true,
        getLatestPrices: fallbackLatest,
        getClosingPrices: vi.fn(async () => []),
      },
    )

    const prices = await provider.getLatestPrices(['aapl', 'ENLAY'])

    expect(prices.map((price) => [price.provider, price.symbol])).toEqual([
      ['alpaca', 'AAPL'],
      ['massive', 'ENLAY'],
    ])
    expect(primaryLatest).toHaveBeenCalledWith(['AAPL', 'ENLAY'])
    expect(fallbackLatest).toHaveBeenCalledWith(['ENLAY'])
  })
})

describe('Massive OTC market data provider', () => {
  it('maps an OTC grouped daily close and caches the trading-day response', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          results: [
            {
              T: 'ENLAY',
              c: 10.98,
              t: Date.UTC(2026, 7, 14, 4),
              otc: true,
            },
            {
              T: 'AAPL',
              c: 305.93,
              t: Date.UTC(2026, 7, 14, 4),
              otc: false,
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    const provider = new MassiveMarketDataProvider({
      baseUrl: 'https://api.massive.com/',
      apiKey: 'massive-key',
      timeoutMs: 1_000,
      cacheTtlSeconds: 900,
      fetchImpl,
      now: () => new Date('2026-08-15T18:00:00.000Z'),
    })

    const first = await provider.getLatestPrices(['enlay'])
    const second = await provider.getLatestPrices(['ENLAY'])

    expect(first).toHaveLength(1)
    expect(first[0]).toMatchObject({
      provider: 'massive',
      symbol: 'ENLAY',
      price: 10.98,
      priceType: 'official_close',
      tradingDate: '2026-08-14',
      isDelayed: true,
      feed: 'otc-eod',
    })
    expect(second[0]?.price).toBe(10.98)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining(
        '/v2/aggs/grouped/locale/us/market/stocks/2026-08-14?adjusted=true&include_otc=true',
      ),
      expect.objectContaining({
        headers: { Authorization: 'Bearer massive-key' },
      }),
    )
  })

  it('does not accept a non-OTC aggregate as a fallback price', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          results: [
            {
              T: 'AAPL',
              c: 305.93,
              t: Date.UTC(2026, 7, 14, 4),
              otc: false,
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    const provider = new MassiveMarketDataProvider({
      baseUrl: 'https://api.massive.com',
      apiKey: 'massive-key',
      timeoutMs: 1_000,
      cacheTtlSeconds: 900,
      fetchImpl,
      now: () => new Date('2026-08-15T18:00:00.000Z'),
    })

    const prices = await provider.getClosingPrices(['AAPL'], '2026-08-14')

    expect(prices).toEqual([])
  })
})

describe('Alpaca market data provider', () => {
  it('uses the latest trade for valuation during market hours', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          trades: {
            AAPL: { p: 200, t: '2026-08-14T18:00:00.000Z' },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    const provider = new AlpacaMarketDataProvider({
      baseUrl: 'https://data.alpaca.markets/',
      keyId: 'test-key',
      secret: 'test-secret',
      feed: 'sip',
      timeoutMs: 1_000,
      fetchImpl,
      now: () => new Date('2026-08-14T18:00:01.000Z'),
    })

    const prices = await provider.getLatestPrices(['aapl'])

    expect(prices).toHaveLength(1)
    expect(prices[0]).toMatchObject({
      symbol: 'AAPL',
      price: 200,
      priceType: 'last_trade',
      provider: 'alpaca',
      feed: 'sip',
    })
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining('/v2/stocks/trades/latest?symbols=AAPL&feed=sip'),
      expect.objectContaining({
        headers: expect.objectContaining({ 'APCA-API-KEY-ID': 'test-key' }),
      }),
    )
  })

  it('isolates an invalid option symbol without dropping valid stock quotes', async () => {
    const optionSymbol = 'AMZN260515C00180000'
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes(optionSymbol)) {
        return new Response(JSON.stringify({ message: `invalid symbol: ${optionSymbol}` }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(
        JSON.stringify({
          trades: {
            AAPL: { p: 200, t: '2026-08-14T18:00:00.000Z' },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    })
    const provider = new AlpacaMarketDataProvider({
      baseUrl: 'https://data.alpaca.markets',
      keyId: 'test-key',
      secret: 'test-secret',
      feed: 'iex',
      timeoutMs: 1_000,
      fetchImpl,
      now: () => new Date('2026-08-14T18:00:01.000Z'),
    })

    const prices = await provider.getLatestPrices(['AAPL', optionSymbol])

    expect(prices).toHaveLength(1)
    expect(prices[0]).toMatchObject({ symbol: 'AAPL', price: 200 })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('uses the most recent consolidated close outside market hours', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          bars: {
            AAPL: [{ c: 305.93, t: '2026-08-14T04:00:00.000Z' }],
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    const provider = new AlpacaMarketDataProvider({
      baseUrl: 'https://data.alpaca.markets',
      keyId: 'test-key',
      secret: 'test-secret',
      feed: 'iex',
      timeoutMs: 1_000,
      fetchImpl,
      now: () => new Date('2026-08-15T18:00:00.000Z'),
    })

    const prices = await provider.getLatestPrices(['AAPL'])

    expect(prices[0]).toMatchObject({
      symbol: 'AAPL',
      price: 305.93,
      priceType: 'official_close',
      feed: 'sip',
      marketSession: 'closed',
    })
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining('/v2/stocks/bars?'),
      expect.any(Object),
    )
  })

  it('maps the daily bar to an official closing-price observation', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          bars: {
            AAPL: [{ c: 198.75, t: '2026-08-14T04:00:00.000Z' }],
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    const provider = new AlpacaMarketDataProvider({
      baseUrl: 'https://data.alpaca.markets',
      keyId: 'test-key',
      secret: 'test-secret',
      feed: 'sip',
      timeoutMs: 1_000,
      fetchImpl,
      now: () => new Date('2026-08-14T20:20:00.000Z'),
    })

    const prices = await provider.getClosingPrices(['AAPL'], '2026-08-14')

    expect(prices[0]).toMatchObject({
      symbol: 'AAPL',
      price: 198.75,
      priceType: 'official_close',
      marketSession: 'closed',
      tradingDate: '2026-08-14',
    })
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining('/v2/stocks/bars?'),
      expect.any(Object),
    )
  })
})
