import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EntitiesApiError } from '../features/partnerships/api/entitiesClient'
import { EntitiesPage } from './EntitiesPage'
import { errorMessage } from './entitiesPageUtils'

const update = vi.fn()
const remove = vi.fn()
const create = vi.fn()
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
  useSession: () => ({ session: { role: 'Admin', user: { email: 'admin@jackson.test' } } }),
  sessionStore: { setUnauthenticated: vi.fn() },
}))
vi.mock('../auth/authClient', () => ({ authClient: { logout: vi.fn().mockResolvedValue(undefined) } }))

describe('EntitiesPage owner rename', () => {
  beforeEach(() => {
    update.mockReset()
    remove.mockReset()
    create.mockReset()
  })

  it('submits the edited owner name and closes the inline editor after success', async () => {
    update.mockResolvedValue({ id: 'e-1', name: 'Renamed Owner' })
    render(<MemoryRouter><EntitiesPage magicPatternDesigns={false} /></MemoryRouter>)
    fireEvent.click(screen.getByTitle('Rename'))
    const input = screen.getByDisplayValue('Jackson Family Trust')
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
    render(<MemoryRouter><EntitiesPage magicPatternDesigns={false} /></MemoryRouter>)

    fireEvent.click(screen.getByTitle('Remove all partnerships before deleting'))
    expect(screen.getByRole('dialog', { name: 'Delete Jackson Family Trust?' })).toBeTruthy()
    expect(remove).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete entity' }))
    })
    await waitFor(() => expect(remove).toHaveBeenCalledWith('e-1'))
  })

  it('renders the Magic Patterns directory when the feature flag is enabled', () => {
    render(<MemoryRouter><EntitiesPage magicPatternDesigns /></MemoryRouter>)

    expect(screen.getByTestId('app-sidebar-panel')).toHaveAttribute(
      'data-design-variant',
      'magic-patterns',
    )
    expect(screen.getByRole('heading', { name: 'Entities & Owners' })).toBeTruthy()
    expect(screen.getByText('Entities on file')).toBeTruthy()
    expect(screen.getByRole('searchbox', { name: /search entities/i })).toBeTruthy()
    expect(screen.queryByText('Add a new entity')).toBeNull()
  })

  it('keeps the existing directory when the feature flag is disabled', () => {
    render(<MemoryRouter><EntitiesPage magicPatternDesigns={false} /></MemoryRouter>)

    expect(screen.getByTestId('app-sidebar-panel')).toHaveAttribute(
      'data-design-variant',
      'legacy',
    )
    expect(screen.getByRole('heading', { name: 'Entities' })).toBeTruthy()
    expect(screen.getByText('Add a new entity')).toBeTruthy()
    expect(document.querySelector('[data-design-variant="magic-patterns-entities"]')).toBeNull()
  })

  it('creates a real entity from the Magic Patterns add dialog', async () => {
    create.mockResolvedValue({ id: 'e-2', name: 'Whitfield Family Trust' })
    render(<MemoryRouter><EntitiesPage magicPatternDesigns /></MemoryRouter>)

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
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Add entity' })).toBeNull()
    })
  })

  it('distinguishes a holding partnership from an investment partnership', async () => {
    render(<MemoryRouter><EntitiesPage magicPatternDesigns /></MemoryRouter>)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add entity' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Entity type' }))
    })

    expect(screen.getByRole('option', { name: 'Holding Partnership / Family LP' })).toBeTruthy()
    expect(screen.queryByRole('option', { name: 'Partnership', exact: true })).toBeNull()
  })

  it('matches the prototype add dialog fields, guidance, and custom validation', async () => {
    render(<MemoryRouter><EntitiesPage magicPatternDesigns /></MemoryRouter>)

    fireEvent.click(screen.getByRole('button', { name: 'Add entity' }))

    expect(screen.getByRole('dialog', { name: 'Add entity' })).toBeTruthy()
    expect(
      screen.getByText(
        'The entity is created as a draft. Link owners, partnerships, and investments after it is saved.',
      ),
    ).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Legal name' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Entity type' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Jurisdiction' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Tax ID (EIN)' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Formation date' })).toBeTruthy()
    expect(
      screen.getByText('Leave blank if the EIN letter has not been received.'),
    ).toBeTruthy()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create entity' }))
    })

    expect(await screen.findByText('Legal name is required.')).toBeTruthy()
    expect(screen.getByText('Jurisdiction of formation is required.')).toBeTruthy()
    expect(create).not.toHaveBeenCalled()
  })

  it('matches the prototype row menu without an invented rename action', () => {
    render(<MemoryRouter><EntitiesPage magicPatternDesigns /></MemoryRouter>)

    fireEvent.click(screen.getByRole('button', { name: 'Row actions' }))
    expect(screen.getByRole('menuitem', { name: 'Open entity' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Remove entity' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Rename entity' })).toBeNull()
  })

  it('uses the prototype alert dialog before removing a flagged entity row', async () => {
    remove.mockResolvedValue(undefined)
    render(<MemoryRouter><EntitiesPage magicPatternDesigns /></MemoryRouter>)

    fireEvent.click(screen.getByRole('button', { name: 'Row actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove entity' }))

    expect(
      screen.getByRole('alertdialog', { name: 'Remove Jackson Family Trust?' }),
    ).toBeTruthy()
    expect(screen.getByText(/along with its links to owners, partnerships, and investments/i)).toBeTruthy()
    expect(remove).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove entity' }))
    })
    await waitFor(() => expect(remove).toHaveBeenCalledWith('e-1'))
  })
})
