import { authClient } from '../auth/authClient'
import { sessionStore, useSession } from '../auth/sessionStore'
import { AppShell } from '../components/shared/AppShell'
import { PageHeader } from '../components/shared/PageHeader'
import { featureFlags } from '../config/featureFlags'
import { MagicPatternInvestmentTrackerPageContent } from '../features/investment-tracker'

export function InvestmentTrackerPage({
  magicPatternDesigns = featureFlags.magicPatternDesigns,
}: {
  magicPatternDesigns?: boolean
} = {}) {
  const { session } = useSession()
  return (
    <AppShell
      currentPath="/investment-tracker"
      userRole={session?.role ?? 'User'}
      userEmail={session?.user.email}
      onSignOut={() => {
        void authClient.logout().finally(() => sessionStore.setUnauthenticated())
      }}
      magicPatternDesigns={magicPatternDesigns}
      contentClassName={magicPatternDesigns ? 'max-w-[2400px]' : undefined}
      mainClassName={magicPatternDesigns ? 'bg-[#e7edf4]' : undefined}
      topBarBreadcrumbs={magicPatternDesigns
        ? [{ label: 'Portfolio', href: '/partnership-tracker' }, { label: 'Investment tracker' }]
        : undefined}
    >
      {magicPatternDesigns ? (
        <MagicPatternInvestmentTrackerPageContent canEdit={session?.role === 'Admin'} />
      ) : (
        <>
          <PageHeader title="Investment Tracker" />
          <div className="rounded-lg border border-gray-200 bg-white p-12 text-center shadow-sm">
            <h2 className="text-xl font-medium text-gray-900">Coming Soon</h2>
            <p className="mx-auto mt-2 max-w-md text-gray-500">
              The Investment Tracker module is available in the Magic Patterns experience.
            </p>
          </div>
        </>
      )}
    </AppShell>
  )
}
