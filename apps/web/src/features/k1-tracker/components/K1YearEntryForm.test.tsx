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
  it('pins the Magic Patterns action bar to the shell bottom edge', () => {
    render(<K1YearEntryForm appearance="magic-pattern" detail={detail} canEdit pending={false} onCalculate={vi.fn()} onSave={vi.fn()} onReconcile={vi.fn()} onDirtyChange={vi.fn()} />)

    expect(screen.getByTestId('k1-form-actions')).toHaveClass('-bottom-4', 'sm:-bottom-6', 'lg:-bottom-8')
  })

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

  it('accepts and saves a negative Section L withdrawal', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    render(<K1YearEntryForm detail={detail} canEdit pending={false} onCalculate={vi.fn()} onSave={save} onDirtyChange={vi.fn()} />)

    await userEvent.type(screen.getByLabelText('Section L withdrawals and distributions'), '-250')
    await userEvent.click(screen.getByRole('button', { name: 'Save revisions' }))

    expect(save).toHaveBeenCalledWith([{
      fieldKey: 'section_l_withdrawals_distributions',
      amount: '-250.00',
      sourceType: 'MANUAL_ENTRY',
    }])
  })

  it('accepts a negative Line 19 distribution', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    render(<K1YearEntryForm detail={detail} canEdit pending={false} onCalculate={vi.fn()} onSave={save} onDirtyChange={vi.fn()} />)

    await userEvent.type(screen.getByLabelText('Line 19 - Distributions'), '-500')
    await userEvent.click(screen.getByRole('button', { name: 'Save revisions' }))

    expect(save).toHaveBeenCalledWith([{
      fieldKey: 'box_19_distributions',
      amount: '-500.00',
      sourceType: 'MANUAL_ENTRY',
    }])
  })

  it('shows one Item J sale-or-exchange checkbox and migrates the legacy exchange value', () => {
    const legacyDetail = {
      ...detail,
      officialFormData: {
        ...detail.officialFormData,
        part_ii_j_decrease_sale: false,
        part_ii_j_decrease_exchange: true,
      },
    } as K1TrackerYearDetail

    render(<K1YearEntryForm detail={legacyDetail} canEdit pending={false} onCalculate={vi.fn()} onSave={vi.fn()} onDirtyChange={vi.fn()} />)

    expect(screen.getByRole('checkbox', {
      name: 'Item J - Decrease due to sale or exchange of partnership interest',
    })).toBeChecked()
    expect(screen.queryByRole('checkbox', { name: 'Item J - Decrease due to exchange' })).not.toBeInTheDocument()
  })

  it('uses one signed amount input for Line 11 ZZ and synchronizes both destinations', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    render(<K1YearEntryForm detail={detail} canEdit pending={false} onCalculate={vi.fn()} onSave={save} onDirtyChange={vi.fn()} />)

    expect(screen.getAllByLabelText('Line 11 ZZ - Other income (loss)')).toHaveLength(1)
    await userEvent.type(screen.getByLabelText('Line 11 ZZ - Other income (loss)'), '-125')
    await userEvent.click(screen.getByRole('button', { name: 'Save revisions' }))

    expect(save).toHaveBeenCalledWith([{
      fieldKey: 'box_11_other_income_loss',
      amount: '-125.00',
      sourceType: 'MANUAL_ENTRY',
    }], expect.objectContaining({
      box_11_entries: [{ code: 'ZZ', value: '-125.00' }],
    }))
  })

  it('shows one source-faithful row for coded Lines 13, 18, 19, and 21', () => {
    const acBellDetail = {
      ...detail,
      officialFormData: {
        ...detail.officialFormData,
        box_13_entries: [{ code: 'A', value: '855.00' }],
        box_15_entries: [{ code: 'J', value: '642.00' }],
        box_18_entries: [{ code: 'C*', value: '642.00' }],
        box_19_entries: [{ code: 'A', value: '190773.00' }],
        box_21_entries: [{ code: '', value: '' }],
      },
    } as K1TrackerYearDetail

    render(<K1YearEntryForm detail={acBellDetail} canEdit pending={false} onCalculate={vi.fn()} onSave={vi.fn()} onDirtyChange={vi.fn()} />)

    expect(screen.getByLabelText('Other deduction code and statement details code 1')).toHaveValue('A')
    expect(screen.queryByLabelText('Line 13 - Other Portfolio Deductions')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Line 13 - Management Fees')).not.toBeInTheDocument()

    expect(screen.getByLabelText('Tax-exempt income and nondeductible expense code details code 1')).toHaveValue('C*')
    expect(screen.queryByLabelText('Line 18A - Nondeductible expenses')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Line 18B - Tax-exempt income (basis only)')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Line 18C - Nondeductible expenses (basis decrease)')).not.toBeInTheDocument()

    expect(screen.getByLabelText('Distribution code and statement details code 1')).toHaveValue('A')
    expect(screen.queryByLabelText('Line 19 - Distributions')).not.toBeInTheDocument()

    expect(screen.getByLabelText('Line 21 - Foreign taxes paid')).toBeInTheDocument()
    expect(screen.queryByText('Foreign tax code and statement details')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Credits code 1')).toHaveValue('J')
  })
})
