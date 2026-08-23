import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { YearRail } from '../components/YearRail'

describe('YearRail', () => {
  it('keeps a large year history in a compact, selectable rail', () => {
    const select = vi.fn()
    render(<YearRail selectedYear={2020} onSelect={select} years={Array.from({ length: 50 }, (_, index) => ({ taxYear: 1971 + index, status: 'IMPORTED' as const, revision: 1, capitalContributed: '0.00', distributions: '0.00', endingOutsideBasis: '0.00', cumulativeSuspendedLoss: '0.00', taxableExcessDistribution: '0.00', sectionLDifference: '0.00', warningCount: index === 49 ? 2 : 0, sourceConflictCount: 0 }))} />)
    const finalYear = screen.getByRole('button', { name: /2020/i })
    expect(finalYear).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: /2019/i }))
    expect(select).toHaveBeenCalledWith(2019)
  })

  it('supports nonconsecutive years and prefetches when a year receives focus', () => {
    const select = vi.fn(); const prefetch = vi.fn()
    render(<YearRail selectedYear={2021} onSelect={select} onPrefetch={prefetch} years={[2021, 2024].map((taxYear) => ({ taxYear, status: 'IMPORTED' as const, revision: 1, capitalContributed: '0.00', distributions: '0.00', endingOutsideBasis: '0.00', cumulativeSuspendedLoss: '0.00', taxableExcessDistribution: '0.00', sectionLDifference: '0.00', warningCount: taxYear === 2024 ? 1 : 0, sourceConflictCount: 0 }))} />)
    const later = screen.getByRole('button', { name: /2024/i })
    later.focus()
    fireEvent.focus(later)
    expect(prefetch).toHaveBeenCalledWith(2024)
    expect(screen.getByText('1 checks')).toBeInTheDocument()
  })

  it('shows workflow status for a one-year tracker and supports Enter and Space selection', () => {
    const select = vi.fn()
    render(<YearRail selectedYear={2024} onSelect={select} years={[{ taxYear: 2024, status: 'NEEDS_REVIEW', revision: 1, capitalContributed: '0.00', distributions: '0.00', endingOutsideBasis: '0.00', cumulativeSuspendedLoss: '0.00', taxableExcessDistribution: '0.00', sectionLDifference: '0.00', warningCount: 0, sourceConflictCount: 0 }]} />)
    const year = screen.getByRole('button', { name: /2024/i })
    expect(screen.getByText('Needs review')).toBeInTheDocument()
    fireEvent.keyDown(year, { key: 'Enter' })
    fireEvent.keyDown(year, { key: ' ' })
    expect(select).toHaveBeenNthCalledWith(1, 2024)
    expect(select).toHaveBeenNthCalledWith(2, 2024)
  })

  it('uses labeled checkboxes when multiple years are being selected', () => {
    const toggle = vi.fn()
    const years = [2023, 2024].map((taxYear) => ({ taxYear, status: 'IMPORTED' as const, revision: 1, capitalContributed: '0.00', distributions: '0.00', endingOutsideBasis: '0.00', cumulativeSuspendedLoss: '0.00', taxableExcessDistribution: '0.00', sectionLDifference: '0.00', warningCount: 0, sourceConflictCount: 0 }))
    render(<YearRail years={years} selectedYear={2024} onSelect={vi.fn()} selectionMode selectedYears={[2023]} onToggleSelection={toggle} appearance="magic-pattern" />)

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Select K-1 entry years' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Select 2023 K-1 year' })).toBeChecked()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select 2024 K-1 year' }))
    expect(toggle).toHaveBeenCalledWith(2024)
  })
})
