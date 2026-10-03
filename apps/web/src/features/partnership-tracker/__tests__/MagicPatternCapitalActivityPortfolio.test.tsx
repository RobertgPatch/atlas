import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { exportInvestmentTrackerPdf } from '../../investment-tracker/exportInvestmentTrackerPdf'
import type { PartnershipAggregateRow, PartnershipAggregationResponse } from '../../../../../../packages/types/src/partnership-tracker'
import { MagicPatternCapitalActivityPortfolio } from '../components/magic-patterns/MagicPatternCapitalActivityPortfolio'
import { investmentPerformanceFixture } from './fixtures'
import { usePortfolioActivity } from '../hooks/usePartnershipTracker'
import { PortfolioCashRecovery, PortfolioCashReturned } from '../components/magic-patterns/MagicPatternPortfolioCharts'
import { buildPortfolioChartData } from '../components/magic-patterns/portfolioChartData'

const member = ({
  id,
  fundName,
  ownerId,
  ownerName,
  assetClass,
}: {
  id: string
  fundName: string
  ownerId: string
  ownerName: string
  assetClass: string
}) => ({
  partnership: {
    id,
    entity: { id: ownerId, name: ownerName },
    name: fundName,
    partnershipType: assetClass,
    status: 'ACTIVE',
    inceptionDate: '2021-01-01',
    fundManager: 'Atlas Manager',
  },
  currentCommittedCapital: { amount: '1000000', date: '2026-01-01' },
  totalCapitalContributions: '600000',
  totalDistributions: '120000',
  unsettledActivityAmount: '0',
  latestNav: { amount: '750000', date: '2026-06-30' },
  unfundedCommitmentAmount: '400000',
  dpi: '0.2',
  tvpi: '1.45',
  irr: '0.125',
  performanceAsOfDate: '2026-06-30',
  cashFlowEvents: [
    { id: `${id}-call`, kind: 'CAPITAL_CALL', activityDate: '2026-01-10', amount: '600000.0000', feesAndCarry: '0.0000' },
    { id: `${id}-distribution`, kind: 'DISTRIBUTION', activityDate: '2026-04-01', amount: '120000.0000', feesAndCarry: '0.0000' },
  ],
})

const data = {
  rollup: {
    partnershipCount: 2,
    ownerRecordCount: 3,
    committedCapital: { amount: '3000000', knownCount: 3, totalCount: 3 },
    paidInCapital: { amount: '1800000', knownCount: 3, totalCount: 3 },
    distributions: { amount: '360000', knownCount: 3, totalCount: 3 },
    latestNav: { amount: '2250000', knownCount: 3, totalCount: 3 },
    unfundedCommitment: { amount: '1200000', knownCount: 3, totalCount: 3 },
    unsettledActivity: { amount: '0', knownCount: 3, totalCount: 3 },
    dpi: { value: '0.2', status: 'AVAILABLE', numeratorKnownCount: 3, denominatorKnownCount: 3, totalCount: 3 },
    tvpi: { value: '1.45', status: 'AVAILABLE', numeratorKnownCount: 3, denominatorKnownCount: 3, totalCount: 3 },
    annualizedCashOnCashYield: { value: '0.125', status: 'AVAILABLE', numeratorKnownCount: 3, denominatorKnownCount: 3, totalCount: 3 },
    asOfDate: '2026-06-30',
    navValuationRange: { earliest: '2026-06-30', latest: '2026-06-30' },
  },
  items: [
    {
      groupKey: 'fund-a',
      name: 'Fund Alpha, LP',
      members: [
        member({ id: 'a-1', fundName: 'Fund Alpha, LP', ownerId: 'entity-a', ownerName: 'Gardner Family Trust', assetClass: 'Real Estate' }),
        member({ id: 'a-2', fundName: 'Fund Alpha, LP', ownerId: 'entity-b', ownerName: 'Gardner Descendant Trust', assetClass: 'Real Estate' }),
      ],
    },
    {
      groupKey: 'fund-b',
      name: 'Fund Beta, LP',
      members: [
        member({ id: 'b-1', fundName: 'Fund Beta, LP', ownerId: 'entity-a', ownerName: 'Gardner Family Trust', assetClass: 'Venture Capital' }),
      ],
    },
  ],
} as unknown as PartnershipAggregationResponse

