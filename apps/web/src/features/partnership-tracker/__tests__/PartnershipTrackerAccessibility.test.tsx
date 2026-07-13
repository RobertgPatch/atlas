import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { PartnershipPicker } from '../components/PartnershipPicker'
import { NavHistoryChart } from '../components/NavHistoryChart'
import { navFixtures, summaryFixture } from './fixtures'

describe('Partnership Tracker accessibility', () => {
  it('gives the picker, search, selection, plot points, and textual chart alternative accessible names', () => {
    render(<MemoryRouter><PartnershipPicker items={[summaryFixture]} selectedId="p-1" search="" loading={false} canEdit onSearch={vi.fn()} onSelect={vi.fn()} onAdd={vi.fn()} /><NavHistoryChart items={navFixtures} /></MemoryRouter>)
    expect(screen.getByLabelText('Partnership directory')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Search partnerships' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Redwood Fund/ })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('img', { name: /NAV values plotted proportionally/i })).toBeInTheDocument()
    expect(screen.getByText(/NAV increased/i)).toBeInTheDocument()
  })
})
