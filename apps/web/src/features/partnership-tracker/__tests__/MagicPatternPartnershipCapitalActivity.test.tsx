import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PartnershipTrackerDetail } from '../../../../../../packages/types/src/partnership-tracker'
import { MagicPatternPartnershipCapitalActivity } from '../components/magic-patterns/MagicPatternPartnershipWorkspace'
import { k1CashActivityDetailFixture, summaryFixture } from './fixtures'

vi.mock('../hooks/usePartnershipTracker', () => ({
  usePartnershipTrackerActions: () => ({
    deleteCashFlow: { isPending: false, mutateAsync: vi.fn() },
  }),
}))

const detail = {
  summary: summaryFixture,
  years: [{ taxYear: 2024 }],
  cashFlowEvents: k1CashActivityDetailFixture.cashFlowEvents,
  commitments: [],
  navEntries: [],
} as unknown as PartnershipTrackerDetail

describe('MagicPatternPartnershipCapitalActivity', () => {
  it('keeps the ledger scoped to the selected partnership', () => {
    render(
      <MagicPatternPartnershipCapitalActivity
        detail={detail}
        canEdit={false}
        drawerOpen={false}
        onDrawerOpenChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Capital activity' })).toBeInTheDocument()
    const summary = screen.getByRole('table', { name: 'Capital activity summary for Redwood Fund' })
    expect(within(summary).getByText('Capital called')).toBeInTheDocument()
    expect(within(summary).getByText('Non-recallable distributions')).toBeInTheDocument()
    expect(within(summary).getByText('Recallable distributions')).toBeInTheDocument()
    expect(within(summary).getByText('Received in kind')).toBeInTheDocument()
    const ledger = screen.getByRole('table', { name: /Capital activity: dated capital calls and distributions/ })
    expect(within(ledger).getByText('($250,000.00)')).toBeInTheDocument()
    expect(within(ledger).getByText('$40,000.00')).toBeInTheDocument()
    expect(within(ledger).getByText('$10,000.00')).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Fund' })).not.toBeInTheDocument()
    expect(screen.queryByText('Fund investment summary')).not.toBeInTheDocument()
  })
})
