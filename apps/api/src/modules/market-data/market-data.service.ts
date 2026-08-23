import { config } from '../../config.js'
import {
  plaidRepository,
  type SourceHoldingRecord,
} from '../plaid/plaid.repository.js'
import { marketPriceRepository } from './market-data.repository.js'
import {
  liquidityValuationRepository,
  type LiquidityValuationPositionInput,
  type LiquidityValuationStore,
} from './liquidity-valuation.repository.js'
import { resolveMarketDataProvider } from './market-data.provider.js'
import type {
  HoldingsPricingMetadata,
  MarketDataProvider,
  MarketPriceObservation,
  MarketPriceStore,
} from './market-data.types.js'

interface MarketDataServiceOptions {
  provider: MarketDataProvider | null
  providerWarning?: string | null
  store: MarketPriceStore
  refreshOnRead: boolean
  maxAgeSeconds: number
  now?: () => Date
  valuationStore?: LiquidityValuationStore
  getSelectedHoldings?: () => SourceHoldingRecord[]
}

export interface PricedHoldingsResult {
  holdings: SourceHoldingRecord[]
  pricing: HoldingsPricingMetadata
}

export interface ClosingPriceRefreshResult {
  status: 'success' | 'skipped'
  provider: string | null
  tradingDate: string
  requestedSymbolCount: number
  refreshedSymbolCount: number
  valuationSnapshotId: string | null
  valuedHoldingCount: number
  fallbackHoldingCount: number
  warnings: string[]
}

const validPublicSymbol = /^[A-Z0-9][A-Z0-9./-]{0,19}$/

const normalizedSymbolFor = (holding: SourceHoldingRecord): string | null => {
  if (!holding.symbol || holding.quantity == null) return null
  if (holding.currencyCode && holding.currencyCode.toUpperCase() !== 'USD') return null
  const symbol = holding.symbol.trim().toUpperCase()
  return validPublicSymbol.test(symbol) ? symbol : null
}

const latestIso = (values: string[]): string | null =>
  values.length === 0 ? null : [...values].sort((a, b) => b.localeCompare(a))[0]!

const latestPricesBySymbol = (
  prices: MarketPriceObservation[],
): Map<string, MarketPriceObservation> => {
  const latest = new Map<string, MarketPriceObservation>()
  for (const price of prices) {
    const symbol = price.symbol.toUpperCase()
    const current = latest.get(symbol)
    if (
      !current ||
      price.receivedAt > current.receivedAt ||
      (price.receivedAt === current.receivedAt &&
        price.providerTimestamp > current.providerTimestamp)
    ) {
      latest.set(symbol, price)
    }
  }
  return latest
}

