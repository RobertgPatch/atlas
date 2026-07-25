import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AddPartnershipDialog } from '../components/AddPartnershipDialog'
import { EditPartnershipDialog } from '../components/EditPartnershipDialog'
import { summaryFixture } from './fixtures'

const create = vi.fn().mockResolvedValue({ partnership: summaryFixture, nextAction: 'ADD_K1_YEAR' })
const update = vi.fn().mockResolvedValue(summaryFixture)
const sourceDetail = {
  summary: summaryFixture,
  years: [
    { taxYear: 2024, status: 'IN_PROGRESS', revision: 1, warningCount: 0 },
    { taxYear: 2023, status: 'RECONCILED', revision: 2, warningCount: 0 },
  ],
}
vi.mock('../hooks/usePartnershipTracker', () => ({
  usePartnershipTrackerList: () => ({ data: { items: [summaryFixture], total: 1, nextCursor: null }, isLoading: false, isError: false }),
  usePartnershipTrackerDetail: (id?: string) => ({ data: id ? sourceDetail : undefined, isLoading: false, isError: false }),
  usePartnershipTrackerActions: () => ({ createPartnership: { mutateAsync: create, isPending: false }, updatePartnership: { mutateAsync: update, isPending: false } }),
}))
vi.mock('../../partnerships/hooks/useEntityQueries', () => ({ useEntityList: () => ({ data: { items: [{ id: 'e-1', name: 'Jackson Family Trust' }, { id: 'e-2', name: 'Jackson Holdings' }] }, isLoading: false, isError: false }) }))

describe('Add Partnership flow', () => {
  beforeEach(() => { create.mockClear(); update.mockClear() })

  it('requires an owner, controlled type, then returns the new selection', async () => {
    const created = vi.fn()
    render(<MemoryRouter><AddPartnershipDialog open onClose={vi.fn()} onCreated={created} /></MemoryRouter>)
    expect(screen.getByRole('option', { name: 'Real Estate' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'JSP' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Owner'), { target: { value: 'e-1' } })
    fireEvent.change(screen.getByLabelText('Partnership name'), { target: { value: 'Redwood Fund' } })
    fireEvent.change(screen.getByLabelText('Partnership type'), { target: { value: 'Real Estate' } })
    fireEvent.change(screen.getByLabelText(/EIN/), { target: { value: '12-3456789' } })
    fireEvent.change(screen.getByLabelText('Fund manager'), { target: { value: 'Redwood Capital' } })
    fireEvent.change(screen.getByLabelText(/Committed amount/), { target: { value: '$1,000,000.00' } })
    fireEvent.change(screen.getByLabelText('Initial valuation'), { target: { value: '$850,000.00' } })
    fireEvent.change(screen.getByLabelText('Valuation date'), { target: { value: '2024-01-15' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create partnership' }))
    await waitFor(() => expect(created).toHaveBeenCalledWith('p-1'))
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ entityId: 'e-1', partnershipType: 'Real Estate', ein: '12-3456789', fundManager: 'Redwood Capital', capitalCommitment: '$1,000,000.00', initialValuationAmount: '$850,000.00', initialValuationDate: '2024-01-15' }))
  })

  it('keeps Cancel and Create partnership outside the scrolling dialog body', () => {
    const closed = vi.fn()
    render(<MemoryRouter><AddPartnershipDialog open onClose={closed} onCreated={vi.fn()} /></MemoryRouter>)

    const scrollBody = screen.getByTestId('add-partnership-form-scroll')
    const footer = screen.getByTestId('add-partnership-dialog-footer')
    expect(scrollBody).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto')
    expect(footer).toHaveClass('shrink-0', 'bg-white')
    expect(scrollBody).not.toContainElement(footer)
    expect(footer).toContainElement(screen.getByRole('button', { name: 'Cancel' }))
    expect(footer).toContainElement(screen.getByRole('button', { name: 'Create partnership' }))

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(closed).toHaveBeenCalledOnce()
  })

  it('adds an independent owner record to an existing partnership aggregate', async () => {
    render(<MemoryRouter><AddPartnershipDialog open onClose={vi.fn()} onCreated={vi.fn()} /></MemoryRouter>)
    fireEvent.click(screen.getByRole('radio', { name: /Existing partnership, new owner/ }))
    fireEvent.change(screen.getByLabelText('Existing partnership'), { target: { value: 'p-1' } })
    expect(screen.getByLabelText(/Committed amount/)).toHaveValue('1000000.00')
    expect(screen.queryByRole('option', { name: 'Jackson Family Trust' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Owner'), { target: { value: 'e-2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add owner record' }))
    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({
      entityId: 'e-2',
      existingPartnershipId: 'p-1',
      name: 'Redwood Fund',
      partnershipType: 'Real Estate',
      capitalCommitment: '1000000.00',
    })))
  })

  it('selects every source K-1 year by default and copies only the retained selection', async () => {
    render(<MemoryRouter><AddPartnershipDialog open onClose={vi.fn()} onCreated={vi.fn()} /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText('Owner'), { target: { value: 'e-1' } })
    fireEvent.change(screen.getByLabelText('Partnership name'), { target: { value: 'Parallel Fund' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Copy K-1 entry years/ }))
    fireEvent.change(screen.getByLabelText('Source partnership'), { target: { value: 'p-1' } })

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: '2024' })).toBeChecked()
      expect(screen.getByRole('checkbox', { name: '2023' })).toBeChecked()
    })
    fireEvent.click(screen.getByRole('checkbox', { name: '2023' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create partnership' }))

    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({
      copyK1YearsFrom: { partnershipId: 'p-1', taxYears: [2024] },
    })))
  })

  it('initializes and submits owner reassignment from Edit Partnership', async () => {
    const closed = vi.fn()
    render(<EditPartnershipDialog summary={summaryFixture} onClose={closed} />)
    const scrollBody = screen.getByTestId('edit-partnership-form-scroll')
    const footer = screen.getByTestId('edit-partnership-dialog-footer')
    expect(scrollBody).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto')
    expect(footer).toHaveClass('sticky', 'bottom-0', 'shrink-0', 'bg-white')
    expect(scrollBody).not.toContainElement(footer)
    expect(footer).toContainElement(screen.getByRole('button', { name: 'Cancel' }))
    expect(footer).toContainElement(screen.getByRole('button', { name: 'Save changes' }))
    expect(screen.getByLabelText('Owner')).toHaveValue('e-1')
    expect(screen.getByLabelText(/Committed amount/)).toHaveValue('1000000.00')
    fireEvent.change(screen.getByLabelText('Owner'), { target: { value: 'e-2' } })
    fireEvent.change(screen.getByLabelText(/Committed amount/), { target: { value: '$1,250,000.00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith(expect.objectContaining({ body: expect.objectContaining({ entityId: 'e-2', capitalCommitment: '$1,250,000.00' }) })))
    expect(closed).toHaveBeenCalled()
  })
})
