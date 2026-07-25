import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PrivateInvestmentPdfExportDialog } from '../components/private-investment/PrivateInvestmentPdfExportDialog'

describe('Private Investment Tracker PDF selection', () => {
  it('keeps summary/detail selection independent and blocks empty groups', async () => {
    const user = userEvent.setup()
    const onExport = vi.fn()
    render(<PrivateInvestmentPdfExportDialog open exporting={false} error={null} onClose={vi.fn()} onExport={onExport} />)

    expect(screen.getByTestId('pdf-export-orientation')).toHaveTextContent('Landscape orientation')
    const groups = screen.getAllByRole('group')
    const summary = groups[0]!
    const detail = groups[1]!
    await user.click(summary.querySelector('button:nth-of-type(3)') as HTMLButtonElement)
    expect(screen.getByRole('button', { name: 'Export PDF' })).toBeDisabled()
    expect(detail.querySelectorAll('input:checked').length).toBeGreaterThan(0)
    await user.click(summary.querySelector('button:nth-of-type(1)') as HTMLButtonElement)
    await user.click(screen.getByRole('button', { name: 'Export PDF' }))
    expect(onExport).toHaveBeenCalledWith(expect.any(Array), expect.any(Array))
  })

  it('shows progress/error feedback and keeps sticky actions visible', () => {
    render(<PrivateInvestmentPdfExportDialog open exporting error="Report failed" onClose={vi.fn()} onExport={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Report failed')
    expect(screen.getByRole('button', { name: /Preparing complete report/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' }).parentElement).toHaveClass('sticky', 'bottom-0')
  })
})
