import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PartnershipAggregationResponse } from '../../../../../../../packages/types/src/partnership-tracker'
import { MagicPatternInvestmentTrackerPageContent } from './MagicPatternInvestmentTrackerPageContent'

const member = (
  id: string,
  ownerId: string,
  ownerName: string,
  values: { commitment: number; invested: number; distributions: number; nav: number },
) => ({
  partnership: {
    id,
    entity: { id: ownerId, name: ownerName },
    name: id.startsWith('one') ? 'Fund One' : 'Fund Two',
    partnershipType: id.startsWith('one') ? 'Real Estate' : 'Private Equity',
    status: 'ACTIVE',
    inceptionDate: id.startsWith('one') ? '2020-01-01' : '2022-01-01',
    fundManager: id.startsWith('one') ? 'Manager One' : 'Manager Two',
  },
  currentCommittedCapital: { amount: String(values.commitment), date: '2026-01-01' },
  totalCapitalContributions: String(values.invested),
  totalDistributions: String(values.distributions),
  latestNav: { amount: String(values.nav), date: '2026-06-30' },
  unfundedCommitmentAmount: String(values.commitment - values.invested),
  performanceAsOfDate: '2026-06-30',
})

const data = {
  rollup: { asOfDate: '2026-06-30' },
  items: [
    {
      groupKey: 'fund-one',
      name: 'Fund One',
      members: [
        member('one-a', 'owner-a', 'Alpha Trust', { commitment: 150, invested: 100, distributions: 20, nav: 120 }),
        member('one-b', 'owner-b', 'Bravo LLC', { commitment: 250, invested: 200, distributions: 40, nav: 260 }),
      ],
    },
    {
      groupKey: 'fund-two',
      name: 'Fund Two',
      members: [
        member('two-a', 'owner-a', 'Alpha Trust', { commitment: 500, invested: 400, distributions: 50, nav: 450 }),
      ],
    },
  ],
} as unknown as PartnershipAggregationResponse

const refetch = vi.fn()

vi.mock('../../hooks/useInvestmentTrackerData', () => ({
  useInvestmentTrackerData: () => ({ data, isLoading: false, isError: false, refetch }),
}))

vi.mock('../../../partnerships/hooks/useEntityQueries', () => ({
  useEntityList: () => ({
    data: {
      items: [
        { id: 'owner-a', entityType: 'Trust' },
        { id: 'owner-b', entityType: 'LLC' },
      ],
    },
  }),
}))

vi.mock('../../../partnership-tracker/hooks/usePartnershipTracker', () => ({
  usePartnershipTrackerDetail: () => ({ isLoading: false, isError: false, data: undefined }),
}))

vi.mock('../../../partnership-tracker/components/magic-patterns/MagicPatternOperationalDrawers', () => ({
  MagicPatternCashActivityDrawer: () => <div>Cash activity drawer</div>,
}))

describe('MagicPatternInvestmentTrackerPageContent', () => {
  beforeEach(() => vi.clearAllMocks())

  it('matches the reference sections and live portfolio figures', () => {
    render(<MagicPatternInvestmentTrackerPageContent canEdit />)

    expect(screen.getByRole('heading', { name: 'Investment tracker' })).toBeTruthy()
    expect(screen.getAllByText('$700').length).toBeGreaterThan(0)
    expect(screen.getAllByText('$830').length).toBeGreaterThan(0)
    expect(screen.getByRole('region', { name: 'Filters' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Capital activity' })).toBeTruthy()
    expect(screen.getByText('2 funds · 3 owner records', { exact: false })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Expand Fund One' })).toBeTruthy()
    expect(screen.getByRole('rowheader', { name: 'Total · all partnerships' })).toBeTruthy()
  })

  it('supports every reference filter popup, partial fund selection, and filter chips', async () => {
    const user = userEvent.setup()
    render(<MagicPatternInvestmentTrackerPageContent canEdit />)

    await user.click(screen.getByRole('combobox', { name: 'Group rows by' }))
    const groupList = screen.getByRole('listbox', { name: 'Group rows by' })
    expect(within(groupList).getByRole('option', { name: /Owner entity/ })).toBeTruthy()
    await user.click(within(groupList).getByRole('option', { name: /Asset class/ }))
    expect(screen.getByRole('combobox', { name: 'Group rows by' })).toHaveTextContent('Asset class')

    await user.click(screen.getByRole('combobox', { name: 'Asset class' }))
    const assetList = screen.getByRole('listbox', { name: 'Asset class' })
    expect(within(assetList).getByRole('option', { name: 'Real Estate' })).toBeTruthy()
    await user.click(within(assetList).getByRole('option', { name: 'Real Estate' }))
    expect(screen.getByRole('combobox', { name: 'Asset class' })).toHaveTextContent('Real Estate')

    await user.click(
      within(screen.getByRole('region', { name: 'Filters' })).getByRole('button', {
        name: 'Fund',
      }),
    )
    const fundDialog = screen.getByRole('dialog', { name: 'Filter by fund or owner record' })
    await user.click(within(fundDialog).getByRole('button', { name: 'Expand owner records for Fund One' }))
    await user.click(within(fundDialog).getByRole('checkbox', { name: 'Select Alpha Trust in Fund One' }))
    await user.click(within(fundDialog).getByRole('button', { name: 'Done' }))

    expect(screen.getByText('Fund One (1/2)')).toBeTruthy()
    expect(screen.getByText('Alpha Trust')).toBeTruthy()
    expect(screen.queryByText('Beta LLC')).toBeNull()
    expect(screen.getByRole('button', { name: /Remove fund filter Fund One/ })).toBeTruthy()
  })

  it('renders the empty state from search and opens the record-activity picker', async () => {
    const user = userEvent.setup()
    render(<MagicPatternInvestmentTrackerPageContent canEdit />)

    await user.type(screen.getByRole('searchbox', { name: 'Search capital activity' }), 'no such fund')
    expect(screen.getByText(/No capital activity matches these filters/)).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Clear activity search' }))
    await user.click(screen.getByRole('button', { name: 'Record activity' }))
    expect(screen.getByRole('dialog', { name: 'Choose an owner record' })).toBeTruthy()
    expect(screen.getByLabelText('Fund and owner entity')).toHaveValue('one-a')
  })
})
