import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { K1TrackerYearDetail } from '../../../../../../packages/types/src/k1-tracker'
import { K1YearEntryForm } from './K1YearEntryForm'

const detail = {
  partnershipId: 'partnership-1', taxYear: 2025, revision: 4, status: 'IN_PROGRESS', values: [],
  officialFormData: { part_i_a_partnership_ein: '12-3456789' },
  officialFormSources: {
    part_i_a_partnership_ein: {
      sourceType: 'FINALIZED_K1', sourceK1DocumentId: 'document-1', sourceK1FieldValueIds: ['field-1'],
      extractionAttemptId: 'attempt-1', createdByEmail: 'reviewer@example.com', createdAt: '2026-08-18T00:00:00Z',
    },
  },
  cashFlowEvents: [], sourceConflicts: [],
  calculation: {
    basis: { beginningOutsideBasis: '0.00', endingOutsideBasis: '0.00' },
    lossLimitation: { priorSuspendedLoss: '0.00' }, liabilities: {}, sectionL: {}, checks: [],
    summary: { status: 'OK' },
  },
  signoff: {},
} as unknown as K1TrackerYearDetail

describe('K1YearEntryForm imported official-field provenance', () => {
  it('links an applied official value back to its reviewed source document', () => {
    render(<K1YearEntryForm detail={detail} canEdit={false} pending={false} onCalculate={vi.fn()} onSave={vi.fn()} onDirtyChange={vi.fn()} />)
    const link = screen.getByRole('link', { name: 'Imported from reviewed K-1' })
    expect(link).toHaveAttribute('href', '/k1/document-1/review')
    expect(screen.getByText('by reviewer@example.com')).toBeInTheDocument()
  })

  it('explains calculated warnings and requires acknowledgement before reconciliation', async () => {
    const reconcile = vi.fn().mockResolvedValue(undefined)
    const warningDetail: K1TrackerYearDetail = {
      ...detail,
      calculation: {
        ...detail.calculation,
        checks: [{
          key: 'taxable-excess-distribution', status: 'WARNING', actual: '250.00', expected: null,
          difference: null, tolerance: null, message: 'Distributions exceed available basis.',
        }],
      },
    }

    render(<K1YearEntryForm appearance="magic-pattern" detail={warningDetail} canEdit pending={false} onCalculate={vi.fn()} onSave={vi.fn()} onReconcile={reconcile} onDirtyChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Review 1 warning' })).toBeDisabled()
    await userEvent.click(screen.getByRole('checkbox', { name: /I reviewed the 1 calculated warning/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Mark reconciled' }))
    expect(reconcile).toHaveBeenCalledOnce()
  })
})
