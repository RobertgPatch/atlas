import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PartnershipTrackerPageContent } from '../components/PartnershipTrackerPageContent'
import { summaryFixture } from './fixtures'

const update = vi.fn()
const remove = vi.fn().mockResolvedValue(undefined)
vi.mock('../hooks/usePartnershipTracker', () => ({
  usePartnershipTrackerList: () => ({ data: { items: [summaryFixture], total: 1, nextCursor: null }, isLoading: false, isError: false }),
  usePartnershipTrackerDetail: () => ({ data: { summary: summaryFixture, years: [], cashFlowEvents: [], commitments: [], navEntries: [], permissions: { canEditPartnership: true, canEditK1: true, canEditCommitment: true, canEditNav: true, canSignoff: true } }, isLoading: false, isError: false, refetch: vi.fn() }),
  usePartnershipTrackerActions: () => ({ createPartnership: { mutateAsync: vi.fn(), isPending: false }, updatePartnership: { mutateAsync: update, isPending: false }, deletePartnership: { mutateAsync: remove, isPending: false } }),
}))
vi.mock('../../partnerships/hooks/useEntityQueries', () => ({ useEntityList: () => ({ data: { items: [{ id: 'e-1', name: 'Jackson Family Trust' }] }, isLoading: false, isError: false }) }))
vi.mock('../components/K1BasisWorkspace', () => ({
  K1BasisWorkspace: ({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) => (
    <button type="button" onClick={() => onDirtyChange(true)}>Make K-1 changes</button>
  ),
}))

describe('PartnershipTrackerPageContent', () => {
  beforeEach(() => { update.mockReset(); remove.mockClear() })
  it('renders searchable selection and the revised four-area workspace', () => {
    render(<MemoryRouter initialEntries={['/partnership-tracker?partnership=p-1']}><PartnershipTrackerPageContent canEdit /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Partnership Tracker' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Partnership workspace' })).toHaveValue('Redwood Fund')
    const layout = screen.getByTestId('partnership-workspace-layout')
    expect(layout).toHaveClass('min-w-0', 'space-y-4')
    expect(layout).not.toHaveClass('grid', 'xl:grid-cols-[20rem_minmax(0,1fr)]')
    expect(screen.getByTestId('partnership-selector').nextElementSibling).toBe(screen.getByRole('main', { name: 'Selected partnership workspace' }))
    expect(screen.getByTestId('partnership-selector-controls')).toHaveClass('sm:items-start')
    expect(screen.getByRole('combobox', { name: 'Partnership workspace' })).toHaveClass('h-11')
    expect(within(screen.getByTestId('partnership-selector')).getByRole('button', { name: 'Add' })).toHaveClass('h-11')
    expect(screen.getAllByText('Redwood Fund').length).toBeGreaterThan(0)
    const workspaceHeader = screen.getByTestId('partnership-workspace-header')
    const tabs = screen.getByRole('tablist', { name: 'Partnership Tracker areas' })
    expect(workspaceHeader.nextElementSibling).toBe(tabs)
    expect(within(workspaceHeader).getByRole('button', { name: 'Edit Partnership' })).toBeInTheDocument()
    expect(within(workspaceHeader).getByRole('button', { name: 'Delete partnership' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'K1 & Cash Activity' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Capital & NAV' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Underlying Assets' })).toBeInTheDocument()
    expect(screen.getAllByText('$1,000,000').length).toBeGreaterThan(0)
    expect(screen.getByText('Paid-in capital')).toBeInTheDocument()
    expect(screen.getByText('Distributions')).toBeInTheDocument()
    expect(screen.getByText('Capital account')).toBeInTheDocument()
    expect(screen.getByText('DPI')).toBeInTheDocument()
    expect(screen.getByText('TVPI')).toBeInTheDocument()
    expect(screen.getByText('XIRR')).toBeInTheDocument()
  })
  it('restores the read-only Underlying Assets area from the URL', () => {
    render(<MemoryRouter initialEntries={['/partnership-tracker?partnership=p-1&area=assets']}><PartnershipTrackerPageContent canEdit /></MemoryRouter>)
    expect(screen.getByRole('tab', { name: 'Underlying Assets' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { name: 'Underlying Assets' })).toBeInTheDocument()
    expect(screen.getByText('Coming soon')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add asset/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit Partnership' })).toBeInTheDocument()
  })
  it('opens the identity editor from the shared workspace header', () => {
    render(<MemoryRouter initialEntries={['/partnership-tracker?partnership=p-1&area=assets']}><PartnershipTrackerPageContent canEdit /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Edit Partnership' }))
    expect(screen.getByRole('dialog', { name: 'Edit partnership' })).toBeInTheDocument()
  })
  it('requires confirmation before cascading partnership deletion', async () => {
    render(<MemoryRouter initialEntries={['/partnership-tracker?partnership=p-1']}><PartnershipTrackerPageContent canEdit /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Delete partnership' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete Redwood Fund?' })
    expect(within(dialog).getByText(/every child record inside it/i)).toBeInTheDocument()
    expect(remove).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete partnership' }))
    await waitFor(() => expect(remove).toHaveBeenCalledWith('p-1'))
  })
  it('uses the application confirmation dialog before discarding K-1 edits', async () => {
    const browserConfirm = vi.spyOn(window, 'confirm')
    render(<MemoryRouter initialEntries={['/partnership-tracker?partnership=p-1&area=k1']}><PartnershipTrackerPageContent canEdit /></MemoryRouter>)

    fireEvent.click(screen.getByRole('button', { name: 'Make K-1 changes' }))
    expect(screen.getByRole('tab', { name: 'K1 & Cash Activity' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(screen.getByRole('tab', { name: 'Overview' }))

    expect(screen.getByRole('dialog', { name: 'Discard unsaved K-1 changes?' })).toBeInTheDocument()
    expect(browserConfirm).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Discard unsaved K-1 changes?' })).not.toBeInTheDocument())
    expect(screen.getByRole('tab', { name: 'K1 & Cash Activity' })).toHaveAttribute('aria-selected', 'true')

    fireEvent.click(screen.getByRole('tab', { name: 'Overview' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true'))
    browserConfirm.mockRestore()
  })
})
