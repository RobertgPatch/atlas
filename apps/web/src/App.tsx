import React, { useEffect } from 'react'
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom'
import { authClient } from './auth/authClient'
import { sessionStore, useSession } from './auth/sessionStore'
import { LoginPage } from './pages/LoginPage'
import { MFASetupPage } from './pages/MFASetupPage'
import { MFAPage } from './pages/MFAPage'
import { DashboardPage } from './pages/DashboardPage'
import { PermissionDeniedPage } from './pages/PermissionDeniedPage'
import { UserManagementPage } from './pages/UserManagementPage'
import { UserDetailPage } from './pages/UserDetailPage'
import { K1Dashboard } from './pages/K1Dashboard'
import { K1ReviewWorkspace } from './pages/K1ReviewWorkspace'
import { PartnershipDirectory } from './pages/PartnershipDirectory'
import { PartnershipDetail } from './pages/PartnershipDetail'
import { EntityDetail } from './pages/EntityDetail'
import { EntitiesPage } from './pages/EntitiesPage'
import { ReportsPage } from './pages/ReportsPage'
import { AppShell } from './components/shared/AppShell'
import { PageHeader } from './components/shared/PageHeader'
import { GlobalLoadingBar } from './components/GlobalLoadingBar'

const PlaceholderPage = ({ title }: { title: string }) => {
  const { session } = useSession()
  const path = window.location.pathname
  return (
    <AppShell
      currentPath={path}
      userRole={session?.role ?? 'User'}
      userEmail={session?.user.email}
      onSignOut={() => {
        void authClient.logout().finally(() => sessionStore.setUnauthenticated())
      }}
    >
      <PageHeader title={title} />
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-12 text-center">
        <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <span className="text-gray-400 text-2xl">🚧</span>
        </div>
        <h2 className="text-xl font-medium text-gray-900 mb-2">Coming Soon</h2>
        <p className="text-gray-500 max-w-md mx-auto">
          The {title} module is currently under development. Please check back
          later.
        </p>
      </div>
    </AppShell>
  )
}

const ProtectedRoute = ({ children }: { children: React.ReactElement }) => {
  const { status } = useSession()
  if (status === 'unknown') return null
  if (status !== 'authenticated') return <Navigate to="/" replace />
  return children
}

const AdminRoute = ({ children }: { children: React.ReactElement }) => {
  const { status, session } = useSession()
  if (status === 'unknown') return null
  if (status !== 'authenticated') return <Navigate to="/" replace />
  if (session?.role !== 'Admin') return <PermissionDeniedPage />
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
        if (cancelled) return
        if (sessionStore.getSnapshot().status !== 'unknown') return
        sessionStore.setAuthenticated(session)
      })
      .catch(() => {
        if (cancelled) return
        if (sessionStore.getSnapshot().status !== 'unknown') return
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
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/mfa/setup" element={<MFASetupPage />} />
          <Route path="/mfa" element={<MFAPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />

          {/* Placeholder Routes */}
          <Route
            path="/k1"
            element={
              <ProtectedRoute>
                <K1Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/k1/:id/review"
            element={
              <ProtectedRoute>
                <K1ReviewWorkspace />
              </ProtectedRoute>
            }
          />
          <Route
            path="/upload"
            element={
              <ProtectedRoute>
                <PlaceholderPage title="Upload Center" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/partnerships"
            element={
              <ProtectedRoute>
                <PartnershipDirectory />
              </ProtectedRoute>
            }
          />
          <Route
            path="/partnerships/:id"
            element={
              <ProtectedRoute>
                <PartnershipDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/entities/:id"
            element={
              <ProtectedRoute>
                <EntityDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/entities"
            element={
              <ProtectedRoute>
                <EntitiesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute>
                <ReportsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <AdminRoute>
                <UserManagementPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/users/:id"
            element={
              <AdminRoute>
                <UserDetailPage />
              </AdminRoute>
            }
          />
          <Route
            path="/forbidden"
            element={
              <ProtectedRoute>
                <PermissionDeniedPage />
              </ProtectedRoute>
            }
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SessionBootstrap>
    </Router>
  )
}
