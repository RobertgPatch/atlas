import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SignOffPanel } from '../components/SignOffPanel'
import { JournalEntryPanel } from '../components/JournalEntryPanel'

describe('SignOffPanel', () => {
  it('explains why sign-off is unavailable until all checks pass', () => {
    render(<SignOffPanel state={{ yearRevision: 3, preparedByEmail: null, preparedAt: null, reviewedByEmail: null, reviewedAt: null, invalidatedAt: null, invalidationReason: null }} checksPassing={false} canEdit pending={false} onSignoff={vi.fn()} />)
    expect(screen.getByRole('button', { name: /sign off year/i })).toBeDisabled()
    expect(screen.getByText(/resolve all checks/i)).toBeInTheDocument()
  })
  it('shows invalidation state for a changed revision', () => {
    render(<SignOffPanel state={{ yearRevision: 4, preparedByEmail: 'preparer@example.com', preparedAt: new Date().toISOString(), reviewedByEmail: 'reviewer@example.com', reviewedAt: new Date().toISOString(), invalidatedAt: new Date().toISOString(), invalidationReason: 'Material input changed.' }} checksPassing canEdit={false} pending={false} onSignoff={vi.fn()} />)
    expect(screen.getByText(/material input changed/i)).toBeInTheDocument()
  })
})

describe('JournalEntryPanel', () => {
  it('labels debit/credit convention and copies tab-separated journal rows', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
    render(<JournalEntryPanel calculation={{ journalEntries: [{ account: 'Interest Income', amount: '12.00', convention: 'DEBIT_POSITIVE_CREDIT_NEGATIVE' }, { account: 'Investment in Partnership', amount: '-12.00', convention: 'DEBIT_POSITIVE_CREDIT_NEGATIVE' }], journalBalance: '0.00' } as never} />)
    expect(screen.getByText(/debit positive/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /copy rows/i }))
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Interest Income\t12.00\nInvestment in Partnership\t-12.00'))
  })
})
