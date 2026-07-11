import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AppShell } from '../../../components/shared/AppShell'

describe('TIC Registry navigation', () => {
  it('shows the TIC Registry side navigation destination and active state', () => {
    render(
      <MemoryRouter>
        <AppShell
          currentPath="/tic-registry"
          userRole="Admin"
          userEmail="admin@atlas.test"
          onSignOut={vi.fn()}
        >
          <div>Registry content</div>
        </AppShell>
      </MemoryRouter>,
    )

    const link = screen.getByRole('link', { name: /tic registry/i })
    expect(link).toHaveAttribute('href', '/tic-registry')
    expect(link).toHaveClass('text-atlas-gold')
  })
})
