import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PartnershipTrackerYearDetail } from '../../../../../../packages/types/src/partnership-tracker'
import { K1YearEntryForm } from '../../k1-tracker/components/K1YearEntryForm'
import { k1CashActivityDetailFixture, k1EntryDetailFixture } from './fixtures'

const detail = {
  partnershipId: 'p-1', taxYear: 2024, revision: 1, status: 'IN_PROGRESS',
  values: [{ id: 'v-1', fieldKey: 'opening_outside_basis', amount: '100.00', sourceType: 'FINALIZED_K1', originalSourceText: '100', sourceK1DocumentId: 'd-1', sourceK1FieldValueId: 'f-1', importBatchId: null, sourceSheet: null, sourceCell: null, carryforwardFromTaxYear: null, overrideReason: null, isActive: true, createdByEmail: null, createdAt: '2025-01-01T00:00:00.000Z' }],
  calculation: { basis: { beginningOutsideBasis: '100.00' }, lossLimitation: { priorSuspendedLoss: '0.00' }, liabilities: {}, sectionL: {} },
} as unknown as PartnershipTrackerYearDetail

describe('manual K-1 annual entry', () => {
  it('keeps every field in one form with one canonical contribution input and no step controls', async () => {
    const calculate = vi.fn().mockResolvedValue(undefined)
    render(<K1YearEntryForm detail={detail} canEdit pending={false} onCalculate={calculate} onSave={vi.fn()} onDirtyChange={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Schedule K-1 (Form 1065)' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: "Partner's Share of Liabilities" })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Book-tax reconciliation' })).toBeInTheDocument()
    expect(screen.getAllByLabelText('Capital contributions')).toHaveLength(1)
    expect(screen.getByLabelText('Line 13 - Other Portfolio Deductions')).toBeInTheDocument()
    expect(screen.getByLabelText('Line 13 - Management Fees')).toBeInTheDocument()
    expect(screen.queryByLabelText('Line 13 - Other deductions')).not.toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Line 1 - Ordinary income (loss)'), { target: { value: '1000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Preview calculation' }))
    await waitFor(() => expect(calculate).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ fieldKey: 'box_1_ordinary_income_loss', amount: '1000.00' })])))
  })

  it('keeps canonical field keys, signs, and values across every form region', async () => {
    const calculate = vi.fn().mockResolvedValue(undefined)
    const save = vi.fn().mockResolvedValue(undefined)
    render(<K1YearEntryForm detail={k1EntryDetailFixture} canEdit pending={false} onCalculate={calculate} onSave={save} onDirtyChange={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Line 1 - Ordinary income (loss)'), { target: { value: '-1000' } })
    fireEvent.change(screen.getByLabelText('Line 12 - Section 179 deduction'), { target: { value: '25.25' } })
    fireEvent.change(screen.getByLabelText('Nonrecourse liabilities - ending'), { target: { value: '300000' } })
    fireEvent.change(screen.getByLabelText('Section L current-year net income (loss)'), { target: { value: '-400' } })
    fireEvent.change(screen.getByLabelText('Book interest income'), { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: 'Preview calculation' }))

    const expectedChanges = expect.arrayContaining([
      expect.objectContaining({ fieldKey: 'box_1_ordinary_income_loss', amount: '-1000.00' }),
      expect.objectContaining({ fieldKey: 'box_12_section_179_deduction', amount: '25.25' }),
      expect.objectContaining({ fieldKey: 'liability_nonrecourse_ending', amount: '300000.00' }),
      expect.objectContaining({ fieldKey: 'section_l_current_year_net_income_loss', amount: '-400.00' }),
      expect.objectContaining({ fieldKey: 'book_interest_income', amount: '20.00' }),
    ])
    await waitFor(() => expect(calculate).toHaveBeenCalledWith(expectedChanges))

    fireEvent.click(screen.getByRole('button', { name: 'Save revisions' }))
    await waitFor(() => expect(save).toHaveBeenCalledWith(expectedChanges))
  })

  it('keeps capital calls, distributions, and recallable distributions read-only and out of change sets', async () => {
    const calculate = vi.fn().mockResolvedValue(undefined)
    render(<K1YearEntryForm detail={k1CashActivityDetailFixture} canEdit pending={false} onCalculate={calculate} onSave={vi.fn()} onDirtyChange={vi.fn()} />)

    expect(screen.getByLabelText('Capital contributions')).toBeDisabled()
    expect(screen.getByLabelText('Line 19 - Distributions')).toBeDisabled()
    expect(screen.getAllByText('Calculated from dated cash activity')).toHaveLength(2)
    expect(screen.getByText('WORKBOOK IMPORT · 2024 K-1!F12')).toBeInTheDocument()
    expect(screen.getByText('CARRYFORWARD · from 2023')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Line 5 - Interest income'), { target: { value: '125' } })
    fireEvent.click(screen.getByRole('button', { name: 'Preview calculation' }))
    await waitFor(() => expect(calculate).toHaveBeenCalledTimes(1))
    const changes = calculate.mock.calls[0]![0]
    expect(changes).toContainEqual(expect.objectContaining({ fieldKey: 'box_5_interest_income', amount: '125.00' }))
    expect(changes).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ fieldKey: 'capital_contributions' }),
      expect.objectContaining({ fieldKey: 'box_19_distributions' }),
    ]))
  })
})
