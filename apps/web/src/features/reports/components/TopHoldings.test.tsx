import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { TopHoldingDatum } from '../utils/consolidatedHoldingsAnalytics'
import { TopHoldings } from './TopHoldings'

const holdings: TopHoldingDatum[] = [
  { id: 'AAA', symbol: 'AAA', description: 'Alpha', marketValue: 50_000, unrealizedGainLoss: 5_000, gainLossPercent: 11.1, costBasisStatus: 'complete', weight: 50, sector: 'Technology' },
  { id: 'BBB', symbol: 'BBB', description: 'Beta', marketValue: 30_000, unrealizedGainLoss: -8_000, gainLossPercent: -21.1, costBasisStatus: 'complete', weight: 30, sector: 'Financials' },
  { id: 'CCC', symbol: 'CCC', description: 'Gamma', marketValue: 20_000, unrealizedGainLoss: 7_000, gainLossPercent: 53.8, costBasisStatus: 'complete', weight: 20, sector: 'Industrials' },
]

describe('TopHoldings ranking tabs', () => {
  it('switches between market value, gains, losses, and percentage return rankings', async () => {
    const user = userEvent.setup()
    render(<TopHoldings holdings={holdings} />)

    expect(screen.getByRole('tab', { name: 'Largest positions' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getAllByText(/AAA|BBB|CCC/)[0]).toHaveTextContent('AAA')

    await user.click(screen.getByRole('tab', { name: 'Top gains' }))
    expect(screen.getByText('+$7.0K')).toBeInTheDocument()
    expect(screen.queryByText('BBB')).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Biggest losers' }))
    expect(screen.getByText('-$8.0K')).toBeInTheDocument()
    expect(screen.getByText('BBB')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Best returns' }))
    expect(screen.getByText('+53.8%')).toBeInTheDocument()
  })

  it('supports arrow-key navigation between ranking tabs', async () => {
    const user = userEvent.setup()
    render(<TopHoldings holdings={holdings} />)

    await user.click(screen.getByRole('tab', { name: 'Largest positions' }))
    await user.keyboard('{ArrowRight}')

    expect(screen.getByRole('tab', { name: 'Top gains' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('tab', { name: 'Top gains' })).toHaveFocus()
  })
})