const queryState = vi.hoisted(() => ({ isLoading: false, isFetching: false, isError: false }))
vi.mock('../../investment-tracker/exportInvestmentTrackerPdf', () => ({ exportInvestmentTrackerPdf: vi.fn() }))
vi.mock('../../investment-tracker/hooks/useInvestmentTrackerData', () => ({
  useInvestmentTrackerData: () => ({
    data,
    ...queryState,
    refetch: vi.fn(),
  }),
}))

vi.mock('../hooks/usePartnershipTracker', () => ({
  usePartnershipTrackerActions: () => ({ deleteCashFlow: { isPending: false }, deleteNav: { isPending: false } }),
  usePortfolioActivity: vi.fn((ids: string[]) => {
    const selected = data.items.flatMap((group) => group.members).filter((member) => ids.includes(member.partnership.id))
    return { isLoading: false, isFetching: false, isError: false, refetch: vi.fn(), data: {
      cashOnCashYield: { value: '0.125', numeratorKnownCount: selected.length, totalCount: selected.length },
      items: selected.map((member) => ({ summary: member, investmentPerformance: investmentPerformanceFixture, navEntries: [],
        cashFlowEvents: member.cashFlowEvents!.map((flow) => ({ ...flow, partnershipId: member.partnership.id, settlementStatus: 'SETTLED' })) })),
      investmentPerformance: { ...investmentPerformanceFixture,
        committedCapital: String(selected.length * 1000000), paidInCapital: String(selected.length * 600000),
        grossDistributions: String(selected.length * 120000), residualValue: String(selected.length * 750000),
        netMoicDpi: '0.2', tvpi: '1.45' },
    } }
  }),
}))

