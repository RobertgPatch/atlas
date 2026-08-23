import { randomUUID } from 'node:crypto'
import type {
  MarketDataProvider,
  MarketPriceObservation,
  MarketSession,
} from './market-data.types.js'

interface AlpacaLatestTrade {
  p?: number
  t?: string
}

interface AlpacaBar {
  c?: number
  t?: string
}

interface AlpacaLatestTradesResponse {
  trades?: Record<string, AlpacaLatestTrade | undefined>
}

interface AlpacaBarsResponse {
  bars?: Record<string, AlpacaBar[] | undefined>
}

export interface AlpacaMarketDataProviderOptions {
  baseUrl: string
  keyId: string
  secret: string
  feed: 'sip' | 'iex' | 'delayed_sip'
  timeoutMs: number
  fetchImpl?: typeof fetch
  now?: () => Date
}

class AlpacaMarketDataRequestError extends Error {
  constructor(readonly status: number) {
    super(`Alpaca market data request failed with HTTP ${status}`)
    this.name = 'AlpacaMarketDataRequestError'
  }
}

const CHUNK_SIZE = 100

const chunksOf = <T>(values: T[], size: number): T[][] => {
  const chunks: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}

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

const tradingDateFor = (date: Date): string => {
  const parts = easternParts(date)
  return `${parts.year}-${parts.month}-${parts.day}`
}

const marketSessionFor = (date: Date): MarketSession => {
  const parts = easternParts(date)
  if (parts.weekday === 'Sat' || parts.weekday === 'Sun') return 'closed'
  const minutes = Number(parts.hour) * 60 + Number(parts.minute)
  if (minutes >= 570 && minutes < 960) return 'regular'
  if (minutes >= 240 && minutes < 570) return 'premarket'
  if (minutes >= 960 && minutes < 1_200) return 'after_hours'
  return 'closed'
}

const isLivePriceWindow = (date: Date): boolean => {
  const parts = easternParts(date)
  if (parts.weekday === 'Sat' || parts.weekday === 'Sun') return false
  const minutes = Number(parts.hour) * 60 + Number(parts.minute)
  // Allow the consolidated daily bar to settle for 15 minutes after 4 p.m. ET.
  return minutes >= 570 && minutes < 975
}

const nextDate = (date: string): string => {
  const parsed = new Date(`${date}T00:00:00.000Z`)
  parsed.setUTCDate(parsed.getUTCDate() + 1)
  return parsed.toISOString().slice(0, 10)
}

const previousDate = (date: string, days: number): string => {
  const parsed = new Date(`${date}T00:00:00.000Z`)
  parsed.setUTCDate(parsed.getUTCDate() - days)
  return parsed.toISOString().slice(0, 10)
}

export class AlpacaMarketDataProvider implements MarketDataProvider {
  readonly id = 'alpaca'
  readonly feed: string
  readonly isDelayed: boolean

  private readonly baseUrl: string
  private readonly keyId: string
  private readonly secret: string
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch
  private readonly now: () => Date

  constructor(options: AlpacaMarketDataProviderOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '')
    this.keyId = options.keyId
    this.secret = options.secret
    this.feed = options.feed
    this.isDelayed = options.feed === 'delayed_sip'
    this.timeoutMs = options.timeoutMs
    this.fetchImpl = options.fetchImpl ?? fetch
    this.now = options.now ?? (() => new Date())
  }

  private async request<T>(path: string, params: URLSearchParams): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}?${params.toString()}`, {
      headers: {
        'APCA-API-KEY-ID': this.keyId,
        'APCA-API-SECRET-KEY': this.secret,
      },
      signal: AbortSignal.timeout(this.timeoutMs),
    })
    if (!response.ok) {
      throw new AlpacaMarketDataRequestError(response.status)
    }
    return (await response.json()) as T
  }

  private async getLatestTradeChunk(
    symbols: string[],
  ): Promise<MarketPriceObservation[]> {
    let payload: AlpacaLatestTradesResponse
    try {
      payload = await this.request<AlpacaLatestTradesResponse>(
        '/v2/stocks/trades/latest',
        new URLSearchParams({ symbols: symbols.join(','), feed: this.feed }),
      )
    } catch (error) {
      // A single OCC option, stale ticker, or unsupported instrument makes
      // Alpaca reject the entire batch. Bisect 400 responses so valid stocks
      // still receive current quotes while the bad symbol falls back safely.
      if (error instanceof AlpacaMarketDataRequestError && error.status === 400) {
        if (symbols.length === 1) return []
        const midpoint = Math.ceil(symbols.length / 2)
        const left = await this.getLatestTradeChunk(symbols.slice(0, midpoint))
        const right = await this.getLatestTradeChunk(symbols.slice(midpoint))
        return [...left, ...right]
      }
      throw error
    }

    const observations: MarketPriceObservation[] = []
    const receivedAt = this.now().toISOString()
    for (const symbol of symbols) {
      const trade = payload.trades?.[symbol]
      if (!trade?.t) continue
      const price = positiveNumber(trade.p)
      if (price == null) continue
      const providerDate = new Date(trade.t)
      if (Number.isNaN(providerDate.getTime())) continue

      observations.push({
        id: randomUUID(),
        provider: this.id,
        symbol,
        price,
        currencyCode: 'USD',
        priceType: 'last_trade',
        marketSession: marketSessionFor(providerDate),
        providerTimestamp: providerDate.toISOString(),
        receivedAt,
        tradingDate: tradingDateFor(providerDate),
        isDelayed: this.isDelayed,
        feed: this.feed,
      })
    }
    return observations
  }

  private async getClosingPriceChunk(
    symbols: string[],
    params: Record<string, string>,
  ): Promise<MarketPriceObservation[]> {
    let payload: AlpacaBarsResponse
    try {
      payload = await this.request<AlpacaBarsResponse>(
        '/v2/stocks/bars',
        new URLSearchParams({ ...params, symbols: symbols.join(',') }),
      )
    } catch (error) {
      if (error instanceof AlpacaMarketDataRequestError && error.status === 400) {
        if (symbols.length === 1) return []
        const midpoint = Math.ceil(symbols.length / 2)
        const left = await this.getClosingPriceChunk(symbols.slice(0, midpoint), params)
        const right = await this.getClosingPriceChunk(symbols.slice(midpoint), params)
        return [...left, ...right]
      }
      throw error
    }

    const observations: MarketPriceObservation[] = []
    const receivedAt = this.now().toISOString()
    for (const symbol of symbols) {
      const bar = payload.bars?.[symbol]
        ?.filter((candidate) => candidate.t && positiveNumber(candidate.c) != null)
        .sort((left, right) => (right.t ?? '').localeCompare(left.t ?? ''))[0]
      const price = positiveNumber(bar?.c)
      if (price == null || !bar?.t) continue
      const providerDate = new Date(bar.t)
      if (Number.isNaN(providerDate.getTime())) continue

      observations.push({
        id: randomUUID(),
        provider: this.id,
        symbol,
        price,
        currencyCode: 'USD',
        priceType: 'official_close',
        marketSession: 'closed',
        providerTimestamp: providerDate.toISOString(),
        receivedAt,
        tradingDate: providerDate.toISOString().slice(0, 10),
        isDelayed: false,
        feed: params.feed ?? 'sip',
      })
    }
    return observations
  }

  private async getMostRecentClosingPrices(
    symbols: string[],
    observedAt: Date,
  ): Promise<MarketPriceObservation[]> {
    const tradingDate = tradingDateFor(observedAt)
    const historicalEnd = new Date(observedAt.getTime() - 16 * 60 * 1_000).toISOString()
    const observations: MarketPriceObservation[] = []
    const params = {
      timeframe: '1Day',
      start: `${previousDate(tradingDate, 10)}T00:00:00.000Z`,
      end: historicalEnd,
      adjustment: 'raw',
      feed: 'sip',
      sort: 'desc',
      limit: '10000',
    }
    for (const chunk of chunksOf(symbols, CHUNK_SIZE)) {
      observations.push(...(await this.getClosingPriceChunk(chunk, params)))
    }
    return observations
  }

  async getLatestPrices(symbols: string[]): Promise<MarketPriceObservation[]> {
    const normalized = [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()))]
    const observedAt = this.now()
    if (!isLivePriceWindow(observedAt)) {
      return this.getMostRecentClosingPrices(normalized, observedAt)
    }
    const observations: MarketPriceObservation[] = []

    for (const chunk of chunksOf(normalized, CHUNK_SIZE)) {
      observations.push(...(await this.getLatestTradeChunk(chunk)))
    }
    return observations
  }

  async getClosingPrices(
    symbols: string[],
    tradingDate: string,
  ): Promise<MarketPriceObservation[]> {
    const normalized = [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()))]
    const observations: MarketPriceObservation[] = []
    const nextTradingDate = `${nextDate(tradingDate)}T00:00:00.000Z`
    const delayedCutoff = new Date(this.now().getTime() - 16 * 60 * 1_000).toISOString()
    const end = nextTradingDate < delayedCutoff ? nextTradingDate : delayedCutoff
    const params = {
      timeframe: '1Day',
      start: `${tradingDate}T00:00:00.000Z`,
      end,
      adjustment: 'raw',
      feed: 'sip',
      sort: 'desc',
      limit: '10000',
    }

    for (const chunk of chunksOf(normalized, CHUNK_SIZE)) {
      observations.push(...(await this.getClosingPriceChunk(chunk, params)))
    }
    return observations
  }
}
