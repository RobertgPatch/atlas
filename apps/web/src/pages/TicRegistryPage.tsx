import { authClient } from '../auth/authClient'
import { sessionStore, useSession } from '../auth/sessionStore'
import { AppShell } from '../components/shared/AppShell'
import { TicRegistryPageContent } from '../features/tic-registry/components/TicRegistryPageContent'

export function TicRegistryPage() {
  const { session } = useSession()

  return (
    <AppShell
      currentPath="/tic-registry"
      userRole={session?.role ?? 'User'}
      userEmail={session?.user.email}
      onSignOut={() => {
        void authClient.logout().finally(() => sessionStore.setUnauthenticated())
      }}
    >
      <TicRegistryPageContent canEdit={session?.role === 'Admin'} />
    </AppShell>
  )
}
