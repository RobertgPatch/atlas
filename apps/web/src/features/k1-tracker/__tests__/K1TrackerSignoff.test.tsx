import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SignOffPanel } from '../components/SignOffPanel'
import { JournalEntryPanel } from '../components/JournalEntryPanel'
import { blockingChecksPass } from '../components/K1YearResults'

describe('SignOffPanel', () => {
  it('allows informational Section L differences while retaining blocking gates', () => {
    const informational = { key: 'section-l-ending', status: 'WARNING' as const, blocking: false, actual: '90.00', expected: '100.00', difference: '-10.00', tolerance: '1.00', message: 'Informational variance.' }
    const blocking = { ...informational, key: 'part-iii-source-data', status: 'INCOMPLETE' as const, blocking: true }
    expect(blockingChecksPass([informational])).toBe(true)
    expect(blockingChecksPass([informational, blocking])).toBe(false)
  })

  it('explains why sign-off is unavailable until all blocking checks pass', () => {
    render(<SignOffPanel state={{ yearRevision: 3, preparedByEmail: null, preparedAt: null, reviewedByEmail: null, reviewedAt: null, invalidatedAt: null, invalidationReason: null }} checksPassing={false} canEdit pending={false} onSignoff={vi.fn()} />)
    expect(screen.getByRole('button', { name: /sign off year/i })).toBeDisabled()
    expect(screen.getByText(/resolve all blocking checks/i)).toBeInTheDocument()
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
