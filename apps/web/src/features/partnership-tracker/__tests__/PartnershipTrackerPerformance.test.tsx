import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { PartnershipPicker } from '../components/PartnershipPicker'
import { PartnershipOverview } from '../components/PartnershipOverview'
import { PerformanceMetricStrip } from '../components/PerformanceMetricStrip'
import { summaryFixture } from './fixtures'

describe('Partnership Tracker large-directory rendering', () => {
  it('renders a 100-partnership bounded directory without dropping selection', () => {
    const items = Array.from({ length: 100 }, (_, index) => ({ ...summaryFixture, partnership: { ...summaryFixture.partnership, id: `p-${index}`, name: `Partnership ${index}` } }))
    const started = performance.now()
    render(<MemoryRouter><PartnershipPicker items={items} selectedId="p-99" search="" loading={false} canEdit={false} onSearch={vi.fn()} onSelect={vi.fn()} onAdd={vi.fn()} /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Open partnership options' }))
    expect(screen.getAllByRole('option')).toHaveLength(100)
    expect(screen.getByRole('option', { name: /Partnership 99/ })).toHaveAttribute('aria-selected', 'true')
    expect(performance.now() - started).toBeLessThan(2000)
  })

  it('renders precise and current performance metrics', () => {
    render(<PerformanceMetricStrip summary={summaryFixture} />)
    expect(screen.getByText('7.87%')).toBeInTheDocument()
    expect(screen.getByText('5.00%')).toBeInTheDocument()
    expect(screen.getByText('Unfunded commitment')).toBeInTheDocument()
    expect(screen.getByText('$525,000')).toBeInTheDocument()
  })

  it('shows NAV once on the overview', () => {
    render(<MemoryRouter><PartnershipOverview summary={summaryFixture} /></MemoryRouter>)
    expect(screen.getAllByText('NAV')).toHaveLength(1)
  })

  it('masks the EIN until the user explicitly reveals it', () => {
    render(<MemoryRouter><PartnershipOverview summary={summaryFixture} /></MemoryRouter>)
    expect(screen.getByText('**-*******')).toBeInTheDocument()
    expect(screen.queryByText('12-3456789')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Unmask EIN' }))
    expect(screen.getByText('12-3456789')).toBeInTheDocument()
  })
})
