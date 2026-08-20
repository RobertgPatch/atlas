import { authClient } from '../auth/authClient'
import { sessionStore, useSession } from '../auth/sessionStore'
import { AppShell } from '../components/shared/AppShell'
import { EstateMapPageContent } from '../features/estate-map/EstateMapPageContent'

export function EstateMapPage() {
  const { session } = useSession()
  return (
    <AppShell
      currentPath="/estate-maps"
      userRole={session?.role ?? 'User'}
      userEmail={session?.user.email}
      onSignOut={() => {
        void authClient.logout().finally(() => sessionStore.setUnauthenticated())
      }}
      magicPatternDesigns
      mainClassName="bg-slate-100"
      topBarBreadcrumbs={[{ label: 'Workspace' }, { label: 'Estate Maps' }]}
    >
      <EstateMapPageContent />
    </AppShell>
  )
}
