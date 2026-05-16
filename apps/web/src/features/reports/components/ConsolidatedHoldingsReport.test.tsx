import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { consolidatedHoldingsFixture } from '../fixtures/consolidatedHoldingsFixture'
import { getCustodianBreakdown } from '../utils/consolidatedHoldingsAnalytics'
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
    expect(screen.queryByText('Brokerage A - Taxable')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /expand GOOGL account details/i }),
    ).toBeInTheDocument()

    await user.click(screen.getByText('GOOGL'))

    expect(screen.getByText('Brokerage A - Taxable')).toBeInTheDocument()
    expect(screen.getByText('Brokerage B - IRA')).toBeInTheDocument()
    expect(screen.getByText('70')).toBeInTheDocument()
  })
})

describe('Consolidated holdings analytics', () => {
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
