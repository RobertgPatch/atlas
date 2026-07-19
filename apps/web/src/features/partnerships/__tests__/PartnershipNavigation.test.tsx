import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AppShell } from '../../../components/shared/AppShell'

describe('Partnership navigation', () => {
  it('uses the consolidated Partnership Tracker management destination', () => {
    render(
      <MemoryRouter>
        <AppShell currentPath="/partnership-tracker" userRole="Admin">
          <div>Partnership management</div>
        </AppShell>
      </MemoryRouter>,
    )

    const link = screen.getByRole('link', { name: /partnership tracker/i })
    expect(link).toHaveAttribute('href', '/partnership-tracker')
    expect(link).toHaveClass('text-atlas-gold')
  })
})
