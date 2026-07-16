import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { LegacyPartnershipRedirect } from '../../../App'
import { AppShell } from '../../../components/shared/AppShell'
import { PartnershipViewSwitcher } from '../components/PartnershipViewSwitcher'

describe('Partnership Tracker navigation', () => {
  beforeEach(() => window.localStorage.clear())

  it('shows one consolidated active navigation item', () => {
    render(<MemoryRouter><AppShell currentPath="/partnership-tracker" userRole="Admin"><div>Workspace</div></AppShell></MemoryRouter>)
    const link = screen.getByRole('link', { name: 'Partnerships' })
    expect(link).toHaveAttribute('href', '/partnership-tracker')
    expect(link.className).toContain('text-atlas-gold')
    expect(screen.getAllByRole('link', { name: 'Partnerships' })).toHaveLength(1)
    expect(screen.queryByRole('link', { name: 'Partnership Tracker' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /K1 Tracker/i })).not.toBeInTheDocument()
  })

  it('preserves a selected partnership and query state through legacy redirects', () => {
    render(<MemoryRouter initialEntries={['/partnerships/p-123?year=2021']}><Routes><Route path="/partnerships/:id" element={<LegacyPartnershipRedirect detail />} /><Route path="/partnership-tracker" element={<div>Redirected <Location /></div>} /></Routes></MemoryRouter>)
    expect(screen.getByText(/partnership=p-123/)).toBeInTheDocument()
    expect(screen.getByText(/year=2021/)).toBeInTheDocument()
  })
  it('normalizes old K1 Tracker query parameter names', () => {
    render(<MemoryRouter initialEntries={['/k1-tracker?partnershipId=p-9&taxYear=2018']}><Routes><Route path="/k1-tracker" element={<LegacyPartnershipRedirect />} /><Route path="/partnership-tracker" element={<Location />} /></Routes></MemoryRouter>)
    expect(screen.getByText(/partnership=p-9/)).toBeInTheDocument()
    expect(screen.getByText(/year=2018/)).toBeInTheDocument()
  })

  it('switches between the aggregate book and individual workspace with selected-state semantics', () => {
    const { rerender } = render(<MemoryRouter><PartnershipViewSwitcher view="aggregation" /></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'All partnerships' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Partnership workspace' })).toHaveAttribute('href', '/partnership-tracker')
    rerender(<MemoryRouter><PartnershipViewSwitcher view="workspace" /></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Partnership workspace' })).toHaveAttribute('aria-current', 'page')
  })

  it('keeps the consolidated sidebar item active for the aggregate route', () => {
    render(<MemoryRouter><AppShell currentPath="/partnership-aggregation"><div>Aggregate</div></AppShell></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Partnerships' }).className).toContain('text-atlas-gold')
  })

  it('collapses to an icon rail and temporarily reveals the full navigation on hover', () => {
    render(<MemoryRouter><AppShell currentPath="/partnership-aggregation"><div>Aggregate</div></AppShell></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Collapse navigation' }))

    const frame = screen.getByTestId('app-sidebar-frame')
    const panel = screen.getByTestId('app-sidebar-panel')
    const trackerLabel = screen.getByRole('link', { name: 'Partnerships' }).querySelector('span')
    expect(frame).toHaveClass('lg:w-20')
    expect(trackerLabel).toHaveClass('lg:hidden')
    expect(screen.getByRole('button', { name: 'Expand navigation' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.mouseEnter(frame)
    expect(panel).toHaveClass('lg:absolute', 'lg:w-64')
    expect(screen.getByRole('link', { name: 'Partnerships' }).querySelector('span')).not.toHaveClass('lg:hidden')

    fireEvent.mouseLeave(frame)
    expect(screen.getByRole('link', { name: 'Partnerships' }).querySelector('span')).toHaveClass('lg:hidden')
    expect(window.localStorage.getItem('atlas-sidebar-collapsed')).toBe('true')
  })
})

function Location() { const location = useLocation(); return <span>{location.search}</span> }
