import { config } from '../../config.js'
import { readLiquiditySources } from '../liquidity-sources/liquidity-source.read.js'
import type { SourceHoldingRecord } from '../liquidity-sources/liquidity-source.types.js'
import { decimal,format,multiply,subtract } from '../liquidity-statements/csv/decimal.js'
import { saveNeutralValuations } from './liquidity-valuation.repository.js'
import { marketPriceRepository } from './market-data.repository.js'
import { resolveMarketDataProvider } from './market-data.provider.js'
import type {
  HoldingsPricingMetadata,
  MarketDataProvider,
  MarketPriceObservation,
  MarketPriceStore,
} from './market-data.types.js'
import {
  admitCostWorkload,
  createServiceCostSubjects,
} from '../abuse-protection/costWorkloadAdmission.js'

interface MarketDataServiceOptions {
  enabled?: boolean | (() => boolean)
  provider: MarketDataProvider | null
  providerWarning?: string | null
  store: MarketPriceStore
  refreshOnRead: boolean
  maxAgeSeconds: number
  now?: () => Date
  getSelectedHoldings?: () => SourceHoldingRecord[] | Promise<SourceHoldingRecord[]>
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

const quoteAfterSource=(holding:SourceHoldingRecord,price:MarketPriceObservation)=>{
  if(holding.sourceKind!=='CSV')return true
  if(price.currencyCode && price.currencyCode!=='USD')return false
  const timestamp=Date.parse(price.providerTimestamp)
  if(!Number.isFinite(timestamp))return false
  if(holding.sourceAsOfAt)return timestamp>=Date.parse(holding.sourceAsOfAt)
  return !holding.sourceAsOfDate || price.providerTimestamp.slice(0,10)>holding.sourceAsOfDate
}

const normalizedSymbolFor = (holding: SourceHoldingRecord): string | null => {
  if (holding.sourceKind === 'CSV' && (!holding.quoteEligible || !holding.providerSymbol)) return null
  if (!holding.symbol || holding.quantity == null) return null
  if (holding.currencyCode && holding.currencyCode.toUpperCase() !== 'USD') return null
  const symbol = (holding.providerSymbol ?? holding.symbol).trim().toUpperCase()
  return validPublicSymbol.test(symbol) ? symbol : null
}

const latestIso = (values: string[]): string | null =>
  values.length === 0 ? null : [...values].sort((a, b) => b.localeCompare(a))[0]!

const isNewerPrice = (
  candidate: MarketPriceObservation,
  current: MarketPriceObservation | undefined,
): boolean =>
  !current ||
  candidate.providerTimestamp > current.providerTimestamp ||
  (candidate.providerTimestamp === current.providerTimestamp &&
    candidate.receivedAt > current.receivedAt)

const latestPricesBySymbol = (
  prices: MarketPriceObservation[],
): Map<string, MarketPriceObservation> => {
  const latest = new Map<string, MarketPriceObservation>()
  for (const price of prices) {
    const symbol = price.symbol.toUpperCase()
    const current = latest.get(symbol)
    if (isNewerPrice(price, current)) {
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
  const isEnabled = () => typeof options.enabled === 'function' ? options.enabled() : options.enabled ?? true
  const now = options.now ?? (() => new Date())
  const inFlightRefreshes = new Map<string, Promise<MarketPriceObservation[]>>()
  const inFlightClosingRefreshes = new Map<string, Promise<ClosingPriceRefreshResult>>()

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
    request: {
      refreshStale?: boolean
      saveDailySnapshot?: boolean
      selectedAccountIds?: string[]
    } = {},
  ): Promise<PricedHoldingsResult> => {
    if (!isEnabled()) {
      return {
        holdings: holdings.map((holding) => ({ ...holding })),
        pricing: {
          status: holdings.length === 0 ? 'unavailable' : 'fallback',
          provider: null,
          feed: null,
          priceAsOf: null,
          refreshedAt: null,
          pricedHoldingCount: 0,
          fallbackHoldingCount: holdings.length,
          warnings: ['Real-time equity pricing is disabled; source values are in use.'],
        },
      }
    }

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
        for (const price of refreshed) {
          const symbol = price.symbol.toUpperCase()
          if (isNewerPrice(price, bySymbol.get(symbol))) {
            bySymbol.set(symbol, price)
          }
        }
        try {
          if (isEnabled()) await options.store.savePrices(refreshed)
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
      if (!isEnabled() || !price || holding.quantity == null || !quoteAfterSource(holding,price)) return { ...holding }

      if (holding.exact) {
        try {
          const q=decimal(holding.exact.quantity!),unit=decimal(String(price.price))
          if(q==null||unit==null)return {...holding}
          const value=multiply(q,unit),basis=holding.exact.costBasis==null?null:decimal(holding.exact.costBasis)
          const gain=basis==null?null:subtract(value,basis)
          usedPrices.push(price)
          return {...holding,institutionPrice:price.price,marketValue:Number(format(value)),unrealizedGainLoss:gain==null?null:Number(format(gain)),asOfDate:price.providerTimestamp,exact:{...holding.exact,institutionPrice:format(unit),marketValue:format(value),unrealizedGainLoss:gain==null?null:format(gain)}}
        } catch { return {...holding} }
      }

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

    const pricing: HoldingsPricingMetadata = {
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
    }

    if (request.saveDailySnapshot && isEnabled() && repriced.some(h=>h.sourceKind==='CSV')) {
      await saveNeutralValuations(repriced,usedPrices).catch(()=>{warnings.push('Price history could not be recorded.')})
    }
    return {
      holdings: repriced,
      pricing,
    }
  }

  const performClosingPriceRefresh = async (
    tradingDate = easternTradingDate(now()),
  ): Promise<ClosingPriceRefreshResult> => {
    if (!isEnabled()) {
      return {
        status: 'skipped',
        provider: null,
        tradingDate,
        requestedSymbolCount: 0,
        refreshedSymbolCount: 0,
        valuationSnapshotId: null,
        valuedHoldingCount: 0,
        fallbackHoldingCount: 0,
        warnings: ['Real-time equity pricing is disabled.'],
      }
    }

    await admitCostWorkload({
      workloadKey: 'market_data_closing_prices',
      method: 'POST',
      routePattern: '/v1/reports/consolidated-holdings/refresh',
      subjectContext: createServiceCostSubjects('market-data', tradingDate, {
        provider: 'market-data',
      }),
      canonicalInputs: { tradingDate },
      globalDailyLimit: config.abuseProtection.quotas.externalProvider.marketProviderCallsGlobalDay,
      leaseTtlSeconds: Math.ceil(config.abuseProtection.timeouts.marketDataProviderMs / 1_000),
    })
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
      await options.getSelectedHoldings?.() ??
      (await readLiquiditySources({userId:'market-data',isAdmin:true,entityIds:[]})).holdings
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
    if (!isEnabled()) return {status:'skipped',provider:null,tradingDate,requestedSymbolCount:0,refreshedSymbolCount:0,valuationSnapshotId:null,valuedHoldingCount:0,fallbackHoldingCount:0,warnings:['Real-time equity pricing is disabled.']}
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

    const positions = holdings.map((holding) => {
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
    await saveNeutralValuations(holdings,prices)
    return {
      status: 'success',
      provider: options.provider.id,
      tradingDate,
      requestedSymbolCount: symbols.length,
      refreshedSymbolCount: closingPrices.size,
      valuationSnapshotId: null,
      valuedHoldingCount: positions.length,
      fallbackHoldingCount,
      warnings,
    }
  }

  const refreshClosingPrices = (
    tradingDate = easternTradingDate(now()),
  ): Promise<ClosingPriceRefreshResult> => {
    const existing = inFlightClosingRefreshes.get(tradingDate)
    if (existing) return existing
    const refresh = performClosingPriceRefresh(tradingDate)
      .finally(() => inFlightClosingRefreshes.delete(tradingDate))
    inFlightClosingRefreshes.set(tradingDate, refresh)
    return refresh
  }

  return { priceHoldingsForRead, refreshClosingPrices }
}

const providerResolution = resolveMarketDataProvider()

export const marketDataService = createMarketDataService({
  enabled: () => config.marketData.realTimeEquitiesEnabled,
  provider: providerResolution.provider,
  providerWarning: providerResolution.warning,
  store: marketPriceRepository,
  refreshOnRead: config.marketData.refreshOnRead,
  maxAgeSeconds: config.marketData.maxAgeSeconds,
})
