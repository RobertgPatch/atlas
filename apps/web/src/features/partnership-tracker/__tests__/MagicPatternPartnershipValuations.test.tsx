import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PartnershipTrackerDetail } from '../../../../../../packages/types/src/partnership-tracker'
import { MagicPatternPartnershipValuations } from '../components/magic-patterns/MagicPatternPartnershipWorkspace'
import { navFixtures, summaryFixture } from './fixtures'

vi.mock('../hooks/usePartnershipTracker', () => ({
  usePartnershipTrackerActions: () => ({
    deleteNav: { isPending: false, mutateAsync: vi.fn() },
  }),
}))

const detail = {
  summary: summaryFixture,
  years: [],
  cashFlowEvents: [],
  commitments: [],
  navEntries: navFixtures,
} as unknown as PartnershipTrackerDetail

describe('MagicPatternPartnershipValuations', () => {
  it('summarizes the partnership valuation history in one table', () => {
    render(<MagicPatternPartnershipValuations detail={detail} canEdit={false} />)

    const summary = screen.getByRole('table', { name: 'Valuation summary for Redwood Fund' })
    expect(within(summary).getByText('Latest NAV / FMV')).toBeInTheDocument()
    expect(within(summary).getByText('$950,000.00')).toBeInTheDocument()
    expect(within(summary).getByText('Change from previous')).toBeInTheDocument()
    expect(within(summary).getByText('+8.6%')).toBeInTheDocument()
    expect(within(summary).getByText('Valuations on file')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'NAV and fair market value history' })).toBeInTheDocument()
  })
})
