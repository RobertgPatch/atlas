import { authClient } from '../auth/authClient'
import { sessionStore, useSession } from '../auth/sessionStore'
import { AppShell } from '../components/shared/AppShell'
import { K1TrackerPageContent } from '../features/k1-tracker/components/K1TrackerPageContent'

export function K1TrackerPage() {
  const { session } = useSession()
  return <AppShell currentPath="/k1-tracker" userRole={session?.role ?? 'User'} userEmail={session?.user.email} onSignOut={() => { void authClient.logout().finally(() => sessionStore.setUnauthenticated()) }}><K1TrackerPageContent canEdit={session?.role === 'Admin'} /></AppShell>
}
