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
    expect(screen.getByRole('group', { name: 'Owner' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Partnership type' })).toBeInTheDocument()
    expect(container.querySelector('[aria-live="polite"]')).toHaveTextContent('4 partnerships in results')
    expect(screen.getByRole('columnheader', { name: /Partnership/ })).toHaveAttribute('aria-sort', 'ascending')
    expect(screen.getByRole('columnheader', { name: /Latest NAV/ })).toHaveAttribute('aria-sort', 'none')
    expect(screen.getByRole('link', { name: /Alpha Growth I/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add partnership/ })).not.toBeInTheDocument()
  })

  it('uses a focus-managed mobile drawer that closes with Escape and restores focus', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><PartnershipAggregationPageContent canEdit={false} /></MemoryRouter>)
    const trigger = screen.getByRole('button', { name: /^Filters/ })
    await user.click(trigger)
    const dialog = screen.getByRole('dialog', { name: 'Partnership filters' })
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
    await user.tab()
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Partnership filters' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})
