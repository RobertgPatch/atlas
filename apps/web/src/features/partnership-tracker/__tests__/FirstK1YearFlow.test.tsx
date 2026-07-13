import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AddYearDialog } from '../components/AddYearDialog'

describe('first K-1 year flow', () => {
  it('accepts the full supported year range and leaves selection to the submitted value', async () => {
    const add = vi.fn().mockResolvedValue(undefined)
    render(<AddYearDialog defaultTaxYear={2024} pending={false} onClose={vi.fn()} onAdd={add} />)
    fireEvent.change(screen.getByLabelText('Tax year'), { target: { value: '1900' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add year' }))
    await waitFor(() => expect(add).toHaveBeenCalledWith(1900))
  })
  it('keeps the dialog open with duplicate-year feedback and supports cancel', async () => {
    const close = vi.fn()
    const add = vi.fn().mockRejectedValue(new Error('A tracker year already exists'))
    render(<AddYearDialog defaultTaxYear={2024} pending={false} onClose={close} onAdd={add} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add year' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('already exists')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(close).toHaveBeenCalled()
  })
})
