import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CompareYearsDrawer } from '../components/CompareYearsDrawer'

describe('K1 Tracker accessibility', () => {
  it('gives the comparison drawer an accessible name and keyboard-operable year choices', () => {
    render(<CompareYearsDrawer years={[2023, 2024].map((taxYear) => ({ taxYear, status: 'IMPORTED' as const, revision: 1, endingOutsideBasis: '100.00', cumulativeSuspendedLoss: '0.00', taxableExcessDistribution: '0.00', sectionLDifference: '0.00', warningCount: 0, sourceConflictCount: 0 }))} selectedYear={2024} onClose={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: /compare tracker years/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2024' })).toHaveAttribute('aria-pressed', 'true')
  })
})
