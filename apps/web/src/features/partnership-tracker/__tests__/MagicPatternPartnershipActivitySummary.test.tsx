import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  MagicPatternPartnershipActivitySummary,
  MagicPatternPartnershipIndex,
} from '../components/magic-patterns/MagicPatternPartnershipIndex'
import { aggregationResponseFixture } from './fixtures'

vi.mock('../hooks/usePartnershipTracker', () => ({
  usePartnershipAggregation: () => ({
    data: aggregationResponseFixture,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  usePartnershipTrackerActions: () => ({
    deletePartnership: { mutateAsync: vi.fn(), isPending: false },
  }),
}))

describe('Magic Patterns partnership activity summary', () => {
  it('combines capital activity and performance aggregations with basis details on the right', async () => {
    const user = userEvent.setup()
    const rollup = {
      ...aggregationResponseFixture.rollup,
      unsettledActivity: { ...aggregationResponseFixture.rollup.unsettledActivity, amount: '123.45' },
    }
    render(<MagicPatternPartnershipActivitySummary rollup={rollup} />)

    const summary = screen.getByRole('table', {
      name: 'Partnership activity summary for the full permitted portfolio',
    })

    expect(within(summary).getByText('Capital activity')).toBeInTheDocument()
    expect(within(summary).getByText('Performance')).toBeInTheDocument()
    expect(within(summary).getByText('Committed capital')).toBeInTheDocument()
    expect(within(summary).getByText('$350,000.00')).toBeInTheDocument()
    expect(within(summary).queryByText('Unsettled activity')).not.toBeInTheDocument()
    expect(within(summary).queryByText('$123.45')).not.toBeInTheDocument()
    expect(within(summary).getByText('Latest NAV rollup')).toBeInTheDocument()
    expect(within(summary).getByText('DPI')).toBeInTheDocument()
    expect(within(summary).getByText('TVPI')).toBeInTheDocument()
    expect(within(summary).queryByText('Annualized cash-on-cash')).not.toBeInTheDocument()
    expect(within(summary).queryByRole('columnheader', { name: 'Coverage / calculation basis' })).not.toBeInTheDocument()
    const basisButton = within(summary).getByRole('button', { name: 'Coverage and calculation basis for Committed capital' })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    await user.hover(basisButton)
    expect(screen.getByRole('tooltip')).toHaveTextContent('3 of 4 owner records covered')
    await user.unhover(basisButton)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    await user.tab()
    expect(basisButton).toHaveFocus()
    expect(screen.getByRole('tooltip')).toHaveTextContent('3 of 4 owner records covered')
    expect(screen.queryByText('Portfolio rollup')).not.toBeInTheDocument()
  })

  it('prioritizes fully readable owner names over fund-manager metadata', () => {
    render(<MagicPatternPartnershipIndex canEdit={false} onOpen={vi.fn()} />)

    const ledger = screen.getByRole('table', { name: /Partnership records grouped by fund/ })
    const columns = ledger.querySelectorAll('col')
    expect(columns[1]).toHaveStyle({ width: '320px' })
    for (const ownerName of within(ledger).getAllByText('Alder Family')) {
      expect(ownerName).toHaveClass('whitespace-normal')
      expect(ownerName).not.toHaveClass('truncate')
    }
    expect(within(ledger).queryByText('Redwood Capital')).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('Search fund, owner, or EIN')).toBeInTheDocument()
  })
})
