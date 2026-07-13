import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AddYearDialog } from '../components/AddYearDialog'
import { YearRail } from '../components/YearRail'

describe('manual K-1 workflow', () => {
  it('allows any supported tax year instead of forcing an increment', async () => {
    const add = vi.fn().mockResolvedValue(undefined)
    render(<AddYearDialog defaultTaxYear={2024} pending={false} onClose={vi.fn()} onAdd={add} />)
    fireEvent.change(screen.getByLabelText('Tax year'), { target: { value: '2017' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add year' }))
    expect(add).toHaveBeenCalledWith(2017)
    expect(screen.getByText(/does not have to be the next chronological year/i)).toBeInTheDocument()
  })
  it('keeps fifty nonconsecutive years in a horizontal compact rail', () => {
    const years = Array.from({ length: 50 }, (_, index) => ({ taxYear: 1950 + index * 2, status: 'IN_PROGRESS' as const, revision: 1, endingOutsideBasis: null, cumulativeSuspendedLoss: null, taxableExcessDistribution: null, sectionLDifference: null, warningCount: 1, sourceConflictCount: 0 }))
    render(<YearRail years={years} selectedYear={years.at(-1)!.taxYear} onSelect={vi.fn()} />)
    expect(screen.getAllByRole('button')).toHaveLength(50)
    expect(screen.getAllByText('In progress')).toHaveLength(50)
  })
})
