import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PartnershipTrackerDetail } from '../../../../../../packages/types/src/partnership-tracker'
import { MagicPatternPartnershipWorkspace } from '../components/magic-patterns/MagicPatternPartnershipWorkspace'
import { summaryFixture } from './fixtures'

vi.mock('../hooks/usePartnershipTracker', () => ({
  usePartnershipTrackerActions: () => ({
    deletePartnership: { isPending: false, mutateAsync: vi.fn() },
    createCommitment: { isPending: false, mutateAsync: vi.fn() },
    updateCommitment: { isPending: false, mutateAsync: vi.fn() },
  }),
}))

vi.mock('../components/magic-patterns/MagicPatternRelationshipsPanel', () => ({
  MagicPatternRelationshipsPanel: () => null,
}))

const detail = {
  summary: summaryFixture,
  years: [],
  cashFlowEvents: [],
  commitments: [],
  navEntries: [],
} as unknown as PartnershipTrackerDetail

describe('MagicPatternPartnershipWorkspace scrolling', () => {
  it('lets the application shell own vertical scrolling', () => {
    render(
      <MagicPatternPartnershipWorkspace
        detail={detail}
        canEdit={false}
        area="overview"
        onAreaChange={vi.fn()}
        onYearChange={vi.fn()}
        onBack={vi.fn()}
        onDeleted={vi.fn()}
      />,
    )

    const workspace = screen.getByTestId('magic-partnership-workspace')
    expect(workspace.className).not.toContain('100vh')
    expect(workspace).not.toHaveClass('overflow-y-auto', 'overflow-auto')
  })
})
