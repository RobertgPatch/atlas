import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { K1YearEntryForm } from '../components/K1YearEntryForm'
import { k1EntryDetailFixture } from '../../partnership-tracker/__tests__/fixtures'

describe('K-1 responsive structure', () => {
  it('keeps logical DOM order while promoting the paper form to split desktop regions', () => {
    render(<K1YearEntryForm detail={k1EntryDetailFixture} canEdit pending={false} onCalculate={vi.fn()} onSave={vi.fn()} onDirtyChange={vi.fn()} />)

    const form = screen.getByRole('form', { name: '2024 Schedule K-1 data entry' })
    const body = screen.getByTestId('k1-form-body')
    const identity = screen.getByTestId('k1-identity-panel')
    const partThree = screen.getByTestId('k1-part-three')
    const partThreeGrid = screen.getByTestId('k1-part-three-grid')
    const workpaper = screen.getByTestId('k1-supplemental-workpaper')

    expect(form).toHaveClass('min-w-0', 'overflow-clip')
    expect(body).toHaveClass('grid-cols-1', 'xl:grid-cols-[minmax(20rem,0.82fr)_minmax(0,1.38fr)]')
    expect(partThreeGrid).toHaveClass('grid-cols-1', 'lg:grid-cols-2')
    expect(identity.compareDocumentPosition(partThree) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(partThree.compareDocumentPosition(workpaper) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('contains long and negative money values and exposes a mobile-wrapping action rail', () => {
    render(<K1YearEntryForm detail={k1EntryDetailFixture} canEdit pending={false} onCalculate={vi.fn()} onSave={vi.fn()} onDirtyChange={vi.fn()} />)

    expect(screen.getByLabelText('Opening outside basis')).toHaveValue('$1,234,567,890.00')
    expect(screen.getByLabelText('Opening outside basis')).toHaveClass('min-w-0', 'text-right', 'tabular-nums')
    expect(screen.getByLabelText('Line 1 - Ordinary income (loss)')).toHaveValue('-$12,500.50')
    expect(screen.getByTestId('k1-form-actions')).toHaveClass('flex-col-reverse', 'sm:flex-row', 'sm:flex-wrap')
    for (const action of screen.getAllByRole('button')) expect(action).toHaveClass('min-h-11')
  })
})
