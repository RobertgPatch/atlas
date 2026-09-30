import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { consolidatedHoldingsFixture } from '../fixtures/consolidatedHoldingsFixture'
import {
  filterHoldingsByAccounts,
  getAssetAllocation,
  getCustodianBreakdown,
} from '../utils/consolidatedHoldingsAnalytics'
import { ConsolidatedHoldingsTable } from './ConsolidatedHoldingsTable'
import { ConsolidatedHoldingsSyncStatus } from './ConsolidatedHoldingsSyncStatus'
import { CustodianBreakdown } from './CustodianBreakdown'

describe('ConsolidatedHoldingsReport table behavior', () => {
  it('recalculates an aggregated position from the selected source accounts',()=>{
    const rows=filterHoldingsByAccounts(consolidatedHoldingsFixture.rows,['11111111-1111-4111-8111-111111111111'])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({quantity:20,costBasis:2000,unrealizedGainLoss:1500,marketValue:3500,averageCostBasis:100})
    expect(rows[0]?.details).toHaveLength(1)
    expect(rows[0]?.details[0]?.accountName).toBe('Taxable')
  })

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

  it('preserves cents in equity cost basis and market values', async () => {
    const user = userEvent.setup()
    const [baseRow] = consolidatedHoldingsFixture.rows
    const rowWithCents = {
      ...baseRow,
      institutionPrice: 175.01,
      costBasis: 8_000.12,
      averageCostBasis: 114.29,
      unrealizedGainLoss: 4_250.22,
      marketValue: 12_250.34,
      details: [],
    }

    render(
      <ConsolidatedHoldingsTable
        rows={[rowWithCents]}
        selectedAccountCount={2}
        search=""
        sort="marketValue"
        direction="desc"
        onSearchChange={vi.fn()}
        onSortChange={vi.fn()}
      />,
    )

    await user.click(screen.getByText('Equities'))

    expect(screen.getByText('$8,000.12')).toBeInTheDocument()
    expect(screen.getByText('Avg $114.29')).toBeInTheDocument()
    expect(screen.getAllByText('$12,250.34')).toHaveLength(2)
    expect(screen.getByText(/\$175\.01/)).toBeInTheDocument()
  })

  it('derives a missing equity average basis from total basis and quantity',async()=>{
    const user=userEvent.setup(),[baseRow]=consolidatedHoldingsFixture.rows
    render(<ConsolidatedHoldingsTable rows={[{...baseRow,symbol:'SPCX',description:'SPACE EXPL TECHNOLOGIES',quantity:22223,costBasis:3000105,averageCostBasis:null,details:[]}]} selectedAccountCount={1} search="" sort="marketValue" direction="desc" onSearchChange={vi.fn()} onSortChange={vi.fn()}/>)
    await user.click(screen.getByText('Equities'))
    expect(screen.getByText('Avg $135.00')).toBeInTheDocument()
  })

  it('labels balance cash separately from stable-NAV money-market units',async()=>{
    const user=userEvent.setup(),[baseRow]=consolidatedHoldingsFixture.rows
    const bankDeposit={
      ...baseRow,id:'MSPBNA',symbol:'MSPBNA',description:'BANK DEPOSIT PROGRAM | MORGAN STANLEY PRIVATE BANK NA',type:'Cash',cashDisplayMode:'BALANCE_AT_PAR' as const,
      quantity:null,institutionPrice:null,priceAsOfDate:'2026-09-22',costBasis:160835.8,averageCostBasis:null,unrealizedGainLoss:0,gainLossPercent:0,marketValue:160835.8,details:[],
    }
    const moneyFund={
      ...baseRow,id:'TFDXX',symbol:'TFDXX',description:'BLF FEDFUND',type:'Cash',cashDisplayMode:'STABLE_NAV_UNITS' as const,
      quantity:35802268,institutionPrice:1,priceAsOfDate:'2026-09-18',costBasis:35802268,averageCostBasis:1,unrealizedGainLoss:0,gainLossPercent:0,marketValue:35802268,details:[],
    }
    render(<ConsolidatedHoldingsTable rows={[bankDeposit,moneyFund]} selectedAccountCount={2} search="" sort="marketValue" direction="desc" onSearchChange={vi.fn()} onSortChange={vi.fn()}/>)
    await user.click(screen.getByText('Cash & Equivalents'))
    expect(screen.getAllByText('At par')).toHaveLength(2)
    expect(screen.getByText('Avg $1.00')).toBeInTheDocument()
    expect(screen.getByTitle('Balance-based holding; no quantity is reported.')).toHaveTextContent('—')
    expect(screen.getByText('Balance Sep 22')).toBeInTheDocument()
    expect(screen.queryByText('Avg N/A')).not.toBeInTheDocument()
    expect(screen.queryByText('N/A Sep 22')).not.toBeInTheDocument()
    expect(screen.getAllByText('Accounts').length).toBeGreaterThan(0)
  })

  it('expands the only asset class for active sector filters and still allows collapse', async () => {
    const user = userEvent.setup()
    const onClear = vi.fn()

    render(
      <ConsolidatedHoldingsTable
        rows={consolidatedHoldingsFixture.rows}
        selectedAccountCount={2}
        search=""
        sort="marketValue"
        direction="desc"
        onSearchChange={vi.fn()}
        onSortChange={vi.fn()}
        sectorFilter={{ sectors: ['Technology', 'Financials'], onClear }}
      />,
    )

    expect(screen.getByText(/Sector filter: Technology, Financials/i)).toBeInTheDocument()
    expect(await screen.findByText('GOOGL')).toBeInTheDocument()

    await user.click(screen.getByText('Equities'))

    expect(screen.queryByText('GOOGL')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show all positions' }))

    expect(onClear).toHaveBeenCalledOnce()
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

    const allocation = getAssetAllocation(
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

  it('collapses custodian casing variants into the readable display name',()=>{
    const original=consolidatedHoldingsFixture.selectedAccounts[0]!
    const custodians=getCustodianBreakdown({...consolidatedHoldingsFixture,selectedAccounts:[...consolidatedHoldingsFixture.selectedAccounts,{...original,id:'66666666-6666-4666-8666-666666666666',custodianName:'brokerage a',name:'Legacy empty account',mask:'6666'}]},consolidatedHoldingsFixture.kpis.totalMarketValue??0)
    expect(custodians.filter(custodian=>custodian.institution.toLocaleLowerCase()==='brokerage a')).toEqual([expect.objectContaining({institution:'Brokerage A',accountCount:2,totalValue:3_500})])
  })
})

describe('CustodianBreakdown account filter',()=>{
  it('supports whole-institution, individual-account, and reset actions',async()=>{
    const user=userEvent.setup()
    const custodians=getCustodianBreakdown(consolidatedHoldingsFixture,consolidatedHoldingsFixture.kpis.totalMarketValue??0)
    const onToggleInstitution=vi.fn(),onToggleAccount=vi.fn(),onShowAll=vi.fn()
    const {rerender}=render(<CustodianBreakdown custodians={custodians} selectedAccountIds={consolidatedHoldingsFixture.selectedAccounts.map(account=>account.id)} onToggleInstitution={onToggleInstitution} onToggleAccount={onToggleAccount} onShowAll={onShowAll}/>)

    await user.click(screen.getByRole('checkbox',{name:'Hide all Brokerage A accounts'}))
    expect(onToggleInstitution).toHaveBeenCalledWith(['11111111-1111-4111-8111-111111111111'])
    await user.click(screen.getByRole('checkbox',{name:'Hide Brokerage A Taxable ending 1111'}))
    expect(onToggleAccount).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111')

    rerender(<CustodianBreakdown custodians={custodians} selectedAccountIds={['11111111-1111-4111-8111-111111111111']} onToggleInstitution={onToggleInstitution} onToggleAccount={onToggleAccount} onShowAll={onShowAll}/>)
    expect(screen.getByText('Viewing 1 of 2 accounts')).toBeInTheDocument()
    await user.click(screen.getByRole('button',{name:'Show all'}))
    expect(onShowAll).toHaveBeenCalledOnce()
  })
})

describe('ConsolidatedHoldingsSyncStatus', () => {
  it('renders fresh saved snapshot status details', () => {
    render(
      <ConsolidatedHoldingsSyncStatus
        pricing={consolidatedHoldingsFixture.pricing}
        sync={{
          status: 'success',
          freshnessStatus: 'fresh',
          dataAsOfDate: '2026-05-11',
          dataFetchedAt: '2026-05-11T12:00:00.000Z',
          lastSuccessfulSyncAt: '2026-05-11T12:00:00.000Z',
          nextRefreshAt: null,
          activeRefreshId: null,
          refreshing: false,
          warnings: [],
          refreshPolicy: {
            cadence: 'on_demand',
            manualRefreshEnabled: false,
            automaticRefreshEnabled: false,
          },
        }}
      />,
    )

    expect(screen.getByText('Fresh')).toBeInTheDocument()
    expect(screen.getByText(/Holdings as of May 11, 2026/i)).toBeInTheDocument()
    expect(screen.getByText(/Live SIP prices via Alpaca/i)).toBeInTheDocument()
    expect(screen.queryByText(/Next refresh/i)).not.toBeInTheDocument()
  })

  it('names both pricing sources when OTC fallback prices are used', () => {
    render(
      <ConsolidatedHoldingsSyncStatus
        sync={consolidatedHoldingsFixture.sync}
        pricing={{
          ...consolidatedHoldingsFixture.pricing,
          status: 'eod',
          provider: 'alpaca+massive',
          feed: null,
        }}
      />,
    )

    expect(
      screen.getByText(/Official closing prices via Alpaca \+ Massive/i),
    ).toBeInTheDocument()
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
          nextRefreshAt: null,
          activeRefreshId: null,
          refreshing: false,
          warnings: ['Brokerage B IRA failed to sync.'],
          refreshPolicy: {
            cadence: 'on_demand',
            manualRefreshEnabled: false,
            automaticRefreshEnabled: false,
          },
        }}
      />,
    )

    expect(screen.getByText('Some holdings need attention')).toBeInTheDocument()
    expect(screen.getByText('Brokerage B IRA failed to sync.')).toBeInTheDocument()
  })
})
