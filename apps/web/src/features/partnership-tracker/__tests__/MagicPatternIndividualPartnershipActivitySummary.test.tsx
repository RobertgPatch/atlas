import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PartnershipTrackerDetail } from '../../../../../../packages/types/src/partnership-tracker'
import { MagicPatternPartnershipWorkspace } from '../components/magic-patterns/MagicPatternPartnershipWorkspace'
import { commitmentFixtures, investmentPerformanceFixture, k1CashActivityDetailFixture, navFixtures, summaryFixture } from './fixtures'

vi.mock('../components/magic-patterns/MagicPatternRelationshipsPanel', () => ({
  MagicPatternRelationshipsPanel: () => <section aria-label="Relationships" />,
}))
vi.mock('../hooks/usePartnershipTracker', () => ({
  usePartnershipTrackerActions: () => ({
    deletePartnership: { isPending: false, mutateAsync: vi.fn() },
    deleteCashFlow: { isPending: false, mutateAsync: vi.fn() },
    deleteNav: { isPending: false, mutateAsync: vi.fn() },
  }),
}))

const detail = {
  investmentPerformance: investmentPerformanceFixture,
  summary: summaryFixture,
  years: [{ taxYear: 2024 }],
  cashFlowEvents: k1CashActivityDetailFixture.cashFlowEvents,
  commitments: commitmentFixtures,
  navEntries: navFixtures,
} as unknown as PartnershipTrackerDetail

describe('Consolidated partnership workspace', () => {
  it.each(['overview', 'capital-activity'] as const)('shows only the partnership profile, relationships, and commitment history for %s', (area) => {
    render(<MagicPatternPartnershipWorkspace detail={detail} canEdit={false} area={area}
      onAreaChange={vi.fn()} onYearChange={vi.fn()} onBack={vi.fn()} />)

    expect(screen.queryByRole('table', { name: /Investment Performance/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('table', { name: /Capital activity: dated capital calls/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'K-1 History' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Financial commitment history' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'NAV / FMV over time' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Fund and owner details' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Relationships' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Cash activity' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Investment value bridge' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Overview' })).not.toBeInTheDocument()
  })

  it('keeps the edit actions while removing the partnership delete action', () => {
    render(<MagicPatternPartnershipWorkspace detail={detail} canEdit area="capital-activity"
      onAreaChange={vi.fn()} onYearChange={vi.fn()} onBack={vi.fn()} />)

    const edit = screen.getByRole('button', { name: 'Edit partnership details' })
    expect(screen.getByRole('heading', { level: 1, name: 'Redwood Fund' }).parentElement).toContainElement(edit)
    fireEvent.mouseEnter(edit)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Edit partnership details')
    fireEvent.mouseLeave(edit)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    fireEvent.focus(edit)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Edit partnership details')
    fireEvent.keyDown(edit, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add activity' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add entry' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Record activity' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete partnership' })).not.toBeInTheDocument()
  })
})
