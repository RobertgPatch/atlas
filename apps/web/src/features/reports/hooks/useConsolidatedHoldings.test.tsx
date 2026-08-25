import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ConsolidatedHoldingsQuery,
  ConsolidatedHoldingsResponse,
} from '../../../../../../packages/types/src/reports'
import { reportsClient } from '../api/reportsClient'
import { consolidatedHoldingsFixture } from '../fixtures/consolidatedHoldingsFixture'
import { useConsolidatedHoldings } from './useConsolidatedHoldings'

const mocks = vi.hoisted(() => ({
  getConsolidatedHoldings: vi.fn(),
}))

vi.mock('../api/reportsClient', async (importOriginal) => {
  const original = await importOriginal<typeof import('../api/reportsClient')>()
  return {
    ...original,
    reportsClient: {
      ...original.reportsClient,
      getConsolidatedHoldings: mocks.getConsolidatedHoldings,
    },
  }
})

const defaultQuery = {
  sort: 'symbol',
  direction: 'asc',
  page: 1,
  pageSize: 5_000,
} as const satisfies ConsolidatedHoldingsQuery

const responseWithValue = (totalMarketValue: number): ConsolidatedHoldingsResponse => ({
  ...consolidatedHoldingsFixture,
  kpis: { ...consolidatedHoldingsFixture.kpis, totalMarketValue },
})

describe('useConsolidatedHoldings', () => {
  beforeEach(() => mocks.getConsolidatedHoldings.mockReset())

  it('renders saved values before the background market refresh finishes', async () => {
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
    const { result } = renderHook(() => useConsolidatedHoldings(), { wrapper })

    await waitFor(() =>
      expect(result.current.query.data?.kpis.totalMarketValue).toBe(1_000_000),
    )
    expect(result.current.query.isLoading).toBe(false)
    expect(result.current.isMarketRefreshing).toBe(true)
    expect(reportsClient.getConsolidatedHoldings).toHaveBeenNthCalledWith(
      1,
      defaultQuery,
      { pricingMode: 'saved' },
    )
    expect(reportsClient.getConsolidatedHoldings).toHaveBeenNthCalledWith(
      2,
      defaultQuery,
      { pricingMode: 'refresh' },
    )

    await act(async () => resolveRefresh(refreshed))
    await waitFor(() =>
      expect(result.current.query.data?.kpis.totalMarketValue).toBe(1_025_000),
    )
    expect(result.current.isMarketRefreshing).toBe(false)
  })
})
