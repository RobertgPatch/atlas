import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { K1_TRACKER_OFFICIAL_FORM_FIELD_KEYS } from '../../../../../../packages/types/src/k1-tracker'
import { K1YearEntryForm } from '../components/K1YearEntryForm'
import { K1_EDITABLE_FIELDS } from '../k1FieldGroups'
import { K1_OFFICIAL_FORM_FIELDS } from '../k1OfficialFormFields'
import {
  K1_FORM_HEADER_FIELD_KEYS,
  K1_FORM_IDENTITY_FIELD_KEYS,
  K1_FORM_OFFICIAL_PLACEMENTS,
  K1_FORM_PLACEMENTS,
  K1_OVERLAPPING_CODED_OFFICIAL_FIELD_KEYS,
} from '../k1FormLayout'
import { k1EntryDetailFixture, missingK1IdentitySummaryFixture, summaryFixture } from '../../partnership-tracker/__tests__/fixtures'

describe('K-1 form layout contract', () => {
  it('places every canonical calculation field exactly once', () => {
    const placementKeys = K1_FORM_PLACEMENTS.map((placement) => placement.fieldKey)
    const editableKeys = K1_EDITABLE_FIELDS.map((field) => field.key)

    expect(placementKeys).toHaveLength(42)
    expect(new Set(placementKeys)).toHaveLength(42)
    expect([...placementKeys].sort()).toEqual([...editableKeys].sort())
    expect(placementKeys).not.toContain('box_13_other_deductions')
    expect(placementKeys).not.toContain('section_l_capital_contributed')
  })

  it('keeps each visual region ordered and places every official-form field exactly once', () => {
    const regions = new Set(K1_FORM_PLACEMENTS.map((placement) => placement.region))
    for (const region of regions) {
      const orders = K1_FORM_PLACEMENTS
        .filter((placement) => placement.region === region)
        .map((placement) => placement.order)
      expect(orders).toEqual([...orders].sort((left, right) => left - right))
      expect(new Set(orders)).toHaveLength(orders.length)
    }

    const officialKeys = [
      ...K1_FORM_HEADER_FIELD_KEYS,
      ...K1_FORM_IDENTITY_FIELD_KEYS,
      ...K1_FORM_PLACEMENTS.flatMap((placement) => placement.officialFieldKey ? [placement.officialFieldKey] : []),
      ...K1_FORM_OFFICIAL_PLACEMENTS.map((placement) => placement.fieldKey),
    ]
    expect(new Set(officialKeys)).toHaveLength(officialKeys.length)
    expect([...officialKeys].sort()).toEqual(
      K1_TRACKER_OFFICIAL_FORM_FIELD_KEYS
        .filter((fieldKey) => fieldKey !== 'part_ii_j_decrease_exchange')
        .sort(),
    )
  })

  it('renders every calculation and official-form entry exactly once as an available control', () => {
    const { container } = render(<K1YearEntryForm
      detail={k1EntryDetailFixture}
      canEdit
      pending={false}
      onCalculate={vi.fn()}
      onSave={vi.fn()}
      onDirtyChange={vi.fn()}
    />)

    for (const field of K1_EDITABLE_FIELDS) {
      expect(container.querySelectorAll(`[data-k1-field="${field.key}"]`)).toHaveLength(1)
    }
    for (const field of K1_OFFICIAL_FORM_FIELDS) {
      expect(container.querySelectorAll(`[data-k1-official-field="${field.key}"]`)).toHaveLength(
        K1_OVERLAPPING_CODED_OFFICIAL_FIELD_KEYS.includes(field.key) ? 0 : 1,
      )
    }
    expect(screen.getAllByLabelText('Line 11 ZZ - Other income (loss)')).toHaveLength(1)
    expect(screen.queryByLabelText('Line 11 - Other income code and detail entries code 1')).not.toBeInTheDocument()
  })

  it('keeps the complete field inventory in the Magic Patterns form composition', () => {
    const { container } = render(<K1YearEntryForm
      appearance="magic-pattern"
      detail={k1EntryDetailFixture}
      canEdit
      pending={false}
      onCalculate={vi.fn()}
      onSave={vi.fn()}
      onReconcile={vi.fn()}
      onDirtyChange={vi.fn()}
    />)

    for (const field of K1_EDITABLE_FIELDS) {
      expect(container.querySelectorAll(`[data-k1-field="${field.key}"]`)).toHaveLength(1)
    }
    for (const field of K1_OFFICIAL_FORM_FIELDS) {
      expect(container.querySelectorAll(`[data-k1-official-field="${field.key}"]`)).toHaveLength(
        K1_OVERLAPPING_CODED_OFFICIAL_FIELD_KEYS.includes(field.key) ? 0 : 1,
      )
    }

    const headings = Array.from(container.querySelectorAll('h4, h5')).map((heading) => heading.textContent?.trim())
    expect(headings).toEqual(expect.arrayContaining([
      'Part I - Information about the partnership',
      'Part II - Information about the partner',
      "Partner's share of profit, loss, and capital",
      "Partner's share of liabilities",
      "Part III - Partner's share of current year income and deductions",
      "Partner's capital account analysis and outside basis",
    ]))
    expect(screen.getByLabelText('Ending outside basis (calculated)')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Reconciliation workpaper' })).toBeInTheDocument()
    expect(screen.getByLabelText('Book capital account')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Complete 1 required item' })).toBeDisabled()
  })

  it('renders one recognizable K-1 hierarchy with loaded identity context', () => {
    render(<K1YearEntryForm
      detail={k1EntryDetailFixture}
      identity={{
        partnershipName: summaryFixture.partnership.name,
        partnershipEin: summaryFixture.partnership.ein,
        partnershipAddress: '100 Market Street, San Francisco, CA 94105, United States',
        partnerName: summaryFixture.partnership.entity.name,
      }}
      canEdit
      pending={false}
      onCalculate={vi.fn()}
      onSave={vi.fn()}
      onDirtyChange={vi.fn()}
    />)

    expect(screen.getByRole('form', { name: '2024 Schedule K-1 data entry' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Schedule K-1 (Form 1065)' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Part I - Information About the Partnership' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Part II - Information About the Partner' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: "Part III - Partner's Share of Current Year Income, Deductions, Credits, and Other Items" })).toBeInTheDocument()
    expect((screen.getByLabelText('Item B - Partnership name and address') as HTMLTextAreaElement).value).toContain('Redwood Fund')
    expect(screen.getByLabelText('Item F - Partner name and address')).toHaveValue('Jackson Family Trust')
    expect(screen.getByText('Beginning of year')).toBeInTheDocument()
    expect(screen.getByText('End of year')).toBeInTheDocument()
    expect(screen.getByText('Beginning capital account')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Jackson supplemental workpaper' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Opening basis and loss limitations' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Book-tax reconciliation' })).toBeInTheDocument()
  })

  it('renders blank editable controls rather than inventing missing identity data', () => {
    render(<K1YearEntryForm
      detail={k1EntryDetailFixture}
      identity={{
        partnershipName: '',
        partnershipEin: missingK1IdentitySummaryFixture.partnership.ein,
        partnershipAddress: null,
        partnerName: '',
      }}
      canEdit={false}
      pending={false}
      onCalculate={vi.fn()}
      onSave={vi.fn()}
      onDirtyChange={vi.fn()}
    />)

    expect(screen.getByLabelText('Item A - Partnership employer identification number')).toHaveValue('')
    expect(screen.getByLabelText('Item B - Partnership name and address')).toHaveValue('')
    expect(screen.getByLabelText('Item F - Partner name and address')).toHaveValue('')
    expect(screen.queryByRole('button', { name: 'Save revisions' })).not.toBeInTheDocument()
  })

  it('edits and saves the official lines that were previously static landmarks', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    render(<K1YearEntryForm
      detail={k1EntryDetailFixture}
      canEdit
      pending={false}
      onCalculate={vi.fn()}
      onSave={save}
      onDirtyChange={vi.fn()}
    />)

    fireEvent.change(screen.getByLabelText('Guaranteed payments for services'), { target: { value: '250' } })
    fireEvent.click(screen.getByLabelText('Schedule K-3 is attached'))
    const addCodeRow = within(screen.getByRole('group', { name: 'Other information' })).getByRole('button', { name: 'Add code row' })
    expect(addCodeRow).toHaveClass('rounded-none')
    expect(addCodeRow).not.toHaveClass('rounded-full')
    fireEvent.click(addCodeRow)
    fireEvent.change(screen.getByLabelText('Other information code 1'), { target: { value: 'v' } })
    fireEvent.change(screen.getByLabelText('Other information value 1'), { target: { value: 'SEE STMT' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save revisions' }))

    await waitFor(() => expect(save).toHaveBeenCalledWith([], expect.objectContaining({
        tax_period_beginning: '2024-01-01',
        tax_period_ending: '2024-12-31',
        box_4a_guaranteed_payments_services: '250.00',
        box_16_schedule_k3_attached: true,
        box_20_entries: [{ code: 'V', value: 'SEE STMT' }],
      })))
  })
})
