export type MarketPriceType = 'midpoint' | 'last_trade' | 'official_close'

export type MarketSession =
  | 'regular'
  | 'premarket'
  | 'after_hours'
  | 'closed'
  | 'unknown'

export interface MarketPriceObservation {
  id: string
  provider: string
  symbol: string
  price: number
  currencyCode: string
  priceType: MarketPriceType
  marketSession: MarketSession
  providerTimestamp: string
  receivedAt: string
  tradingDate: string
  isDelayed: boolean
  feed: string | null
}

export interface MarketDataProvider {
  readonly id: string
  readonly feed: string | null
  readonly isDelayed: boolean
  readonly cacheProviderIds?: readonly string[]
  getLatestPrices(symbols: string[]): Promise<MarketPriceObservation[]>
  getClosingPrices(
    symbols: string[],
    tradingDate: string,
  ): Promise<MarketPriceObservation[]>
}

export interface MarketPriceStore {
  getLatestPrices(
    provider: string,
    symbols: string[],
  ): Promise<MarketPriceObservation[]>
  savePrices(prices: MarketPriceObservation[]): Promise<void>
}

export type HoldingsPricingStatus =
  | 'live'
  | 'delayed'
  | 'eod'
  | 'fallback'
  | 'unavailable'

export interface HoldingsPricingMetadata {
  status: HoldingsPricingStatus
  provider: string | null
  feed: string | null
  priceAsOf: string | null
  refreshedAt: string | null
  pricedHoldingCount: number
  fallbackHoldingCount: number
  warnings: string[]
}
