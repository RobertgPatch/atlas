import type {
  MarketDataProvider,
  MarketPriceObservation,
} from './market-data.types.js'

const uniqueSymbols = (symbols: string[]): string[] => [
  ...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean)),
]

const missingSymbols = (
  requested: string[],
  prices: MarketPriceObservation[],
): string[] => {
  const priced = new Set(prices.map((price) => price.symbol.toUpperCase()))
  return requested.filter((symbol) => !priced.has(symbol))
}

export class FallbackMarketDataProvider implements MarketDataProvider {
  readonly id: string
  readonly feed = null
  readonly isDelayed: boolean
  readonly cacheProviderIds: readonly string[]

  constructor(
    private readonly primary: MarketDataProvider,
    private readonly fallback: MarketDataProvider,
  ) {
    this.id = `${primary.id}+${fallback.id}`
    this.isDelayed = primary.isDelayed || fallback.isDelayed
    this.cacheProviderIds = [
      ...new Set([
        ...(primary.cacheProviderIds ?? [primary.id]),
        ...(fallback.cacheProviderIds ?? [fallback.id]),
      ]),
    ]
  }

  private async resolve(
    symbols: string[],
    primaryRequest: (symbols: string[]) => Promise<MarketPriceObservation[]>,
    fallbackRequest: (symbols: string[]) => Promise<MarketPriceObservation[]>,
  ): Promise<MarketPriceObservation[]> {
    const requested = uniqueSymbols(symbols)
    let primaryPrices: MarketPriceObservation[] = []
    let primaryError: unknown = null

    try {
      primaryPrices = await primaryRequest(requested)
    } catch (error) {
      primaryError = error
      console.warn(
        JSON.stringify({
          event: 'market_data_primary_provider_failed',
          provider: this.primary.id,
          errorName: error instanceof Error ? error.name : 'UnknownError',
        }),
      )
    }

    const unresolved = missingSymbols(requested, primaryPrices)
    if (unresolved.length === 0) return primaryPrices

    let fallbackPrices: MarketPriceObservation[] = []
    try {
      fallbackPrices = await fallbackRequest(unresolved)
    } catch (error) {
      console.warn(
        JSON.stringify({
          event: 'market_data_fallback_provider_failed',
          provider: this.fallback.id,
          errorName: error instanceof Error ? error.name : 'UnknownError',
        }),
      )
      if (primaryError && primaryPrices.length === 0) throw primaryError
    }

    if (primaryError && primaryPrices.length === 0 && fallbackPrices.length === 0) {
      throw primaryError
    }

    return [...primaryPrices, ...fallbackPrices]
  }

  getLatestPrices(symbols: string[]): Promise<MarketPriceObservation[]> {
    return this.resolve(
      symbols,
      (requested) => this.primary.getLatestPrices(requested),
      (requested) => this.fallback.getLatestPrices(requested),
    )
  }

  getClosingPrices(
    symbols: string[],
    tradingDate: string,
  ): Promise<MarketPriceObservation[]> {
    return this.resolve(
      symbols,
      (requested) => this.primary.getClosingPrices(requested, tradingDate),
      (requested) => this.fallback.getClosingPrices(requested, tradingDate),
    )
  }
}
