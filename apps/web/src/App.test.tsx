import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let sessionStatus: 'authenticated' | 'unauthenticated' = 'authenticated'
let userRole: 'Admin' | 'User' = 'Admin'

vi.mock('./auth/sessionStore', () => ({
  useSession: () => ({
    status: sessionStatus,
    session: sessionStatus === 'authenticated'
      ? { role: userRole, user: { email: `${userRole.toLowerCase()}@example.com` } }
      : null,
  }),
  sessionStore: {
    getSnapshot: () => ({ status: sessionStatus }),
    setAuthenticated: vi.fn(),
    setUnauthenticated: vi.fn(),
  },
}))
vi.mock('./auth/authClient', () => ({ authClient: { getSession: vi.fn(), logout: vi.fn() } }))
vi.mock('./auth/SessionExpiryDialog', () => ({ SessionExpiryDialog: () => null }))
vi.mock('./components/GlobalLoadingBar', () => ({ GlobalLoadingBar: () => null }))

const pageMocks = [
  ['./pages/LoginPage', 'LoginPage', 'Login'],
  ['./pages/MFAPage', 'MFAPage', 'MFA verification'],
  ['./pages/MFASetupPage', 'MFASetupPage', 'MFA setup'],
  ['./pages/K1Dashboard', 'K1Dashboard', 'K1 dashboard'],
  ['./pages/K1ReviewWorkspace', 'K1ReviewWorkspace', 'K1 review'],
  ['./pages/EntityDetail', 'EntityDetail', 'Entity detail'],
  ['./pages/EntitiesPage', 'EntitiesPage', 'Entities'],
  ['./pages/ReportsPage', 'ReportsPage', 'Reports'],
  ['./pages/LiquidityPage', 'LiquidityPage', 'Liquidity'],
  ['./pages/TicRegistryPage', 'TicRegistryPage', 'TIC registry'],
  ['./pages/EstateMapPage', 'EstateMapPage', 'Estate maps'],
  ['./pages/InvestmentTrackerPage', 'InvestmentTrackerPage', 'Investment tracker'],
  ['./pages/magic-patterns/MagicPatternDashboardPage', 'MagicPatternDashboardPage', 'Dashboard'],
] as const

for (const [path, name, label] of pageMocks) {
  vi.doMock(path, () => ({ [name]: () => <div>{label}</div> }))
}

const { App } = await import('./App')
const { BROWSER_ROUTE_PATTERNS } = await import('./routeContract')

const retainedPatterns = [
  '/',
  '/mfa/setup',
  '/mfa',
  '/dashboard',
  '/investment-tracker',
  '/liquidity',
  '/entities',
  '/entities/:id',
  '/estate-maps',
  '/tic-registry',
  '/reports',
  '/k1',
  '/k1/:id/review',
  '*',
]

function open(path: string) {
  window.history.pushState({}, '', path)
  return render(<App />)
}

describe('top-level application routing', () => {
  beforeEach(() => {
    sessionStatus = 'authenticated'
    userRole = 'Admin'
    window.history.pushState({}, '', '/')
  })

  afterEach(() => cleanup())

  it('exposes exactly the retained 13 routes plus wildcard', () => {
    expect([...BROWSER_ROUTE_PATTERNS]).toEqual(retainedPatterns)
  })

  it('renders the current Dashboard unconditionally for both roles', () => {
    for (const role of ['Admin', 'User'] as const) {
      cleanup()
      userRole = role
      open('/dashboard')
      expect(screen.getByText('Dashboard')).toBeInTheDocument()
      expect(window.location.pathname).toBe('/dashboard')
    }
  })

  it.each([
    ['/mfa', 'MFA verification'],
    ['/mfa/setup', 'MFA setup'],
  ])('keeps %s public before a session exists', (path, label) => {
    sessionStatus = 'unauthenticated'
    open(path)
    expect(screen.getByText(label)).toBeInTheDocument()
    expect(window.location.pathname).toBe(path)
  })

  it.each([
    ['/investment-tracker', 'Investment tracker'],
    ['/liquidity', 'Liquidity'],
    ['/entities', 'Entities'],
    ['/entities/e-1', 'Entity detail'],
    ['/estate-maps', 'Estate maps'],
    ['/tic-registry', 'TIC registry'],
    ['/reports', 'Reports'],
    ['/k1', 'K1 dashboard'],
    ['/k1/doc-1/review', 'K1 review'],
  ])('renders the retained protected route %s', (path, label) => {
    open(path)
    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it.each([
    '/upload',
    '/partnerships',
    '/partnerships/p-1',
    '/partnership-aggregation',
    '/partnership-tracker',
    '/k1-tracker',
    '/admin/users',
    '/admin/users/u-1',
    '/forbidden',
  ])('does not preserve retired route %s as a compatibility alias', (path) => {
    open(path)
    expect(screen.getByText('Login')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/')
  })
})
