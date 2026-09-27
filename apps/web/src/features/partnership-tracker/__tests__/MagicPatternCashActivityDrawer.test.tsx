import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { K1TrackerCashFlowEvent } from '../../../../../../packages/types/src/k1-tracker'
import { MagicPatternCashActivityDrawer } from '../components/magic-patterns/MagicPatternOperationalDrawers'

const mutations = vi.hoisted(() => ({
  createCashFlows: vi.fn().mockResolvedValue({ created: [] }),
  updateCashFlow: vi.fn().mockResolvedValue({ id: 'cash-flow-1' }),
  createNav: vi.fn().mockResolvedValue({ id: 'valuation-1' }),
  createYear: vi.fn().mockResolvedValue({ taxYear: 2026 }),
}))

vi.mock('../hooks/usePartnershipTracker', () => ({
  usePartnershipTrackerActions: () => ({
    createCashFlows: { mutateAsync: mutations.createCashFlows, isPending: false },
    updateCashFlow: { mutateAsync: mutations.updateCashFlow, isPending: false },
    createNav: { mutateAsync: mutations.createNav, isPending: false },
    createYear: { mutateAsync: mutations.createYear, isPending: false },
  }),
}))

describe('MagicPatternCashActivityDrawer', () => {
  it('marks a distribution as final liquidation and records its date in the activity request', async () => {
    render(<MagicPatternCashActivityDrawer open onClose={vi.fn()} partnershipId="partnership-1" fundName="Workbook" />)
    expect(screen.queryByRole('checkbox', { name: /Final Liquidation/ })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/Activity type/), { target: { value: 'DISTRIBUTION' } })
    fireEvent.change(screen.getByLabelText(/Activity date/), { target: { value: '2026-09-15' } })
    fireEvent.change(screen.getByLabelText(/Amount \(USD\)/), { target: { value: '1019307.11' } })
    fireEvent.click(screen.getByRole('radio', { name: /Announced - awaiting settlement/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Final Liquidation/ }))
    expect(screen.getByRole('radio', { name: 'Settled' })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Announced - awaiting settlement/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Record activity' }))
    await waitFor(() => expect(mutations.createCashFlows).toHaveBeenCalledWith({ id: 'partnership-1', body: {
      entries: [{ kind: 'DISTRIBUTION', activityDate: '2026-09-15', amount: '1019307.11', isFinalLiquidation: true, note: null }],
    } }))
  })

  it('allows only one final liquidation choice in a batch', () => {
    render(<MagicPatternCashActivityDrawer open onClose={vi.fn()} partnershipId="partnership-1" fundName="Workbook" />)
    fireEvent.change(screen.getByLabelText(/Activity type/), { target: { value: 'DISTRIBUTION' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Final Liquidation/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Add another activity' }))
    fireEvent.change(screen.getAllByLabelText(/Activity type/)[1]!, { target: { value: 'DISTRIBUTION' } })
    fireEvent.click(screen.getAllByRole('checkbox', { name: /Final Liquidation/ })[1]!)
    const checkboxes = screen.getAllByRole('checkbox', { name: /Final Liquidation/ })
    expect(checkboxes[0]).not.toBeChecked()
    expect(checkboxes[1]).toBeChecked()
  })

  it('records gross distribution and actual fees separately at workbook precision', async () => {
    render(<MagicPatternCashActivityDrawer open onClose={vi.fn()} partnershipId="partnership-1" fundName="Workbook" />)
    fireEvent.change(screen.getByLabelText(/Activity type/), { target: { value: 'DISTRIBUTION' } })
    fireEvent.change(screen.getByLabelText(/Activity date/), { target: { value: '2026-09-15' } })
    fireEvent.change(screen.getByLabelText(/Amount \(USD\)/), { target: { value: '1211888.68' } })
    expect(screen.getByText(/Enter the gross distribution before fees and carry/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/Fees & carry \(USD\)/), { target: { value: '192581.565' } })
    fireEvent.click(screen.getByRole('button', { name: 'Record activity' }))
    await waitFor(() => expect(mutations.createCashFlows).toHaveBeenCalledWith({ id: 'partnership-1', body: {
      entries: [{ kind: 'DISTRIBUTION', activityDate: '2026-09-15', amount: '1211888.68', feesAndCarry: '192581.565', note: null }],
    } }))
  })

  beforeEach(() => {
    mutations.createCashFlows.mockClear()
    mutations.updateCashFlow.mockClear()
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

  it('loads and updates every editable field for an existing capital activity', async () => {
    const entry: K1TrackerCashFlowEvent = {
      id: 'cash-flow-1',
      partnershipId: 'partnership-1',
      taxYear: 2026,
      kind: 'DISTRIBUTION',
      activityDate: '2026-06-30',
      amount: '45000.0000',
      feesAndCarry: '500.0000',
      settlementStatus: 'SETTLED',
      announcedDate: null,
      isFinalLiquidation: false,
      note: 'Source: Manager notice — Original note',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-02T00:00:00.000Z',
    }
    render(
      <MagicPatternCashActivityDrawer
        open
        onClose={vi.fn()}
        partnershipId="partnership-1"
        fundName="AC Bell Investors, LLC"
        entry={entry}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Edit capital activity' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add another activity' })).not.toBeInTheDocument()
    expect(screen.getByLabelText(/Activity type/)).toHaveValue('DISTRIBUTION')
    expect(screen.getByLabelText(/Activity date/)).toHaveValue('2026-06-30')
    expect(screen.getByLabelText(/Amount \(USD\)/)).toHaveValue('45000.0000')
    expect(screen.getByLabelText(/Fees & carry \(USD\)/)).toHaveValue('500.0000')
    expect(screen.getByLabelText(/^Source/)).toHaveValue('Manager notice')
    expect(screen.getByLabelText(/^Note/)).toHaveValue('Original note')

    fireEvent.change(screen.getByLabelText(/Activity type/), { target: { value: 'CAPITAL_CALL' } })
    fireEvent.change(screen.getByLabelText(/Activity date/), { target: { value: '2026-07-15' } })
    fireEvent.change(screen.getByLabelText(/Amount \(USD\)/), { target: { value: '50000' } })
    fireEvent.change(screen.getByLabelText(/Fees & carry \(USD\)/), { target: { value: '250' } })
    fireEvent.change(screen.getByLabelText(/^Note/), { target: { value: 'Corrected amount' } })
    fireEvent.click(screen.getByRole('radio', { name: /Announced - awaiting settlement/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(mutations.updateCashFlow).toHaveBeenCalledWith({
      id: 'partnership-1',
      cashFlowId: 'cash-flow-1',
      body: {
        kind: 'CAPITAL_CALL',
        activityDate: '2026-07-15',
        amount: '50000.00',
        feesAndCarry: '250',
        isFinalLiquidation: false,
        settlementStatus: 'ANNOUNCED',
        note: 'Source: Manager notice — Corrected amount',
        expectedUpdatedAt: '2026-07-02T00:00:00.000Z',
      },
    }))
    expect(mutations.createCashFlows).not.toHaveBeenCalled()
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
