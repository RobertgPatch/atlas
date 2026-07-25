import { authClient } from '../auth/authClient'
import { sessionStore, useSession } from '../auth/sessionStore'
import { AppShell } from '../components/shared/AppShell'
import { PrivateInvestmentTrackerPageContent } from '../features/partnership-tracker/components/private-investment'

export function PrivateInvestmentTrackerPage() {
  const { session } = useSession()
  return (
    <AppShell
      currentPath="/private-investment-tracker"
      contentClassName="max-w-[112rem]"
      userRole={session?.role ?? 'User'}
      userEmail={session?.user.email}
      onSignOut={() => { void authClient.logout().finally(() => sessionStore.setUnauthenticated()) }}
    >
      <PrivateInvestmentTrackerPageContent />
    </AppShell>
  )
}
