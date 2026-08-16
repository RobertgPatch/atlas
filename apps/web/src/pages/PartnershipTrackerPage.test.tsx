import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PartnershipTrackerPage } from './PartnershipTrackerPage'

vi.mock('../auth/sessionStore', () => ({
  useSession: () => ({
    session: { user: { email: 'advisor@example.com' }, role: 'Admin' },
  }),
  sessionStore: { setUnauthenticated: vi.fn() },
}))

vi.mock('../auth/authClient', () => ({
  authClient: { logout: vi.fn().mockResolvedValue(undefined) },
}))

vi.mock('../components/shared/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('../features/partnership-tracker', () => ({
  PartnershipTrackerPageContent: () => <div>Legacy partnership experience</div>,
  MagicPatternPartnershipTrackerPageContent: () => <div>Magic Patterns partnership experience</div>,
}))

describe('PartnershipTrackerPage feature flag', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the Magic Patterns partnerships UI when enabled', () => {
    render(<MemoryRouter><PartnershipTrackerPage magicPatternDesigns /></MemoryRouter>)
    expect(screen.getByText('Magic Patterns partnership experience')).toBeTruthy()
    expect(screen.queryByText('Legacy partnership experience')).toBeNull()
  })

  it('preserves the current partnership UI when disabled', () => {
    render(<MemoryRouter><PartnershipTrackerPage magicPatternDesigns={false} /></MemoryRouter>)
    expect(screen.getByText('Legacy partnership experience')).toBeTruthy()
    expect(screen.queryByText('Magic Patterns partnership experience')).toBeNull()
  })
})
