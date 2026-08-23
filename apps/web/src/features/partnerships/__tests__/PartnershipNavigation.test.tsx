import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AppShell } from '../../../components/shared/AppShell'

describe('Partnership navigation', () => {
  it('uses the consolidated Partnerships management destination', () => {
    render(
      <MemoryRouter>
        <AppShell currentPath="/partnership-tracker" userRole="Admin" magicPatternDesigns={false}>
          <div>Partnership management</div>
        </AppShell>
      </MemoryRouter>,
    )

    const link = screen.getByRole('link', { name: 'Partnerships' })
    expect(link).toHaveAttribute('href', '/partnership-tracker')
    expect(link).toHaveClass('text-primary')
  })
})
