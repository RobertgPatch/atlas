import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CompareYearsDrawer } from '../components/CompareYearsDrawer'
import { yearSummaryFixtures } from '../../partnership-tracker/__tests__/fixtures'

const years = yearSummaryFixtures(10)

describe('Compare Years drawer', () => {
  it('selects every year and renders exactly the requested financial rows', () => {
    render(<CompareYearsDrawer years={years} selectedYear={2024} onClose={vi.fn()} />)

    expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(10)
    const table = screen.getByRole('table')
    expect(within(table).getByText('Capital Contributed')).toBeInTheDocument()
    expect(within(table).getByText('Distributions')).toBeInTheDocument()
    expect(within(table).getByText('Ending Outside Basis')).toBeInTheDocument()
    expect(within(table).queryByText('Suspended loss')).not.toBeInTheDocument()
    expect(within(table).queryByText('Warnings')).not.toBeInTheDocument()
    expect(within(table).getAllByText('Not available')).toHaveLength(2)
  })

  it('allows one through all years and gives long histories a stable minimum width', () => {
    render(<CompareYearsDrawer years={years} onClose={vi.fn()} />)
    for (const year of years.slice(1)) fireEvent.click(screen.getByRole('button', { name: String(year.taxYear) }))
    expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(1)
    expect(screen.getByRole('button', { name: '2024' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('table')).toHaveStyle({ minWidth: '20rem' })
  })

  it('uses the viewport and confines overflow to the table region', () => {
    render(<CompareYearsDrawer years={years} onClose={vi.fn()} />)
    expect(screen.getByRole('dialog')).toHaveClass('h-[100dvh]')
    expect(screen.getByTestId('compare-years-table-scroll')).toHaveClass('overflow-auto')
    expect(screen.getByRole('table')).toHaveStyle({ minWidth: '92rem' })
  })
})
