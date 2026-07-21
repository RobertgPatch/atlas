import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmationDialog } from './ConfirmationDialog'

describe('ConfirmationDialog', () => {
  it('presents an accessible confirmation and keeps the destructive action explicit', async () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn()

    await act(async () => {
      render(
        <ConfirmationDialog
          open
          title="Delete the 2024 K-1 year?"
          description="Later years will be recalculated."
          confirmLabel="Delete year"
          onClose={onClose}
          onConfirm={onConfirm}
        />,
      )
    })

    expect(screen.getByRole('dialog', { name: 'Delete the 2024 K-1 year?' }).textContent).toContain(
      'Later years will be recalculated.',
    )
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete year' }))
    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('prevents dismissal while the action is pending', async () => {
    const onClose = vi.fn()
    await act(async () => {
      render(
        <ConfirmationDialog
          open
          title="Delete entry?"
          description="This cannot be undone."
          confirmLabel="Delete entry"
          pending
          pendingLabel="Deleting…"
          onClose={onClose}
          onConfirm={vi.fn()}
        />,
      )
    })

    expect((screen.getByRole('button', { name: 'Deleting…' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('supports an application-styled warning for unsaved work', async () => {
    const onClose = vi.fn()
    await act(async () => {
      render(
        <ConfirmationDialog
          open
          tone="warning"
          title="Discard unsaved K-1 changes?"
          description="The current draft has not been saved."
          confirmLabel="Discard changes"
          cancelLabel="Keep editing"
          onClose={onClose}
          onConfirm={vi.fn()}
        />,
      )
    })

    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
