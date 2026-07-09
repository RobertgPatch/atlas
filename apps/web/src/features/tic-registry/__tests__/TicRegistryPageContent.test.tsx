import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TicRegistryPageContent } from '../components/TicRegistryPageContent'
import { emptyTicRegistryFixture, ticRegistryFixture } from './ticRegistryFixtures'

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

function renderWithQueryClient(canEdit: boolean) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <TicRegistryPageContent canEdit={canEdit} />
    </QueryClientProvider>,
  )
}

describe('TicRegistryPageContent', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads and renders registry records from the API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = input instanceof Request ? input.url : String(input)
        if (url.includes('/tic-registry/properties')) {
          return jsonResponse(ticRegistryFixture)
        }
        if (url.includes('/entities')) {
          return jsonResponse({
            items: [
              {
                id: 'entity-1',
                name: 'Atlas Holdings LLC',
                partnershipCount: 0,
                totalDistributionsUsd: 0,
              },
            ],
          })
        }
        return Promise.reject(new Error(`Unexpected request: ${url}`))
      }),
    )

    renderWithQueryClient(true)

    expect(await screen.findByText('Harbor View TIC')).toBeInTheDocument()
    expect(screen.getByText('Harbor View TIC A')).toBeInTheDocument()
    expect(screen.getByText('Atlas Family Trust')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add property/i })).toBeInTheDocument()
  })

  it('shows the empty state when the registry has no records', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = input instanceof Request ? input.url : String(input)
        if (url.includes('/tic-registry/properties')) {
          return jsonResponse(emptyTicRegistryFixture)
        }
        if (url.includes('/entities')) {
          return jsonResponse({ items: [] })
        }
        return Promise.reject(new Error(`Unexpected request: ${url}`))
      }),
    )

    renderWithQueryClient(false)

    expect(await screen.findByText('No TIC records found')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add property/i })).not.toBeInTheDocument()
  })

  it('shows a loading state while the registry request is pending', async () => {
    let resolveRegistry: (response: Response) => void = () => undefined
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = input instanceof Request ? input.url : String(input)
        if (url.includes('/tic-registry/properties')) {
          return new Promise<Response>((resolve) => {
            resolveRegistry = resolve
          })
        }
        if (url.includes('/entities')) {
          return jsonResponse({ items: [] })
        }
        return Promise.reject(new Error(`Unexpected request: ${url}`))
      }),
    )

    const { container } = renderWithQueryClient(false)

    expect(container.querySelector('.animate-spin')).toBeInTheDocument()

    resolveRegistry(
      new Response(JSON.stringify(emptyTicRegistryFixture), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    expect(await screen.findByText('No TIC records found')).toBeInTheDocument()
  })

  it('shows the database-required error without falling back to an empty state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = input instanceof Request ? input.url : String(input)
        if (url.includes('/tic-registry/properties')) {
          return jsonResponse({ error: 'DATABASE_REQUIRED' }, 503)
        }
        if (url.includes('/entities')) {
          return jsonResponse({ items: [] })
        }
        return Promise.reject(new Error(`Unexpected request: ${url}`))
      }),
    )

    renderWithQueryClient(false)

    expect(
      await screen.findByText(/requires the RDS database connection/i),
    ).toBeInTheDocument()
    expect(screen.queryByText('No TIC records found')).not.toBeInTheDocument()
  })
})
