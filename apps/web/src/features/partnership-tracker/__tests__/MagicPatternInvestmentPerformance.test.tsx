import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MagicPatternInvestmentPerformance } from '../components/magic-patterns/MagicPatternInvestmentPerformance'
import { investmentPerformanceFixture } from './fixtures'

describe('Investment Performance', () => {
  it('renders all spreadsheet rows in order with the same displayed figures', () => {
    render(<MagicPatternInvestmentPerformance performance={investmentPerformanceFixture} partnershipName="Workbook example" cashOnCashYield="0.05" cashOnCashEndDate="2026-09-15" />)
    expect(screen.getByRole('heading', { name: 'Investment Performance' })).toBeInTheDocument()
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    const expected = [
      ['Final liquidation date', '09/15/2026'], ['Committed capital ($)', '$600,000'], ['Residual / ending valuation ($)', '$0'],
      ['Cash-on-cash yield', '5.0%'],
      ['Paid-in capital (contributions)', '$641,939'], ['Gross distributions', '$1,604,846'], ['Fees & carry', '($192,582)'],
      ['Net distributions to LP', '$1,412,265'], ['% of commitment called', '107.0%'], ['Gross MOIC (x)', '2.50x'],
      ['Net MOIC / DPI (x)', '2.20x'], ['Gross XIRR', '24.6%'], ['Net XIRR', '21.5%'], ['Net gain / (loss) ($)', '$770,326'],
      ['Holding period to liquidation (years)', '5.63'], ['RVPI — residual value / paid-in (x)', '0.00x'],
      ['TVPI — total value / paid-in (x)', '2.20x'], ['Net XIRR incl. residual value', '21.5%'],
    ]
    expect(rows).toHaveLength(expected.length)
    expected.forEach(([label, value], index) => {
      expect(within(rows[index]!).getByRole('rowheader', { name: label })).toBeInTheDocument()
      expect(within(rows[index]!).getByText(value!)).toBeInTheDocument()
    })
  })

  it('floors net gain at zero and shows n/a for missing inputs', () => {
    render(<MagicPatternInvestmentPerformance partnershipName="Missing inputs" performance={{ ...investmentPerformanceFixture,
      committedCapital: null, finalLiquidationDate: null, holdingPeriodYears: null, grossMoic: null, commitmentCalled: null,
      netGain: '-100', grossXirr: null, xirrStatus: { ...investmentPerformanceFixture.xirrStatus, gross: 'INSUFFICIENT_CASH_FLOWS' },
    }} />)
    const netGainRow = screen.getByRole('rowheader', { name: 'Net gain / (loss) ($)' }).closest('tr')
    expect(netGainRow).not.toBeNull()
    expect(within(netGainRow!).getByText('$0')).toBeInTheDocument()
    expect(screen.getByText(/minimum of zero/)).toBeInTheDocument()
    expect(screen.getByText('Not recorded')).toBeInTheDocument()
    expect(screen.getByText('No valuation; using $0')).toBeInTheDocument()
    expect(screen.getAllByText('n/a')).toHaveLength(6)
    expect(screen.getByText(/requires both inflows and outflows/)).toBeInTheDocument()
  })
})
