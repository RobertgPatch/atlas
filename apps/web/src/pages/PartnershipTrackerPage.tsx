import { authClient } from '../auth/authClient'
import { sessionStore, useSession } from '../auth/sessionStore'
import { AppShell } from '../components/shared/AppShell'
import { PartnershipTrackerPageContent } from '../features/partnership-tracker'

export function PartnershipTrackerPage() {
  const { session } = useSession()
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
