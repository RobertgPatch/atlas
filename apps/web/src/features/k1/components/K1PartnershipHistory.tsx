import { useSearchParams } from 'react-router-dom'
import { AppShell } from '../../../components/shared/AppShell'
import { authClient } from '../../../auth/authClient'
import { sessionStore, useSession } from '../../../auth/sessionStore'
import { K1BasisWorkspace } from '../../partnership-tracker/components/K1BasisWorkspace'
import { usePartnershipTrackerDetail } from '../../partnership-tracker/hooks/usePartnershipTracker'
import { selectedInvestmentTrackerYear } from '../../investment-tracker/investmentTrackerQueryState'
import { MagicButton, MagicCard } from '../../partnership-tracker/components/magic-patterns/MagicPatternPrimitives'

export function K1PartnershipHistory({ partnershipId }: { partnershipId: string }) {
  const { session } = useSession()
  const [params, setParams] = useSearchParams()
  const detail = usePartnershipTrackerDetail(partnershipId)
  return <AppShell currentPath="/k1" userRole={session?.role ?? 'User'} userAccessLevel={session?.user.accessLevel} userEmail={session?.user.email} onSignOut={() => { void authClient.logout().finally(() => sessionStore.setUnauthenticated()) }}>
    <MagicButton variant="ghost" onClick={() => { const next = new URLSearchParams(params); next.delete('partnership'); next.delete('year'); setParams(next) }}>← K1 Management</MagicButton>
    <h1 className="mb-1 mt-4 text-2xl font-semibold text-slate-950">{detail.data?.summary.partnership.name ?? 'Partnership K-1 history'}</h1>
    <p className="mb-6 text-sm text-slate-600">{detail.data?.summary.partnership.entity.name}</p>
    {detail.isLoading ? <p role="status">Loading K-1 history…</p> : detail.isError ? <MagicCard className="p-6"><p role="alert">K-1 history could not be loaded.</p><MagicButton onClick={() => void detail.refetch()}>Try again</MagicButton></MagicCard> : detail.data ? <div className="magic-k1-shell"><K1BasisWorkspace detail={detail.data} appearance="magic-pattern" selectedYear={selectedInvestmentTrackerYear(params.get('year'))} canEdit={session?.role === 'Admin'} onSelectYear={(year) => { const next = new URLSearchParams(params); next.set('year', String(year)); setParams(next, { replace: true }) }} onDirtyChange={() => undefined} /></div> : null}
  </AppShell>
}
