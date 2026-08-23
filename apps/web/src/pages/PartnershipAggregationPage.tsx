import { authClient } from '../auth/authClient'
import { sessionStore, useSession } from '../auth/sessionStore'
import { AppShell } from '../components/shared/AppShell'
import { PartnershipAggregationPageContent } from '../features/partnership-tracker/components/aggregation'

export function PartnershipAggregationPage() {
  const { session } = useSession()
  return (
    <AppShell
      currentPath="/partnership-aggregation"
      userRole={session?.role ?? 'User'}
      userEmail={session?.user.email}
      onSignOut={() => { void authClient.logout().finally(() => sessionStore.setUnauthenticated()) }}
    >
      <PartnershipAggregationPageContent canEdit={session?.role === 'Admin'} />
    </AppShell>
  )
}
