import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
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
}))

function CurrentLocation() {
  const location = useLocation()
  return <div>Current location: {location.pathname}{location.search}</div>
}

describe('PartnershipTrackerPage feature flag', () => {
  beforeEach(() => vi.clearAllMocks())

  it('redirects the retired Magic Patterns partnerships page into the investment tracker', () => {
    render(
      <MemoryRouter initialEntries={['/partnership-tracker?partnership=p-1&area=valuations&year=2025']}>
        <Routes>
          <Route path="/partnership-tracker" element={<PartnershipTrackerPage magicPatternDesigns />} />
          <Route path="/investment-tracker" element={<CurrentLocation />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('Current location: /investment-tracker?partnership=p-1&area=valuations&year=2025')).toBeTruthy()
    expect(screen.queryByText('Legacy partnership experience')).toBeNull()
  })

  it('preserves the current partnership UI when disabled', () => {
    render(<MemoryRouter><PartnershipTrackerPage magicPatternDesigns={false} /></MemoryRouter>)
    expect(screen.getByText('Legacy partnership experience')).toBeTruthy()
    expect(screen.queryByText('Magic Patterns partnership experience')).toBeNull()
  })
})
