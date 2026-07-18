import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DatedCashFlowPanel } from '../components/DatedCashFlowPanel'

describe('Dated cash activity', () => {
  it('adds an on-demand capital call row and submits its exact date', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined)
    render(<DatedCashFlowPanel taxYear={2024} events={[]} canEdit pending={false} onCreate={onCreate} onDelete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Capital call' }))
    fireEvent.change(screen.getByLabelText('Cash activity date'), { target: { value: '2024-03-15' } })
    fireEvent.change(screen.getByLabelText('Cash activity amount'), { target: { value: '$125,000' } })
    fireEvent.change(screen.getByLabelText('Cash activity note'), { target: { value: 'First close' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith({ kind: 'CAPITAL_CALL', activityDate: '2024-03-15', amount: '125000.00', note: 'First close' }))
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
