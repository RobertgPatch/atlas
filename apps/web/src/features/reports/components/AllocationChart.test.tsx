import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { ConsolidatedHoldingRow } from '../../../../../../packages/types/src/reports'
import {
  EQUITY_SECTORS,
  filterHoldingsBySectors,
  getSectorAllocation,
  inferEquitySector,
} from '../utils/consolidatedHoldingsAnalytics'
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
  const [selectedSectors, setSelectedSectors] = useState([...EQUITY_SECTORS])

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
    expect(sectorCheckboxes).toHaveLength(EQUITY_SECTORS.length)
    sectorCheckboxes.forEach((checkbox) => expect(checkbox).toBeChecked())

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
