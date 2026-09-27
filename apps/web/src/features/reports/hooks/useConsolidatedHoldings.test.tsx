import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useState, type PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { consolidatedHoldingsFixture } from '../fixtures/consolidatedHoldingsFixture'
import { useConsolidatedHoldings } from './useConsolidatedHoldings'
const mocks = vi.hoisted(() => ({ get: vi.fn(), refresh: vi.fn() }))
vi.mock('../api/reportsClient', () => ({ reportsClient: { getConsolidatedHoldings: mocks.get, refreshConsolidatedHoldings: mocks.refresh } }))
const response = (enabled: boolean, value = 1000) => ({ ...consolidatedHoldingsFixture, kpis: { ...consolidatedHoldingsFixture.kpis, totalMarketValue: value }, pricingCapability: { realTimeEquitiesEnabled: enabled, valuationMode: enabled ? 'CSV_WITH_EQUITY_QUOTES' as const : 'CSV_ONLY' as const, revision: String(enabled) } })
function wrapper({ children }: PropsWithChildren) { const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })); return <QueryClientProvider client={client}>{children}</QueryClientProvider> }
beforeEach(() => { mocks.get.mockReset(); mocks.refresh.mockReset() })
describe('CSV pricing capability', () => {
  it('pages through bounded holdings results and resets the page when filtering', async () => {
    mocks.get.mockResolvedValue(response(false))
    const { result } = renderHook(() => useConsolidatedHoldings(), { wrapper })
    await waitFor(() => expect(result.current.query.data).toBeDefined())
    act(() => result.current.setPage(2))
    await waitFor(() => expect(mocks.get.mock.calls.some(call => call[0].page === 2)).toBe(true))
    act(() => result.current.updateFilter('search', 'DEMO'))
    expect(result.current.queryInput).toMatchObject({page:1,search:'DEMO'})
  })
  it('uses saved queries only on mount and manual refresh when disabled', async () => {
    mocks.get.mockResolvedValue(response(false))
    const { result } = renderHook(() => useConsolidatedHoldings(), { wrapper })
    await waitFor(() => expect(result.current.query.data?.kpis.totalMarketValue).toBe(1000))
    await act(async () => { await result.current.refresh.mutateAsync(undefined) })
    expect(mocks.refresh).not.toHaveBeenCalled()
    expect(mocks.get.mock.calls.every(call => call[1].pricingMode === 'saved')).toBe(true)
  })
  it('refetches the stable report cache when the page is left and reopened', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const sharedWrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    mocks.get.mockResolvedValueOnce(response(false, 0)).mockResolvedValue(response(false, 42_418_308.86))
    const first = renderHook(() => useConsolidatedHoldings(), { wrapper: sharedWrapper })
    await waitFor(() => expect(first.result.current.query.data?.kpis.totalMarketValue).toBe(0))
    first.unmount()
    const reopened = renderHook(() => useConsolidatedHoldings(), { wrapper: sharedWrapper })
    await waitFor(() => expect(reopened.result.current.query.data?.kpis.totalMarketValue).toBe(42_418_308.86))
    expect(mocks.get).toHaveBeenCalledTimes(2)
  })
  it('keeps saved values while the admitted price refresh is pending', async () => {
    let finish!: () => void
    mocks.refresh.mockImplementation(() => new Promise<void>(resolve => { finish = resolve }))
    mocks.get.mockResolvedValueOnce(response(true)).mockResolvedValue(response(true, 1100))
    const { result } = renderHook(() => useConsolidatedHoldings(), { wrapper })
    await waitFor(() => expect(result.current.isMarketRefreshing).toBe(true))
    expect(result.current.query.data?.kpis.totalMarketValue).toBe(1000)
    await act(async () => finish())
    await waitFor(() => expect(result.current.query.data?.kpis.totalMarketValue).toBe(1100))
    expect(mocks.refresh).toHaveBeenCalledOnce()
  })
  it('does not replace a newer CSV revision with an older quote response', async () => {
    let finish!: (value: ReturnType<typeof response>) => void
    mocks.refresh.mockResolvedValue(undefined)
    mocks.get.mockResolvedValueOnce(response(true))
      .mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
      .mockResolvedValue({ ...response(false, 900), sourceRevision: 'new-upload' })
    const { result } = renderHook(() => useConsolidatedHoldings(), { wrapper })
    await waitFor(() => expect(finish).toBeDefined())
    await act(async () => { await result.current.query.refetch() })
    await waitFor(() => expect(result.current.query.data?.sourceRevision).toBe('new-upload'))
    await act(async () => finish(response(true, 1200)))
    await waitFor(() => expect(result.current.isMarketRefreshing).toBe(false))
    expect(result.current.query.data?.kpis.totalMarketValue).toBe(900)
    expect(result.current.query.data?.pricingCapability?.realTimeEquitiesEnabled).toBe(false)
  })
})
