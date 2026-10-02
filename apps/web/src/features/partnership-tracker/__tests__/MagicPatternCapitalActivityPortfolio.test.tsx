import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { PartnershipAggregateRow, PartnershipAggregationResponse } from '../../../../../../packages/types/src/partnership-tracker'
import { MagicPatternCapitalActivityPortfolio } from '../components/magic-patterns/MagicPatternCapitalActivityPortfolio'
import { PortfolioCashRecovery } from '../components/magic-patterns/MagicPatternPortfolioCharts'
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

vi.mock('../../investment-tracker/hooks/useInvestmentTrackerData', () => ({
  useInvestmentTrackerData: () => ({
    data,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}))

describe('MagicPatternCapitalActivityPortfolio', () => {
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

  it('rolls owner records into expandable fund totals', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    render(<MagicPatternCapitalActivityPortfolio onOpen={onOpen} />)
    const table = screen.getByRole('table', { name: 'Capital activity fund investment summary' })

    expect(screen.getByRole('table', { name: 'Partnership activity summary for the full permitted portfolio' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Fund investment summary' })).toBeInTheDocument()
    const summaryHeading = screen.getByRole('heading', { name: 'Partnership activity summary' })
    for (const chartName of ['Cash recovery', 'Funding over time', 'Commitment progress', 'Distributions by asset type']) {
      expect(screen.getByRole('heading', { name: chartName }).compareDocumentPosition(summaryHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    expect(screen.getByRole('img', { name: /Cash paid \$1,800,000\.00; net cash returned \$360,000\.00/ })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Cumulative capital called by year against \$3,000,000\.00 committed: 2026 \$1,800,000\.00/ })).toBeInTheDocument()
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
    expect(screen.getByRole('img', { name: /Cash paid \$600,000\.00; net cash returned \$120,000\.00/ })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Cumulative capital called by year against \$1,000,000\.00 committed: 2026 \$600,000\.00/ })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Distribution share by asset type: Venture Capital \$120,000\.00/ })).toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Entity' }), 'entity-b')
    expect(screen.getByText('No distribution amounts are available for this selection.')).toBeInTheDocument()
    expect(screen.getByText('No settled cash activity is available for this selection.')).toBeInTheDocument()
    expect(screen.getByText('No dated capital calls are available for partnerships with commitments in this selection.')).toBeInTheDocument()
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
