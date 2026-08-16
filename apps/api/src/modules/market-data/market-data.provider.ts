import { config } from '../../config.js'
import { AlpacaMarketDataProvider } from './alpaca-market-data.provider.js'
import { FallbackMarketDataProvider } from './fallback-market-data.provider.js'
import { MassiveMarketDataProvider } from './massive-market-data.provider.js'
import type { MarketDataProvider } from './market-data.types.js'

export interface MarketDataProviderResolution {
  provider: MarketDataProvider | null
  warning: string | null
}

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
      timeoutMs: config.marketData.requestTimeoutMs,
    })
    if (!config.marketData.massive.enabled) {
      return { provider: alpaca, warning: null }
    }
    if (!config.marketData.massive.apiKey) {
      return {
        provider: alpaca,
        warning: 'Massive OTC fallback is enabled but its API key is missing.',
      }
    }

    const massive = new MassiveMarketDataProvider({
      baseUrl: config.marketData.massive.baseUrl,
      apiKey: config.marketData.massive.apiKey,
      timeoutMs: config.marketData.requestTimeoutMs,
      cacheTtlSeconds: config.marketData.massive.cacheTtlSeconds,
    })
    return {
      provider: new FallbackMarketDataProvider(alpaca, massive),
      warning: null,
    }
  }

  return {
    provider: null,
    warning: `Unsupported market data provider: ${String(config.marketData.provider)}`,
  }
}
