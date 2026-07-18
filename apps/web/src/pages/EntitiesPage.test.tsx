import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EntitiesApiError } from '../features/partnerships/api/entitiesClient'
import { EntitiesPage, errorMessage } from './EntitiesPage'

const update = vi.fn()
const remove = vi.fn()
vi.mock('../features/partnerships/hooks/useEntityQueries', () => ({
  useEntityList: () => ({
    data: { items: [{ id: 'e-1', name: 'Atlas Family Trust', partnershipCount: 1, totalDistributionsUsd: 1000 }] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useCreateEntity: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateEntity: () => ({ mutateAsync: update, isPending: false }),
  useDeleteEntity: () => ({ mutateAsync: remove, isPending: false }),
}))
vi.mock('../auth/sessionStore', () => ({
  useSession: () => ({ session: { role: 'Admin', user: { email: 'admin@atlas.test' } } }),
  sessionStore: { setUnauthenticated: vi.fn() },
}))
vi.mock('../auth/authClient', () => ({ authClient: { logout: vi.fn().mockResolvedValue(undefined) } }))

describe('EntitiesPage owner rename', () => {
  beforeEach(() => {
    update.mockReset()
    remove.mockReset()
  })

  it('submits the edited owner name and closes the inline editor after success', async () => {
    update.mockResolvedValue({ id: 'e-1', name: 'Renamed Owner' })
    render(<MemoryRouter><EntitiesPage /></MemoryRouter>)
    fireEvent.click(screen.getByTitle('Rename'))
    const input = screen.getByDisplayValue('Atlas Family Trust')
    fireEvent.change(input, { target: { value: 'Renamed Owner' } })
    await act(async () => { fireEvent.click(screen.getByTitle('Save')) })
    await waitFor(() => expect(update).toHaveBeenCalledWith({ id: 'e-1', name: 'Renamed Owner' }))
    await waitFor(() => expect(screen.queryByDisplayValue('Renamed Owner')).not.toBeInTheDocument())
  })

  it('maps durable rename failures to actionable row messages', () => {
    expect(errorMessage(new EntitiesApiError('DUPLICATE_ENTITY_NAME', 409))).toBe('An entity with that name already exists.')
    expect(errorMessage(new EntitiesApiError('FORBIDDEN_ROLE', 403))).toBe('Only Admins can manage entities.')
    expect(errorMessage(new EntitiesApiError('VALIDATION_ERROR', 400))).toBe('Please enter a valid entity name.')
  })

  it('confirms entity deletion without using a browser prompt', async () => {
    remove.mockResolvedValue(undefined)
    render(<MemoryRouter><EntitiesPage /></MemoryRouter>)

    fireEvent.click(screen.getByTitle('Remove all partnerships before deleting'))
    expect(screen.getByRole('dialog', { name: 'Delete Atlas Family Trust?' })).toBeTruthy()
    expect(remove).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete entity' }))
    })
    await waitFor(() => expect(remove).toHaveBeenCalledWith('e-1'))
  })
})
