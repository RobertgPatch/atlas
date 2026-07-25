import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PartnershipAggregationPageContent } from '../components/aggregation/PartnershipAggregationPageContent'
import { aggregationResponseFixture } from './fixtures'

const aggregationState = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
const createPartnership = vi.hoisted(() => vi.fn())

vi.mock('../hooks/usePartnershipTracker', () => ({
  usePartnershipAggregation: () => aggregationState.current,
  usePartnershipTrackerList: () => ({ data: { items: aggregationResponseFixture.items.flatMap((group) => group.members), total: 4, nextCursor: null }, isLoading: false, isError: false }),
  usePartnershipTrackerDetail: () => ({ data: undefined, isLoading: false, isError: false }),
  usePartnershipTrackerActions: () => ({ createPartnership: { mutateAsync: createPartnership, isPending: false } }),
}))
vi.mock('../../partnerships/hooks/useEntityQueries', () => ({ useEntityList: () => ({ data: { items: [{ id: 'e-1', name: 'Alder Family' }] }, isLoading: false, isError: false }) }))

const loadedState = (data = aggregationResponseFixture) => ({ data, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() })
function LocationProbe() { const location = useLocation(); return <output aria-label="Current route">{`${location.pathname}${location.search}`}</output> }
const renderPage = (canEdit = false, entry = '/partnership-aggregation') => render(<MemoryRouter initialEntries={[entry]}><PartnershipAggregationPageContent canEdit={canEdit} /><LocationProbe /></MemoryRouter>)

describe('PartnershipAggregationPageContent', () => {
  beforeEach(() => {
    aggregationState.current = loadedState()
    createPartnership.mockReset()
  })

  it('renders exact rollups, coverage, rows, explicit missing values, and no portfolio IRR', () => {
    const data = structuredClone(aggregationResponseFixture)
    data.items[0]!.members[0]!.unfundedCommitmentAmount = '0.00'
    data.items[0]!.totals.unfundedCommitment.amount = '0.00'
    aggregationState.current = loadedState(data)
    renderPage()

    expect(screen.getByRole('heading', { level: 1, name: 'Partnership aggregation' })).toBeInTheDocument()
    expect(screen.getByText('$350,000')).toBeInTheDocument()
    expect(screen.getByText('0.21×')).toBeInTheDocument()
    expect(screen.getByText('1.36×')).toBeInTheDocument()
    expect(screen.getAllByText('3 of 4 owner records').length).toBeGreaterThan(0)
    expect(screen.getAllByText('$0').length).toBeGreaterThan(0)
    expect(screen.getByText('-$5,000')).toBeInTheDocument()
    expect(screen.getAllByText('0.25×').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/No commitment/).length).toBeGreaterThan(0)
    const missingDistributionRow = screen.getByRole('link', { name: /Redwood Fund/ }).closest('tr')
    expect(missingDistributionRow).not.toBeNull()
    expect(within(missingDistributionRow!).getByText('$0')).toBeInTheDocument()
    expect(within(missingDistributionRow!).queryByText(/No distribution data/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Alpha Growth I/ })).toHaveAttribute('href', '/partnership-tracker?partnership=p-alpha')
    expect(screen.getByText(/Partial data in this page/)).toBeInTheDocument()
    expect(screen.queryByText('Portfolio IRR')).not.toBeInTheDocument()
  })

  it('distinguishes loading, base-empty, no-match, and error/retry states', () => {
    aggregationState.current = { data: undefined, isLoading: true, isFetching: true, isError: false, refetch: vi.fn() }
    const { unmount } = renderPage()
    expect(screen.getByLabelText('Loading partnership aggregation')).toBeInTheDocument()
    unmount()

    const empty = structuredClone(aggregationResponseFixture)
    empty.items = []
    empty.pageInfo = { page: 1, pageSize: 50, totalItems: 0, totalPages: 0, hasPreviousPage: false, hasNextPage: false }
    empty.rollup.partnershipCount = 0
    empty.facets = { owners: [], partnershipTypes: [], statuses: [], workflowStatuses: [], dataQuality: [] }
    aggregationState.current = loadedState(empty)
    const baseEmpty = renderPage()
    expect(screen.getByRole('heading', { name: 'No partnerships in your scope' })).toBeInTheDocument()
    baseEmpty.unmount()

    const noMatch = structuredClone(empty)
    noMatch.facets = aggregationResponseFixture.facets
    noMatch.query.statuses = ['LIQUIDATED']
    aggregationState.current = loadedState(noMatch)
    const filteredEmpty = renderPage(false, '/partnership-aggregation?statuses=LIQUIDATED')
    expect(screen.getByRole('heading', { name: 'No partnerships match these filters' })).toBeInTheDocument()
    filteredEmpty.unmount()

    const refetch = vi.fn()
    aggregationState.current = { data: undefined, isLoading: false, isFetching: false, isError: true, refetch }
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(refetch).toHaveBeenCalledOnce()
  })

  it('shows role-aware actions', () => {
    const userView = renderPage(false)
    expect(screen.queryByRole('button', { name: /Add partnership/ })).not.toBeInTheDocument()
    userView.unmount()
    renderPage(true)
    expect(screen.getByRole('button', { name: /Add partnership/ })).toBeInTheDocument()
  })

  it('routes a newly created Admin partnership into its individual workspace', async () => {
    createPartnership.mockResolvedValue({ partnership: { partnership: { id: 'p-new' } } })
    renderPage(true)
    fireEvent.click(screen.getByRole('button', { name: /Add partnership/ }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Owner' }), { target: { value: 'e-1' } })
    fireEvent.change(screen.getByLabelText('Partnership name'), { target: { value: 'Northstar Fund' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create partnership' }))
    await waitFor(() => expect(screen.getByLabelText('Current route')).toHaveTextContent('/partnership-tracker?partnership=p-new&area=k1'))
  })
})
