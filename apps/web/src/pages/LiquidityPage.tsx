import { authClient } from '../auth/authClient'
import { sessionStore, useSession } from '../auth/sessionStore'
import { AppShell } from '../components/shared/AppShell'
import { ConsolidatedHoldingsReport } from '../features/reports/components/ConsolidatedHoldingsReport'

export function LiquidityPage() {
  const { session } = useSession()

  return (
    <AppShell
      currentPath="/liquidity"
      userRole={session?.role ?? 'User'}
      userEmail={session?.user.email}
      onSignOut={() => {
        void authClient.logout().finally(() => sessionStore.setUnauthenticated())
      }}
    >
      <ConsolidatedHoldingsReport />
    </AppShell>
  )
}
