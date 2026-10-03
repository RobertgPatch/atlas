import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PartnershipTrackerDetail } from '../../../../../../packages/types/src/partnership-tracker'
import { MagicPatternPartnershipCapitalActivity } from '../components/magic-patterns/MagicPatternPartnershipWorkspace'
import { investmentPerformanceFixture, k1CashActivityDetailFixture, navFixtures, summaryFixture } from './fixtures'

vi.mock('../hooks/usePartnershipTracker', () => ({
  usePartnershipTrackerActions: () => ({
    deleteCashFlow: { isPending: false, mutateAsync: vi.fn() },
    deleteNav: { isPending: false, mutateAsync: vi.fn() },
  }),
}))

vi.mock('../components/magic-patterns/MagicPatternOperationalDrawers', () => ({
  MagicPatternCashActivityDrawer: ({ partnershipId, entry }: { partnershipId: string; entry?: { id: string } }) => <div role="dialog">{partnershipId} {entry?.id}</div>,
  MagicPatternValuationDrawer: ({ partnershipId }: { partnershipId: string }) => <div role="dialog">{partnershipId}</div>,
}))

const detail = {
  investmentPerformance: { ...investmentPerformanceFixture, residualValue: '950000.0000' },
  summary: summaryFixture,
  years: [{ taxYear: 2024 }],
  cashFlowEvents: k1CashActivityDetailFixture.cashFlowEvents.map((flow) => flow.kind === 'DISTRIBUTION' ? { ...flow, activityDate: '2024-12-15', feesAndCarry: '1000.1250', isFinalLiquidation: true } : flow),
  commitments: [],
  navEntries: navFixtures,
} as unknown as PartnershipTrackerDetail

