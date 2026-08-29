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
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="estate-shell">{children}</div>
  ),
}))

describe('EstateMapPage', () => {
  it('renders the current estate map content inside the application shell', () => {
    render(<EstateMapPage />)
    expect(screen.getByTestId('estate-shell')).toBeInTheDocument()
    expect(screen.getByText('Estate map content')).toBeInTheDocument()
  })
})
