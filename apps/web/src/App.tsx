import React, { useEffect } from 'react'
import {
  BrowserRouter as Router,
  Navigate,
  Route,
  Routes,
} from 'react-router-dom'
import { authClient } from './auth/authClient'
import { SessionExpiryDialog } from './auth/SessionExpiryDialog'
import { sessionStore, useSession } from './auth/sessionStore'
import { GlobalLoadingBar } from './components/GlobalLoadingBar'
import { EntitiesPage } from './pages/EntitiesPage'
import { EntityDetail } from './pages/EntityDetail'
import { EstateMapPage } from './pages/EstateMapPage'
import { InvestmentTrackerPage } from './pages/InvestmentTrackerPage'
import { K1Dashboard } from './pages/K1Dashboard'
import { K1ReviewWorkspace } from './pages/K1ReviewWorkspace'
import { LiquidityPage } from './pages/LiquidityPage'
import { LiquidityStatementsPage } from './pages/LiquidityStatementsPage'
import { LiquiditySectorsPage } from './pages/LiquiditySectorsPage'
import { LoginPage } from './pages/LoginPage'
import { MFAPage } from './pages/MFAPage'
import { MFASetupPage } from './pages/MFASetupPage'
import { PasswordChangePage } from './pages/PasswordChangePage'
import { AdminOperationsPage } from './pages/AdminOperationsPage'
import { MagicPatternDashboardPage } from './pages/magic-patterns/MagicPatternDashboardPage'
import { ReportsPage } from './pages/ReportsPage'
import { TicRegistryPage } from './pages/TicRegistryPage'
import {
  CURRENT_PROTECTED_ROUTE_PATTERNS,
  type CurrentProtectedRoutePattern,
} from './routeContract'

const protectedRouteElements: Record<CurrentProtectedRoutePattern, React.ReactElement> = {
  '/dashboard': <MagicPatternDashboardPage />,
  '/investment-tracker': <InvestmentTrackerPage />,
  '/liquidity': <LiquidityPage />,
  '/liquidity/statements': <LiquidityStatementsPage />,
  '/liquidity/sectors': <LiquiditySectorsPage />,
  '/entities': <EntitiesPage />,
  '/entities/:id': <EntityDetail />,
  '/estate-maps': <EstateMapPage />,
  '/tic-registry': <TicRegistryPage />,
  '/reports': <ReportsPage />,
  '/k1': <K1Dashboard />,
  '/k1/:id/review': <K1ReviewWorkspace />,
  '/admin': <AdminOperationsPage />,
}

const ProtectedRoute = ({ children, superAdmin = false }: { children: React.ReactElement; superAdmin?: boolean }) => {
  const { status, session } = useSession()
  if (status === 'unknown') return null
  if (status !== 'authenticated') return <Navigate to="/" replace />
  if (superAdmin && session?.user.accessLevel !== 'SuperAdmin') return <Navigate to="/dashboard" replace />
  return children
}

const SessionBootstrap = ({ children }: { children: React.ReactNode }) => {
  const { status } = useSession()

  useEffect(() => {
    if (status !== 'unknown') return

    let cancelled = false
    authClient
      .getSession()
      .then((session) => {
        if (cancelled || sessionStore.getSnapshot().status !== 'unknown') return
        sessionStore.setAuthenticated(session)
      })
      .catch(() => {
        if (cancelled || sessionStore.getSnapshot().status !== 'unknown') return
        sessionStore.setUnauthenticated()
      })

    return () => {
      cancelled = true
    }
  }, [status])

  return <>{children}</>
}

export function App() {
  return (
    <Router>
      <SessionBootstrap>
        <GlobalLoadingBar />
        <SessionExpiryDialog />
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/password/change" element={<PasswordChangePage />} />
          <Route path="/mfa/setup" element={<MFASetupPage />} />
          <Route path="/mfa" element={<MFAPage />} />
          {CURRENT_PROTECTED_ROUTE_PATTERNS.map((path) => (
            <Route
              key={path}
              path={path}
              element={<ProtectedRoute superAdmin={path === '/admin'}>{protectedRouteElements[path]}</ProtectedRoute>}
            />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SessionBootstrap>
    </Router>
  )
}
