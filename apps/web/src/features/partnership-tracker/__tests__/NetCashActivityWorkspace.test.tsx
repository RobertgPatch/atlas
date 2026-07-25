import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PartnershipTrackerDetail } from '../../../../../../packages/types/src/partnership-tracker'
import { NetCashActivityWorkspace } from '../components/NetCashActivityWorkspace'
import { usePartnershipTrackerActions } from '../hooks/usePartnershipTracker'
import { k1CashActivityDetailFixture, summaryFixture, yearSummaryFixtures } from './fixtures'

vi.mock('../hooks/usePartnershipTracker', () => ({
  usePartnershipTrackerActions: vi.fn(),
}))

vi.mock('../components/DatedCashFlowPanel', () => ({
  DatedCashFlowPanel: ({ events }: { events: unknown[] }) => <div>Cash ledger with {events.length} entries</div>,
}))

const detail: PartnershipTrackerDetail = {
  summary: summaryFixture,
  years: yearSummaryFixtures(4),
  cashFlowEvents: k1CashActivityDetailFixture.cashFlowEvents,
  commitments: [],
  navEntries: [],
  permissions: { canEditPartnership: true, canEditK1: true, canEditCommitment: true, canEditNav: true, canSignoff: true },
}

describe('NetCashActivityWorkspace', () => {
  beforeEach(() => {
    vi.mocked(usePartnershipTrackerActions).mockReturnValue({
      createCashFlows: { mutateAsync: vi.fn(), isPending: false },
      deleteCashFlow: { mutateAsync: vi.fn(), isPending: false },
    } as unknown as ReturnType<typeof usePartnershipTrackerActions>)
  })

  it('shows one all-date cash ledger independent from K-1 years', () => {
    render(<NetCashActivityWorkspace detail={detail} canEdit />)

    expect(screen.getByRole('heading', { name: 'Net cash activity across all dates' })).toBeInTheDocument()
    expect(screen.getByText(/independently from K-1 tax years/i)).toBeInTheDocument()
    expect(screen.getByText(/feeds the Investment Tracker/i)).toBeInTheDocument()
    expect(screen.getByText('Cash ledger with 3 entries')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /2023/i })).not.toBeInTheDocument()
  })
})
