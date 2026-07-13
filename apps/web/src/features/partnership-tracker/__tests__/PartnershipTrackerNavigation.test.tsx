import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { LegacyPartnershipRedirect } from '../../../App'
import { AppShell } from '../../../components/shared/AppShell'

describe('Partnership Tracker navigation', () => {
  it('shows one consolidated active navigation item', () => {
    render(<MemoryRouter><AppShell currentPath="/partnership-tracker" userRole="Admin"><div>Workspace</div></AppShell></MemoryRouter>)
    const link = screen.getByRole('link', { name: 'Partnership Tracker' })
    expect(link).toHaveAttribute('href', '/partnership-tracker')
    expect(link.className).toContain('text-atlas-gold')
    expect(screen.queryByRole('link', { name: /^Partnerships$/ })).not.toBeInTheDocument()
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
})

function Location() { const location = useLocation(); return <span>{location.search}</span> }