const easternTradingDate = (date: Date): string => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day}`
}

const roundCurrency = (value: number): number => Math.round(value * 100) / 100

export const createMarketDataService = (options: MarketDataServiceOptions) => {
  const now = options.now ?? (() => new Date())
  const inFlightRefreshes = new Map<string, Promise<MarketPriceObservation[]>>()

  const fetchLatestOnce = (symbols: string[]): Promise<MarketPriceObservation[]> => {
    if (!options.provider || symbols.length === 0) return Promise.resolve([])
    const key = [...symbols].sort().join(',')
    const existing = inFlightRefreshes.get(key)
    if (existing) return existing

    const request = options.provider
      .getLatestPrices(symbols)
      .finally(() => inFlightRefreshes.delete(key))
    inFlightRefreshes.set(key, request)
    return request
  }

  const priceHoldingsForRead = async (
    holdings: SourceHoldingRecord[],
    request: { refreshStale?: boolean } = {},
  ): Promise<PricedHoldingsResult> => {
    const symbols = [
      ...new Set(
        holdings
          .map(normalizedSymbolFor)
          .filter((symbol): symbol is string => Boolean(symbol)),
      ),
    ]
    const warnings: string[] = []
    if (options.providerWarning) warnings.push(options.providerWarning)

    let cached: MarketPriceObservation[] = []
    if (options.provider && symbols.length > 0) {
      try {
        const providerIds = options.provider.cacheProviderIds ?? [options.provider.id]
        cached = (
          await Promise.all(
            providerIds.map((provider) => options.store.getLatestPrices(provider, symbols)),
          )
        ).flat()
      } catch (error) {
        console.warn(
          JSON.stringify({
            event: 'market_price_cache_read_failed',
            errorName: error instanceof Error ? error.name : 'UnknownError',
          }),
        )
        warnings.push('Saved market prices could not be read; a live refresh was attempted.')
      }
    }

    const bySymbol = latestPricesBySymbol(cached)
    const staleBefore = now().getTime() - Math.max(0, options.maxAgeSeconds) * 1_000
    const staleSymbols = symbols.filter((symbol) => {
      const price = bySymbol.get(symbol)
      return !price || new Date(price.receivedAt).getTime() < staleBefore
    })

    if (
      options.provider &&
      options.refreshOnRead &&
      request.refreshStale !== false &&
      staleSymbols.length > 0
    ) {
      try {
        const refreshed = await fetchLatestOnce(staleSymbols)
        for (const price of refreshed) bySymbol.set(price.symbol.toUpperCase(), price)
        try {
          await options.store.savePrices(refreshed)
        } catch (error) {
          console.warn(
            JSON.stringify({
              event: 'market_price_cache_write_failed',
              errorName: error instanceof Error ? error.name : 'UnknownError',
            }),
          )
          warnings.push('Current prices were applied but could not be saved for reuse.')
        }
      } catch (error) {
        console.warn(
          JSON.stringify({
            event: 'market_price_refresh_failed',
            provider: options.provider.id,
            errorName: error instanceof Error ? error.name : 'UnknownError',
          }),
        )
        warnings.push('The live price service was unavailable; saved prices were used where possible.')
      }
    }

    const usedPrices: MarketPriceObservation[] = []
    const repriced = holdings.map((holding) => {
      const symbol = normalizedSymbolFor(holding)
      const price = symbol ? bySymbol.get(symbol) : undefined
      if (!price || holding.quantity == null) return { ...holding }

      usedPrices.push(price)
      const marketValue = roundCurrency(holding.quantity * price.price)
      return {
        ...holding,
        institutionPrice: price.price,
        marketValue,
        unrealizedGainLoss:
          holding.costBasis == null
            ? null
            : roundCurrency(marketValue - holding.costBasis),
        asOfDate: price.providerTimestamp,
      }
    })

    const pricedHoldingCount = usedPrices.length
    const fallbackHoldingCount = holdings.length - pricedHoldingCount
    const usedFeeds = [
      ...new Set(
        usedPrices
          .map((price) => price.feed)
          .filter((feed): feed is string => Boolean(feed)),
      ),
    ]
    const usedProviders = [...new Set(usedPrices.map((price) => price.provider))]
    if (options.provider && symbols.length > 0 && fallbackHoldingCount > 0) {
      warnings.push(
        `${fallbackHoldingCount} holding${fallbackHoldingCount === 1 ? '' : 's'} retained custodian pricing because a current public-market price was unavailable.`,
      )
    }

    const status: HoldingsPricingMetadata['status'] =
      holdings.length === 0
        ? 'unavailable'
        : usedPrices.length === 0
          ? 'fallback'
          : usedPrices.every((price) => price.priceType === 'official_close')
            ? 'eod'
            : usedPrices.some((price) => price.isDelayed)
              ? 'delayed'
              : 'live'

    return {
      holdings: repriced,
      pricing: {
        status,
        provider:
          usedProviders.length === 1
            ? usedProviders[0]!
            : usedProviders.length > 1
              ? options.provider?.id ?? null
              : options.provider?.id ?? null,
        feed: usedFeeds.length === 1 ? usedFeeds[0]! : (options.provider?.feed ?? null),
        priceAsOf: latestIso(usedPrices.map((price) => price.providerTimestamp)),
        refreshedAt: latestIso(usedPrices.map((price) => price.receivedAt)),
        pricedHoldingCount,
        fallbackHoldingCount,
        warnings,
      },
    }
  }

  const refreshClosingPrices = async (
    tradingDate = easternTradingDate(now()),
  ): Promise<ClosingPriceRefreshResult> => {
    if (!options.provider) {
      return {
        status: 'skipped',
        provider: null,
        tradingDate,
        requestedSymbolCount: 0,
        refreshedSymbolCount: 0,
        valuationSnapshotId: null,
        valuedHoldingCount: 0,
        fallbackHoldingCount: 0,
        warnings: options.providerWarning ? [options.providerWarning] : [],
      }
    }

    const holdings =
      options.getSelectedHoldings?.() ??
      plaidRepository.listSourceHoldingsForSelectedAccounts()
    const symbols = [
      ...new Set(
        holdings
          .map(normalizedSymbolFor)
          .filter((symbol): symbol is string => Boolean(symbol)),
      ),
    ]
    if (symbols.length === 0) {
      return {
        status: 'skipped',
        provider: options.provider.id,
        tradingDate,
        requestedSymbolCount: 0,
        refreshedSymbolCount: 0,
        valuationSnapshotId: null,
        valuedHoldingCount: 0,
        fallbackHoldingCount: 0,
        warnings: ['No selected public-market holdings were available to price.'],
      }
    }

    const prices = await options.provider.getClosingPrices(symbols, tradingDate)
    await options.store.savePrices(prices)
    const closingPrices = latestPricesBySymbol(
      prices.filter(
        (price) =>
          price.priceType === 'official_close' && price.tradingDate === tradingDate,
      ),
    )
    if (closingPrices.size === 0) {
      return {
        status: 'skipped',
        provider: options.provider.id,
        tradingDate,
        requestedSymbolCount: symbols.length,
        refreshedSymbolCount: 0,
        valuationSnapshotId: null,
        valuedHoldingCount: 0,
        fallbackHoldingCount: 0,
        warnings: ['No official closing prices were returned for this trading date.'],
      }
    }

    const positions: LiquidityValuationPositionInput[] = holdings.map((holding) => {
      const symbol = normalizedSymbolFor(holding)
      const price = symbol ? closingPrices.get(symbol) : undefined
      const marketValue =
        price && holding.quantity != null
          ? roundCurrency(holding.quantity * price.price)
          : holding.marketValue
      return {
        sourceHoldingId: holding.id,
        accountId: holding.accountId,
        symbol: holding.symbol,
        description: holding.description,
        securityType: holding.type,
        currencyCode: holding.currencyCode,
        quantity: holding.quantity,
        costBasis: holding.costBasis,
        closingPrice: price?.price ?? holding.institutionPrice,
        marketValue,
        unrealizedGainLoss:
          holding.costBasis != null && marketValue != null
            ? roundCurrency(marketValue - holding.costBasis)
            : holding.unrealizedGainLoss,
        valuationSource: price ? 'official_close' : 'custodian_fallback',
        provider: price?.provider ?? null,
        feed: price?.feed ?? null,
        priceAsOf: price?.providerTimestamp ?? holding.asOfDate,
      }
    })
    const fallbackHoldingCount = positions.filter(
      (position) => position.valuationSource === 'custodian_fallback',
    ).length
    const missingSymbolCount = symbols.length - closingPrices.size
    const warnings = options.providerWarning ? [options.providerWarning] : []
    if (missingSymbolCount > 0) {
      warnings.push(
        `${missingSymbolCount} symbol${missingSymbolCount === 1 ? '' : 's'} did not return a closing price.`,
      )
    }
    if (fallbackHoldingCount > 0) {
      warnings.push(
        `${fallbackHoldingCount} holding${fallbackHoldingCount === 1 ? '' : 's'} retained its custodian value in the market-close snapshot.`,
      )
    }

    const usedPrices = [...closingPrices.values()]
    const usedFeeds = [
      ...new Set(
        usedPrices
          .map((price) => price.feed)
          .filter((feed): feed is string => Boolean(feed)),
      ),
    ]
    const savedSnapshot = options.valuationStore
      ? await options.valuationStore.saveSnapshot({
          tradingDate,
          selectedAccountIds: [
            ...new Set(holdings.map((holding) => holding.accountId)),
          ],
          provider: options.provider.id,
          feed: usedFeeds.length === 1 ? usedFeeds[0]! : options.provider.feed,
          priceAsOf: latestIso(
            usedPrices.map((price) => price.providerTimestamp),
          ),
          capturedAt: now().toISOString(),
          positions,
          warnings,
        })
      : null
    return {
      status: 'success',
      provider: options.provider.id,
      tradingDate,
      requestedSymbolCount: symbols.length,
      refreshedSymbolCount: closingPrices.size,
      valuationSnapshotId: savedSnapshot?.id ?? null,
      valuedHoldingCount: positions.length,
      fallbackHoldingCount,
      warnings,
    }
  }

  return { priceHoldingsForRead, refreshClosingPrices }
}

const providerResolution = resolveMarketDataProvider()

export const marketDataService = createMarketDataService({
  provider: providerResolution.provider,
  providerWarning: providerResolution.warning,
  store: marketPriceRepository,
  refreshOnRead: config.marketData.refreshOnRead,
  maxAgeSeconds: config.marketData.maxAgeSeconds,
  valuationStore: liquidityValuationRepository,
})
