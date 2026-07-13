import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AddYearDialog } from '../components/AddYearDialog'

describe('AddYearDialog', () => {
  it('lets an Admin add a nonconsecutive historical year', async () => {
    const add = vi.fn().mockResolvedValue(undefined)
    render(<AddYearDialog defaultTaxYear={2026} pending={false} onClose={vi.fn()} onAdd={add} />)
    fireEvent.change(screen.getByLabelText('Tax year'), { target: { value: '2014' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add year' }))
    await waitFor(() => expect(add).toHaveBeenCalledWith(2014))
  })

  it('rejects an out-of-range tax year before creating anything', () => {
    const add = vi.fn()
    render(<AddYearDialog defaultTaxYear={2026} pending={false} onClose={vi.fn()} onAdd={add} />)
    fireEvent.change(screen.getByLabelText('Tax year'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add year' }))
    expect(screen.getByRole('alert')).toHaveTextContent('1900 through 2100')
    expect(add).not.toHaveBeenCalled()
  })
})
