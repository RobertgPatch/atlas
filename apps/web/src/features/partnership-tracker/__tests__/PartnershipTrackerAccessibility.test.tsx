import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { PartnershipTrackerYearDetail } from '../../../../../../packages/types/src/partnership-tracker'
import { K1YearEntryForm } from '../../k1-tracker/components/K1YearEntryForm'
import { PartnershipPicker } from '../components/PartnershipPicker'
import { NavHistoryChart } from '../components/NavHistoryChart'
import { navFixtures, summaryFixture } from './fixtures'

const inlineDetail = {
  partnershipId: 'p-1', taxYear: 2024, revision: 1, status: 'NOT_STARTED', values: [],
  calculation: { basis: {}, lossLimitation: {}, liabilities: {}, sectionL: {} },
} as unknown as PartnershipTrackerYearDetail

describe('Partnership Tracker accessibility', () => {
  it('gives the picker, search, selection, plot points, and textual chart alternative accessible names', () => {
    render(<MemoryRouter><PartnershipPicker items={[summaryFixture]} selectedId="p-1" search="" loading={false} canEdit onSearch={vi.fn()} onSelect={vi.fn()} onAdd={vi.fn()} /><NavHistoryChart items={navFixtures} /></MemoryRouter>)
    expect(screen.getByLabelText('Partnership directory')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Search partnerships' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Redwood Fund/ })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('img', { name: /NAV values plotted proportionally/i })).toBeInTheDocument()
    expect(screen.getByText(/NAV increased/i)).toBeInTheDocument()
  })
  it('keeps the continuous K-1 form labeled, keyboard reachable, and error-announcing', async () => {
    const user = userEvent.setup()
    render(<K1YearEntryForm detail={inlineDetail} canEdit pending={false} onCalculate={vi.fn()} onSave={vi.fn()} onDirtyChange={vi.fn()} />)
    const firstAmount = screen.getByLabelText('Opening outside basis')
    expect(firstAmount).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Preview calculation' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save revisions' })).toBeInTheDocument()
    await user.tab()
    expect(firstAmount).toHaveFocus()
    await user.clear(firstAmount)
    await user.type(firstAmount, '1,00')
    await user.tab()
    expect(screen.getByRole('alert')).toHaveTextContent('valid comma grouping')
  })
})
