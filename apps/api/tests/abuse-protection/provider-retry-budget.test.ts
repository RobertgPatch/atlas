import { describe, expect, it, vi } from 'vitest'

import { RetryBudgetMarketDataProvider } from '../../src/modules/market-data/market-data.provider.js'
import type { MarketDataProvider } from '../../src/modules/market-data/market-data.types.js'

describe('external provider retry budgets', () => {
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
