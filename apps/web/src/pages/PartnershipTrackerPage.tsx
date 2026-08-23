import { authClient } from '../auth/authClient'
import { sessionStore, useSession } from '../auth/sessionStore'
import { Navigate, useLocation } from 'react-router-dom'
import { AppShell } from '../components/shared/AppShell'
import { featureFlags } from '../config/featureFlags'
import { PartnershipTrackerPageContent } from '../features/partnership-tracker'

export function PartnershipTrackerPage({
  magicPatternDesigns = featureFlags.magicPatternDesigns,
}: {
  magicPatternDesigns?: boolean
} = {}) {
  const { session } = useSession()
  const location = useLocation()

  if (magicPatternDesigns) {
    return <Navigate to={`/investment-tracker${location.search}`} replace />
  }

  return (
    <AppShell
      currentPath="/partnership-tracker"
      userRole={session?.role ?? 'User'}
      userEmail={session?.user.email}
      onSignOut={() => { void authClient.logout().finally(() => sessionStore.setUnauthenticated()) }}
    >
      <PartnershipTrackerPageContent canEdit={session?.role === 'Admin'} />
    </AppShell>
  )
}
