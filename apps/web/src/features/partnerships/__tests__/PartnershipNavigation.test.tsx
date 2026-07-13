import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AppShell } from '../../../components/shared/AppShell'

describe('Partnership navigation', () => {
  it('exposes Partnerships as a visible management destination', () => {
    render(
      <MemoryRouter>
        <AppShell currentPath="/partnerships" userRole="Admin">
          <div>Partnership management</div>
        </AppShell>
      </MemoryRouter>,
    )

    const link = screen.getByRole('link', { name: /^partnerships$/i })
    expect(link).toHaveAttribute('href', '/partnerships')
    expect(link).toHaveClass('text-atlas-gold')
  })
})
