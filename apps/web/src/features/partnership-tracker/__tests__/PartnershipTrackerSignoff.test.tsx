import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SignOffPanel } from '../components/SignOffPanel'

describe('Partnership Tracker sign-off panel', () => {
  it('explains failed gates and supports prepare then independent review states', () => {
    const signoff = vi.fn()
    const state = { yearRevision: 2, preparedByEmail: null, preparedAt: null, reviewedByEmail: null, reviewedAt: null, invalidatedAt: null, invalidationReason: null, history: [] }
    const { rerender } = render(<SignOffPanel state={state} checksPassing={false} canEdit pending={false} onSignoff={signoff} />)
    expect(screen.getByRole('button', { name: 'Prepare year' })).toBeDisabled()
    expect(screen.getByText(/Resolve all checks/i)).toBeInTheDocument()
    rerender(<SignOffPanel state={state} checksPassing canEdit pending={false} onSignoff={signoff} />)
    fireEvent.click(screen.getByRole('button', { name: 'Prepare year' }))
    expect(signoff).toHaveBeenCalledWith('PREPARED')
    rerender(<SignOffPanel state={{ ...state, preparedByEmail: 'preparer@example.com', preparedAt: '2025-01-01T00:00:00.000Z' }} checksPassing canEdit pending={false} onSignoff={signoff} />)
    expect(screen.getByRole('button', { name: 'Independent review' })).toBeEnabled()
  })
  it('shows revision invalidation evidence', () => {
    render(<SignOffPanel state={{ yearRevision: 3, preparedByEmail: null, preparedAt: null, reviewedByEmail: null, reviewedAt: null, invalidatedAt: '2025-01-01T00:00:00.000Z', invalidationReason: 'Earlier year changed' }} checksPassing={false} canEdit={false} pending={false} onSignoff={vi.fn()} />)
    expect(screen.getByText(/Earlier year changed/i)).toBeInTheDocument()
  })
})
