import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { K1TrackerCashFlowEvent } from '../../../../../../packages/types/src/k1-tracker'
import { MagicPatternInvestmentVisuals } from '../components/magic-patterns/MagicPatternInvestmentVisuals'

const flow = (
  id: string,
  kind: K1TrackerCashFlowEvent['kind'],
  activityDate: string,
  amount: string,
  settlementStatus: K1TrackerCashFlowEvent['settlementStatus'] = 'SETTLED',
): K1TrackerCashFlowEvent => ({
  id,
  partnershipId: 'p-1',
  taxYear: 2026,
  kind,
  activityDate,
  amount,
  feesAndCarry: '0',
  settlementStatus,
  announcedDate: settlementStatus === 'ANNOUNCED' ? activityDate : null,
  note: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
})

describe('Investment visual summary', () => {
  it('keeps only the distribution mix on the individual partnership page', () => {
    render(<MagicPatternInvestmentVisuals events={[
      flow('call', 'CAPITAL_CALL', '2026-01-01', '100.00'),
      flow('ordinary', 'DISTRIBUTION', '2026-03-01', '40.00'),
      flow('recallable', 'RECALLABLE_DISTRIBUTION', '2026-04-01', '20.00'),
      flow('announced', 'RECALLABLE_DISTRIBUTION', '2026-05-01', '1000.00', 'ANNOUNCED'),
    ]} />)

    expect(screen.getByRole('img', { name: /Distribution mix: \$40\.00 non-recallable and \$20\.00 recallable/ })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Cash activity' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Investment value bridge' })).not.toBeInTheDocument()
  })

  it('does not leave an empty visual section when there is no distribution mix', () => {
    render(<MagicPatternInvestmentVisuals events={[flow('call', 'CAPITAL_CALL', '2026-01-01', '100.00')]} />)

    expect(screen.queryByRole('region', { name: 'Investment visual summary' })).not.toBeInTheDocument()
  })
})
