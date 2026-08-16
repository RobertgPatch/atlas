import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { InvestmentTrackerPage } from './InvestmentTrackerPage'

vi.mock('../auth/sessionStore', () => ({
  useSession: () => ({ session: { user: { email: 'advisor@example.com' }, role: 'Admin' } }),
  sessionStore: { setUnauthenticated: vi.fn() },
}))

vi.mock('../auth/authClient', () => ({ authClient: { logout: vi.fn().mockResolvedValue(undefined) } }))

vi.mock('../components/shared/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('../features/investment-tracker', () => ({
  MagicPatternInvestmentTrackerPageContent: () => <div>Magic Patterns investment tracker</div>,
}))

describe('InvestmentTrackerPage feature flag', () => {
  it('renders the Magic Patterns tracker when enabled', () => {
    render(<MemoryRouter><InvestmentTrackerPage magicPatternDesigns /></MemoryRouter>)
    expect(screen.getByText('Magic Patterns investment tracker')).toBeTruthy()
    expect(screen.queryByText('Coming Soon')).toBeNull()
  })

  it('keeps the legacy placeholder when disabled', () => {
    render(<MemoryRouter><InvestmentTrackerPage magicPatternDesigns={false} /></MemoryRouter>)
    expect(screen.getByText('Coming Soon')).toBeTruthy()
    expect(screen.queryByText('Magic Patterns investment tracker')).toBeNull()
  })
})
