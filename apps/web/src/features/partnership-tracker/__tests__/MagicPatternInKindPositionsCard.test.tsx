import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { K1TrackerCashFlowEvent } from '../../../../../../packages/types/src/k1-tracker'
import {
  MagicPatternInKindPositionsCard,
} from '../components/magic-patterns/MagicPatternInKindPositionsCard'
import {
  formatInKindActivityNote,
  inKindLotsFor,
  parseInKindActivityNote,
} from '../components/magic-patterns/MagicPatternOperationalUtils'

const event = (note: string | null): K1TrackerCashFlowEvent => ({
  id: 'lot-1',
  partnershipId: '11111111-1111-4111-8111-111111111111',
  taxYear: 2026,
  kind: 'DISTRIBUTION',
  activityDate: '2026-06-12',
  settlementStatus: 'SETTLED',
  announcedDate: null,
  amount: '4000.00',
  note,
  createdAt: '2026-06-12T12:00:00.000Z',
  updatedAt: '2026-06-12T12:00:00.000Z',
})

describe('Magic Patterns securities received in kind', () => {
  it('round-trips structured security detail through the persisted activity note', () => {
    const note = formatInKindActivityNote({
      ticker: 'nvda',
      securityName: 'NVIDIA Corporation',
      shares: 100,
      costBasisPerShare: 25,
      fmvPerShare: 40,
      source: 'Manager notice 06/12/2026',
      note: 'Restricted lot',
    })

    expect(parseInKindActivityNote(note)).toEqual({
      ticker: 'NVDA',
      name: 'NVIDIA Corporation',
      shares: 100,
      costBasisPerShare: 25,
      fmvPerShare: 40,
      source: 'Manager notice 06/12/2026',
      note: 'Restricted lot',
    })
  })

  it('populates the reference table and totals from recorded distribution activity', () => {
    const activity = event('Source: Manager statement — In kind · 100 NVDA at $40.00 FMV per share · cost basis $25.00 per share · NVIDIA Corporation — Restricted lot')
    expect(inKindLotsFor([activity])).toHaveLength(1)

    render(<MagicPatternInKindPositionsCard events={[activity]} />)

    const card = screen.getByTestId('securities-received-in-kind')
    expect(within(card).getByText('1 lot')).toBeInTheDocument()
    expect(within(card).getByText('NVDA')).toBeInTheDocument()
    expect(within(card).getByText('NVIDIA Corporation')).toBeInTheDocument()
    expect(within(card).getByText('100')).toBeInTheDocument()
    expect(within(card).getByText('$2,500.00')).toBeInTheDocument()
    expect(within(card).getByText('$4,000.00')).toBeInTheDocument()
  })

  it('does not treat ordinary distribution notes as security lots', () => {
    render(<MagicPatternInKindPositionsCard events={[event('Quarterly cash distribution')]} />)

    expect(screen.getByText('0 lots')).toBeInTheDocument()
    expect(screen.getByText(/No in-kind distributions recorded/)).toBeInTheDocument()
  })
})
