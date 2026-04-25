import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ReportsHeaderActions } from './ReportsHeaderActions'

describe('ReportsHeaderActions', () => {
  it('invokes export callback for both CSV and XLSX actions', async () => {
    const user = userEvent.setup()
    const onExport = vi.fn()

    render(<ReportsHeaderActions onExport={onExport} />)

    await user.click(screen.getByRole('button', { name: 'Export CSV' }))
    await user.click(screen.getByRole('button', { name: 'Export XLSX' }))

    expect(onExport).toHaveBeenNthCalledWith(1, 'csv')
    expect(onExport).toHaveBeenNthCalledWith(2, 'xlsx')
  })

  it('disables export actions while export is in progress', () => {
    render(<ReportsHeaderActions onExport={vi.fn()} isExporting={true} />)

    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Export XLSX' })).toBeDisabled()
  })
})
