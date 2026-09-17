import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MagicPatternCashActivityDrawer } from '../components/magic-patterns/MagicPatternOperationalDrawers'

const mutations = vi.hoisted(() => ({
  createCashFlows: vi.fn().mockResolvedValue({ created: [] }),
  createNav: vi.fn().mockResolvedValue({ id: 'valuation-1' }),
  createYear: vi.fn().mockResolvedValue({ taxYear: 2026 }),
}))

vi.mock('../hooks/usePartnershipTracker', () => ({
  usePartnershipTrackerActions: () => ({
    createCashFlows: { mutateAsync: mutations.createCashFlows, isPending: false },
    createNav: { mutateAsync: mutations.createNav, isPending: false },
    createYear: { mutateAsync: mutations.createYear, isPending: false },
  }),
}))

describe('MagicPatternCashActivityDrawer', () => {
  beforeEach(() => {
    mutations.createCashFlows.mockClear()
    mutations.createNav.mockClear()
    mutations.createYear.mockClear()
  })

  it('records operational activity without creating a K-1 year', async () => {
    render(
      <MagicPatternCashActivityDrawer
        open
        onClose={vi.fn()}
        partnershipId="partnership-1"
        fundName="AC Bell Investors, LLC"
      />,
    )

    fireEvent.change(screen.getByLabelText(/Activity date/), { target: { value: '2026-04-15' } })
    fireEvent.change(screen.getByLabelText(/Amount \(USD\)/), { target: { value: '125000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Record activity' }))

    await waitFor(() => expect(mutations.createCashFlows).toHaveBeenCalledWith({
      id: 'partnership-1',
      body: {
        entries: [{
          kind: 'CAPITAL_CALL',
          activityDate: '2026-04-15',
          amount: '125000.00',
          note: null,
        }],
      },
    }))
    expect(mutations.createYear).not.toHaveBeenCalled()
  })

  it('records a capital call and distribution together in one batch', async () => {
    render(
      <MagicPatternCashActivityDrawer
        open
        onClose={vi.fn()}
        partnershipId="partnership-1"
        fundName="AC Bell Investors, LLC"
      />,
    )

    fireEvent.change(screen.getByLabelText(/Activity date/), { target: { value: '2026-06-30' } })
    fireEvent.change(screen.getByLabelText(/Amount \(USD\)/), { target: { value: '200000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add another activity' }))

    const activityTypes = screen.getAllByLabelText(/Activity type/)
    const activityDates = screen.getAllByLabelText(/Activity date/)
    const amounts = screen.getAllByLabelText(/Amount \(USD\)/)
    expect(activityTypes).toHaveLength(2)
    expect(activityTypes[1]).toHaveValue('DISTRIBUTION')
    expect(activityDates[1]).toHaveValue('2026-06-30')
    fireEvent.change(amounts[1], { target: { value: '45000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Record 2 activities' }))

    await waitFor(() => expect(mutations.createCashFlows).toHaveBeenCalledWith({
      id: 'partnership-1',
      body: {
        entries: [
          { kind: 'CAPITAL_CALL', activityDate: '2026-06-30', amount: '200000.00', note: null },
          { kind: 'DISTRIBUTION', activityDate: '2026-06-30', amount: '45000.00', note: null },
        ],
      },
    }))
  })

  it('records a valuation selected from the activity type dropdown', async () => {
    render(
      <MagicPatternCashActivityDrawer
        open
        onClose={vi.fn()}
        partnershipId="partnership-1"
        fundName="AC Bell Investors, LLC"
      />,
    )

    fireEvent.change(screen.getByLabelText(/Activity type/), { target: { value: 'VALUATION' } })
    fireEvent.change(screen.getByLabelText(/Valuation date/), { target: { value: '2026-06-30' } })
    fireEvent.change(screen.getByLabelText(/NAV \/ FMV \(USD\)/), { target: { value: '875000' } })
    fireEvent.change(screen.getByLabelText(/^Source/), { target: { value: 'valuation_409a' } })
    fireEvent.change(screen.getByLabelText(/^Note/), { target: { value: 'Quarter-end report' } })
    expect(screen.queryByText('Settlement state')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Record activity' }))

    await waitFor(() => expect(mutations.createNav).toHaveBeenCalledWith({
      id: 'partnership-1',
      body: {
        amount: '875000.00',
        valuationDate: '2026-06-30',
        note: '[409A valuation] Quarter-end report',
      },
    }))
    expect(mutations.createCashFlows).not.toHaveBeenCalled()
  })
})
