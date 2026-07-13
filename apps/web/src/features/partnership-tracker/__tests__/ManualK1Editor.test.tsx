import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PartnershipTrackerYearDetail } from '../../../../../../packages/types/src/partnership-tracker'
import { EditYearDrawer } from '../components/EditYearDrawer'

const detail = { partnershipId: 'p-1', taxYear: 2024, revision: 1, status: 'IN_PROGRESS', values: [{ id: 'v-1', fieldKey: 'opening_outside_basis', amount: '100.00', sourceType: 'FINALIZED_K1', originalSourceText: '100', sourceK1DocumentId: 'd-1', sourceK1FieldValueId: 'f-1', importBatchId: null, sourceSheet: null, sourceCell: null, carryforwardFromTaxYear: null, overrideReason: null, isActive: true, createdByEmail: null, createdAt: '2025-01-01T00:00:00.000Z' }], calculation: { basis: {}, lossLimitation: {}, liabilities: {}, sectionL: {} } } as unknown as PartnershipTrackerYearDetail

describe('manual K-1 editor boundary', () => {
  it('shows provenance, requires confirmation for unsaved navigation, and exposes no import control', () => {
    render(<EditYearDrawer detail={detail} pending={false} onClose={vi.fn()} onCalculate={vi.fn()} onSave={vi.fn()} />)
    expect(screen.getByText(/finalized K-1 values remain traceable/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /import/i })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Opening Outside Basis'), { target: { value: '200.00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Close editor' }))
    expect(screen.getByRole('alertdialog', { name: 'Discard unsaved changes' })).toBeInTheDocument()
  })
})
