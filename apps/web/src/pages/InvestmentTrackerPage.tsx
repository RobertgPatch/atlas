import { authClient } from '../auth/authClient'
import { sessionStore, useSession } from '../auth/sessionStore'
import { AppShell } from '../components/shared/AppShell'
import { MagicPatternInvestmentTrackerPageContent } from '../features/investment-tracker'

export function InvestmentTrackerPage() {
  const { session } = useSession()
  return (
    <AppShell
      currentPath="/investment-tracker"
      userRole={session?.role ?? 'User'}
      userEmail={session?.user.email}
      onSignOut={() => {
        void authClient.logout().finally(() => sessionStore.setUnauthenticated())
      }}
      mainClassName="bg-[#e7edf4]"
      topBarBreadcrumbs={[{ label: 'Portfolio' }, { label: 'Investment tracker' }]}
    >
      <MagicPatternInvestmentTrackerPageContent canEdit={session?.role === 'Admin'} />
    </AppShell>
  )
}
