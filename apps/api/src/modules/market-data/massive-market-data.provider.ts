import { randomUUID } from 'node:crypto'
import type {
  MarketDataProvider,
  MarketPriceObservation,
} from './market-data.types.js'

interface MassiveGroupedAggregate {
  T?: string
  c?: number
  t?: number
  otc?: boolean
}

interface MassiveGroupedDailyResponse {
  results?: MassiveGroupedAggregate[]
}

interface CachedTradingDay {
  expiresAt: number
  aggregates: Map<string, MassiveGroupedAggregate>
}

export interface MassiveMarketDataProviderOptions {
  baseUrl: string
  apiKey: string
  timeoutMs: number
  cacheTtlSeconds: number
  fetchImpl?: typeof fetch
  now?: () => Date
}

const MAX_LOOKBACK_TRADING_DAYS = 5
const MARKET_CLOSE_BUFFER_MINUTES = 15

const positiveNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null

const easternParts = (date: Date): Record<string, string> =>
  Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )

const dateFromParts = (parts: Record<string, string>): string =>
  `${parts.year}-${parts.month}-${parts.day}`

const previousWeekday = (date: string): string => {
  const candidate = new Date(`${date}T12:00:00.000Z`)
  do {
    candidate.setUTCDate(candidate.getUTCDate() - 1)
  } while (candidate.getUTCDay() === 0 || candidate.getUTCDay() === 6)
  return candidate.toISOString().slice(0, 10)
}

const latestCompletedTradingDate = (date: Date): string => {
  const parts = easternParts(date)
  const currentDate = dateFromParts(parts)
  if (parts.weekday === 'Sat' || parts.weekday === 'Sun') {
    return previousWeekday(currentDate)
  }

  const minutes = Number(parts.hour) * 60 + Number(parts.minute)
  const closeWithBuffer = 16 * 60 + MARKET_CLOSE_BUFFER_MINUTES
  return minutes >= closeWithBuffer ? currentDate : previousWeekday(currentDate)
}

const lookbackDates = (start: string): string[] => {
  const dates = [start]
  while (dates.length < MAX_LOOKBACK_TRADING_DAYS) {
    dates.push(previousWeekday(dates[dates.length - 1]!))
  }
  return dates
}

const normalizedSymbols = (symbols: string[]): string[] => [
  ...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean)),
]

export class MassiveMarketDataProvider implements MarketDataProvider {
  readonly id = 'massive'
  readonly feed = 'otc-eod'
  readonly isDelayed = true

  private readonly baseUrl: string
  private readonly apiKey: string
  private readonly timeoutMs: number
  private readonly cacheTtlMs: number
  private readonly fetchImpl: typeof fetch
  private readonly now: () => Date
  private readonly tradingDayCache = new Map<string, CachedTradingDay>()
  private readonly inFlightRequests = new Map<
    string,
    Promise<Map<string, MassiveGroupedAggregate>>
  >()

  constructor(options: MassiveMarketDataProviderOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '')
    this.apiKey = options.apiKey
    this.timeoutMs = options.timeoutMs
    this.cacheTtlMs = Math.max(0, options.cacheTtlSeconds) * 1_000
    this.fetchImpl = options.fetchImpl ?? fetch
    this.now = options.now ?? (() => new Date())
  }

  private async requestTradingDay(
    tradingDate: string,
  ): Promise<Map<string, MassiveGroupedAggregate>> {
    const cached = this.tradingDayCache.get(tradingDate)
    if (cached && cached.expiresAt > this.now().getTime()) return cached.aggregates

    const inFlight = this.inFlightRequests.get(tradingDate)
    if (inFlight) return inFlight

    const request = (async () => {
      const params = new URLSearchParams({
        adjusted: 'true',
        include_otc: 'true',
      })
      const response = await this.fetchImpl(
        `${this.baseUrl}/v2/aggs/grouped/locale/us/market/stocks/${tradingDate}?${params.toString()}`,
        {
          headers: { Authorization: `Bearer ${this.apiKey}` },
          signal: AbortSignal.timeout(this.timeoutMs),
        },
      )
      if (!response.ok) {
        throw new Error(`Massive market data request failed with HTTP ${response.status}`)
      }

      const payload = (await response.json()) as MassiveGroupedDailyResponse
      const aggregates = new Map<string, MassiveGroupedAggregate>()
      for (const aggregate of payload.results ?? []) {
        const symbol = aggregate.T?.trim().toUpperCase()
        if (!symbol || aggregate.otc !== true || positiveNumber(aggregate.c) == null) continue
        aggregates.set(symbol, aggregate)
      }
      this.tradingDayCache.set(tradingDate, {
        expiresAt: this.now().getTime() + this.cacheTtlMs,
        aggregates,
      })
      return aggregates
    })().finally(() => this.inFlightRequests.delete(tradingDate))

    this.inFlightRequests.set(tradingDate, request)
    return request
  }

  private observationFor(
    symbol: string,
    tradingDate: string,
    aggregate: MassiveGroupedAggregate,
  ): MarketPriceObservation | null {
    const price = positiveNumber(aggregate.c)
    if (price == null) return null
    const timestamp =
      typeof aggregate.t === 'number' ? new Date(aggregate.t) : new Date('invalid')
    if (Number.isNaN(timestamp.getTime())) return null

    return {
      id: randomUUID(),
      provider: this.id,
      symbol,
      price,
      currencyCode: 'USD',
      priceType: 'official_close',
      marketSession: 'closed',
      providerTimestamp: timestamp.toISOString(),
      receivedAt: this.now().toISOString(),
      tradingDate,
      isDelayed: true,
      feed: this.feed,
    }
  }

  async getLatestPrices(symbols: string[]): Promise<MarketPriceObservation[]> {
    const remaining = new Set(normalizedSymbols(symbols))
    const observations: MarketPriceObservation[] = []
    if (remaining.size === 0) return observations

    const firstDate = latestCompletedTradingDate(this.now())
    for (const tradingDate of lookbackDates(firstDate)) {
      const aggregates = await this.requestTradingDay(tradingDate)
      for (const symbol of [...remaining]) {
        const aggregate = aggregates.get(symbol)
        if (!aggregate) continue
        const observation = this.observationFor(symbol, tradingDate, aggregate)
        if (!observation) continue
        observations.push(observation)
        remaining.delete(symbol)
      }
      if (remaining.size === 0) break
    }
    return observations
  }

  async getClosingPrices(
    symbols: string[],
    tradingDate: string,
  ): Promise<MarketPriceObservation[]> {
    const aggregates = await this.requestTradingDay(tradingDate)
    return normalizedSymbols(symbols)
      .map((symbol) => {
        const aggregate = aggregates.get(symbol)
        return aggregate ? this.observationFor(symbol, tradingDate, aggregate) : null
      })
      .filter((price): price is MarketPriceObservation => Boolean(price))
  }
}
