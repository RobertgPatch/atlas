import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { PartnershipTrackerYearDetail } from '../../../../../../packages/types/src/partnership-tracker'
import { K1YearEntryForm } from '../../k1-tracker/components/K1YearEntryForm'
import { K1_EDITABLE_FIELDS } from '../../k1-tracker/k1FieldGroups'
import { PartnershipPicker } from '../components/PartnershipPicker'
import { NavHistoryChart } from '../components/NavHistoryChart'
import { navFixtures, summaryFixture } from './fixtures'

const inlineDetail = {
  partnershipId: 'p-1', taxYear: 2024, revision: 1, status: 'NOT_STARTED', values: [],
  calculation: { basis: {}, lossLimitation: {}, liabilities: {}, sectionL: {} },
} as unknown as PartnershipTrackerYearDetail

describe('Partnership Tracker accessibility', () => {
  it('gives the autocomplete, selection, plot points, and textual chart alternative accessible names', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><PartnershipPicker items={[summaryFixture]} selectedId="p-1" search="" loading={false} canEdit onSearch={vi.fn()} onSelect={vi.fn()} onAdd={vi.fn()} /><NavHistoryChart items={navFixtures} /></MemoryRouter>)
    expect(screen.getByTestId('partnership-selector')).toHaveAccessibleName('Partnership workspace')
    expect(screen.getByRole('combobox', { name: 'Partnership workspace' })).toHaveAttribute('aria-autocomplete', 'list')
    await user.click(screen.getByRole('button', { name: 'Open partnership options' }))
    expect(screen.getByRole('option', { name: /Redwood Fund/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('img', { name: /NAV values plotted proportionally/i })).toBeInTheDocument()
    expect(screen.getByText(/NAV increased/i)).toBeInTheDocument()
  })
  it('searches and selects another partnership from the autocomplete', async () => {
    const user = userEvent.setup()
    const onSearch = vi.fn()
    const onSelect = vi.fn()
    const secondPartnership = {
      ...summaryFixture,
      partnership: { ...summaryFixture.partnership, id: 'p-2', name: 'Bluewater Credit Fund' },
    }
    render(<MemoryRouter><PartnershipPicker items={[summaryFixture, secondPartnership]} selectedId="p-1" search="" loading={false} canEdit={false} onSearch={onSearch} onSelect={onSelect} onAdd={vi.fn()} /></MemoryRouter>)

    const input = screen.getByRole('combobox', { name: 'Partnership workspace' })
    await user.click(input)
    await user.clear(input)
    await user.type(input, 'Bluewater')
    expect(onSearch).toHaveBeenLastCalledWith('Bluewater')
    await user.click(screen.getByRole('option', { name: /Bluewater Credit Fund/ }))
    expect(onSelect).toHaveBeenCalledWith('p-2')
    expect(onSearch).toHaveBeenLastCalledWith('')
  })
  it('keeps the continuous K-1 form labeled, keyboard reachable, and error-announcing', async () => {
    const user = userEvent.setup()
    render(<K1YearEntryForm detail={inlineDetail} canEdit pending={false} onCalculate={vi.fn()} onSave={vi.fn()} onDirtyChange={vi.fn()} />)
    const firstAmount = screen.getByLabelText('Nonrecourse liabilities - beginning')
    const firstControl = screen.getByLabelText('Item G - Partner type')
    expect(screen.getByRole('form', { name: '2024 Schedule K-1 data entry' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Part I — Information About the Partnership' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Part II — Information About the Partner' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Part III — Partner’s Share/ })).toBeInTheDocument()
    for (const field of K1_EDITABLE_FIELDS) expect(screen.getByLabelText(field.label)).toBeInTheDocument()
    expect(firstAmount).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Preview calculation' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save revisions' })).toBeInTheDocument()
    await user.tab()
    expect(firstControl).toHaveFocus()
    await user.click(firstAmount)
    await user.clear(firstAmount)
    await user.type(firstAmount, '1,00')
    await user.tab()
    expect(screen.getByRole('alert')).toHaveTextContent('valid comma grouping')
  })
  it('keeps values and provenance readable without exposing edit actions to read-only users', () => {
    render(<K1YearEntryForm detail={inlineDetail} canEdit={false} pending={false} onCalculate={vi.fn()} onSave={vi.fn()} onDirtyChange={vi.fn()} />)
    for (const field of K1_EDITABLE_FIELDS) expect(screen.getByLabelText(field.label)).toBeDisabled()
    expect(screen.queryByRole('checkbox', { name: /Manual override/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Preview calculation' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save revisions' })).not.toBeInTheDocument()
  })
})
