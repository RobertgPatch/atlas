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

    expect(screen.getByText('GOOGL')).toBeInTheDocument()
    expect(screen.getByText('Equities')).toBeInTheDocument()
    expect(screen.getByText('2 source records')).toBeInTheDocument()
    expect(screen.getAllByText('2 accts').length).toBeGreaterThan(0)
    expect(screen.queryByText('Taxable')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /expand GOOGL account details/i }),
    ).toBeInTheDocument()

    await user.click(screen.getByText('GOOGL'))

    expect(screen.getByText('Taxable')).toBeInTheDocument()
    expect(screen.getByText('IRA')).toBeInTheDocument()
    expect(screen.getByText('70')).toBeInTheDocument()
  })

  it('sorts positions alphabetically within each asset-class section', () => {
    const [baseRow] = consolidatedHoldingsFixture.rows
    const appleRow = {
      ...baseRow,
      id: 'AAPL',
      symbol: 'AAPL',
      description: 'Apple Inc.',
      marketValue: 5_000,
      details: baseRow.details.map((detail, index) => ({
        ...detail,
        id: `AAPL-${index}`,
        symbol: 'AAPL',
        description: 'Apple Inc.',
        marketValue: 2_500,
      })),
    }

    render(
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

    const appleSymbol = screen.getByText('AAPL')
    const googleSymbol = screen.getByText('GOOGL')

    expect(
      appleSymbol.compareDocumentPosition(googleSymbol) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
})

describe('Consolidated holdings analytics', () => {
  it('uses Plaid sector data and separates unidentified holdings from Other', () => {
    const [baseRow] = consolidatedHoldingsFixture.rows
    const unidentifiedRow = {
      ...baseRow,
      id: 'unidentified-1',
      symbol: null,
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
        expect.objectContaining({ name: 'Technology', value: 12_250 }),
        expect.objectContaining({ name: 'Unidentified', value: 5_000 }),
      ]),
    )
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
    expect(screen.getByText('$12,250.00')).toBeInTheDocument()
    expect(screen.getByText('Connected Accounts')).toBeInTheDocument()
  })
})

describe('ConsolidatedHoldingsSyncStatus', () => {
  it('renders partial sync warnings', () => {
    render(
      <ConsolidatedHoldingsSyncStatus
        sync={{
          status: 'partial_success',
          lastSuccessfulSyncAt: '2026-05-11T08:00:00.000Z',
          warnings: ['Brokerage B IRA failed to sync.'],
        }}
      />,
    )

    expect(screen.getByText('Some holdings need attention')).toBeInTheDocument()
    expect(screen.getByText('Brokerage B IRA failed to sync.')).toBeInTheDocument()
  })
})
