import { render, screen } from '@testing-library/react'
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
    expect(screen.getAllByRole('button')).toHaveLength(100)
    expect(screen.getByRole('button', { name: /Partnership 99/ })).toHaveAttribute('aria-current', 'true')
    expect(performance.now() - started).toBeLessThan(2000)
  })

  it('renders precise and current performance metrics', () => {
    render(<PerformanceMetricStrip summary={summaryFixture} />)
    expect(screen.getByText('7.87%')).toBeInTheDocument()
    expect(screen.getByText('5.00%')).toBeInTheDocument()
    expect(screen.getByText('Unfunded commitment')).toBeInTheDocument()
    expect(screen.getByText('$525,000.00')).toBeInTheDocument()
  })

  it('shows NAV once on the overview', () => {
    render(<MemoryRouter><PartnershipOverview summary={summaryFixture} canEdit={false} onEdit={vi.fn()} /></MemoryRouter>)
    expect(screen.getAllByText('NAV')).toHaveLength(1)
  })
})
