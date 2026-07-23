import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PartnershipTrackerDetail } from '../../../../../../packages/types/src/partnership-tracker'
import { NetCashActivityWorkspace } from '../components/NetCashActivityWorkspace'
import { usePartnershipTrackerActions, usePartnershipTrackerYear } from '../hooks/usePartnershipTracker'
import { k1CashActivityDetailFixture, summaryFixture, yearSummaryFixtures } from './fixtures'

vi.mock('../hooks/usePartnershipTracker', () => ({
  usePartnershipTrackerActions: vi.fn(),
  usePartnershipTrackerYear: vi.fn(),
}))

vi.mock('../components/DatedCashFlowPanel', () => ({
  DatedCashFlowPanel: ({ events }: { events: unknown[] }) => <div>Cash ledger with {events.length} entries</div>,
}))

const detail: PartnershipTrackerDetail = {
  summary: summaryFixture,
  years: yearSummaryFixtures(4),
  commitments: [],
  navEntries: [],
  permissions: { canEditPartnership: true, canEditK1: true, canEditCommitment: true, canEditNav: true, canSignoff: true },
}

describe('NetCashActivityWorkspace', () => {
  beforeEach(() => {
    vi.mocked(usePartnershipTrackerYear).mockReturnValue({ data: k1CashActivityDetailFixture, isLoading: false, isError: false } as ReturnType<typeof usePartnershipTrackerYear>)
    vi.mocked(usePartnershipTrackerActions).mockReturnValue({
      createCashFlows: { mutateAsync: vi.fn(), isPending: false },
      deleteCashFlow: { mutateAsync: vi.fn(), isPending: false },
    } as unknown as ReturnType<typeof usePartnershipTrackerActions>)
  })

  it('shows the cash ledger in its own year-based workspace', () => {
    const selectYear = vi.fn()
    render(<NetCashActivityWorkspace detail={detail} selectedYear={2024} canEdit onSelectYear={selectYear} />)

    expect(screen.getByRole('heading', { name: 'Net cash activity' })).toBeInTheDocument()
    expect(screen.getByText(/independently from the values reported on K-1 documents/i)).toBeInTheDocument()
    expect(screen.getByText('Cash ledger with 3 entries')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /2023/i }))
    expect(selectYear).toHaveBeenCalledWith(2023)
  })
})
