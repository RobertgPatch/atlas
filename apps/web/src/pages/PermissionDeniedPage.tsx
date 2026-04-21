import React from 'react'
import { ShieldAlert } from 'lucide-react'
import { AppShell } from '../components/shared/AppShell'
import { PageHeader } from '../components/shared/PageHeader'
import { useSession } from '../auth/sessionStore'

export function PermissionDeniedPage() {
  const { session } = useSession()

  return (
    <AppShell
      currentPath={window.location.pathname}
      userRole={session?.role ?? 'User'}
      userEmail={session?.user.email}
    >
      <PageHeader title="Permission Restricted" />
      <div className="bg-white border border-gray-200 rounded-lg p-10 text-center">
        <ShieldAlert className="w-12 h-12 text-warning mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          You do not have access to this page
        </h2>
        <p className="text-sm text-gray-600 max-w-md mx-auto">
          Your current role does not allow access to this admin-only section.
          Contact an administrator if you need elevated permissions.
        </p>
      </div>
    </AppShell>
  )
}
