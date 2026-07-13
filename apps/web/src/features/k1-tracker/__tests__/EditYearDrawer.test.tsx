import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { K1TrackerYearDetail } from '../../../../../packages/types/src/k1-tracker'
import { EditYearDrawer } from '../components/EditYearDrawer'

const detail = { taxYear: 2024, values: [{ id: '1', fieldKey: 'opening_outside_basis', amount: '100.00', sourceType: 'MANUAL_ENTRY', originalSourceText: null, sourceK1DocumentId: null, sourceK1FieldValueId: null, importBatchId: null, sourceSheet: null, sourceCell: null, carryforwardFromTaxYear: null, overrideReason: null, isActive: true, createdByEmail: null, createdAt: new Date().toISOString() }] } as unknown as K1TrackerYearDetail
describe('EditYearDrawer', () => {
  it('requires a reason before saving a manual override', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    render(<EditYearDrawer detail={detail} pending={false} onClose={vi.fn()} onCalculate={vi.fn().mockResolvedValue(undefined)} onSave={save} />)
    fireEvent.click(screen.getByLabelText(/replace an existing source/i))
    fireEvent.change(screen.getByLabelText(/opening outside basis/i), { target: { value: '110.00' } })
    fireEvent.click(screen.getByRole('button', { name: /save revisions/i }))
    expect(screen.getByText(/state why this source/i)).toBeInTheDocument()
    expect(save).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText(/override reason/i), { target: { value: 'Reviewed amended K-1.' } })
    fireEvent.click(screen.getByRole('button', { name: /save revisions/i }))
    expect(save).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ sourceType: 'MANUAL_OVERRIDE', overrideReason: 'Reviewed amended K-1.' })]))
  })
})
