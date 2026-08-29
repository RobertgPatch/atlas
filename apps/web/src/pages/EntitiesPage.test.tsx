import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EntitiesPage } from './EntitiesPage'

const update = vi.fn()
const remove = vi.fn()
const create = vi.fn()
const authState = vi.hoisted(() => ({ role: 'Admin' as 'Admin' | 'User' }))

vi.mock('../features/partnerships/hooks/useEntityQueries', () => ({
  useEntityList: () => ({
    data: {
      items: [
        {
          id: 'e-1',
          name: 'Jackson Family Trust',
          entityType: 'TRUST',
          jurisdiction: 'Nevada',
          taxId: '88-1140552',
          formedOn: '06/02/2008',
          status: 'ACTIVE',
          notes: null,
          registeredAgent: null,
          primaryContact: null,
          ownerCount: 2,
          partnershipCount: 1,
          investmentCount: 1,
          holdingsValueUsd: 5470000,
          totalDistributionsUsd: 1000,
        },
      ],
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useCreateEntity: () => ({ mutateAsync: create, isPending: false }),
  useUpdateEntity: () => ({ mutateAsync: update, isPending: false }),
  useDeleteEntity: () => ({ mutateAsync: remove, isPending: false }),
}))

vi.mock('../auth/sessionStore', () => ({
  useSession: () => ({ session: { role: authState.role, user: { email: 'admin@jackson.test' } } }),
  sessionStore: { setUnauthenticated: vi.fn() },
}))

vi.mock('../auth/authClient', () => ({ authClient: { logout: vi.fn().mockResolvedValue(undefined) } }))

describe('EntitiesPage current flow', () => {
  beforeEach(() => {
    update.mockReset()
    remove.mockReset()
    create.mockReset()
    authState.role = 'Admin'
  })

  it('renders the current entity directory', () => {
    render(<MemoryRouter><EntitiesPage /></MemoryRouter>)

    expect(screen.getByTestId('app-sidebar-panel')).toHaveAttribute(
      'data-design-variant',
      'magic-patterns',
    )
    expect(screen.getByRole('heading', { name: 'Entities & Owners' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add entity' })).toHaveClass('bg-primary')
    expect(screen.getByText('Entities on file')).toBeTruthy()
    expect(screen.getByRole('searchbox', { name: /search entities/i })).toHaveClass(
      'focus:border-focus',
    )
  })

  it('creates an entity from the current add dialog', async () => {
    create.mockResolvedValue({ id: 'e-2', name: 'Whitfield Family Trust' })
    render(<MemoryRouter><EntitiesPage /></MemoryRouter>)

    fireEvent.click(screen.getByRole('button', { name: 'Add entity' }))
    fireEvent.click(screen.getByRole('button', { name: 'Entity type' }))
    fireEvent.click(screen.getByRole('option', { name: 'Trust' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Legal name' }), {
      target: { value: ' Whitfield Family Trust ' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Jurisdiction' }), {
      target: { value: ' Nevada ' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Tax ID (EIN)' }), {
      target: { value: ' 88-1140552 ' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Formation date' }), {
      target: { value: ' 06/02/2008 ' },
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create entity' }))
    })

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        name: 'Whitfield Family Trust',
        kind: 'trust',
        jurisdiction: 'Nevada',
        taxId: '88-1140552',
        formedOn: '06/02/2008',
      }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add entity' })).toBeNull())
  })

  it('distinguishes a holding partnership from an investment partnership', async () => {
    render(<MemoryRouter><EntitiesPage /></MemoryRouter>)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Add entity' })))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Entity type' })))
    expect(screen.getByRole('option', { name: 'Holding Partnership / Family LP' })).toBeTruthy()
    expect(screen.queryByRole('option', { name: /^Partnership$/ })).toBeNull()
  })

  it('shows the current dialog guidance and validation', async () => {
    render(<MemoryRouter><EntitiesPage /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Add entity' }))
    expect(screen.getByRole('dialog', { name: 'Add entity' })).toBeTruthy()
    expect(screen.getByText(/created as a draft/i)).toBeTruthy()
    expect(screen.getByText('Leave blank if the EIN letter has not been received.')).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Create entity' })))
    expect(await screen.findByText('Legal name is required.')).toBeTruthy()
    expect(screen.getByText('Jurisdiction of formation is required.')).toBeTruthy()
    expect(create).not.toHaveBeenCalled()
  })

  it('uses the current row menu without a legacy rename action', () => {
    render(<MemoryRouter><EntitiesPage /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Row actions' }))
    expect(screen.getByRole('menuitem', { name: 'Open entity' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Remove entity' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Rename entity' })).toBeNull()
  })

  it('opens the current entity detail route from the directory row', () => {
    render(
      <MemoryRouter initialEntries={['/entities']}>
        <Routes>
          <Route path="/entities" element={<EntitiesPage />} />
          <Route path="/entities/:id" element={<div>Current entity detail</div>} />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Row actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open entity' }))
    expect(screen.getByText('Current entity detail')).toBeTruthy()
  })

  it('keeps mutations Admin-only while Users retain directory access', () => {
    authState.role = 'User'
    render(<MemoryRouter><EntitiesPage /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Entities & Owners' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Add entity' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Row actions' }))
    expect(screen.getByRole('menuitem', { name: 'Open entity' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Remove entity' })).toBeNull()
  })

  it('confirms removal before deleting an entity row', async () => {
    remove.mockResolvedValue(undefined)
    render(<MemoryRouter><EntitiesPage /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Row actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove entity' }))
    expect(screen.getByRole('alertdialog', { name: 'Remove Jackson Family Trust?' })).toBeTruthy()
    expect(remove).not.toHaveBeenCalled()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Remove entity' })))
    await waitFor(() => expect(remove).toHaveBeenCalledWith('e-1'))
  })
})