describe('MagicPatternPartnershipCapitalActivity', () => {
  it('offers an edit action for every cash activity and valuation row', () => {
    render(
      <MagicPatternPartnershipCapitalActivity
        detail={detail}
        canEdit
        drawerOpen={false}
        onDrawerOpenChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Edit capital call from 2024-03-01' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit non-recallable distribution from 2024-12-15' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit recallable distribution from 2024-11-30' })).toBeInTheDocument()
    for (const valuation of navFixtures) {
      expect(screen.getByRole('button', { name: `Edit valuation dated ${valuation.valuationDate}` })).toBeInTheDocument()
    }
  })

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
    const summary = screen.getByRole('table', { name: 'Investment Performance for Redwood Fund' })
    expect(within(summary).getByText('Paid-in capital (contributions)')).toBeInTheDocument()
    expect(within(summary).getByText('Net MOIC / DPI (x)')).toBeInTheDocument()
    expect(within(summary).getByText('Net XIRR incl. residual value')).toBeInTheDocument()
    expect(within(summary).getByText('Residual / ending valuation ($)')).toBeInTheDocument()
    const ledger = screen.getByRole('table', { name: /Capital activity: dated capital calls, distributions, and valuations/ })
    expect(within(ledger).getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Activity date', 'Activity type', 'Status', 'Gross Amount', 'Fees & Carry', 'Net Amount', 'Cumulative Net', 'Net Incl. Residual', 'Actions',
    ])
    const rows = within(ledger).getAllByRole('row').slice(1)
    expect(rows.map((row) => within(row).getAllByRole('cell')[0].textContent?.slice(0, 10))).toEqual([
      '03/01/2024', '03/31/2024', '09/30/2024', '11/30/2024', '12/15/2024', '03/31/2025',
    ])
    const callCells = within(rows[0]).getAllByRole('cell')
    expect(callCells[3]).toHaveTextContent('($250,000.00)')
    expect(callCells[4]).toHaveTextContent('$0.00')
    expect(callCells[5]).toHaveTextContent('($250,000.00)')
    expect(callCells[6]).toHaveTextContent('($250,000.00)')
    const recallableCells = within(rows[3]).getAllByRole('cell')
    expect(recallableCells[6]).toHaveTextContent('($240,000.00)')
    const liquidationCells = within(rows[4]).getAllByRole('cell')
    expect(liquidationCells[1]).toHaveTextContent('Liquidating Distribution')
    expect(liquidationCells[1]).not.toHaveTextContent('Non-recallable distribution')
    expect(liquidationCells[2]).toHaveTextContent('Settled')
    expect(liquidationCells[2].querySelector('span')?.className).toBe(callCells[2].querySelector('span')?.className)
    expect(liquidationCells[3]).toHaveTextContent('$40,000.00')
    expect(liquidationCells[4]).toHaveTextContent('($1,000.13)')
    expect(liquidationCells[5]).toHaveTextContent('$38,999.88')
    expect(liquidationCells[6]).toHaveTextContent('($201,000.13)')
    expect(liquidationCells[7]).toHaveTextContent('$988,999.88')
    expect(within(ledger).getAllByText('Valuation')).toHaveLength(navFixtures.length)
    const valuationCells = within(rows[5]).getAllByRole('cell')
    expect(valuationCells[3]).toHaveTextContent('$950,000.00')
    expect(valuationCells[4]).toHaveTextContent('—')
    expect(valuationCells[5]).toHaveTextContent('—')
    expect(valuationCells[6]).toHaveTextContent('—')
    expect(valuationCells[7]).toHaveTextContent('—')
    expect(within(ledger).queryByText('Final liquidation')).not.toBeInTheDocument()
    expect(within(ledger).queryByRole('columnheader', { name: 'Source' })).not.toBeInTheDocument()
    expect(within(ledger).queryByRole('columnheader', { name: 'Note' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Fund' })).not.toBeInTheDocument()
    expect(screen.queryByText('Fund investment summary')).not.toBeInTheDocument()
  })

  it('edits the correct owner record and applies only its residual in a combined ledger', () => {
    const second = { ...detail, summary: { ...detail.summary, partnership: { ...detail.summary.partnership, id: 'p-2', name: 'Second Fund' } },
      investmentPerformance: { ...investmentPerformanceFixture, residualValue: '100.0000' }, navEntries: [],
      cashFlowEvents: [{ ...detail.cashFlowEvents[0], id: 'second-flow', partnershipId: 'p-2', kind: 'DISTRIBUTION' as const, activityDate: '2025-12-01', amount: '200.00', feesAndCarry: '0', isFinalLiquidation: true }],
    }
    const combined = { ...detail, investmentPerformance: { ...investmentPerformanceFixture, residualValue: '950100.0000' }, cashFlowEvents: [...detail.cashFlowEvents, ...second.cashFlowEvents] }
    render(<MagicPatternPartnershipCapitalActivity detail={combined} portfolioItems={[detail, second]} canEdit drawerOpen={false} onDrawerOpenChange={vi.fn()} />)
    const row = screen.getByText('Second Fund').closest('tr')!
    expect(within(row).getAllByRole('cell')[8]).toHaveTextContent('$300.00')
    expect(screen.getByRole('button', { name: 'Add activity' })).toBeDisabled()
    fireEvent.click(within(row).getByRole('button', { name: 'Edit non-recallable distribution from 2025-12-01' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('p-2 second-flow')
  })

  it('leaves announced activity out of running totals, even when the ledger is filtered', () => {
    const announced = {
      ...k1CashActivityDetailFixture.cashFlowEvents[1],
      id: 'cash-announced',
      activityDate: '2024-09-01',
      settlementStatus: 'ANNOUNCED' as const,
      amount: '1000.0000',
      feesAndCarry: '100.0000',
    }
    render(
      <MagicPatternPartnershipCapitalActivity
        detail={{ ...detail, investmentPerformance: investmentPerformanceFixture, cashFlowEvents: [...detail.cashFlowEvents, announced] }}
        canEdit={false}
        drawerOpen={false}
        onDrawerOpenChange={vi.fn()}
      />,
    )

    const ledger = screen.getByRole('table', { name: /Capital activity: dated capital calls, distributions, and valuations/ })
    const announcedRow = within(ledger).getByText('09/01/2024').closest('tr')!
    const announcedCells = within(announcedRow).getAllByRole('cell')
    expect(announcedCells[3]).toHaveTextContent('$1,000.00')
    expect(announcedCells[4]).toHaveTextContent('($100.00)')
    expect(announcedCells[5]).toHaveTextContent('$900.00')
    expect(announcedCells[6]).toHaveTextContent('—')
    expect(announcedCells[7]).toHaveTextContent('—')

    fireEvent.click(screen.getByRole('button', { name: 'Non-recallable 2' }))
    const liquidatingRow = within(ledger).getByText('Liquidating Distribution').closest('tr')!
    expect(within(liquidatingRow).getAllByRole('cell')[6]).toHaveTextContent('($201,000.13)')
    expect(within(liquidatingRow).getAllByRole('cell')[7]).toHaveTextContent('$38,999.88')
  })
})