describe('MagicPatternCapitalActivityPortfolio', () => {
  beforeEach(() => {
    Object.assign(queryState, { isLoading: false, isFetching: false, isError: false })
    vi.mocked(exportInvestmentTrackerPdf).mockReset().mockResolvedValue(undefined)
  })

  it('exports the filtered view with graphics and expanded owner rows', async () => {
    const user = userEvent.setup()
    render(<MagicPatternCapitalActivityPortfolio onOpen={vi.fn()} />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Asset class' }), 'Real Estate')
    await user.click(screen.getByRole('button', { name: 'Expand Fund Alpha, LP owner details' }))
    await user.click(screen.getByRole('button', { name: 'Export to PDF' }))

    const [target] = vi.mocked(exportInvestmentTrackerPdf).mock.calls[0]
    expect(within(target).getByRole('img', { name: /Distribution share by asset type: Real Estate/ })).toBeInTheDocument()
    const table = within(target).getByRole('table', { name: 'Capital activity fund investment summary' })
    expect(within(table).getByText('Gardner Descendant Trust')).toBeInTheDocument()
    expect(within(table).queryByText('Fund Beta, LP')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Asset class' })).toHaveValue('Real Estate')
  })

  it('disables duplicate exports and allows retry after a rendering failure', async () => {
    const user = userEvent.setup()
    let rejectExport!: (error: Error) => void
    vi.mocked(exportInvestmentTrackerPdf).mockImplementationOnce(() => new Promise((_, reject) => { rejectExport = reject }))
    render(<MagicPatternCapitalActivityPortfolio onOpen={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Export to PDF' }))
    expect(screen.getByRole('button', { name: 'Exporting PDF…' })).toBeDisabled()
    rejectExport(new Error('Rendering failed'))
    expect(await screen.findByRole('alert')).toHaveTextContent('The PDF could not be exported. Please try again.')
    await user.click(screen.getByRole('button', { name: 'Export to PDF' }))
    expect(exportInvestmentTrackerPdf).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it.each(['isLoading', 'isFetching'] as const)('disables export while data %s', (state) => {
    queryState[state] = true
    render(<MagicPatternCapitalActivityPortfolio onOpen={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Export to PDF' })).toBeDisabled()
  })

  it('does not offer export when the portfolio failed to load', () => {
    queryState.isError = true
    render(<MagicPatternCapitalActivityPortfolio onOpen={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Export to PDF' })).not.toBeInTheDocument()
  })

  it('renders settled zero and negative net returns instead of an empty cash state', () => {
    const negative = member({ id: 'negative', fundName: 'Negative Return', ownerId: 'entity-a', ownerName: 'Owner', assetClass: 'Real Estate' })
    negative.cashFlowEvents = [
      { id: 'negative-distribution', kind: 'DISTRIBUTION', activityDate: '2026-04-01', amount: '5.0000', feesAndCarry: '10.0000' },
    ]
    const { rerender } = render(<PortfolioCashRecovery data={buildPortfolioChartData([negative as unknown as PartnershipAggregateRow])} />)
    expect(screen.getByRole('img', { name: /net cash returned -\$5\.00/ })).toBeInTheDocument()
    expect(screen.queryByText('No settled cash activity is available for this selection.')).not.toBeInTheDocument()

    negative.cashFlowEvents = [
      { id: 'zero-distribution', kind: 'DISTRIBUTION', activityDate: '2026-04-01', amount: '10.0000', feesAndCarry: '10.0000' },
    ]
    rerender(<PortfolioCashRecovery data={buildPortfolioChartData([negative as unknown as PartnershipAggregateRow])} />)
    expect(screen.getByRole('img', { name: /net cash returned \$0\.00/ })).toBeInTheDocument()
  })

  it('shows returns above 100% using cash paid including call fees and net distributions', () => {
    const record = member({ id: 'returned', fundName: 'Returned Fund', ownerId: 'entity-a', ownerName: 'Owner', assetClass: 'Real Estate' })
    record.cashFlowEvents = [
      { id: 'call', kind: 'CAPITAL_CALL', activityDate: '2026-01-01', amount: '90.0000', feesAndCarry: '10.0000' },
      { id: 'distribution', kind: 'DISTRIBUTION', activityDate: '2026-04-01', amount: '230.0000', feesAndCarry: '10.0000' },
    ]
    render(<PortfolioCashReturned data={buildPortfolioChartData([record as unknown as PartnershipAggregateRow])} />)
    expect(screen.getByRole('img', { name: '220% of cash paid returned; cash paid $100.00; net cash returned $220.00' })).toBeInTheDocument()
    expect(screen.getByText('220%')).toBeInTheDocument()
    expect(screen.getByText('Net cash gain').nextElementSibling).toHaveTextContent('$120.00')
    expect(screen.getByText(/Cash paid recovered in full/)).toHaveTextContent('$120.00 returned above the original cash paid.')
  })

  it('handles partial recovery and missing cash paid without an invalid percentage', () => {
    const data = buildPortfolioChartData([])
    const { rerender } = render(<PortfolioCashReturned data={{ ...data, cash: { paid: 1_000_000n, returned: 200_000n, eventCount: 2 } }} />)
    expect(screen.getByText('20%')).toBeInTheDocument()
    expect(screen.getByText('Net cash loss').nextElementSibling).toHaveTextContent('-$80.00')
    rerender(<PortfolioCashReturned data={{ ...data, cash: { paid: 0n, returned: 200_000n, eventCount: 1 } }} />)
    expect(screen.getByText('No settled cash paid has been recorded.')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('switches the pie to cash returned only for one fund selected in the dropdown', async () => {
    const user = userEvent.setup()
    render(<MagicPatternCapitalActivityPortfolio onOpen={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Fund filter: All funds' }))
    await user.click(screen.getByRole('checkbox', { name: 'Fund Alpha, LP' }))
    expect(screen.getByRole('heading', { name: 'Cash returned' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Distributions by asset type' })).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: '20% of cash paid returned; cash paid $1,200,000.00; net cash returned $240,000.00' })).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: 'Fund Beta, LP' }))
    expect(screen.getByRole('heading', { name: 'Distributions by asset type' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Cash returned' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(screen.getByRole('heading', { name: 'Distributions by asset type' })).toBeInTheDocument()
  })

  it('rolls owner records into expandable fund totals', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    render(<MagicPatternCapitalActivityPortfolio onOpen={onOpen} />)
    expect(screen.getByRole('button', { name: 'Future' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('img', { name: /Annual funding requirements.*2027 \$240,000\.00 estimated.*2031 \$240,000\.00 estimated/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Historic' }))
    const table = screen.getByRole('table', { name: 'Capital activity fund investment summary' })

    expect(screen.getByRole('table', { name: 'Investment Performance for All Partnerships' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Fund investment summary' })).toBeInTheDocument()
    const summaryHeading = screen.getByRole('heading', { name: 'Investment Performance' })
    const fundHeading = screen.getByRole('heading', { name: 'Fund investment summary' })
    expect(fundHeading.compareDocumentPosition(summaryHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    for (const chartName of ['Cash recovery', 'Funding over time', 'Commitment progress', 'Distributions by asset type']) {
      expect(screen.getByRole('heading', { name: chartName }).compareDocumentPosition(fundHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    expect(screen.getByRole('img', { name: /Cash paid \$1,800,000\.00; net cash returned \$360,000\.00/ })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Cumulative capital called by year against \$3,000,000\.00 committed:.*2026 \$1,800,000\.00/ })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /\$1,800,000\.00 paid in of \$3,000,000\.00 committed/ })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Distribution share by asset type: Real Estate \$240,000\.00; Venture Capital \$120,000\.00/ })).toBeInTheDocument()
    expect(screen.getByText('2 funds · 3 owner records')).toBeInTheDocument()
    expect(within(table).getByText('Fund Alpha, LP')).toBeInTheDocument()
    expect(within(table).getByText('2 owner entities')).toBeInTheDocument()
    expect(within(table).getByText('$2,000,000.00')).toBeInTheDocument()
    expect(within(table).getByText('($1,200,000.00)')).toBeInTheDocument()
    expect(within(table).queryByText('Gardner Family Trust')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Expand Fund Alpha, LP owner details' }))

    expect(within(table).getByText('Gardner Family Trust')).toBeInTheDocument()
    expect(within(table).getByText('Gardner Descendant Trust')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Collapse Fund Alpha, LP owner details' })).toHaveAttribute('aria-expanded', 'true')

    await user.click(within(table).getByText('Gardner Descendant Trust'))
    expect(onOpen).toHaveBeenLastCalledWith('a-2')

    await user.click(within(table).getByText('Fund Beta, LP'))
    expect(onOpen).toHaveBeenLastCalledWith('b-1')
  })

  it('filters the fund rollups by asset class, entity, and fund', async () => {
    const user = userEvent.setup()
    render(<MagicPatternCapitalActivityPortfolio onOpen={vi.fn()} />)
    const table = screen.getByRole('table', { name: 'Capital activity fund investment summary' })

    expect(screen.getByRole('columnheader', { name: 'Total committed' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'DPI' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'TVPI' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Return' })).toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Asset class' }), 'Venture Capital')
    expect(screen.getByRole('img', { name: /Annual funding requirements.*2027 \$80,000\.00 estimated.*2031 \$80,000\.00 estimated/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Historic' }))
    expect(screen.getByRole('img', { name: /Cash paid \$600,000\.00; net cash returned \$120,000\.00/ })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Cumulative capital called by year against \$1,000,000\.00 committed:.*2026 \$600,000\.00/ })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Distribution share by asset type: Venture Capital \$120,000\.00/ })).toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Entity' }), 'entity-b')
    expect(screen.getByText('No distribution amounts are available for this selection.')).toBeInTheDocument()
    expect(screen.getByText('No settled cash activity is available for this selection.')).toBeInTheDocument()
    expect(screen.getByText('No commitment amounts are available for this selection.')).toBeInTheDocument()
    expect(within(table).queryByText('Fund Beta, LP')).not.toBeInTheDocument()
    expect(within(table).queryByText('Gardner Descendant Trust')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear all' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Entity' }), 'entity-b')
    expect(screen.getByText('1 fund · 1 owner record')).toBeInTheDocument()
    expect(within(table).getByText('Fund Alpha, LP')).toBeInTheDocument()
    expect(within(table).queryByText('Gardner Descendant Trust')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Expand Fund Alpha, LP owner details' })).not.toBeInTheDocument()
    expect(within(table).getByRole('row', { name: 'Open Fund Alpha, LP partnership management' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear all' }))
    await user.click(screen.getByRole('button', { name: 'Fund filter: All funds' }))
    await user.click(screen.getByRole('checkbox', { name: 'Fund Beta, LP' }))
    expect(screen.getByText('1 fund · 1 owner record')).toBeInTheDocument()
    expect(within(table).getByText('Fund Beta, LP')).toBeInTheDocument()
    expect(within(table).queryByText('Gardner Descendant Trust')).not.toBeInTheDocument()
  })

  it('uses the same selected owner IDs for performance and every capital activity row', async () => {
    const user = userEvent.setup()
    render(<MagicPatternCapitalActivityPortfolio onOpen={vi.fn()} />)
    const performance = () => screen.getByRole('table', { name: /Investment Performance for/ })
    const ledger = () => screen.getByRole('table', { name: /Capital activity: dated capital calls/ })
    expect(within(performance()).getByRole('row', { name: /Committed capital/ })).toHaveTextContent('$3,000,000')
    expect(within(ledger()).getAllByRole('row')).toHaveLength(7)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Entity' }), 'entity-b')
    expect(usePortfolioActivity).toHaveBeenLastCalledWith(['a-2'], false)
    expect(performance()).toHaveAccessibleName('Investment Performance for Fund Alpha, LP')
    expect(within(performance()).getByRole('row', { name: /Committed capital/ })).toHaveTextContent('$1,000,000')
    expect(within(ledger()).getAllByRole('row')).toHaveLength(3)
    expect(within(ledger()).queryByText('Fund Beta, LP')).not.toBeInTheDocument()
    expect(within(ledger()).getAllByText('Gardner Descendant Trust')).toHaveLength(2)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Asset class' }), 'Venture Capital')
    expect(screen.queryByRole('table', { name: /Investment Performance for/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(usePortfolioActivity).toHaveBeenLastCalledWith(['a-1', 'a-2', 'b-1'], true)
    expect(within(ledger()).getAllByRole('row')).toHaveLength(7)
  })

  it('allows several funds to be selected and keeps them combined with other filters', async () => {
    const user = userEvent.setup()
    render(<MagicPatternCapitalActivityPortfolio onOpen={vi.fn()} />)
    const table = screen.getByRole('table', { name: 'Capital activity fund investment summary' })

    await user.click(screen.getByRole('button', { name: 'Fund filter: All funds' }))
    await user.click(screen.getByRole('checkbox', { name: 'Fund Alpha, LP' }))
    expect(screen.getByText('1 fund · 2 owner records')).toBeInTheDocument()
    expect(within(table).queryByText('Fund Beta, LP')).not.toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'Fund Beta, LP' }))
    expect(screen.getByRole('button', { name: 'Fund filter: 2 funds selected' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('img', { name: /Cash paid \$1,800,000\.00; net cash returned \$360,000\.00/ })).toBeInTheDocument()
    expect(screen.getByText('2 funds · 3 owner records')).toBeInTheDocument()
    expect(within(table).getByText('Fund Alpha, LP')).toBeInTheDocument()
    expect(within(table).getByText('Fund Beta, LP')).toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Asset class' }), 'Real Estate')
    expect(screen.getByText('1 fund · 2 owner records')).toBeInTheDocument()
    expect(within(table).queryByText('Fund Beta, LP')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(screen.getByRole('button', { name: 'Fund filter: All funds' })).toBeInTheDocument()
    expect(screen.getByText('2 funds · 3 owner records')).toBeInTheDocument()
  })
})
