import { authClient } from '../auth/authClient'
import { sessionStore, useSession } from '../auth/sessionStore'
import { AppShell } from '../components/shared/AppShell'
import { featureFlags } from '../config/featureFlags'
import {
  MagicPatternPartnershipTrackerPageContent,
  PartnershipTrackerPageContent,
} from '../features/partnership-tracker'

export function PartnershipTrackerPage({
  magicPatternDesigns = featureFlags.magicPatternDesigns,
}: {
  magicPatternDesigns?: boolean
} = {}) {
  const { session } = useSession()
  return (
    <AppShell
      currentPath="/partnership-tracker"
      userRole={session?.role ?? 'User'}
      userEmail={session?.user.email}
      onSignOut={() => { void authClient.logout().finally(() => sessionStore.setUnauthenticated()) }}
      contentClassName={magicPatternDesigns ? 'max-w-[2200px]' : undefined}
    >
      {magicPatternDesigns ? (
        <MagicPatternPartnershipTrackerPageContent canEdit={session?.role === 'Admin'} />
      ) : (
        <PartnershipTrackerPageContent canEdit={session?.role === 'Admin'} />
      )}
    </AppShell>
  )
}
