import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConsolidatedHoldingsResponse } from '../../../../../../packages/types/src/reports'
import { consolidatedHoldingsFixture } from '../../reports/fixtures/consolidatedHoldingsFixture'
import { reportsClient } from '../../reports/api/reportsClient'
import { LIQUIDITY_SUMMARY_QUERY, useLiquiditySummary } from './useLiquiditySummary'

const mocks = vi.hoisted(() => ({
  getConsolidatedHoldings: vi.fn(),
}))

vi.mock('../../reports/api/reportsClient', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../reports/api/reportsClient')>()
  return {
    ...original,
    reportsClient: {
      ...original.reportsClient,
      getConsolidatedHoldings: mocks.getConsolidatedHoldings,
    },
  }
})

const responseWithValue = (totalMarketValue: number): ConsolidatedHoldingsResponse => ({
  ...consolidatedHoldingsFixture,
  kpis: { ...consolidatedHoldingsFixture.kpis, totalMarketValue },
})

describe('useLiquiditySummary', () => {
  beforeEach(() => mocks.getConsolidatedHoldings.mockReset())

  it('shows the saved value first and swaps in the live value only after refresh completes', async () => {
    const saved = responseWithValue(1_000_000)
    const refreshed = responseWithValue(1_025_000)
    let resolveRefresh!: (value: ConsolidatedHoldingsResponse) => void
    const pendingRefresh = new Promise<ConsolidatedHoldingsResponse>((resolve) => {
      resolveRefresh = resolve
    })
    mocks.getConsolidatedHoldings.mockImplementation(
      (_query, options?: { pricingMode?: 'saved' | 'refresh' }) =>
        options?.pricingMode === 'saved' ? Promise.resolve(saved) : pendingRefresh,
    )

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useLiquiditySummary(), { wrapper })

    await waitFor(() => expect(result.current.data?.kpis.totalMarketValue).toBe(1_000_000))
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isFetching).toBe(true)
    expect(mocks.getConsolidatedHoldings).toHaveBeenNthCalledWith(
      1,
      LIQUIDITY_SUMMARY_QUERY,
      { pricingMode: 'saved' },
    )
    expect(mocks.getConsolidatedHoldings).toHaveBeenNthCalledWith(
      2,
      LIQUIDITY_SUMMARY_QUERY,
      { pricingMode: 'refresh' },
    )

    await act(async () => resolveRefresh(refreshed))
    await waitFor(() => expect(result.current.data?.kpis.totalMarketValue).toBe(1_025_000))
    expect(result.current.isFetching).toBe(false)
  })
})

