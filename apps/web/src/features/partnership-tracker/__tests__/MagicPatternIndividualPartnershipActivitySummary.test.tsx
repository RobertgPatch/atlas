import { render, screen, within } from '@testing-library/react'
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
  it.each(['overview', 'capital-activity'] as const)('shows capital metrics, yield, ledger, and supporting details for %s', (area) => {
    render(<MagicPatternPartnershipWorkspace detail={detail} canEdit={false} area={area}
      onAreaChange={vi.fn()} onYearChange={vi.fn()} onBack={vi.fn()} onDeleted={vi.fn()} />)

    const summary = screen.getByRole('table', { name: 'Investment Performance for Redwood Fund' })
    expect(within(summary).getByText('Paid-in capital (contributions)')).toBeInTheDocument()
    expect(within(summary).getByText('Net MOIC / DPI (x)')).toBeInTheDocument()
    expect(within(summary).getByText('Net XIRR incl. residual value')).toBeInTheDocument()
    const yieldRow = within(summary).getByRole('row', { name: /Cash-on-cash yield/ })
    expect(yieldRow).toHaveTextContent('5.0%')
    expect(yieldRow).toHaveTextContent('Called capital ÷ gross distributions')
    expect(screen.getAllByText('Cash-on-cash yield')).toHaveLength(1)
    expect(screen.queryByRole('table', { name: 'Partnership activity summary for Redwood Fund' })).not.toBeInTheDocument()
    expect(screen.getByRole('table', { name: /Capital activity: dated capital calls/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Financial commitment history' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'NAV / FMV over time' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Fund and owner details' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Relationships' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Overview' })).not.toBeInTheDocument()
  })
})
