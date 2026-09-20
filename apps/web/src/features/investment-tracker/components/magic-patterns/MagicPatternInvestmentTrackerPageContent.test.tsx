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

vi.mock('../../../k1/components/K1UploadDialog', () => ({
  K1UploadDialog: ({
    open,
    createPartnershipIfMissing,
    onBatchCreated,
  }: {
    open: boolean
    createPartnershipIfMissing?: boolean
    onBatchCreated: (batch: { id: string }) => void
  }) => open ? (
    <div role="dialog" aria-label="Add partnership from K-1">
      <output aria-label="K-1 partnership import">{String(createPartnershipIfMissing)}</output>
      <button type="button" onClick={() => onBatchCreated({ id: 'batch-new' })}>Upload K-1</button>
    </div>
  ) : null,
}))

vi.mock('../../../partnership-tracker/components/magic-patterns/MagicPatternPartnershipWorkspace', () => ({
  MagicPatternPartnershipWorkspace: ({
    detail,
    area,
    selectedYear,
    onAreaChange,
    onYearChange,
    onBack,
  }: {
    detail: { id: string }
    area: string
    selectedYear?: number
    onAreaChange: (area: 'capital-activity' | 'k1-history') => void
    onYearChange: (year: number) => void
    onBack: () => void
  }) => (
    <section
      aria-label="Partnership management"
      data-area={area}
      data-year={selectedYear === undefined ? 'unset' : String(selectedYear)}
    >
      Workspace {detail.id}
      <button type="button" onClick={() => onAreaChange('capital-activity')}>Open capital activity</button>
      <button type="button" onClick={() => onAreaChange('k1-history')}>Open K-1 history</button>
      <button type="button" onClick={() => onYearChange(2024)}>Choose 2024</button>
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

vi.mock('../../../k1/hooks/useK1Queries', () => ({
  useK1Batch: () => ({ data: undefined, isError: false, refetch: vi.fn() }),
}))

function CurrentLocation() {
  const location = useLocation()
  return <output aria-label="Current location">{location.pathname}{location.search}</output>
}

function renderTracker(canEdit = true, initialEntry = '/investment-tracker') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
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
    expect(screen.getByRole('status', { name: 'Current location' })).toHaveTextContent('/investment-tracker?partnership=p-row&area=capital-activity')
  })

  it('creates a partnership and opens its management workspace', async () => {
    const user = userEvent.setup()
    renderTracker()

    await user.click(screen.getByRole('button', { name: 'Add partnership' }))
    await user.click(screen.getByRole('button', { name: /Enter details manually/i }))
    await user.click(screen.getByRole('button', { name: 'Create partnership' }))

    expect(screen.getByRole('region', { name: 'Partnership management' })).toHaveTextContent('Workspace p-new')
  })

  it('offers a K-1-first partnership creation path with duplicate safeguards', async () => {
    const user = userEvent.setup()
    renderTracker()

    await user.click(screen.getByRole('button', { name: 'Add partnership' }))
    expect(screen.getByText(/Existing records are reused automatically/i)).toBeInTheDocument()
    expect(screen.getByText(/Conflicting matches stop for review/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Use a K-1 PDF/i }))
    expect(screen.getByRole('dialog', { name: 'Add partnership from K-1' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'K-1 partnership import' })).toHaveTextContent('true')
  })

  it('does not show partnership creation in read-only mode', () => {
    renderTracker(false)

    expect(screen.queryByRole('button', { name: 'Add partnership' })).not.toBeInTheDocument()
  })

  it.each([
    ['overview', 'capital-activity'],
    ['cash-activity', 'capital-activity'],
    ['k1', 'k1-history'],
    ['capital', 'capital-activity'],
    ['valuations', 'capital-activity'],
    ['assets', 'underlying-assets'],
  ])('maps the legacy %s area alias to %s', (alias, expectedArea) => {
    renderTracker(true, `/investment-tracker?partnership=p-1&area=${alias}`)
    expect(screen.getByRole('region', { name: 'Partnership management' })).toHaveAttribute(
      'data-area',
      expectedArea,
    )
  })

  it.each([
    ['2025', '2025'],
    ['1899', 'unset'],
    ['2101', 'unset'],
    ['2025.5', 'unset'],
    ['not-a-year', 'unset'],
  ])('validates the selected workspace year %s', (year, expectedYear) => {
    renderTracker(true, `/investment-tracker?partnership=p-1&area=k1-history&year=${year}`)
    expect(screen.getByRole('region', { name: 'Partnership management' })).toHaveAttribute(
      'data-year',
      expectedYear,
    )
  })

  it('preserves the partnership while canonical workspace changes update area and year state', async () => {
    const user = userEvent.setup()
    renderTracker(true, '/investment-tracker?partnership=p-1&area=k1&year=2025')

    expect(screen.getByRole('region', { name: 'Partnership management' })).toHaveAttribute(
      'data-area',
      'k1-history',
    )
    expect(screen.getByRole('region', { name: 'Partnership management' })).toHaveAttribute(
      'data-year',
      '2025',
    )

    await user.click(screen.getByRole('button', { name: 'Open capital activity' }))
    let location = new URL(`https://atlas.test${screen.getByRole('status', { name: 'Current location' }).textContent}`)
    expect(location.pathname).toBe('/investment-tracker')
    expect(location.searchParams.get('partnership')).toBe('p-1')
    expect(location.searchParams.get('area')).toBe('capital-activity')
    expect(location.searchParams.has('year')).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Choose 2024' }))
    location = new URL(`https://atlas.test${screen.getByRole('status', { name: 'Current location' }).textContent}`)
    expect(location.searchParams.get('partnership')).toBe('p-1')
    expect(location.searchParams.get('area')).toBe('k1-history')
    expect(location.searchParams.get('year')).toBe('2024')
  })
})
