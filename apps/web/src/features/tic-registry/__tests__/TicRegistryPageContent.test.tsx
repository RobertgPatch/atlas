import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
        return Promise.reject(new Error(`Unexpected request: ${url}`))
      }),
    )

    renderWithQueryClient(true)

    expect(await screen.findByText('Harbor View TIC')).toBeInTheDocument()
    const totalUnitsLabel = screen.getByText('Total Units')
    expect(totalUnitsLabel).toBeInTheDocument()
    expect(totalUnitsLabel.nextElementSibling).toHaveTextContent('24')
    expect(screen.getAllByText('Harbor View TIC A')).toHaveLength(2)
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
        return Promise.reject(new Error(`Unexpected request: ${url}`))
      }),
    )

    renderWithQueryClient(false)

    expect(await screen.findByText('No TIC records found')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add property/i })).not.toBeInTheDocument()
  })

  it('opens the add property dialog with property detail fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = input instanceof Request ? input.url : String(input)
        if (url.includes('/tic-registry/properties')) {
          return jsonResponse(emptyTicRegistryFixture)
        }
        return Promise.reject(new Error(`Unexpected request: ${url}`))
      }),
    )

    const user = userEvent.setup()
    renderWithQueryClient(true)

    await screen.findByText('No TIC records found')
    await user.click(screen.getAllByRole('button', { name: /add property/i })[0])

    expect(screen.getByLabelText('Name')).toBeInTheDocument()
    expect(screen.getByLabelText('City')).toBeInTheDocument()
    expect(screen.getByLabelText('State')).toBeInTheDocument()
    expect(screen.getByLabelText('Property Code')).toBeInTheDocument()
    expect(screen.getByLabelText('Number of Units')).toBeInTheDocument()
    expect(screen.getByLabelText('Acquisition Price')).toBeInTheDocument()
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
