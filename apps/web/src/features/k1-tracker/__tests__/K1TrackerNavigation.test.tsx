import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AppShell } from '../../../components/shared/AppShell'

describe('Partnership Tracker navigation', () => {
  it('exposes the consolidated tracker navigation item and keeps it active', () => {
    render(<MemoryRouter><AppShell currentPath="/partnership-tracker" userRole="Admin"><div>Tracker workspace</div></AppShell></MemoryRouter>)
    const link = screen.getByRole('link', { name: 'Partnerships' })
    expect(link).toHaveAttribute('href', '/partnership-tracker')
    expect(link.className).toContain('text-jackson-gold')
  })
})
