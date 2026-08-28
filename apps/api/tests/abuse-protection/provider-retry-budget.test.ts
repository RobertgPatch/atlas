import { describe, expect, it, vi } from 'vitest'

import { config } from '../../src/config.js'
import { RetryBudgetMarketDataProvider } from '../../src/modules/market-data/market-data.provider.js'
import type { MarketDataProvider } from '../../src/modules/market-data/market-data.types.js'
import { callPlaidWithRetry } from '../../src/modules/plaid/plaid.client.js'

describe('external provider retry budgets', () => {
  it('uses one Plaid deadline signal across the finite attempt budget', async () => {
    const signals: AbortSignal[] = []
    const operation = vi.fn(async (signal: AbortSignal) => {
      signals.push(signal)
      if (signals.length < config.abuseProtection.retryBudgets.plaidMaximumAttempts) {
        throw Object.assign(new Error('temporary failure'), { response: { status: 503 } })
      }
      return 'ok'
    })

    await expect(callPlaidWithRetry(operation)).resolves.toBe('ok')
    expect(operation).toHaveBeenCalledTimes(config.abuseProtection.retryBudgets.plaidMaximumAttempts)
    expect(signals).toHaveLength(config.abuseProtection.retryBudgets.plaidMaximumAttempts)
    expect(new Set(signals).size).toBe(1)
    expect(signals[0]).toBeInstanceOf(AbortSignal)
  })

  it('does not retry non-retryable Plaid failures', async () => {
    const operation = vi.fn(async (_signal: AbortSignal) => {
      throw Object.assign(new Error('bad request'), { response: { status: 400 } })
    })

    await expect(callPlaidWithRetry(operation)).rejects.toThrow('bad request')
    expect(operation).toHaveBeenCalledTimes(1)
  })

  it('owns one finite retry loop around the complete market-data operation', async () => {
    const getLatestPrices = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('provider unavailable'), { status: 503 }))
      .mockResolvedValueOnce([])
    const provider: MarketDataProvider = {
      id: 'fake',
      feed: 'test',
      isDelayed: false,
      getLatestPrices,
      getClosingPrices: vi.fn().mockResolvedValue([]),
    }
    const budgeted = new RetryBudgetMarketDataProvider(provider, 2)

    await expect(budgeted.getLatestPrices(['ATLS'])).resolves.toEqual([])
    expect(getLatestPrices).toHaveBeenCalledTimes(2)
  })

  it('stops market-data retries at the configured maximum', async () => {
    const failure = Object.assign(new Error('rate limited'), { status: 429 })
    const getClosingPrices = vi.fn().mockRejectedValue(failure)
    const provider: MarketDataProvider = {
      id: 'fake',
      feed: 'test',
      isDelayed: false,
      getLatestPrices: vi.fn().mockResolvedValue([]),
      getClosingPrices,
    }
    const budgeted = new RetryBudgetMarketDataProvider(provider, 2)

    await expect(budgeted.getClosingPrices(['ATLS'], '2026-08-25')).rejects.toBe(failure)
    expect(getClosingPrices).toHaveBeenCalledTimes(2)
  })
})
