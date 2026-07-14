import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PartnershipTrackerYearDetail } from '../../../../../../packages/types/src/partnership-tracker'
import { K1YearEntryForm } from '../../k1-tracker/components/K1YearEntryForm'

const detail = {
  partnershipId: 'p-1', taxYear: 2024, revision: 1, status: 'IN_PROGRESS',
  values: [{ id: 'v-1', fieldKey: 'opening_outside_basis', amount: '100.00', sourceType: 'FINALIZED_K1', originalSourceText: '100', sourceK1DocumentId: 'd-1', sourceK1FieldValueId: 'f-1', importBatchId: null, sourceSheet: null, sourceCell: null, carryforwardFromTaxYear: null, overrideReason: null, isActive: true, createdByEmail: null, createdAt: '2025-01-01T00:00:00.000Z' }],
  calculation: { basis: { beginningOutsideBasis: '100.00' }, lossLimitation: { priorSuspendedLoss: '0.00' }, liabilities: {}, sectionL: {} },
} as unknown as PartnershipTrackerYearDetail

describe('manual K-1 annual entry', () => {
  it('keeps every field in one form with one canonical contribution input and no step controls', async () => {
    const calculate = vi.fn().mockResolvedValue(undefined)
    render(<K1YearEntryForm detail={detail} canEdit pending={false} onCalculate={calculate} onSave={vi.fn()} onDirtyChange={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Opening balances and capital' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Item K liabilities' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Book-tax reconciliation' })).toBeInTheDocument()
    expect(screen.getAllByLabelText('Capital contributions')).toHaveLength(1)
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Line 1 - Ordinary income (loss)'), { target: { value: '1000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Preview calculation' }))
    await waitFor(() => expect(calculate).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ fieldKey: 'box_1_ordinary_income_loss', amount: '1000.00' })])))
  })
})
