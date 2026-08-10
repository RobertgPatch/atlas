import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PrivateInvestmentTrackerPageContent } from '../components/private-investment/PrivateInvestmentTrackerPageContent'
import { privateInvestmentResponseFixture } from './fixtures'

const state = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
const exportMutation = vi.hoisted(() => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null as Error | null }))
vi.mock('../hooks/usePartnershipTracker', () => ({
  usePrivateInvestmentTracker: () => state.current,
  usePrivateInvestmentPdfExport: () => exportMutation,
}))
const loaded = () => ({ data: privateInvestmentResponseFixture, isLoading: false, isFetching: false, isPlaceholderData: false, isError: false, refetch: vi.fn() })

describe('PrivateInvestmentTrackerPageContent', () => {
  beforeEach(() => { state.current = loaded(); exportMutation.mutate.mockReset(); exportMutation.reset.mockReset() })

  it('renders the application-aligned lifetime summary without the retired activity ledger', () => {
    const { container } = render(<MemoryRouter initialEntries={['/private-investment-tracker']}><PrivateInvestmentTrackerPageContent /></MemoryRouter>)
    expect(screen.getByRole('heading', { level: 1, name: 'Investment Tracker' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Fund investment summary' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Cash flow & valuation detail' })).not.toBeInTheDocument()
    expect(screen.getByText('Redwood Fund')).toBeInTheDocument()
    expect(screen.getAllByText('($1,000,000.00)')).toHaveLength(1)
    expect(screen.getAllByText('$950,000.00').length).toBeGreaterThan(0)
    expect(screen.getByText(/Lifetime metrics for every matching entity-fund position/)).toBeInTheDocument()
    expect(container.querySelectorAll('.overflow-x-auto')).toHaveLength(1)
    expect(container.firstElementChild).toHaveClass('border-l-4', 'border-jackson-gold')
    expect(screen.getAllByRole('columnheader')[0].parentElement).toHaveClass('bg-gray-50')
    const summary = screen.getByRole('table', { name: /Lifetime investment metrics/ })
    expect(within(summary).queryByRole('columnheader', { name: 'Non-Recallable Distributions' })).not.toBeInTheDocument()
    expect(within(summary).queryByRole('columnheader', { name: 'Recallable Distributions' })).not.toBeInTheDocument()
    expect(container.innerHTML).not.toContain('bg-[#315e9e]')
    expect(container.innerHTML).not.toContain('bg-[#eef4fb]')
    expect(screen.queryByRole('table', { name: /Filtered cash flow and valuation activity/ })).not.toBeInTheDocument()
  })

  it('distinguishes loading, base-empty, filtered-empty, and error states', () => {
    state.current = { data: undefined, isLoading: true, isFetching: true, isPlaceholderData: false, isError: false }
    const loading = render(<MemoryRouter><PrivateInvestmentTrackerPageContent /></MemoryRouter>)
    expect(screen.getByLabelText('Loading investment tracker')).toBeInTheDocument()
    loading.unmount()

    const empty = structuredClone(privateInvestmentResponseFixture)
    empty.positions = []; empty.activities = []; empty.facets.entities = []; empty.facets.partnerships = []
    empty.pageInfo = { page: 1, pageSize: 50, totalItems: 0, totalPages: 0, hasPreviousPage: false, hasNextPage: false }
    state.current = { ...loaded(), data: empty }
    const baseEmpty = render(<MemoryRouter><PrivateInvestmentTrackerPageContent /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'No partnerships yet' })).toBeInTheDocument()
    baseEmpty.unmount()

    const commitmentOnly = structuredClone(privateInvestmentResponseFixture)
    commitmentOnly.activities = []
    commitmentOnly.pageInfo = { page: 1, pageSize: 50, totalItems: 0, totalPages: 0, hasPreviousPage: false, hasNextPage: false }
    state.current = { ...loaded(), data: commitmentOnly }
    const commitmentOnlyView = render(<MemoryRouter><PrivateInvestmentTrackerPageContent /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Fund investment summary' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'No Cash Activity or FMV entries yet' })).not.toBeInTheDocument()
    commitmentOnlyView.unmount()

    state.current = { data: undefined, isLoading: false, isFetching: false, isPlaceholderData: false, isError: true, refetch: vi.fn() }
    render(<MemoryRouter><PrivateInvestmentTrackerPageContent /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'The investment tracker could not be loaded' })).toBeInTheDocument()
  })

  it('exposes labeled filters, polite result counts, and a report export action', () => {
    render(<MemoryRouter><PrivateInvestmentTrackerPageContent /></MemoryRouter>)
    expect(screen.getByLabelText('Asset class filter')).toBeInTheDocument()
    expect(screen.getByLabelText('Entity filter')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open Fund filter' })).toBeInTheDocument()
    expect(screen.getByText('1 position')).toHaveAttribute('aria-live', 'polite')
    expect(screen.getByRole('button', { name: 'Export PDF' })).toBeEnabled()
  })
})
