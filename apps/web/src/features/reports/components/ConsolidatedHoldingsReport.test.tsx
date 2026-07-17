import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { consolidatedHoldingsFixture } from '../fixtures/consolidatedHoldingsFixture'
import {
  getCustodianBreakdown,
  getSectorAllocation,
} from '../utils/consolidatedHoldingsAnalytics'
import { ConsolidatedHoldingsTable } from './ConsolidatedHoldingsTable'
import { ConsolidatedHoldingsSummaryCards } from './ConsolidatedHoldingsSummaryCards'
import { ConsolidatedHoldingsSyncStatus } from './ConsolidatedHoldingsSyncStatus'

describe('ConsolidatedHoldingsReport table behavior', () => {
  it('renders parent rows and expands custodian detail rows', async () => {
    const user = userEvent.setup()

    render(
      <ConsolidatedHoldingsTable
        rows={consolidatedHoldingsFixture.rows}
        selectedAccountCount={2}
        search=""
        sort="marketValue"
        direction="desc"
        onSearchChange={vi.fn()}
        onSortChange={vi.fn()}
      />,
    )

    expect(screen.getByText('Equities')).toBeInTheDocument()
    expect(screen.queryByText('GOOGL')).not.toBeInTheDocument()

    await user.click(screen.getByText('Equities'))

    expect(screen.getByText('GOOGL')).toBeInTheDocument()
    expect(screen.queryByText('2 source records')).not.toBeInTheDocument()
    expect(screen.queryByText('Taxable')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /expand GOOGL account details/i }),
    ).toBeInTheDocument()

    await user.click(screen.getByText('GOOGL'))

    expect(screen.getByText('Taxable')).toBeInTheDocument()
    expect(screen.getByText('IRA')).toBeInTheDocument()
    expect(screen.getByText('70')).toBeInTheDocument()
  })

  it('sorts positions alphabetically within each asset-class section', async () => {
    const user = userEvent.setup()
    const [baseRow] = consolidatedHoldingsFixture.rows
    const appleRow = {
      ...baseRow,
      id: 'AAPL',
      symbol: 'AAPL',
      securityIdentifier: 'CUSIP 037833100',
      description: 'Apple Inc.',
      marketValue: 5_000,
      details: baseRow.details.map((detail, index) => ({
        ...detail,
        id: `AAPL-${index}`,
        symbol: 'AAPL',
        securityIdentifier: 'CUSIP 037833100',
        description: 'Apple Inc.',
        marketValue: 2_500,
      })),
    }

    render(
      <ConsolidatedHoldingsTable
        rows={[baseRow, appleRow]}
        selectedAccountCount={2}
        search=""
        sort="symbol"
        direction="asc"
        onSearchChange={vi.fn()}
        onSortChange={vi.fn()}
      />,
    )

    await user.click(screen.getByText('Equities'))

    const appleSymbol = screen.getByText('AAPL')
    const googleSymbol = screen.getByText('GOOGL')

    expect(
      appleSymbol.compareDocumentPosition(googleSymbol) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('reverses the same positions when toggling a numeric sort direction', async () => {
    const user = userEvent.setup()
    const [baseRow] = consolidatedHoldingsFixture.rows
    const appleRow = {
      ...baseRow,
      id: 'AAPL',
      symbol: 'AAPL',
      securityIdentifier: 'CUSIP 037833100',
      description: 'Apple Inc.',
      marketValue: 5_000,
      details: [],
    }

    const { rerender } = render(
      <ConsolidatedHoldingsTable
        rows={[baseRow, appleRow]}
        selectedAccountCount={2}
        search=""
        sort="marketValue"
        direction="desc"
        onSearchChange={vi.fn()}
        onSortChange={vi.fn()}
      />,
    )

    await user.click(screen.getByText('Equities'))

    expect(screen.getAllByText(/AAPL|GOOGL/).map((node) => node.textContent)).toEqual([
      'GOOGL',
      'AAPL',
    ])

    rerender(
      <ConsolidatedHoldingsTable
        rows={[baseRow, appleRow]}
        selectedAccountCount={2}
        search=""
        sort="marketValue"
        direction="asc"
        onSearchChange={vi.fn()}
        onSortChange={vi.fn()}
      />,
    )

    expect(screen.getAllByText(/AAPL|GOOGL/).map((node) => node.textContent)).toEqual([
      'AAPL',
      'GOOGL',
    ])
  })
})

describe('Consolidated holdings analytics', () => {
  it('uses one asset-type allocation strategy and separates unidentified holdings from Other', () => {
    const [baseRow] = consolidatedHoldingsFixture.rows
    const unidentifiedRow = {
      ...baseRow,
      id: 'unidentified-1',
      symbol: null,
      securityIdentifier: null,
      description: 'Unidentified holding - Summit Gate Custody Brokerage ****1234',
      type: 'Other',
      sector: null,
      industry: null,
      identityConfidence: 'low' as const,
      marketValue: 5_000,
      details: [],
    }

    const allocation = getSectorAllocation(
      [baseRow, unidentifiedRow],
      (baseRow.marketValue ?? 0) + (unidentifiedRow.marketValue ?? 0),
    )

    expect(allocation).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Equities', value: 12_250 }),
        expect.objectContaining({ name: 'Unidentified', value: 5_000 }),
      ]),
    )
    expect(allocation.find((item) => item.name === 'Technology')).toBeUndefined()
    expect(allocation.find((item) => item.name === 'Other')).toBeUndefined()
  })

  it('includes selected custodians even when they have no holdings rows', () => {
    const custodians = getCustodianBreakdown(
      {
        ...consolidatedHoldingsFixture,
        selectedAccounts: [
          ...consolidatedHoldingsFixture.selectedAccounts,
          {
            id: '55555555-5555-4555-8555-555555555555',
            connectionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            custodianName: 'Brokerage C',
            name: 'Trust Account',
            officialName: 'Trust Account',
            mask: '5555',
            type: 'investment',
            subtype: 'brokerage',
            selectedForHoldingsReport: true,
            syncStatus: 'success',
            lastSyncedAt: '2026-05-11T08:00:00.000Z',
          },
        ],
      },
      consolidatedHoldingsFixture.kpis.totalMarketValue ?? 0,
    )

    const emptyCustodian = custodians.find(
      (custodian) => custodian.institution === 'Brokerage C',
    )
    expect(emptyCustodian).toMatchObject({
      accountCount: 1,
      totalValue: 0,
      percentage: 0,
    })
  })
})

