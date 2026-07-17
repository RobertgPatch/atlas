import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AddPartnershipDialog } from '../components/AddPartnershipDialog'
import { EditPartnershipDialog } from '../components/EditPartnershipDialog'
import { summaryFixture } from './fixtures'

const create = vi.fn().mockResolvedValue({ partnership: summaryFixture, nextAction: 'ADD_K1_YEAR' })
const update = vi.fn().mockResolvedValue(summaryFixture)
vi.mock('../hooks/usePartnershipTracker', () => ({
  usePartnershipTrackerList: () => ({ data: { items: [summaryFixture], total: 1, nextCursor: null }, isLoading: false, isError: false }),
  usePartnershipTrackerActions: () => ({ createPartnership: { mutateAsync: create, isPending: false }, updatePartnership: { mutateAsync: update, isPending: false } }),
}))
vi.mock('../../partnerships/hooks/useEntityQueries', () => ({ useEntityList: () => ({ data: { items: [{ id: 'e-1', name: 'Atlas Family Trust' }, { id: 'e-2', name: 'Atlas Holdings' }] }, isLoading: false, isError: false }) }))

describe('Add Partnership flow', () => {
  beforeEach(() => { create.mockClear(); update.mockClear() })

  it('requires an owner, controlled type, then returns the new selection', async () => {
    const created = vi.fn()
    render(<MemoryRouter><AddPartnershipDialog open onClose={vi.fn()} onCreated={created} /></MemoryRouter>)
    expect(screen.getByRole('option', { name: 'Real Estate' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Owner'), { target: { value: 'e-1' } })
    fireEvent.change(screen.getByLabelText('Partnership name'), { target: { value: 'Redwood Fund' } })
    fireEvent.change(screen.getByLabelText('Partnership type'), { target: { value: 'Real Estate' } })
    fireEvent.change(screen.getByLabelText(/EIN/), { target: { value: '12-3456789' } })
    fireEvent.change(screen.getByLabelText('Fund manager'), { target: { value: 'Redwood Capital' } })
    fireEvent.change(screen.getByLabelText('Initial valuation'), { target: { value: '$850,000.00' } })
    fireEvent.change(screen.getByLabelText('Valuation date'), { target: { value: '2024-01-15' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create partnership' }))
    await waitFor(() => expect(created).toHaveBeenCalledWith('p-1'))
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ entityId: 'e-1', partnershipType: 'Real Estate', ein: '12-3456789', fundManager: 'Redwood Capital', initialValuationAmount: '$850,000.00', initialValuationDate: '2024-01-15' }))
  })

  it('adds an independent owner record to an existing partnership aggregate', async () => {
    render(<MemoryRouter><AddPartnershipDialog open onClose={vi.fn()} onCreated={vi.fn()} /></MemoryRouter>)
    fireEvent.click(screen.getByRole('radio', { name: /Existing partnership, new owner/ }))
    fireEvent.change(screen.getByLabelText('Existing partnership'), { target: { value: 'p-1' } })
    expect(screen.queryByRole('option', { name: 'Atlas Family Trust' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Owner'), { target: { value: 'e-2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add owner record' }))
    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({
      entityId: 'e-2',
      existingPartnershipId: 'p-1',
      name: 'Redwood Fund',
      partnershipType: 'Real Estate',
    })))
  })

  it('initializes and submits owner reassignment from Edit Partnership', async () => {
    const closed = vi.fn()
    render(<EditPartnershipDialog summary={summaryFixture} onClose={closed} />)
    expect(screen.getByLabelText('Owner')).toHaveValue('e-1')
    fireEvent.change(screen.getByLabelText('Owner'), { target: { value: 'e-2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith(expect.objectContaining({ body: expect.objectContaining({ entityId: 'e-2' }) })))
    expect(closed).toHaveBeenCalled()
  })
})
