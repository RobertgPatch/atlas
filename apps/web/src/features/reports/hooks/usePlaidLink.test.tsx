import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlaidLink } from './usePlaidLink'

const mocks = vi.hoisted(() => ({
  createPlaidLinkToken: vi.fn(),
  exchangePlaidPublicToken: vi.fn(),
  open: vi.fn(),
}))

vi.mock('react-plaid-link', () => ({
  usePlaidLink: () => ({ ready: false, open: mocks.open }),
}))

vi.mock('../api/reportsClient', async (importOriginal) => {
  const original = await importOriginal<typeof import('../api/reportsClient')>()
  return {
    ...original,
    reportsClient: {
      ...original.reportsClient,
      createPlaidLinkToken: mocks.createPlaidLinkToken,
      exchangePlaidPublicToken: mocks.exchangePlaidPublicToken,
    },
  }
})

describe('usePlaidLink', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createPlaidLinkToken.mockResolvedValue({
      linkToken: 'link-sandbox-test',
      expiration: '2026-08-25T12:00:00.000Z',
    })
  })

  it('does not create a paid link token until the user opens Plaid Link', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => usePlaidLink(), { wrapper })

    expect(mocks.createPlaidLinkToken).not.toHaveBeenCalled()

    await act(async () => result.current.open())

    await waitFor(() => expect(mocks.createPlaidLinkToken).toHaveBeenCalledOnce())
  })
})
