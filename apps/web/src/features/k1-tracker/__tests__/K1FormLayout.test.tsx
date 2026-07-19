import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { K1YearEntryForm } from '../components/K1YearEntryForm'
import { K1_EDITABLE_FIELDS } from '../k1FieldGroups'
import { K1_FORM_PLACEMENTS, K1_FORM_REFERENCE_CELLS } from '../k1FormLayout'
import { k1EntryDetailFixture, missingK1IdentitySummaryFixture, summaryFixture } from '../../partnership-tracker/__tests__/fixtures'

describe('K-1 form layout contract', () => {
  it('places every canonical editable field exactly once', () => {
    const placementKeys = K1_FORM_PLACEMENTS.map((placement) => placement.fieldKey)
    const editableKeys = K1_EDITABLE_FIELDS.map((field) => field.key)

    expect(placementKeys).toHaveLength(42)
    expect(new Set(placementKeys)).toHaveLength(42)
    expect([...placementKeys].sort()).toEqual([...editableKeys].sort())
    expect(placementKeys).not.toContain('box_13_other_deductions')
    expect(placementKeys).not.toContain('section_l_capital_contributed')
  })

  it('keeps each visual region ordered and reference cells free of writable keys', () => {
    const regions = new Set(K1_FORM_PLACEMENTS.map((placement) => placement.region))
    for (const region of regions) {
      const orders = K1_FORM_PLACEMENTS
        .filter((placement) => placement.region === region)
        .map((placement) => placement.order)
      expect(orders).toEqual([...orders].sort((left, right) => left - right))
      expect(new Set(orders)).toHaveLength(orders.length)
    }

    for (const reference of K1_FORM_REFERENCE_CELLS) {
      expect(reference).not.toHaveProperty('fieldKey')
      expect(reference.status).toBe('NOT_TRACKED')
    }
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
    expect(screen.getByRole('heading', { name: 'Part I — Information About the Partnership' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Part II — Information About the Partner' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Part III — Partner’s Share of Current Year Income, Deductions, Credits, and Other Items' })).toBeInTheDocument()
    expect(screen.getByText('Redwood Fund')).toBeInTheDocument()
    expect(screen.getByText('Jackson Family Trust')).toBeInTheDocument()
    expect(screen.getByText('Beginning of year')).toBeInTheDocument()
    expect(screen.getByText('End of year')).toBeInTheDocument()
    expect(screen.getByText('Beginning capital account')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Jackson supplemental workpaper' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Opening basis and loss limitations' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Book-tax reconciliation' })).toBeInTheDocument()
  })

  it('shows explicit unavailable states rather than inventing missing identity data', () => {
    render(<K1YearEntryForm
      detail={k1EntryDetailFixture}
      identity={{
        partnershipName: missingK1IdentitySummaryFixture.partnership.name,
        partnershipEin: missingK1IdentitySummaryFixture.partnership.ein,
        partnershipAddress: null,
        partnerName: missingK1IdentitySummaryFixture.partnership.entity.name,
      }}
      canEdit={false}
      pending={false}
      onCalculate={vi.fn()}
      onSave={vi.fn()}
      onDirtyChange={vi.fn()}
    />)

    expect(screen.getAllByText('Not available').length).toBeGreaterThanOrEqual(2)
    expect(screen.queryByRole('button', { name: 'Save revisions' })).not.toBeInTheDocument()
  })

  it('renders unsupported official lines as static landmarks that cannot enter a change set', () => {
    const calculate = vi.fn().mockResolvedValue(undefined)
    const { container } = render(<K1YearEntryForm
      detail={k1EntryDetailFixture}
      canEdit
      pending={false}
      onCalculate={calculate}
      onSave={vi.fn()}
      onDirtyChange={vi.fn()}
    />)

    for (const line of ['4a', '4b', '6b', '6c', '9b', '9c', '14', '15', '16', '17', '20', '22', '23']) {
      const landmark = container.querySelector(`[data-k1-reference="${line}"]`)
      expect(landmark).toBeInTheDocument()
      expect(landmark).toHaveTextContent('Not tracked in Jackson')
      expect(landmark?.querySelector('input')).toBeNull()
      expect(landmark).not.toHaveAttribute('tabindex')
    }

    expect(screen.getAllByText('Not tracked in Jackson').length).toBeGreaterThanOrEqual(15)
    fireEvent.click(screen.getByRole('button', { name: 'Preview calculation' }))
    expect(calculate).not.toHaveBeenCalled()
  })
})
