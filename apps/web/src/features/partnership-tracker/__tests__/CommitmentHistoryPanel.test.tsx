import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CommitmentHistoryPanel } from '../components/CommitmentHistoryPanel'
import { commitmentFixtures } from './fixtures'

vi.mock('../hooks/usePartnershipTracker', () => ({ usePartnershipTrackerActions: () => ({ deleteCommitment: { mutateAsync: vi.fn(), isPending: false }, createCommitment: { mutateAsync: vi.fn(), isPending: false }, updateCommitment: { mutateAsync: vi.fn(), isPending: false } }) }))

describe('CommitmentHistoryPanel', () => {
  it('shows the current total and a chronological, accessible history', () => {
    render(<CommitmentHistoryPanel partnershipId="p-1" items={commitmentFixtures} canEdit />)
    expect(screen.getByText('Current commitment')).toBeInTheDocument()
    expect(screen.getAllByText('$1,000,000.00').length).toBeGreaterThan(0)
    const rows = screen.getAllByRole('row')
    expect(rows[1]).toHaveTextContent('Jan 1, 2022')
    expect(rows[2]).toHaveTextContent('Jan 1, 2024')
    expect(screen.getByRole('button', { name: 'Add entry' })).toBeInTheDocument()
  })
  it('hides mutations from read-only users', () => {
    render(<CommitmentHistoryPanel partnershipId="p-1" items={commitmentFixtures} canEdit={false} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
  it('formats natural US currency entry and rejects negative commitments inline', () => {
    render(<CommitmentHistoryPanel partnershipId="p-1" items={commitmentFixtures} canEdit />)
    fireEvent.click(screen.getByRole('button', { name: 'Add entry' }))
    const input = screen.getByLabelText('Total committed capital')
    fireEvent.change(input, { target: { value: '$1,250,000.5' } })
    fireEvent.blur(input)
    expect(input).toHaveValue('$1,250,000.50')
    fireEvent.change(input, { target: { value: '(10)' } })
    fireEvent.blur(input)
    expect(screen.getByRole('alert')).toHaveTextContent('cannot be negative')
  })
})
