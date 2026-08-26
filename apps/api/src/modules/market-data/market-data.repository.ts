import { randomUUID } from 'node:crypto'
import { pool, query } from '../../infra/db/client.js'
import type { MarketPriceObservation, MarketPriceStore } from './market-data.types.js'

interface MarketPriceRow {
  id: string
  provider: string
  symbol: string
  price: string | number
  currency_code: string
  price_type: MarketPriceObservation['priceType']
  market_session: MarketPriceObservation['marketSession']
  provider_timestamp: Date | string
  received_at: Date | string
  trading_date: Date | string
  is_delayed: boolean
  feed: string | null
}

const memoryPrices = new Map<string, MarketPriceObservation>()

const cacheKey = (provider: string, symbol: string): string =>
  `${provider}:${symbol.trim().toUpperCase()}`

const isoValue = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString()

const dateValue = (value: Date | string): string =>
  value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10)

const fromRow = (row: MarketPriceRow): MarketPriceObservation => ({
  id: row.id,
  provider: row.provider,
  symbol: row.symbol,
  price: Number(row.price),
  currencyCode: row.currency_code,
  priceType: row.price_type,
  marketSession: row.market_session,
  providerTimestamp: isoValue(row.provider_timestamp),
  receivedAt: isoValue(row.received_at),
  tradingDate: dateValue(row.trading_date),
  isDelayed: row.is_delayed,
  feed: row.feed,
})

const newerPrice = (
  current: MarketPriceObservation | undefined,
  candidate: MarketPriceObservation,
): MarketPriceObservation =>
  !current ||
  candidate.providerTimestamp > current.providerTimestamp ||
  (candidate.providerTimestamp === current.providerTimestamp &&
    candidate.receivedAt > current.receivedAt)
    ? candidate
    : current

export const createInMemoryMarketPriceStore = (): MarketPriceStore & {
  clear(): void
} => {
  const prices = new Map<string, MarketPriceObservation>()
  return {
    async getLatestPrices(provider, symbols) {
      return symbols
        .map((symbol) => prices.get(cacheKey(provider, symbol)))
        .filter((price): price is MarketPriceObservation => Boolean(price))
    },
    async savePrices(nextPrices) {
      for (const price of nextPrices) {
        const key = cacheKey(price.provider, price.symbol)
        prices.set(key, newerPrice(prices.get(key), price))
      }
    },
    clear() {
      prices.clear()
    },
  }
}

export const marketPriceRepository: MarketPriceStore = {
  async getLatestPrices(provider, symbols) {
    const normalizedSymbols = [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()))]
    if (normalizedSymbols.length === 0) return []

    const latest = new Map<string, MarketPriceObservation>()
    if (pool) {
      const result = await query<MarketPriceRow>(
        `select distinct on (upper(symbol))
           id, provider, symbol, price, currency_code, price_type, market_session,
           provider_timestamp, received_at, trading_date, is_delayed, feed
         from market_price_observations
         where provider = $1 and upper(symbol) = any($2::text[])
         order by upper(symbol), provider_timestamp desc, received_at desc`,
        [provider, normalizedSymbols],
      )
      for (const row of result.rows) {
        const price = fromRow(row)
        latest.set(price.symbol.toUpperCase(), price)
      }
    }

    for (const symbol of normalizedSymbols) {
      const cached = memoryPrices.get(cacheKey(provider, symbol))
      if (cached) {
        latest.set(symbol, newerPrice(latest.get(symbol), cached))
      }
    }
    return [...latest.values()]
  },

  async savePrices(prices) {
    if (prices.length === 0) return

    const normalized = prices.map((price) => ({
      ...price,
      id: price.id || randomUUID(),
      symbol: price.symbol.trim().toUpperCase(),
    }))
    for (const price of normalized) {
      const key = cacheKey(price.provider, price.symbol)
      memoryPrices.set(key, newerPrice(memoryPrices.get(key), price))
    }

    if (!pool) return

    const columnsPerRow = 12
    const params: unknown[] = []
    const values = normalized.map((price, index) => {
      const offset = index * columnsPerRow
      params.push(
        price.id,
        price.provider,
        price.symbol,
        price.price,
        price.currencyCode,
        price.priceType,
        price.marketSession,
        price.providerTimestamp,
        price.receivedAt,
        price.tradingDate,
        price.isDelayed,
        price.feed,
      )
      return `(${Array.from({ length: columnsPerRow }, (_, column) => `$${offset + column + 1}`).join(', ')})`
    })

    await query(
      `insert into market_price_observations (
         id, provider, symbol, price, currency_code, price_type, market_session,
         provider_timestamp, received_at, trading_date, is_delayed, feed
       ) values ${values.join(', ')}
       on conflict (provider, symbol, price_type, provider_timestamp)
       do update set
         price = excluded.price,
         received_at = excluded.received_at,
         market_session = excluded.market_session,
         is_delayed = excluded.is_delayed,
         feed = excluded.feed`,
      params,
    )
  },
}