describe('ConsolidatedHoldingsSummaryCards', () => {
  it('renders portfolio value and connected account metrics', () => {
    render(<ConsolidatedHoldingsSummaryCards kpis={consolidatedHoldingsFixture.kpis} />)

    expect(screen.getByText('Total Portfolio Value')).toBeInTheDocument()
    expect(screen.getByText('$12,250')).toBeInTheDocument()
    expect(screen.getByText('Connected Accounts')).toBeInTheDocument()
  })
})

describe('ConsolidatedHoldingsSyncStatus', () => {
  it('renders fresh saved snapshot status details', () => {
    render(
      <ConsolidatedHoldingsSyncStatus
        sync={{
          status: 'success',
          freshnessStatus: 'fresh',
          dataAsOfDate: '2026-05-11',
          dataFetchedAt: '2026-05-11T12:00:00.000Z',
          lastSuccessfulSyncAt: '2026-05-11T12:00:00.000Z',
          nextRefreshAt: '2026-05-12T12:00:00.000Z',
          activeRefreshId: null,
          refreshing: false,
          warnings: [],
          refreshPolicy: {
            id: '00000000-0000-4000-8000-000000000014',
            name: 'liquidity_default',
            cadence: 'daily',
            refreshTimeLocal: '05:00',
            timezone: 'America/Los_Angeles',
            staleAfterCutoff: true,
            manualRefreshEnabled: true,
            automaticRefreshEnabled: true,
            createdAt: '2026-05-11T12:00:00.000Z',
            updatedAt: '2026-05-11T12:00:00.000Z',
          },
        }}
      />,
    )

    expect(screen.getByText('Fresh')).toBeInTheDocument()
    expect(screen.getByText(/Data as of May 11, 2026/i)).toBeInTheDocument()
    expect(screen.getByText(/Next refresh/i)).toBeInTheDocument()
  })

  it('renders partial sync warnings', () => {
    render(
      <ConsolidatedHoldingsSyncStatus
        sync={{
          status: 'partial_success',
          freshnessStatus: 'failed',
          dataAsOfDate: '2026-05-11',
          dataFetchedAt: '2026-05-11T08:00:00.000Z',
          lastSuccessfulSyncAt: '2026-05-11T08:00:00.000Z',
          nextRefreshAt: '2026-05-12T12:00:00.000Z',
          activeRefreshId: null,
          refreshing: false,
          warnings: ['Brokerage B IRA failed to sync.'],
          refreshPolicy: {
            id: '00000000-0000-4000-8000-000000000014',
            name: 'liquidity_default',
            cadence: 'daily',
            refreshTimeLocal: '05:00',
            timezone: 'America/Los_Angeles',
            staleAfterCutoff: true,
            manualRefreshEnabled: true,
            automaticRefreshEnabled: true,
            createdAt: '2026-05-11T08:00:00.000Z',
            updatedAt: '2026-05-11T08:00:00.000Z',
          },
        }}
      />,
    )

    expect(screen.getByText('Some holdings need attention')).toBeInTheDocument()
    expect(screen.getByText('Brokerage B IRA failed to sync.')).toBeInTheDocument()
  })
})
