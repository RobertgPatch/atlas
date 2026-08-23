import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
vi.mock('../../k1/components/K1PartnershipIntakeRail', () => ({
  K1PartnershipIntakeRail: ({ onUpload }: { onUpload: () => void }) => <aside aria-label="K-1 document workflow"><button type="button" onClick={onUpload}>Upload K-1 PDFs</button></aside>,
}))
vi.mock('../../k1/components/K1UploadDialog', () => ({
  K1UploadDialog: ({ entityScope }: { entityScope: { id: string; name: string } }) => <div role="dialog" aria-label="Upload K-1 documents">Uploading for {entityScope.name}</div>,
}))
vi.mock('../components/DatedCashFlowPanel', () => ({ DatedCashFlowPanel: () => <div>Cash activity</div> }))

const mutation = () => ({ mutateAsync: vi.fn(), isPending: false })
const detail: PartnershipTrackerDetail = {
  summary: summaryFixture,
  years: yearSummaryFixtures(4),
  cashFlowEvents: [],
  commitments: [],
  navEntries: [],
  permissions: { canEditPartnership: true, canEditK1: true, canEditCommitment: true, canEditNav: true, canSignoff: true },
}
let trackerActions: ReturnType<typeof usePartnershipTrackerActions>

describe('K1BasisWorkspace year actions', () => {
  beforeEach(() => {
    vi.mocked(usePartnershipTrackerYear).mockReturnValue({ data: k1EntryDetailFixture, isLoading: false, isError: false } as ReturnType<typeof usePartnershipTrackerYear>)
    trackerActions = {
      createYear: mutation(),
      calculate: mutation(),
      updateYear: mutation(),
      deleteYear: mutation(),
      deleteYears: mutation(),
      createCashFlows: mutation(),
      deleteCashFlow: mutation(),
      signoff: mutation(),
    } as unknown as ReturnType<typeof usePartnershipTrackerActions>
    vi.mocked(usePartnershipTrackerActions).mockReturnValue(trackerActions)
  })

  it('selects multiple K-1 entry years and deletes them in one confirmed action', async () => {
    render(<K1BasisWorkspace detail={detail} selectedYear={2024} canEdit onSelectYear={vi.fn()} onDirtyChange={vi.fn()} />)

    const actions = screen.getByRole('group', { name: 'K-1 year actions' })
    expect(within(actions).getByRole('button', { name: 'Select years' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'K-1 tax data and outside basis' })).toBeInTheDocument()

    fireEvent.click(within(actions).getByRole('button', { name: 'Select years' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select 2024 K-1 year' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select 2022 K-1 year' }))
    expect(screen.getByRole('status')).toHaveTextContent('2 selected')

    fireEvent.click(screen.getByRole('button', { name: 'Delete selected (2)' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete 2 K-1 years?' })
    expect(within(dialog).getByText(/2022, 2024/)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete 2 years' }))

    await waitFor(() => expect(trackerActions.deleteYears.mutateAsync).toHaveBeenCalledWith({
      id: 'p-1',
      years: [
        { year: 2024, expectedRevision: 1 },
        { year: 2022, expectedRevision: 1 },
      ],
    }))
  })

  it('maps the Magic Patterns K-1 History hierarchy without duplicating operational cash entry', () => {
    render(<K1BasisWorkspace appearance="magic-pattern" detail={detail} selectedYear={2024} canEdit onSelectYear={vi.fn()} onDirtyChange={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'K-1 entry and outside basis' })).toBeInTheDocument()
    expect(screen.getByText(/Upload one or more K-1 PDFs/)).toBeInTheDocument()
    expect(screen.getAllByRole('tablist', { name: 'Tax year' })).toHaveLength(1)
    expect(screen.getByRole('tablist', { name: 'Tax year' })).toHaveClass('overflow-x-auto')
    expect(screen.getByRole('button', { name: 'Add tax year' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Select years' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'K-1 document workflow' })).toBeInTheDocument()
    expect(screen.queryByText('Cash activity', { selector: 'div' })).not.toBeInTheDocument()
    expect(screen.queryByText('K-1 results')).not.toBeInTheDocument()

    const actions = screen.getByRole('group', { name: 'K-1 year actions' })
    fireEvent.click(within(actions).getByRole('button', { name: 'Upload K-1 PDFs' }))
    expect(screen.getByRole('dialog', { name: 'Upload K-1 documents' })).toHaveTextContent('Uploading for Jackson Family Trust')
  })
})
