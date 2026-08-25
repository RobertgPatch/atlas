import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EstateMapPage } from './EstateMapPage'

vi.mock('../auth/sessionStore', () => ({
  useSession: () => ({ session: { role: 'User', user: { email: 'user@example.com' } } }),
  sessionStore: { setUnauthenticated: vi.fn() },
}))
vi.mock('../auth/authClient', () => ({ authClient: { logout: vi.fn() } }))
vi.mock('../features/estate-map/EstateMapPageContent', () => ({
  EstateMapPageContent: () => <div>Estate map content</div>,
}))
vi.mock('../components/shared/AppShell', () => ({
  AppShell: ({ magicPatternDesigns, children }: { magicPatternDesigns?: boolean; children: React.ReactNode }) => (
    <div data-testid="estate-shell" data-magic-patterns={String(magicPatternDesigns)}>{children}</div>
  ),
}))

describe('EstateMapPage appearance', () => {
  it('retains its explicit Magic Patterns appearance exception', () => {
    render(<EstateMapPage />)
    expect(screen.getByTestId('estate-shell')).toHaveAttribute('data-magic-patterns', 'true')
    expect(screen.getByText('Estate map content')).toBeInTheDocument()
  })
})
