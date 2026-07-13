import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AppShell } from '../../../components/shared/AppShell'

describe('K1 Tracker navigation', () => {
  it('exposes the visible tracker navigation item and keeps it active on nested paths', () => {
    render(<MemoryRouter><AppShell currentPath="/k1-tracker/partnerships/example" userRole="Admin"><div>Tracker workspace</div></AppShell></MemoryRouter>)
    const link = screen.getByRole('link', { name: /k1 tracker/i })
    expect(link).toHaveAttribute('href', '/k1-tracker')
    expect(link.className).toContain('text-atlas-gold')
  })
})
