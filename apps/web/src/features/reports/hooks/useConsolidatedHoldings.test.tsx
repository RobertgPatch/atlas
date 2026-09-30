import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useState, type PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { consolidatedHoldingsFixture } from '../fixtures/consolidatedHoldingsFixture'
import { useConsolidatedHoldings } from './useConsolidatedHoldings'
const mocks = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('../api/reportsClient', () => ({ reportsClient: { getConsolidatedHoldings: mocks.get } }))
const response = (enabled: boolean, value = 1000) => ({ ...consolidatedHoldingsFixture, kpis: { ...consolidatedHoldingsFixture.kpis, totalMarketValue: value }, pricingCapability: { realTimeEquitiesEnabled: enabled, valuationMode: enabled ? 'CSV_WITH_EQUITY_QUOTES' as const : 'CSV_ONLY' as const, revision: String(enabled) } })
function wrapper({ children }: PropsWithChildren) { const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })); return <QueryClientProvider client={client}>{children}</QueryClientProvider> }
beforeEach(() => { mocks.get.mockReset() })
describe('CSV pricing capability', () => {
  it('pages through bounded holdings results and resets the page when filtering', async () => {
    mocks.get.mockResolvedValue(response(false))
    const { result } = renderHook(() => useConsolidatedHoldings('entity-1'), { wrapper })
    await waitFor(() => expect(result.current.query.data).toBeDefined())
    act(() => result.current.setPage(2))
    await waitFor(() => expect(mocks.get.mock.calls.some(call => call[0].page === 2)).toBe(true))
    act(() => result.current.updateFilter('search', 'DEMO'))
    expect(result.current.queryInput).toMatchObject({page:1,search:'DEMO'})
  })
  it('uses saved values and scopes requests to the selected entity', async () => {
    mocks.get.mockResolvedValue(response(false))
    const { result } = renderHook(() => useConsolidatedHoldings('entity-1'), { wrapper })
    await waitFor(() => expect(result.current.query.data?.kpis.totalMarketValue).toBe(1000))
    expect(mocks.get.mock.calls.every(call => call[0].entityId === 'entity-1')).toBe(true)
    expect(mocks.get.mock.calls.every(call => call[1].pricingMode === 'saved')).toBe(true)
  })
  it('refetches the stable report cache when the page is left and reopened', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const sharedWrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    mocks.get.mockResolvedValueOnce(response(false, 0)).mockResolvedValue(response(false, 42_418_308.86))
    const first = renderHook(() => useConsolidatedHoldings('entity-1'), { wrapper: sharedWrapper })
    await waitFor(() => expect(first.result.current.query.data?.kpis.totalMarketValue).toBe(0))
    first.unmount()
    const reopened = renderHook(() => useConsolidatedHoldings('entity-1'), { wrapper: sharedWrapper })
    await waitFor(() => expect(reopened.result.current.query.data?.kpis.totalMarketValue).toBe(42_418_308.86))
    expect(mocks.get).toHaveBeenCalledTimes(2)
  })
})
