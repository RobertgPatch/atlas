import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PartnershipTrackerPageContent } from '../components/PartnershipTrackerPageContent'
import { summaryFixture } from './fixtures'

const update = vi.fn()
vi.mock('../hooks/usePartnershipTracker', () => ({
  usePartnershipTrackerList: () => ({ data: { items: [summaryFixture], total: 1, nextCursor: null }, isLoading: false, isError: false }),
  usePartnershipTrackerDetail: () => ({ data: { summary: summaryFixture, years: [], commitments: [], navEntries: [], permissions: { canEditPartnership: true, canEditK1: true, canEditCommitment: true, canEditNav: true, canSignoff: true } }, isLoading: false, isError: false, refetch: vi.fn() }),
  usePartnershipTrackerActions: () => ({ createPartnership: { mutateAsync: vi.fn(), isPending: false }, updatePartnership: { mutateAsync: update, isPending: false } }),
}))
vi.mock('../../partnerships/hooks/useEntityQueries', () => ({ useEntityList: () => ({ data: { items: [{ id: 'e-1', name: 'Atlas Family Trust' }] }, isLoading: false, isError: false }) }))

describe('PartnershipTrackerPageContent', () => {
  beforeEach(() => update.mockReset())
  it('renders searchable selection and the bounded three-area workspace', () => {
    render(<MemoryRouter initialEntries={['/partnership-tracker?partnership=p-1']}><PartnershipTrackerPageContent canEdit /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Partnership Tracker' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Search partnerships' })).toBeInTheDocument()
    expect(screen.getAllByText('Redwood Fund').length).toBeGreaterThan(0)
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'K-1 & Basis' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Capital & NAV' })).toBeInTheDocument()
    expect(screen.getAllByText('$1,000,000.00').length).toBeGreaterThan(0)
    expect(screen.getByText('Paid-in capital')).toBeInTheDocument()
    expect(screen.getByText('Distributions')).toBeInTheDocument()
    expect(screen.getByText('Capital account')).toBeInTheDocument()
    expect(screen.getByText('DPI')).toBeInTheDocument()
    expect(screen.getByText('TVPI')).toBeInTheDocument()
    expect(screen.getByText('IRR')).toBeInTheDocument()
  })
  it('opens the identity editor from Overview', () => {
    render(<MemoryRouter initialEntries={['/partnership-tracker?partnership=p-1']}><PartnershipTrackerPageContent canEdit /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Edit partnership' }))
    expect(screen.getByRole('dialog', { name: 'Edit partnership' })).toBeInTheDocument()
  })
})
