import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { MagicPatternInvestmentTrackerPageContent } from './MagicPatternInvestmentTrackerPageContent'

vi.mock('../../../partnership-tracker/components/magic-patterns/MagicPatternCapitalActivityPortfolio', () => ({
  MagicPatternCapitalActivityPortfolio: ({ onOpen }: { onOpen: (id: string) => void }) => (
    <section aria-label="Portfolio capital activity">
      Capital activity portfolio
      <button type="button" onClick={() => onOpen('p-row')}>Open partnership row</button>
    </section>
  ),
}))

vi.mock('../../../partnership-tracker/components/magic-patterns/MagicPatternPartnershipRecordDialog', () => ({
  MagicPatternPartnershipRecordDialog: ({ onCreated }: { onCreated: (id: string) => void }) => (
    <div role="dialog" aria-label="Add partnership">
      <button type="button" onClick={() => onCreated('p-new')}>Create partnership</button>
    </div>
  ),
}))

vi.mock('../../../partnership-tracker/components/magic-patterns/MagicPatternPartnershipWorkspace', () => ({
  MagicPatternPartnershipWorkspace: ({ detail, onBack }: { detail: { id: string }; onBack: () => void }) => (
    <section aria-label="Partnership management">
      Workspace {detail.id}
      <button type="button" onClick={onBack}>Investment tracker</button>
    </section>
  ),
}))

vi.mock('../../../partnership-tracker/hooks/usePartnershipTracker', () => ({
  usePartnershipTrackerDetail: (id?: string) => ({
    data: id ? { id } : undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}))

function CurrentLocation() {
  const location = useLocation()
  return <output aria-label="Current location">{location.pathname}{location.search}</output>
}

function renderTracker(canEdit = true) {
  return render(
    <MemoryRouter initialEntries={['/investment-tracker']}>
      <MagicPatternInvestmentTrackerPageContent canEdit={canEdit} />
      <CurrentLocation />
    </MemoryRouter>,
  )
}

describe('MagicPatternInvestmentTrackerPageContent', () => {
  it('presents the combined partnership and investment register', () => {
    renderTracker()

    expect(screen.getByRole('heading', { name: 'Investment tracker' })).toBeInTheDocument()
    expect(screen.getByText(/Create and manage partnerships, review portfolio-wide activity/i)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Portfolio capital activity' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add partnership' })).toBeInTheDocument()
  })

  it('opens partnership management from an investment row', async () => {
    const user = userEvent.setup()
    renderTracker()

    await user.click(screen.getByRole('button', { name: 'Open partnership row' }))

    expect(screen.getByRole('region', { name: 'Partnership management' })).toHaveTextContent('Workspace p-row')
    expect(screen.getByRole('status', { name: 'Current location' })).toHaveTextContent('/investment-tracker?partnership=p-row&area=overview')
  })

  it('creates a partnership and opens its management workspace', async () => {
    const user = userEvent.setup()
    renderTracker()

    await user.click(screen.getByRole('button', { name: 'Add partnership' }))
    await user.click(screen.getByRole('button', { name: 'Create partnership' }))

    expect(screen.getByRole('region', { name: 'Partnership management' })).toHaveTextContent('Workspace p-new')
  })

  it('does not show partnership creation in read-only mode', () => {
    renderTracker(false)

    expect(screen.queryByRole('button', { name: 'Add partnership' })).not.toBeInTheDocument()
  })
})
