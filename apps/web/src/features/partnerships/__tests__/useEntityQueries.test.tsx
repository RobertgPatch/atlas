import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { entitiesClient } from '../api/entitiesClient'
import { useUpdateEntity } from '../hooks/useEntityQueries'

vi.mock('../api/entitiesClient', async (importOriginal) => {
  const original = await importOriginal<typeof import('../api/entitiesClient')>()
  return { ...original, entitiesClient: { ...original.entitiesClient, update: vi.fn() } }
})

describe('owner rename cache refresh', () => {
  it('invalidates every owner-dependent query family after rename', async () => {
    vi.mocked(entitiesClient.update).mockResolvedValue({ id: 'e-1', name: 'Renamed Owner' })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const { result } = renderHook(() => useUpdateEntity(), { wrapper })
    await act(async () => { await result.current.mutateAsync({ id: 'e-1', name: 'Renamed Owner' }) })
    const roots = invalidate.mock.calls.map(([filters]) => (filters.queryKey as string[])[0])
    expect(new Set(roots)).toEqual(new Set(['entity', 'entities', 'k1', 'k1-tracker', 'partnership-tracker', 'partnerships-list', 'partnership', 'dashboard', 'reports']))
  })
})
