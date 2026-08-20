import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PartnershipNavEntry } from '../../../../../../packages/types/src/partnership-tracker'
import { MagicPatternOperationalChart } from '../components/magic-patterns/MagicPatternOperationalChart'

const navEntry = (id: string, valuationDate: string, amount: string): PartnershipNavEntry => ({
  id,
  partnershipId: '11111111-1111-4111-8111-111111111111',
  amount,
  valuationDate,
  sourceType: 'manager_statement',
  note: null,
  createdAt: `${valuationDate}T12:00:00.000Z`,
  updatedAt: `${valuationDate}T12:00:00.000Z`,
})

describe('MagicPatternOperationalChart', () => {
  it('keeps the plot constrained and supports the reference date-range controls', () => {
    render(<MagicPatternOperationalChart items={[
      navEntry('old', '2021-08-26', '1000000.00'),
      navEntry('latest', '2026-08-26', '5000000.00'),
    ]} />)

    const plot = screen.getByTestId('nav-fmv-plot')
    expect(plot).toHaveClass('max-w-[680px]')
    expect(screen.getByRole('img', { name: 'NAV and fair market value history' })).toBeInTheDocument()
    expect(plot.querySelectorAll('circle')).toHaveLength(2)

    const range = screen.getByRole('group', { name: 'Chart date range' })
    expect(within(range).getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(within(range).getByRole('button', { name: '3 yr' }))

    expect(within(range).getByRole('button', { name: '3 yr' })).toHaveAttribute('aria-pressed', 'true')
    expect(plot.querySelectorAll('circle')).toHaveLength(1)
  })
})
