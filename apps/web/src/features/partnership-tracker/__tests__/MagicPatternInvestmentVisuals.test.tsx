import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { K1TrackerCashFlowEvent } from '../../../../../../packages/types/src/k1-tracker'
import { MagicPatternInvestmentVisuals } from '../components/magic-patterns/MagicPatternInvestmentVisuals'
import { investmentPerformanceFixture } from './fixtures'

const flow = (
  id: string,
  kind: K1TrackerCashFlowEvent['kind'],
  activityDate: string,
  amount: string,
  feesAndCarry = '0',
  settlementStatus: K1TrackerCashFlowEvent['settlementStatus'] = 'SETTLED',
): K1TrackerCashFlowEvent => ({
  id,
  partnershipId: 'p-1',
  taxYear: 2026,
  kind,
  activityDate,
  amount,
  feesAndCarry,
  settlementStatus,
  announcedDate: settlementStatus === 'ANNOUNCED' ? activityDate : null,
  note: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
})

describe('Investment visual summary', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('keeps fee-only cash activity and the value bridge on the individual page', () => {
    render(<MagicPatternInvestmentVisuals
      events={[
        flow('call', 'CAPITAL_CALL', '2026-01-01', '100.00'),
        flow('fee', 'CAPITAL_CALL', '2026-02-01', '0.00', '10.0000'),
        flow('announced', 'DISTRIBUTION', '2026-03-01', '1000.00', '0', 'ANNOUNCED'),
        flow('distribution', 'DISTRIBUTION', '2026-04-01', '150.00', '15.1250'),
      ]}
      performance={{
        ...investmentPerformanceFixture,
        committedCapital: '200.00',
        paidInCapital: '100.0000',
        grossDistributions: '150.0000',
        feesAndCarry: '-25.1250',
        residualValue: '75.0000',
        residualValueDate: '2026-04-30',
      }}
    />)

    expect(screen.getByRole('region', { name: 'Investment visual summary' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Cash activity bars by activity date/ })).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /Cumulative net cash by activity date/ })).not.toBeInTheDocument()
    const svgTitles = Array.from(document.querySelectorAll('svg title'), (node) => node.textContent ?? '')
    expect(svgTitles).toContainEqual(expect.stringMatching(/Fees and carry -\$10.0000 USD/))
    expect(svgTitles).toContainEqual(expect.stringMatching(/Distribution \$1,000\.00 \(announced\)/))
    expect(screen.queryByRole('heading', { name: 'Commitment progress' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Cash paid composition' })).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: /\$99\.8750 net position/ })).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /Distribution mix:/ })).not.toBeInTheDocument()
  })

  it('does not treat a missing NAV as a real zero in the value bridge', () => {
    render(<MagicPatternInvestmentVisuals
      events={[]}
      performance={{ ...investmentPerformanceFixture, committedCapital: null, paidInCapital: '0.0000', grossDistributions: '0.0000', feesAndCarry: '0.0000', residualValue: '0.0000', residualValueDate: null }}
    />)

    expect(screen.getByText('Record a capital call or distribution to see cash activity.')).toBeInTheDocument()
    expect(screen.getByText(/Record a NAV \/ FMV valuation to show the current value bridge/)).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /Investment value bridge:/ })).not.toBeInTheDocument()
  })

  it('keeps distribution type mix on the individual page while other cash charts move', () => {
    render(<MagicPatternInvestmentVisuals
      events={[
        flow('call', 'CAPITAL_CALL', '2026-01-01', '100.00'),
        flow('fee', 'CAPITAL_CALL', '2026-02-01', '0.00', '10.0000'),
        flow('ordinary', 'DISTRIBUTION', '2026-03-01', '40.00', '5.0000'),
        flow('recallable', 'RECALLABLE_DISTRIBUTION', '2026-04-01', '20.00'),
        flow('announced', 'RECALLABLE_DISTRIBUTION', '2026-05-01', '1000.00', '0', 'ANNOUNCED'),
      ]}
      performance={{ ...investmentPerformanceFixture, committedCapital: '200.00', paidInCapital: '100.0000', grossDistributions: '60.0000', feesAndCarry: '-15.0000', residualValue: '0.0000', residualValueDate: null }}
    />)

    expect(screen.getByRole('img', { name: /Distribution mix: \$40\.00 non-recallable and \$20\.00 recallable/ })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Cash recovery' })).not.toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /Investment value bridge:/ })).not.toBeInTheDocument()
  })

  it('expands the remaining activity chart to the width available in its panel', async () => {
    vi.stubGlobal('ResizeObserver', class {
      callback: ResizeObserverCallback
      constructor(callback: ResizeObserverCallback) { this.callback = callback }
      observe() { this.callback([{ contentRect: { width: 860 } } as ResizeObserverEntry], this as unknown as ResizeObserver) }
      disconnect() {}
    })
    const { rerender } = render(<MagicPatternInvestmentVisuals
      events={[]}
      performance={investmentPerformanceFixture}
    />)
    rerender(<MagicPatternInvestmentVisuals
      events={[flow('call', 'CAPITAL_CALL', '2026-01-01', '100.00')]}
      performance={investmentPerformanceFixture}
    />)

    await waitFor(() => expect(screen.getByRole('img', { name: /Cash activity bars by activity date/ })).toHaveAttribute('width', '860'))
  })
})
