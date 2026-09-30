import { useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { ConsolidatedHoldingRow } from '../../../../../../packages/types/src/reports'
import {
  EQUITY_SECTORS,
  SECTOR_FILTER_OPTIONS,
  filterHoldingsBySectors,
  filterHoldingsByAccounts,
  getSectorAllocation,
  inferEquitySector,
  inferSector,
} from '../utils/consolidatedHoldingsAnalytics'
import {
  ADDITIONAL_SECTOR_CATALOG_SOURCE,
  ADDITIONAL_SYMBOLS_BY_SECTOR,
  additionalSectorBySymbol,
  SP500_SECTOR_CATALOG_SOURCE,
  SP500_SYMBOLS_BY_SECTOR,
  sp500SectorBySymbol,
} from '../utils/equitySectorCatalog'
import { AllocationChart } from './AllocationChart'

const stockRow = ({
  symbol,
  sector,
  industry,
  marketValue = 100,
  type = 'Stock',
}: {
  symbol: string
  sector: string | null
  industry: string | null
  marketValue?: number
  type?: string
}): ConsolidatedHoldingRow => ({
  id: symbol,
  symbol,
  securityIdentifier: null,
  description: `${symbol} holding`,
  type,
  sector,
  industry,
  custodianSummary: 'Brokerage',
  quantity: 1,
  institutionPrice: marketValue,
  priceAsOfDate: '2026-08-15',
  costBasis: marketValue,
  averageCostBasis: marketValue,
  unrealizedGainLoss: 0,
  gainLossPercent: 0,
  marketValue,
  identityConfidence: 'high',
  details: [],
})

describe('sector allocation', () => {
  it('links to sector management while preserving the selected entity', () => {
    render(<MemoryRouter><AllocationChart manageSectorsHref="/liquidity/sectors?entityId=entity-a"
      assetData={[]} sectorData={[]} selectedSectors={[...SECTOR_FILTER_OPTIONS]} onSelectedSectorsChange={() => {}}/></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Manage sectors' })).toHaveAttribute('href', '/liquidity/sectors?entityId=entity-a')
  })
  it('prioritizes saved assignments over the catalog but never assigns fund sector exposure', () => {
    const stock = { ...stockRow({ symbol: 'AAPL', sector: null, industry: null }), sectorOverride: 'Financials' as const }
    expect(inferEquitySector(stock)).toBe('Financials')
    expect(filterHoldingsBySectors([stock], ['Financials'])).toEqual([stock])
    expect(getSectorAllocation([stock])[0]?.name).toBe('Financials')
    expect(inferEquitySector({ ...stock, sectorOverride: null })).toBe('Technology')
    expect(inferEquitySector({ ...stock, sectorOverride: 'Unclassified' })).toBe('Unclassified')
    expect(inferEquitySector({ ...stock, type: 'Equity Fund' })).toBeNull()
  })
  it('covers every reference equity once across the eleven sectors', () => {
    const symbols = Object.values(SP500_SYMBOLS_BY_SECTOR).flatMap((group) => group.split(' '))
    expect(symbols).toHaveLength(SP500_SECTOR_CATALOG_SOURCE.symbolCount)
    expect(new Set(symbols).size).toBe(symbols.length)
    expect(Object.keys(SP500_SYMBOLS_BY_SECTOR).sort()).toEqual([...EQUITY_SECTORS].sort())
    for (const [symbol, sector] of Object.entries(sp500SectorBySymbol)) {
      expect(inferEquitySector(stockRow({ symbol, sector: null, industry: null })), symbol).toBe(sector)
    }
  })

  it.each([
    ['SNOW', 'Technology'],
    ['SPCX', 'Communication Services'],
    ['CPNG', 'Consumer Discretionary'],
    ['GOOG', 'Communication Services'],
    ['ROST', 'Consumer Discretionary'],
    ['CHD', 'Consumer Staples'],
    ['EQT', 'Energy'],
    ['SCHW', 'Financials'],
    ['VRTX', 'Health Care'],
    ['ADP', 'Industrials'],
    ['NUE', 'Materials'],
    ['IRM', 'Real Estate'],
    ['WEC', 'Utilities'],
    ['INTC', 'Technology'],
    [' brk-b ', 'Financials'],
    ['BRK/B', 'Financials'],
    ['BRK B', 'Financials'],
    ['bf.b', 'Consumer Staples'],
  ])('classifies %s from the catalog ahead of incompatible provider labels', (symbol, sector) => {
    expect(inferEquitySector(stockRow({ symbol, sector: 'Miscellaneous', industry: 'Software' }))).toBe(sector)
  })

  it.each(['Stock', 'Stocks', 'Equity', 'Equities', 'Common Stock'])('recognizes %s as a direct-stock asset type', (type) => {
    const row = stockRow({ symbol: 'GOOG', sector: null, industry: null, type })
    expect(getSectorAllocation([row])).toEqual([
      expect.objectContaining({ name: 'Communication Services', value: 100, percentage: 100 }),
    ])
  })

  it.each(['ETF', 'Equity Fund', 'Stock Mutual Fund', 'Cash', 'Bond', 'Other'])('does not assign an equity sector to %s, even with a matching stock symbol', (type) => {
    const row = stockRow({ symbol: 'AAPL', sector: 'Technology', industry: 'Software', type })
    expect(inferEquitySector(row)).toBeNull()
    expect(getSectorAllocation([row])).toEqual([])
    expect(filterHoldingsBySectors([row], SECTOR_FILTER_OPTIONS)).toEqual([])
  })

  it('includes unknown equities in the denominator and lets them be selected without funds or cash', () => {
    const rows = [
      stockRow({ symbol: 'INTC', sector: null, industry: null, marketValue: 300 }),
      stockRow({ symbol: 'UNKNOWN', sector: null, industry: null, marketValue: 100 }),
      stockRow({ symbol: 'VTI', sector: null, industry: null, type: 'Equity Fund', marketValue: 900 }),
      stockRow({ symbol: 'CASH', sector: null, industry: null, type: 'Cash', marketValue: 500 }),
    ]
    expect(getSectorAllocation(rows)).toEqual([
      expect.objectContaining({ name: 'Technology', value: 300, percentage: 75 }),
      expect.objectContaining({ name: 'Unclassified', value: 100, percentage: 25 }),
    ])
    expect(inferSector(rows[1]!)).toBe('Unclassified')
    expect(filterHoldingsBySectors(rows, ['Unclassified']).map((row) => row.symbol)).toEqual(['UNKNOWN'])
    expect(filterHoldingsBySectors(rows, [])).toEqual([])
  })

  it('uses only selected account values for sector totals', () => {
    const row = stockRow({ symbol: 'AMZN', sector: null, industry: null, marketValue: 1000 })
    row.details = [
      { ...row, id: 'a', accountId: 'a', accountName: 'Taxable', accountMask: '1111', marketValue: 250, custodian: 'Schwab' },
      { ...row, id: 'b', accountId: 'b', accountName: 'IRA', accountMask: '2222', marketValue: 750, custodian: 'Morgan Stanley' },
    ]
    const selectedRows = filterHoldingsByAccounts([row], ['a'])
    expect(getSectorAllocation(selectedRows)).toEqual([
      expect.objectContaining({ name: 'Consumer Discretionary', value: 250, percentage: 100 }),
    ])
    expect(filterHoldingsBySectors(selectedRows, ['Consumer Discretionary'])[0]?.marketValue).toBe(250)
  })

  it('keeps supplemental coverage unique and resolves each verified non-index stock', () => {
    const symbols = Object.values(ADDITIONAL_SYMBOLS_BY_SECTOR).flatMap((group) => group.split(' '))
    expect(symbols).toHaveLength(ADDITIONAL_SECTOR_CATALOG_SOURCE.symbolCount)
    expect(new Set(symbols).size).toBe(symbols.length)
    for (const [symbol, sector] of Object.entries(additionalSectorBySymbol)) {
      expect(sp500SectorBySymbol[symbol]).toBeUndefined()
      expect(inferEquitySector(stockRow({ symbol, sector: null, industry: null })), symbol).toBe(sector)
    }
  })

  it('categorizes the supplied reference tickers across all eleven sectors', () => {
    const rows = [
      stockRow({ symbol: 'GOOGL', sector: 'Technology Services', industry: 'Internet Software or Services' }),
      stockRow({ symbol: 'AMZN', sector: 'Retail Trade', industry: 'Internet Retail' }),
      stockRow({ symbol: 'WMT', sector: 'Retail Trade', industry: 'Discount Stores' }),
      stockRow({ symbol: 'XOM', sector: 'Energy & Minerals', industry: 'Integrated Oil' }),
      stockRow({ symbol: 'JPM', sector: 'Finance', industry: 'Major Banks' }),
      stockRow({ symbol: 'JNJ', sector: 'Health Technology', industry: 'Major Pharmaceuticals' }),
      stockRow({ symbol: 'BA', sector: 'Electronic Technology', industry: 'Aerospace and Defense' }),
      stockRow({ symbol: 'NEM', sector: 'Miscellaneous', industry: 'Miscellaneous' }),
      stockRow({ symbol: 'CBRE', sector: 'Finance', industry: 'Real Estate Development' }),
      stockRow({ symbol: 'VST', sector: 'Utilities', industry: 'Electric Utilities' }),
      stockRow({ symbol: 'AAPL', sector: 'Electronic Technology', industry: 'Telecommunications Equipment' }),
    ]

    const allocation = getSectorAllocation(rows)

    expect(allocation.map((item) => item.name).sort()).toEqual(
      [...EQUITY_SECTORS].sort(),
    )
    expect(allocation.every((item) => item.percentage === 100 / 11)).toBe(true)
    expect(allocation.find((item) => item.name === 'Communication Services')).toMatchObject({
      symbols: ['GOOGL'],
    })
  })

  it('normalizes provider industries and preserves an explicit fallback', () => {
    expect(
      inferEquitySector(
        stockRow({ symbol: 'REITX', sector: 'Finance', industry: 'Real Estate Investment Trusts' }),
      ),
    ).toBe('Real Estate')
    expect(
      inferEquitySector(
        stockRow({ symbol: 'TELCO', sector: 'Communications', industry: 'Wireless Telecommunications' }),
      ),
    ).toBe('Communication Services')

    const allocation = getSectorAllocation([
      stockRow({ symbol: 'NEW', sector: null, industry: null, marketValue: 75 }),
      stockRow({
        symbol: 'INDEX',
        sector: 'Technology',
        industry: 'Investment Trusts or Mutual Funds',
        marketValue: 25,
        type: 'ETF',
      }),
    ])

    expect(allocation).toEqual([
      expect.objectContaining({
        name: 'Unclassified',
        value: 75,
        percentage: 100,
        symbols: ['NEW'],
      }),
    ])
  })

  it('filters the holdings list to multiple selected sectors and excludes funds', () => {
    const rows = [
      stockRow({ symbol: 'AAPL', sector: 'Technology', industry: 'Computer Hardware' }),
      stockRow({ symbol: 'JPM', sector: 'Finance', industry: 'Major Banks' }),
      stockRow({ symbol: 'GOOGL', sector: 'Technology Services', industry: 'Internet Software or Services' }),
      stockRow({
        symbol: 'VTI',
        sector: 'Technology',
        industry: 'Investment Trusts or Mutual Funds',
        type: 'ETF',
      }),
    ]

    expect(
      filterHoldingsBySectors(rows, ['Technology', 'Financials']).map(
        (row) => row.symbol,
      ),
    ).toEqual(['AAPL', 'JPM'])
  })
})

function AllocationChartHarness() {
  const [selectedSectors, setSelectedSectors] = useState([...SECTOR_FILTER_OPTIONS])

  return (
    <AllocationChart
      assetData={[
        { name: 'Equities', value: 1_000, percentage: 100, color: '#2563eb' },
      ]}
      sectorData={[
        {
          name: 'Technology',
          value: 600,
          percentage: 60,
          color: '#4f46e5',
          symbols: ['AAPL', 'MSFT'],
        },
        {
          name: 'Financials',
          value: 400,
          percentage: 40,
          color: '#2563eb',
          symbols: ['JPM'],
        },
      ]}
      selectedSectors={selectedSectors}
      onSelectedSectorsChange={setSelectedSectors}
    />
  )
}

describe('AllocationChart', () => {
  it('shows and selects Unclassified, and resets it with the other sectors', async () => {
    const rows = [
      stockRow({ symbol: 'AAPL', sector: null, industry: null, marketValue: 600 }),
      stockRow({ symbol: 'UNKNOWN', sector: null, industry: null, marketValue: 400 }),
    ]
    function Harness() {
      const [selected, setSelected] = useState([...SECTOR_FILTER_OPTIONS])
      return <>
        <AllocationChart assetData={[]} sectorData={getSectorAllocation(rows)} selectedSectors={selected} onSelectedSectorsChange={setSelected} />
        <output aria-label="Filtered symbols">{filterHoldingsBySectors(rows, selected).map((row) => row.symbol).join(', ')}</output>
      </>
    }
    const user = userEvent.setup()
    render(<Harness />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Allocation view' }), 'sector')
    expect(screen.getByRole('checkbox', { name: /Unclassified/ })).toBeChecked()
    expect(screen.getByText('Selected total: $1.0K · 100.0%')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Uncheck all' }))
    await user.click(screen.getByRole('checkbox', { name: /Unclassified/ }))
    expect(screen.getByText('Selected total: $400 · 40.0%')).toBeInTheDocument()
    expect(screen.getByLabelText('Filtered symbols')).toHaveTextContent(/^UNKNOWN$/)
    await user.click(screen.getByRole('button', { name: 'Check all' }))
    expect(screen.getByLabelText('Filtered symbols')).toHaveTextContent('AAPL, UNKNOWN')
    await user.click(screen.getByRole('checkbox', { name: /Unclassified/ }))
    expect(screen.getByLabelText('Filtered symbols')).toHaveTextContent(/^AAPL$/)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Allocation view' }), 'asset')
    expect(screen.getByLabelText('Filtered symbols')).toHaveTextContent('AAPL, UNKNOWN')
  })

  it('switches between asset and sector views with an accessible dropdown', async () => {
    const user = userEvent.setup()

    render(<AllocationChartHarness />)

    expect(screen.getByRole('img', { name: 'Asset allocation chart' })).toBeInTheDocument()
    expect(screen.getByText('Equities')).toBeInTheDocument()

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Allocation view' }),
      'sector',
    )

    expect(screen.getByRole('img', { name: 'Sector allocation chart' })).toBeInTheDocument()
    expect(screen.getByText('Technology')).toBeInTheDocument()
    expect(screen.getByText('AAPL, MSFT')).toBeInTheDocument()
    expect(screen.getByText('60% in Technology')).toBeInTheDocument()
    expect(screen.getByText(/Funds and ETFs are excluded/i)).toBeInTheDocument()

    const sectorCheckboxes = screen.getAllByRole('checkbox')
    expect(sectorCheckboxes).toHaveLength(SECTOR_FILTER_OPTIONS.length)
    sectorCheckboxes.forEach((checkbox) => {
      expect(checkbox).toBeChecked()
      expect(checkbox).toHaveClass('accent-primary', 'focus:ring-focus')
    })

    await user.click(screen.getByRole('button', { name: 'Uncheck all' }))
    expect(screen.getByText('Selected total: $0 · 0.0%')).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: /Technology/ }))
    expect(screen.getByText('Selected total: $600 · 60.0%')).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: /Financials/ }))
    expect(screen.getByText('2 selected · 100.0% of direct stocks')).toBeInTheDocument()
    expect(screen.getByText('Selected total: $1.0K · 100.0%')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Check all' }))
    screen.getAllByRole('checkbox').forEach((checkbox) => expect(checkbox).toBeChecked())
  })
})
