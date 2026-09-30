import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LiquiditySectorsPage } from './LiquiditySectorsPage'
import { entitiesClient } from '../features/partnerships/api/entitiesClient'

const auth = vi.hoisted(() => ({ role: 'Admin' as 'Admin' | 'User' }))
vi.mock('../auth/sessionStore', () => ({
  useSession: () => ({ session: { role: auth.role, user: { email: 'admin@example.test', accessLevel: auth.role } } }),
  sessionStore: { setUnauthenticated: vi.fn() },
}))
vi.mock('../features/partnerships/api/entitiesClient', () => ({ entitiesClient: { list: vi.fn() } }))
vi.mock('../features/reports/components/LiquiditySectorManager', () => ({
  LiquiditySectorManager: ({ entityId }: { entityId?: string }) => <div data-testid="stock-scope">{entityId ?? 'all'}</div>,
}))

beforeEach(() => {
  auth.role = 'Admin'
  vi.clearAllMocks()
  vi.mocked(entitiesClient.list).mockResolvedValue({ items: ['entity-a', 'entity-b'].map((id) => ({
    id, name: `Trust ${id}`, entityType: 'Trust', jurisdiction: null, taxId: null,
    formedOn: null, status: 'ACTIVE', notes: null, registeredAgent: null, primaryContact: null,
    ownerCount: 0, partnershipCount: 0, investmentCount: 0, holdingsValueUsd: 0, totalDistributionsUsd: 0,
  })) })
})

function setup(path = '/liquidity/sectors?entityId=entity-a') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/liquidity/sectors" element={<LiquiditySectorsPage/>}/>
    <Route path="/liquidity" element={<p>Liquidity overview</p>}/>
  </Routes></MemoryRouter></QueryClientProvider>)
}

describe('Liquidity sector management page', () => {
  it('preserves the selected entity on entry and when returning to Liquidity', async () => {
    setup()
    expect(screen.getByRole('heading', { name: 'Manage sectors' })).toBeInTheDocument()
    await screen.findByRole('option', { name: 'Trust entity-a' })
    expect(screen.getByLabelText('Sector management entity')).toHaveValue('entity-a')
    expect(screen.getByTestId('stock-scope')).toHaveTextContent('entity-a')
    expect(screen.getByRole('link', { name: 'Back to Liquidity' })).toHaveAttribute('href', '/liquidity?entityId=entity-a')
    expect(screen.getByText(/across every entity and custodian/)).toBeInTheDocument()
  })

  it('changes the displayed stock scope without implying assignments are entity-specific', async () => {
    const user = userEvent.setup()
    setup()
    await screen.findByRole('option', { name: 'Trust entity-b' })
    await user.selectOptions(screen.getByLabelText('Sector management entity'), 'entity-b')
    expect(screen.getByTestId('stock-scope')).toHaveTextContent('entity-b')
    expect(screen.getByRole('link', { name: 'Back to Liquidity' })).toHaveAttribute('href', '/liquidity?entityId=entity-b')
    await user.selectOptions(screen.getByLabelText('Sector management entity'), '')
    expect(screen.getByTestId('stock-scope')).toHaveTextContent('all')
    expect(screen.getByRole('link', { name: 'Back to Liquidity' })).toHaveAttribute('href', '/liquidity')
  })

  it('redirects non-admins before any management data is requested', () => {
    auth.role = 'User'
    setup()
    expect(screen.getByText('Liquidity overview')).toBeInTheDocument()
    expect(screen.queryByTestId('stock-scope')).not.toBeInTheDocument()
    expect(entitiesClient.list).not.toHaveBeenCalled()
  })
})
