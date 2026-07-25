import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PartnershipAggregationQuery } from '../../../../../../packages/types/src/partnership-tracker'
import { PartnershipAggregationPageContent } from '../components/aggregation/PartnershipAggregationPageContent'
import { aggregationResponseFixture } from './fixtures'

const captured = vi.hoisted(() => ({ queries: [] as PartnershipAggregationQuery[], usePlaceholderData: false }))
vi.mock('../hooks/usePartnershipTracker', () => ({
  usePartnershipAggregation: (query: PartnershipAggregationQuery) => {
    captured.queries.push(query)
    return { data: { ...aggregationResponseFixture, query: captured.usePlaceholderData ? aggregationResponseFixture.query : query, pageInfo: { ...aggregationResponseFixture.pageInfo, page: query.page, pageSize: query.pageSize, hasNextPage: query.page < 3, hasPreviousPage: query.page > 1, totalPages: 3 } }, isPlaceholderData: captured.usePlaceholderData, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() }
  },
  usePartnershipTrackerActions: () => ({ createPartnership: { mutateAsync: vi.fn(), isPending: false } }),
}))

function LocationProbe() { const location = useLocation(); return <output aria-label="Current location">{`${location.pathname}${location.search}`}</output> }
function BackButton() { const navigate = useNavigate(); return <button type="button" onClick={() => navigate(-1)}>Browser back</button> }
const renderState = (entry = '/partnership-aggregation') => render(<MemoryRouter initialEntries={[entry]}><PartnershipAggregationPageContent canEdit={false} /><LocationProbe /><BackButton /></MemoryRouter>)

describe('partnership aggregation URL state', () => {
  beforeEach(() => { captured.queries.length = 0; captured.usePlaceholderData = false })

  it('restores canonical filter, sort, direction, page, and page-size state', () => {
    renderState('/partnership-aggregation?partnershipTypes=Credit&statuses=ACTIVE,CLOSED&sort=nav&direction=desc&page=2&pageSize=25')
    expect(captured.queries.at(-1)).toMatchObject({ partnershipTypes: ['Credit'], statuses: ['ACTIVE', 'CLOSED'], sort: 'nav', direction: 'desc', page: 2, pageSize: 25 })
    expect(screen.getByLabelText('Current location')).toHaveTextContent('sort=nav')
  })

  it('replaces search and filter state, resets page one, and clears canonical parameters', async () => {
    const user = userEvent.setup()
    renderState('/partnership-aggregation?page=3&sort=nav')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search partnerships' }), { target: { value: 'Alpha' } })
    await waitFor(() => expect(screen.getByLabelText('Current location')).toHaveTextContent('search=Alpha'), { timeout: 1_000 })
    expect(screen.getByLabelText('Current location')).not.toHaveTextContent('page=3')

    await user.click(screen.getByRole('button', { name: 'Open Owner filter' }))
    await user.click(screen.getByRole('option', { name: /Alder Family/ }))
    expect(screen.getByLabelText('Current location')).toHaveTextContent('ownerIds=e-1')
    fireEvent.click(screen.getAllByRole('button', { name: 'Clear all' })[0])
    expect(screen.getByLabelText('Current location')).not.toHaveTextContent('ownerIds=')
    expect(screen.getByLabelText('Current location')).not.toHaveTextContent('search=')
  })

  it('keeps the first owner click while prior results are serving as placeholder data', async () => {
    const user = userEvent.setup()
    captured.usePlaceholderData = true
    renderState()
    await user.click(screen.getByRole('button', { name: 'Open Owner filter' }))
    await user.click(screen.getByRole('option', { name: /Alder Family/ }))
    const owner = screen.getByRole('button', { name: 'Remove Alder Family' })
    expect(owner).toBeInTheDocument()
    expect(screen.getByLabelText('Current location')).toHaveTextContent('ownerIds=e-1')
  })

  it('toggles sort direction and preserves page navigation in browser history', async () => {
    const user = userEvent.setup()
    renderState('/partnership-aggregation?sort=nav')
    await user.click(screen.getByRole('button', { name: /Sort by Latest NAV/ }))
    expect(screen.getByLabelText('Current location')).toHaveTextContent('sort=nav&direction=desc')
    await user.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByLabelText('Current location')).toHaveTextContent('page=2')
    await user.click(screen.getByRole('button', { name: 'Browser back' }))
    await waitFor(() => expect(screen.getByLabelText('Current location')).not.toHaveTextContent('page=2'))
  })
})
