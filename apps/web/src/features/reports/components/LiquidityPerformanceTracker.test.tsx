import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { LiquidityPerformancePoint } from '../../../../../../packages/types/src/reports'
import {
  LiquidityPerformanceTracker,
} from './LiquidityPerformanceTracker'
import { selectPerformancePoints } from '../utils/liquidityPerformanceAnalytics'

const point = (
  input: Pick<
    LiquidityPerformancePoint,
    'date' | 'totalMarketValue' | 'totalCostBasis' | 'totalUnrealizedGainLoss'
  >,
): LiquidityPerformancePoint => ({
  ...input,
  accountCount: 2,
  source: 'market_close',
  capturedAt: `${input.date}T20:20:00.000Z`,
  priceAsOf: `${input.date}T20:00:00.000Z`,
  pricedHoldingCount: 3,
  fallbackHoldingCount: 0,
})

const points: LiquidityPerformancePoint[] = [
  point({ date: '2026-07-31', totalMarketValue: 90_000, totalCostBasis: 75_000, totalUnrealizedGainLoss: 15_000 }),
  point({ date: '2026-08-01', totalMarketValue: 92_000, totalCostBasis: 75_000, totalUnrealizedGainLoss: 17_000 }),
  point({ date: '2026-08-14', totalMarketValue: 98_000, totalCostBasis: 76_000, totalUnrealizedGainLoss: 22_000 }),
  point({ date: '2026-08-20', totalMarketValue: 100_000, totalCostBasis: 76_000, totalUnrealizedGainLoss: 24_000 }),
]

describe('LiquidityPerformanceTracker', () => {
  it('selects the nearest baseline at the start of a preset range', () => {
    const selected = selectPerformancePoints(points, '1w')

    expect(selected.map((point) => point.date)).toEqual([
      '2026-08-01',
      '2026-08-14',
      '2026-08-20',
    ])
  })

  it('handles month-end ranges without rolling the start into the latest month', () => {
    const monthEndPoints: LiquidityPerformancePoint[] = [
      point({ ...points[0]!, date: '2026-02-28' }),
      point({ ...points[1]!, date: '2026-03-01' }),
      point({ ...points[2]!, date: '2026-03-31' }),
    ]

    expect(selectPerformancePoints(monthEndPoints, '1m').map((point) => point.date)).toEqual([
      '2026-02-28',
      '2026-03-01',
      '2026-03-31',
    ])
  })

  it('shows plotted value change and supports custom date controls', async () => {
    const user = userEvent.setup()
    render(<LiquidityPerformanceTracker points={points} />)

    expect(screen.getByRole('img', { name: /portfolio value from/i })).toBeInTheDocument()
    expect(screen.getByText('+$10,000 (+11.11%)')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Custom' }))

    expect(screen.getByLabelText('Start date')).toHaveValue('2026-07-31')
    expect(screen.getByLabelText('End date')).toHaveValue('2026-08-20')
  })

  it('keeps the graph on saved closing values when a newer live valuation exists', () => {
    render(
      <LiquidityPerformanceTracker
        points={points}
        currentPoint={{
          ...point({
            date: '2026-08-21',
            totalMarketValue: 110_000,
            totalCostBasis: 76_000,
            totalUnrealizedGainLoss: 34_000,
          }),
          source: 'current',
        }}
      />,
    )

    expect(screen.getByText('$100,000')).toBeInTheDocument()
    expect(screen.getByText('+$10,000 (+11.11%)')).toBeInTheDocument()
    expect(screen.getByText(/official close · 3 priced/i)).toBeInTheDocument()
  })

  it('explains when only the first snapshot is available', () => {
    render(<LiquidityPerformanceTracker points={[points[0]!]} />)

    expect(screen.getByText(/first change will appear after the next market close/i)).toBeInTheDocument()
  })
})
