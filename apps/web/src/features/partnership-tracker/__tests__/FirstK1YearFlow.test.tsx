import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PartnershipTrackerYearDetail } from '../../../../../../packages/types/src/partnership-tracker'
import { K1YearEntryForm } from '../../k1-tracker/components/K1YearEntryForm'
import { AddYearDialog } from '../components/AddYearDialog'
import { unsignedK1SignoffFixture } from './fixtures'

const inlineDetail = {
  partnershipId: 'p-1', taxYear: 2024, isInceptionYear: true, revision: 1, status: 'NOT_STARTED', officialFormData: {}, values: [], cashFlowEvents: [],
  calculation: { basis: {}, lossLimitation: {}, liabilities: {}, sectionL: {}, checks: [] },
  sourceConflicts: [],
  signoff: unsignedK1SignoffFixture(),
} as unknown as PartnershipTrackerYearDetail

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
  it('opens a new selected year as an inline form without a drawer or Next control', () => {
    render(<K1YearEntryForm detail={inlineDetail} canEdit pending={false} onCalculate={vi.fn()} onSave={vi.fn()} onDirtyChange={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Schedule K-1 (Form 1065)' })).toBeInTheDocument()
    expect(screen.getByLabelText('Tax period beginning')).toHaveValue('2024-01-01')
    expect(screen.getByLabelText('Tax period ending')).toHaveValue('2024-12-31')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument()
  })
})
