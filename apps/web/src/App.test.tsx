import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

let magicPatternDesigns = false

vi.mock('./config/featureFlags', () => ({
  featureFlags: {
    get magicPatternDesigns() {
      return magicPatternDesigns
    },
  },
}))

vi.mock('./auth/sessionStore', () => ({
  useSession: () => ({
    status: 'authenticated',
    session: { role: 'Admin', user: { email: 'admin@example.com' } },
  }),
  sessionStore: {
    getSnapshot: () => ({ status: 'authenticated' }),
    setAuthenticated: vi.fn(),
    setUnauthenticated: vi.fn(),
  },
}))
vi.mock('./auth/authClient', () => ({ authClient: { getSession: vi.fn(), logout: vi.fn() } }))
vi.mock('./auth/SessionExpiryDialog', () => ({ SessionExpiryDialog: () => null }))
vi.mock('./components/GlobalLoadingBar', () => ({ GlobalLoadingBar: () => null }))

const pageMocks = [
  ['./pages/LoginPage', 'LoginPage', 'Login'],
  ['./pages/PermissionDeniedPage', 'PermissionDeniedPage', 'Forbidden'],
  ['./pages/UserManagementPage', 'UserManagementPage', 'Users'],
  ['./pages/UserDetailPage', 'UserDetailPage', 'User detail'],
  ['./pages/K1Dashboard', 'K1Dashboard', 'K1 dashboard'],
  ['./pages/K1ReviewWorkspace', 'K1ReviewWorkspace', 'K1 review'],
  ['./pages/EntityDetail', 'EntityDetail', 'Entity detail'],
  ['./pages/EntitiesPage', 'EntitiesPage', 'Entities'],
  ['./pages/ReportsPage', 'ReportsPage', 'Reports'],
  ['./pages/LiquidityPage', 'LiquidityPage', 'Liquidity page'],
  ['./pages/TicRegistryPage', 'TicRegistryPage', 'TIC registry'],
  ['./pages/PartnershipTrackerPage', 'PartnershipTrackerPage', 'Partnership tracker'],
  ['./pages/PartnershipAggregationPage', 'PartnershipAggregationPage', 'Partnership aggregation'],
  ['./pages/EstateMapPage', 'EstateMapPage', 'Estate maps'],
  ['./pages/InvestmentTrackerPage', 'InvestmentTrackerPage', 'Investment tracker'],
  ['./pages/magic-patterns/MagicPatternDashboardPage', 'MagicPatternDashboardPage', 'Magic dashboard'],
] as const

for (const [path, name, label] of pageMocks) {
  vi.doMock(path, () => ({ [name]: () => <div>{label}</div> }))
}

const { App } = await import('./App')

function open(path: string) {
  window.history.pushState({}, '', path)
  return render(<App />)
}

describe('top-level application routing', () => {
  beforeEach(() => {
    magicPatternDesigns = false
    window.history.pushState({}, '', '/')
  })

  it('redirects the disabled dashboard to liquidity', async () => {
    open('/dashboard')
    expect(await screen.findByText('Liquidity page')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/liquidity')
  })

  it('renders the Magic Patterns dashboard when enabled', () => {
    magicPatternDesigns = true
    open('/dashboard')
    expect(screen.getByText('Magic dashboard')).toBeInTheDocument()
  })

  it.each([
    ['/partnerships?partnershipId=p-list&taxYear=2024', '/partnership-tracker?partnership=p-list&year=2024'],
    ['/partnerships/p-detail?area=valuations', '/partnership-tracker?area=valuations&partnership=p-detail'],
    ['/k1-tracker?partnership=p-k1&year=2025', '/partnership-tracker?partnership=p-k1&year=2025'],
  ])('preserves the compatibility redirect %s', async (source, expected) => {
    open(source)
    await screen.findByText('Partnership tracker')
    await waitFor(() => expect(`${window.location.pathname}${window.location.search}`).toBe(expected))
  })
})
