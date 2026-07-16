import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AddPartnershipDialog } from '../components/AddPartnershipDialog'
import { EditPartnershipDialog } from '../components/EditPartnershipDialog'
import { summaryFixture } from './fixtures'

const create = vi.fn().mockResolvedValue({ partnership: summaryFixture, nextAction: 'ADD_K1_YEAR' })
const update = vi.fn().mockResolvedValue(summaryFixture)
vi.mock('../hooks/usePartnershipTracker', () => ({ usePartnershipTrackerActions: () => ({ createPartnership: { mutateAsync: create, isPending: false }, updatePartnership: { mutateAsync: update, isPending: false } }) }))
vi.mock('../../partnerships/hooks/useEntityQueries', () => ({ useEntityList: () => ({ data: { items: [{ id: 'e-1', name: 'Atlas Family Trust' }, { id: 'e-2', name: 'Atlas Holdings' }] }, isLoading: false, isError: false }) }))

describe('Add Partnership flow', () => {
  it('requires an owner, controlled type, then returns the new selection', async () => {
    const created = vi.fn()
    render(<MemoryRouter><AddPartnershipDialog open onClose={vi.fn()} onCreated={created} /></MemoryRouter>)
    expect(screen.getByRole('option', { name: 'Real Estate' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Owner'), { target: { value: 'e-1' } })
    fireEvent.change(screen.getByLabelText('Partnership name'), { target: { value: 'Redwood Fund' } })
    fireEvent.change(screen.getByLabelText('Partnership type'), { target: { value: 'Real Estate' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create partnership' }))
    await waitFor(() => expect(created).toHaveBeenCalledWith('p-1'))
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ entityId: 'e-1', partnershipType: 'Real Estate' }))
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
