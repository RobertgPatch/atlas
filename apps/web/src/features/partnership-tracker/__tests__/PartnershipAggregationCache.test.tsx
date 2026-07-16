import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePartnershipTrackerActions } from '../hooks/usePartnershipTracker'

const api = vi.hoisted(() => ({
  create: vi.fn(), update: vi.fn(),
  createCommitment: vi.fn(), updateCommitment: vi.fn(), deleteCommitment: vi.fn(),
  createNav: vi.fn(), updateNav: vi.fn(), deleteNav: vi.fn(),
  createYear: vi.fn(), updateYear: vi.fn(), deleteYear: vi.fn(), signoff: vi.fn(),
}))
vi.mock('../api/partnershipTrackerClient', () => ({ partnershipTrackerClient: api }))

describe('partnership aggregation cache invalidation', () => {
  beforeEach(() => {
    for (const mock of Object.values(api)) mock.mockReset().mockResolvedValue({})
  })

  it('invalidates the complete aggregation family after every aggregate-affecting mutation', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const { result } = renderHook(() => usePartnershipTrackerActions(), { wrapper })

    await act(async () => {
      await result.current.createPartnership.mutateAsync({ entityId: 'e-1', name: 'New fund', partnershipType: 'Credit' })
      await result.current.updatePartnership.mutateAsync({ id: 'p-1', body: { name: 'Renamed fund', expectedUpdatedAt: '2026-01-01T00:00:00.000Z' } })
      await result.current.createCommitment.mutateAsync({ id: 'p-1', body: { amount: '100.00', effectiveDate: '2026-01-01' } })
      await result.current.updateCommitment.mutateAsync({ id: 'p-1', entryId: 'c-1', body: { amount: '125.00', expectedUpdatedAt: '2026-01-01T00:00:00.000Z' } })
      await result.current.deleteCommitment.mutateAsync({ id: 'p-1', entryId: 'c-1', expectedUpdatedAt: '2026-01-01T00:00:00.000Z' })
      await result.current.createNav.mutateAsync({ id: 'p-1', body: { amount: '90.00', valuationDate: '2026-03-31' } })
      await result.current.updateNav.mutateAsync({ id: 'p-1', entryId: 'n-1', body: { amount: '95.00', expectedUpdatedAt: '2026-01-01T00:00:00.000Z' } })
      await result.current.deleteNav.mutateAsync({ id: 'p-1', entryId: 'n-1', expectedUpdatedAt: '2026-01-01T00:00:00.000Z' })
      await result.current.createYear.mutateAsync({ id: 'p-1', year: 2025 })
      await result.current.updateYear.mutateAsync({ id: 'p-1', year: 2025, expectedRevision: 1, changes: [{ fieldKey: 'capital_contributions', amount: '100.00', sourceType: 'MANUAL_ENTRY' }] })
      await result.current.deleteYear.mutateAsync({ id: 'p-1', year: 2025, expectedRevision: 2 })
      await result.current.signoff.mutateAsync({ id: 'p-1', year: 2025, expectedRevision: 1, action: 'PREPARE' })
    })

    const aggregationInvalidations = invalidate.mock.calls.filter(([filters]) => {
      const key = filters.queryKey as string[] | undefined
      return key?.[0] === 'partnership-tracker' && key[1] === 'aggregation'
    })
    expect(aggregationInvalidations).toHaveLength(12)
  })
})
