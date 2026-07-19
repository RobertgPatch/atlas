import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DatedCashFlowPanel } from '../components/DatedCashFlowPanel'

describe('Dated cash activity', () => {
  it('opens one Net Cash Activity dialog with all three activity choices', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined)
    render(<DatedCashFlowPanel taxYear={2024} events={[]} canEdit pending={false} onCreate={onCreate} onDelete={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Capital call' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Distribution' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Net Cash Activity' }))
    expect(screen.getByRole('dialog', { name: 'Net Cash Activity' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Capital call/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /^Distribution/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Recallable distribution/ })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Cash activity date'), { target: { value: '2024-03-15' } })
    fireEvent.change(screen.getByLabelText('Cash activity amount'), { target: { value: '$125,000' } })
    fireEvent.change(screen.getByLabelText('Cash activity note'), { target: { value: 'First close' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Capital call' }))
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith({ kind: 'CAPITAL_CALL', activityDate: '2024-03-15', amount: '125000.00', note: 'First close' }))
  })

  it('submits a recallable distribution and explains the commitment effect', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined)
    render(<DatedCashFlowPanel taxYear={2024} events={[]} canEdit pending={false} onCreate={onCreate} onDelete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Net Cash Activity' }))
    fireEvent.click(screen.getByRole('radio', { name: /Recallable distribution/ }))
    expect(screen.getByText(/increases committed capital by the same amount/i)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Cash activity date'), { target: { value: '2024-10-15' } })
    fireEvent.change(screen.getByLabelText('Cash activity amount'), { target: { value: '$10,000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Recallable distribution' }))
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith({ kind: 'RECALLABLE_DISTRIBUTION', activityDate: '2024-10-15', amount: '10000.00', note: null }))
    expect(await screen.findByRole('status')).toHaveTextContent(/commitment increased by \$10,000.00/i)
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
