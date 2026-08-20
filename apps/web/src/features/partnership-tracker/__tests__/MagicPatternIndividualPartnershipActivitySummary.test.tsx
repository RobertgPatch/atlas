import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PartnershipTrackerDetail } from '../../../../../../packages/types/src/partnership-tracker'
import { MagicPatternPartnershipOverview } from '../components/magic-patterns/MagicPatternPartnershipWorkspace'
import {
  commitmentFixtures,
  k1CashActivityDetailFixture,
  navFixtures,
  summaryFixture,
} from './fixtures'

vi.mock('../components/magic-patterns/MagicPatternRelationshipsPanel', () => ({
  MagicPatternRelationshipsPanel: () => <section aria-label="Relationships" />,
}))

const detail = {
  summary: summaryFixture,
  years: [{ taxYear: 2024 }],
  cashFlowEvents: k1CashActivityDetailFixture.cashFlowEvents,
  commitments: commitmentFixtures,
  navEntries: navFixtures,
} as unknown as PartnershipTrackerDetail

describe('Magic Patterns individual partnership activity summary', () => {
  it('combines the selected partnership activity and performance into one table', () => {
    render(
      <MagicPatternPartnershipOverview
        detail={detail}
        cashFlows={detail.cashFlowEvents}
        canEdit={false}
        onGo={vi.fn()}
      />,
    )

    const summary = screen.getByRole('table', {
      name: 'Partnership activity summary for Redwood Fund',
    })

    expect(within(summary).getByText('Capital activity')).toBeInTheDocument()
    expect(within(summary).getByText('Performance')).toBeInTheDocument()
    expect(within(summary).getByText('Capital called')).toBeInTheDocument()
    expect(within(summary).getByText('($250,000.00)')).toBeInTheDocument()
    expect(within(summary).getByText('Non-recallable distributions')).toBeInTheDocument()
    expect(within(summary).getByText('$40,000.00')).toBeInTheDocument()
    expect(within(summary).getByText('Recallable distributions')).toBeInTheDocument()
    expect(within(summary).getByText('$10,000.00')).toBeInTheDocument()
    expect(within(summary).getByText('Committed capital')).toBeInTheDocument()
    expect(within(summary).getByText('DPI')).toBeInTheDocument()
    expect(within(summary).getByText('TVPI')).toBeInTheDocument()
    expect(within(summary).getByText('XIRR')).toBeInTheDocument()
    expect(within(summary).getByText('Cash-on-cash yield')).toBeInTheDocument()
    expect(screen.queryByText('Current investment position')).not.toBeInTheDocument()
    expect(screen.queryByText('Calculated performance')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Financial commitment history' })).toBeInTheDocument()
  })
})
