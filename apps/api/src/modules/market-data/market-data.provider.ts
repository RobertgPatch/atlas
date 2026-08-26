import { config } from '../../config.js'
import { AlpacaMarketDataProvider } from './alpaca-market-data.provider.js'
import { FallbackMarketDataProvider } from './fallback-market-data.provider.js'
import { MassiveMarketDataProvider } from './massive-market-data.provider.js'
import type { MarketDataProvider } from './market-data.types.js'

export interface MarketDataProviderResolution {
  provider: MarketDataProvider | null
  warning: string | null
}

const retryableMarketDataError = (error: unknown): boolean => {
  const candidate = error as {
    status?: number
    code?: string
    name?: string
    message?: string
  }
  if (candidate.status === 429 || (candidate.status ?? 0) >= 500) return true
  if (['AbortError', 'TimeoutError'].includes(candidate.name ?? '')) return true
  if (['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED'].includes(candidate.code ?? '')) return true
  return /HTTP (?:429|5\d\d)\b/.test(candidate.message ?? '')
}

/**
 * Owns the single retry loop for an entire market-data operation. Individual
 * Alpaca/Massive clients have request abort signals but deliberately do not
 * retry, preventing fallback and HTTP layers from multiplying attempts.
 */
export class RetryBudgetMarketDataProvider implements MarketDataProvider {
  readonly id: string
  readonly feed: string | null
  readonly isDelayed: boolean
  readonly cacheProviderIds?: readonly string[]

  constructor(
    private readonly provider: MarketDataProvider,
    private readonly maximumAttempts: number,
  ) {
    this.id = provider.id
    this.feed = provider.feed
    this.isDelayed = provider.isDelayed
    this.cacheProviderIds = provider.cacheProviderIds
  }

  private async run<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: unknown
    for (let attempt = 1; attempt <= this.maximumAttempts; attempt += 1) {
      try {
        return await operation()
      } catch (error) {
        lastError = error
        if (attempt >= this.maximumAttempts || !retryableMarketDataError(error)) throw error
        if (config.nodeEnv !== 'test') {
          const base = config.abuseProtection.retryBudgets.baseDelayMs * 2 ** (attempt - 1)
          const bounded = Math.min(base, config.abuseProtection.retryBudgets.maximumDelayMs)
          const jittered = Math.max(1, Math.floor(bounded * (0.5 + Math.random() * 0.5)))
          await new Promise<void>((resolve) => setTimeout(resolve, jittered))
        }
      }
    }
    throw lastError
  }

  getLatestPrices(symbols: string[]) {
    return this.run(() => this.provider.getLatestPrices(symbols))
  }

  getClosingPrices(symbols: string[], tradingDate: string) {
    return this.run(() => this.provider.getClosingPrices(symbols, tradingDate))
  }
}

const withRetryBudget = (provider: MarketDataProvider): MarketDataProvider =>
  new RetryBudgetMarketDataProvider(
    provider,
    config.abuseProtection.retryBudgets.marketDataMaximumAttempts,
  )

export const resolveMarketDataProvider = (): MarketDataProviderResolution => {
  if (config.marketData.provider === 'none') {
    return { provider: null, warning: null }
  }

  if (config.marketData.provider === 'alpaca') {
    if (!config.marketData.alpaca.keyId || !config.marketData.alpaca.secret) {
      return {
        provider: null,
        warning: 'Live market pricing is configured but Alpaca credentials are missing.',
      }
    }
    const alpaca = new AlpacaMarketDataProvider({
      baseUrl: config.marketData.alpaca.baseUrl,
      keyId: config.marketData.alpaca.keyId,
      secret: config.marketData.alpaca.secret,
      feed: config.marketData.alpaca.feed,
      timeoutMs: config.abuseProtection.timeouts.marketDataProviderMs,
    })
    if (!config.marketData.massive.enabled) {
      return { provider: withRetryBudget(alpaca), warning: null }
    }
    if (!config.marketData.massive.apiKey) {
      return {
        provider: withRetryBudget(alpaca),
        warning: 'Massive OTC fallback is enabled but its API key is missing.',
      }
    }

    const massive = new MassiveMarketDataProvider({
      baseUrl: config.marketData.massive.baseUrl,
      apiKey: config.marketData.massive.apiKey,
      timeoutMs: config.abuseProtection.timeouts.marketDataProviderMs,
      cacheTtlSeconds: config.marketData.massive.cacheTtlSeconds,
    })
    return {
      provider: withRetryBudget(new FallbackMarketDataProvider(alpaca, massive)),
      warning: null,
    }
  }

  return {
    provider: null,
    warning: `Unsupported market data provider: ${String(config.marketData.provider)}`,
  }
}
