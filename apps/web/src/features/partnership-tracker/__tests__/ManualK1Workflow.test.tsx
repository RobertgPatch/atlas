import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PartnershipTrackerYearDetail } from '../../../../../../packages/types/src/partnership-tracker'
import { K1YearEntryForm } from '../../k1-tracker/components/K1YearEntryForm'
import { AddYearDialog } from '../components/AddYearDialog'
import { YearRail } from '../components/YearRail'

const carryforwardDetail = {
  partnershipId: 'p-1', taxYear: 2024, revision: 1, status: 'IN_PROGRESS', values: [],
  calculation: { basis: { beginningOutsideBasis: '500.00' }, lossLimitation: { priorSuspendedLoss: '0.00' }, liabilities: {}, sectionL: {} },
} as unknown as PartnershipTrackerYearDetail

describe('manual K-1 workflow', () => {
  it('allows any supported tax year instead of forcing an increment', async () => {
    const add = vi.fn().mockResolvedValue(undefined)
    render(<AddYearDialog defaultTaxYear={2024} pending={false} onClose={vi.fn()} onAdd={add} />)
    fireEvent.change(screen.getByLabelText('Tax year'), { target: { value: '2017' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add year' }))
    expect(add).toHaveBeenCalledWith(2017)
    expect(screen.getByText(/does not have to be the next chronological year/i)).toBeInTheDocument()
  })
  it('keeps fifty nonconsecutive years in a horizontal compact rail', () => {
    const years = Array.from({ length: 50 }, (_, index) => ({ taxYear: 1950 + index * 2, status: 'IN_PROGRESS' as const, revision: 1, endingOutsideBasis: null, cumulativeSuspendedLoss: null, taxableExcessDistribution: null, sectionLDifference: null, warningCount: 1, sourceConflictCount: 0 }))
    render(<YearRail years={years} selectedYear={years.at(-1)!.taxYear} onSelect={vi.fn()} />)
    expect(screen.getAllByRole('button')).toHaveLength(50)
    expect(screen.getAllByText('In progress')).toHaveLength(50)
  })
  it('submits one change set, exposes carryforwards, and reports save failures without losing the draft', async () => {
    const save = vi.fn().mockRejectedValue(new Error('This K-1 year changed in another session.'))
    const dirty = vi.fn()
    render(<K1YearEntryForm detail={carryforwardDetail} canEdit pending={false} onCalculate={vi.fn()} onSave={save} onDirtyChange={dirty} />)
    expect(screen.getByText('Carried from the prior year: $500.00')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Capital contributions'), { target: { value: '1000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save revisions' }))
    await waitFor(() => expect(save).toHaveBeenCalledWith([
      expect.objectContaining({ fieldKey: 'capital_contributions', amount: '1000.00' }),
    ]))
    expect(dirty).toHaveBeenCalledWith(true)
    expect(await screen.findByRole('status')).toHaveTextContent('changed in another session')
    expect(screen.getByLabelText('Capital contributions')).toHaveValue('1000')
  })
})
