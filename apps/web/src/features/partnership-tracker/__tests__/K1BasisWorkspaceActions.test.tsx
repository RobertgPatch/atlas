import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PartnershipTrackerDetail } from '../../../../../../packages/types/src/partnership-tracker'
import { K1BasisWorkspace } from '../components/K1BasisWorkspace'
import { usePartnershipTrackerActions, usePartnershipTrackerYear } from '../hooks/usePartnershipTracker'
import { k1EntryDetailFixture, summaryFixture, yearSummaryFixtures } from './fixtures'

vi.mock('../hooks/usePartnershipTracker', () => ({
  usePartnershipTrackerActions: vi.fn(),
  usePartnershipTrackerYear: vi.fn(),
}))
vi.mock('../../k1-tracker/components/K1YearEntryForm', () => ({ K1YearEntryForm: () => <div>K-1 entry form</div> }))
vi.mock('../../k1-tracker/components/K1YearResults', () => ({ K1YearResults: () => <div>K-1 results</div> }))
vi.mock('../components/DatedCashFlowPanel', () => ({ DatedCashFlowPanel: () => <div>Cash activity</div> }))

const mutation = () => ({ mutateAsync: vi.fn(), isPending: false })
const detail: PartnershipTrackerDetail = {
  summary: summaryFixture,
  years: yearSummaryFixtures(4),
  commitments: [],
  navEntries: [],
  permissions: { canEditPartnership: true, canEditK1: true, canEditCommitment: true, canEditNav: true, canSignoff: true },
}

describe('K1BasisWorkspace year actions', () => {
  beforeEach(() => {
    vi.mocked(usePartnershipTrackerYear).mockReturnValue({ data: k1EntryDetailFixture, isLoading: false, isError: false } as ReturnType<typeof usePartnershipTrackerYear>)
    vi.mocked(usePartnershipTrackerActions).mockReturnValue({
      createYear: mutation(),
      calculate: mutation(),
      updateYear: mutation(),
      deleteYear: mutation(),
      createCashFlows: mutation(),
      deleteCashFlow: mutation(),
      signoff: mutation(),
    } as ReturnType<typeof usePartnershipTrackerActions>)
  })

  it('groups Delete year with the other year-level actions', () => {
    render(<K1BasisWorkspace detail={detail} selectedYear={2024} canEdit onSelectYear={vi.fn()} onDirtyChange={vi.fn()} />)

    const actions = screen.getByRole('group', { name: 'K-1 year actions' })
    expect(within(actions).getByRole('button', { name: 'Compare years' })).toBeInTheDocument()
    expect(within(actions).getByRole('button', { name: 'Delete year' })).toBeInTheDocument()
    expect(within(actions).getByRole('button', { name: 'Add year' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'K-1 tax data and outside basis' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Delete year' })).toHaveLength(1)

    fireEvent.click(within(actions).getByRole('button', { name: 'Delete year' }))
    expect(screen.getByRole('dialog', { name: 'Delete the 2024 K-1 year?' })).toBeInTheDocument()
  })

  it('maps the Magic Patterns K-1 History hierarchy without duplicating operational cash entry', () => {
    render(<K1BasisWorkspace appearance="magic-pattern" detail={detail} selectedYear={2024} canEdit onSelectYear={vi.fn()} onDirtyChange={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'K-1 entry and outside basis' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'K-1 tax history' })).toBeInTheDocument()
    expect(screen.getByText('Enter the values reported on each K-1 document. Operational cash activity is maintained separately.')).toBeInTheDocument()
    expect(screen.getAllByRole('tablist', { name: 'Tax year' })).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Add any year' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete 2024' })).toBeInTheDocument()
    expect(screen.queryByText('Cash activity', { selector: 'div' })).not.toBeInTheDocument()
    expect(screen.queryByText('K-1 results')).not.toBeInTheDocument()
  })
})
