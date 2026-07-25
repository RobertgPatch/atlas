import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { PartnershipAggregationPageContent } from '../components/aggregation/PartnershipAggregationPageContent'
import { aggregationResponseFixture } from './fixtures'

vi.mock('../hooks/usePartnershipTracker', () => ({
  usePartnershipAggregation: () => ({ data: aggregationResponseFixture, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() }),
  usePartnershipTrackerActions: () => ({ createPartnership: { mutateAsync: vi.fn(), isPending: false } }),
}))

describe('partnership aggregation accessibility', () => {
  it('exposes one h1, labeled groups, live results, sortable headers, and persistent row links', () => {
    const { container } = render(<MemoryRouter><PartnershipAggregationPageContent canEdit={false} /></MemoryRouter>)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByLabelText('Owner filter')).toBeInTheDocument()
    expect(screen.getByLabelText('Partnership type filter')).toBeInTheDocument()
    expect([...container.querySelectorAll('[aria-live="polite"]')].some((element) => element.textContent?.includes('4 partnerships in results'))).toBe(true)
    expect(screen.getByRole('columnheader', { name: /Partnership/ })).toHaveAttribute('aria-sort', 'ascending')
    expect(screen.getByRole('columnheader', { name: /Latest NAV/ })).toHaveAttribute('aria-sort', 'none')
    expect(screen.getByRole('link', { name: /Alpha Growth I/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add partnership/ })).not.toBeInTheDocument()
  })

  it('opens autocomplete options from the keyboard and restores focus on Escape', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><PartnershipAggregationPageContent canEdit={false} /></MemoryRouter>)
    const trigger = screen.getByRole('button', { name: 'Open Owner filter' })
    await user.click(trigger)
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Alder Family/ })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Owner filter')).toHaveFocus()
  })
})
