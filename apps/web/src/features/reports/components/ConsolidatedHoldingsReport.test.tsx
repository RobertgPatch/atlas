import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { consolidatedHoldingsFixture } from '../fixtures/consolidatedHoldingsFixture'
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

    await user.click(screen.getByText('GOOGL'))

    expect(screen.getByText('Brokerage A - Taxable')).toBeInTheDocument()
    expect(screen.getByText('Brokerage B - IRA')).toBeInTheDocument()
    expect(screen.getByText('70')).toBeInTheDocument()
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
