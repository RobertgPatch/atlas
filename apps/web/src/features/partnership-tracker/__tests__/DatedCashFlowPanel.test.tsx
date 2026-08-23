import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DatedCashFlowPanel } from '../components/DatedCashFlowPanel'

describe('Dated cash activity', () => {
  it('starts with one row and adds another cash activity row', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined)
    render(<DatedCashFlowPanel taxYear={2024} events={[]} canEdit pending={false} onCreate={onCreate} onDelete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Net Cash Activity' }))

    const dialog = screen.getByRole('dialog', { name: 'Net Cash Activity' })
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByTestId('cash-activity-draft-list')).toHaveClass('pl-3', 'pt-3')
    expect(within(dialog).getByTestId('cash-activity-row-number-1')).toHaveClass('-left-2', '-top-2', 'ring-2')
    expect(screen.getAllByLabelText(/Cash activity date row/)).toHaveLength(1)
    expect(screen.getAllByLabelText(/Cash activity amount row/)).toHaveLength(1)
    expect(screen.getByLabelText('Cash activity amount row 1')).toHaveClass('bg-white', 'text-gray-950')
    expect(screen.getAllByRole('combobox', { name: /Cash activity type row/ })).toHaveLength(1)
    expect(screen.getByLabelText('Cash activity type row 1')).toHaveValue('CAPITAL_CALL')
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Capital call',
      'Distribution',
      'Recallable distribution',
    ])

    fireEvent.click(screen.getByRole('button', { name: 'Add another row' }))
    expect(screen.getAllByLabelText(/Cash activity date row/)).toHaveLength(2)
    expect(screen.getAllByRole('combobox', { name: /Cash activity type row/ })).toHaveLength(2)
    expect(within(dialog).getByTestId('cash-activity-row-number-2')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Cash activity date row 1'), { target: { value: '2024-03-15' } })
    fireEvent.change(screen.getByLabelText('Cash activity amount row 1'), { target: { value: '$125,000' } })
    expect(screen.getByLabelText('Cash activity amount row 1')).toHaveValue('$125,000')
    fireEvent.change(screen.getByLabelText('Cash activity date row 2'), { target: { value: '2024-10-15' } })
    fireEvent.change(screen.getByLabelText('Cash activity amount row 2'), { target: { value: '$10,000' } })
    fireEvent.change(screen.getByLabelText('Cash activity type row 2'), { target: { value: 'RECALLABLE_DISTRIBUTION' } })

    expect(screen.getByText(/increases committed capital by the same amount/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add 2 activities' }))
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith([
      { kind: 'CAPITAL_CALL', activityDate: '2024-03-15', amount: '125000.00', note: null },
      { kind: 'RECALLABLE_DISTRIBUTION', activityDate: '2024-10-15', amount: '10000.00', note: null },
    ]))
    expect(await screen.findByRole('status')).toHaveTextContent(/2 cash activities added/i)
    expect(screen.getByRole('status')).toHaveTextContent(/recallable distribution also increased commitment/i)
  })

  it('shows annual totals and confirms deletion in the application modal', async () => {
    const event = { id: 'flow-1', partnershipId: 'p-1', taxYear: 2024, kind: 'DISTRIBUTION' as const, activityDate: '2024-09-30', amount: '25000.00', note: null, createdAt: '2024-09-30T00:00:00.000Z', updatedAt: '2024-09-30T00:00:00.000Z' }
    const onDelete = vi.fn().mockResolvedValue(undefined)
    render(<DatedCashFlowPanel taxYear={2024} events={[event]} canEdit pending={false} onCreate={vi.fn()} onDelete={onDelete} />)
    expect(screen.getAllByText('$25,000.00').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /Delete distribution/ }))
    expect(screen.getByRole('dialog', { name: 'Delete this distribution?' })).toBeTruthy()
    expect(onDelete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Delete distribution' }))
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(event))
  })
})
