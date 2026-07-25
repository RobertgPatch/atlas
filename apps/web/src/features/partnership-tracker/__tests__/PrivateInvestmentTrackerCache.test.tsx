import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePartnershipTrackerActions } from '../hooks/usePartnershipTracker'

const api = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  createCommitment: vi.fn(),
  updateCommitment: vi.fn(),
  deleteCommitment: vi.fn(),
  createNav: vi.fn(),
  updateNav: vi.fn(),
  deleteNav: vi.fn(),
  createCashFlow: vi.fn(),
  createCashFlows: vi.fn(),
  deleteCashFlow: vi.fn(),
  createYear: vi.fn(),
  updateYear: vi.fn(),
  deleteYear: vi.fn(),
  signoff: vi.fn(),
}))

vi.mock('../api/partnershipTrackerClient', () => ({ partnershipTrackerClient: api }))

describe('Private Investment Tracker cache policy', () => {
  beforeEach(() => {
    for (const mock of Object.values(api)) mock.mockReset().mockResolvedValue({})
  })

  it('refreshes for operational mutations but not K-1-only changes', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const { result } = renderHook(() => usePartnershipTrackerActions(), { wrapper })

    await act(async () => {
      await result.current.createPartnership.mutateAsync({ entityId: 'e-1', name: 'Fund', partnershipType: 'Credit' })
      await result.current.updatePartnership.mutateAsync({ id: 'p-1', body: { name: 'Renamed', expectedUpdatedAt: '2026-01-01T00:00:00.000Z' } })
      await result.current.createCommitment.mutateAsync({ id: 'p-1', body: { amount: '100.00', effectiveDate: '2026-01-01' } })
      await result.current.createNav.mutateAsync({ id: 'p-1', body: { amount: '95.00', valuationDate: '2026-03-31' } })
      await result.current.createCashFlow.mutateAsync({ id: 'p-1', body: { kind: 'CAPITAL_CALL', activityDate: '2026-01-01', amount: '25.00', note: null } })
      await result.current.deletePartnership.mutateAsync('p-1')
    })

    const operationalInvalidations = invalidate.mock.calls.filter(([filters]) => {
      const key = filters.queryKey as string[] | undefined
      return key?.[0] === 'partnership-tracker' && key[1] === 'private-investments'
    }).length
    expect(operationalInvalidations).toBe(6)

    await act(async () => {
      await result.current.createYear.mutateAsync({ id: 'p-1', year: 2025 })
      await result.current.updateYear.mutateAsync({ id: 'p-1', year: 2025, expectedRevision: 1, changes: [{ fieldKey: 'box_1_ordinary_income_loss', amount: '500.00', sourceType: 'MANUAL_ENTRY' }] })
      await result.current.signoff.mutateAsync({ id: 'p-1', year: 2025, expectedRevision: 2, action: 'PREPARE' })
    })

    const afterTaxEdits = invalidate.mock.calls.filter(([filters]) => {
      const key = filters.queryKey as string[] | undefined
      return key?.[0] === 'partnership-tracker' && key[1] === 'private-investments'
    }).length
    expect(afterTaxEdits).toBe(operationalInvalidations)
  })
})
