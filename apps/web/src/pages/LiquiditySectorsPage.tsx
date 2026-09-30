import { useQuery } from '@tanstack/react-query'
import { ArrowLeftIcon, TagsIcon } from 'lucide-react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { authClient } from '../auth/authClient'
import { sessionStore, useSession } from '../auth/sessionStore'
import { AppShell } from '../components/shared/AppShell'
import { entitiesClient } from '../features/partnerships/api/entitiesClient'
import { LiquiditySectorManager } from '../features/reports/components/LiquiditySectorManager'

function SectorWorkspace() {
  const { session } = useSession()
  const [params, setParams] = useSearchParams()
  const entityId = params.get('entityId') || undefined
  const entities = useQuery({ queryKey: ['entities', 'liquidity-page'], queryFn: () => entitiesClient.list() })
  return <AppShell currentPath="/liquidity/sectors" userRole={session!.role} userAccessLevel={session!.user.accessLevel} userEmail={session!.user.email}
    onSignOut={() => void authClient.logout().finally(() => sessionStore.setUnauthenticated())}>
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link to={entityId ? `/liquidity?entityId=${encodeURIComponent(entityId)}` : '/liquidity'} className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-primary"><ArrowLeftIcon className="h-4 w-4"/>Back to Liquidity</Link>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">Manage sectors</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Classify unassigned stocks and review manual sector assignments.</p>
        </div>
        <label className="min-w-64 text-sm font-medium text-slate-700">Show stocks held by
          <select aria-label="Sector management entity" value={entityId ?? ''} disabled={entities.isPending || entities.isError} onChange={(event) => setParams(event.target.value ? { entityId: event.target.value } : {})} className="mt-1.5 block h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-focus focus:ring-2 focus:ring-focus">
            <option value="">All entities</option>
            {(entities.data?.items ?? []).map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}
          </select>
        </label>
      </header>
      {entities.isError && <p role="alert" className="text-sm text-red-700">Entity names could not be loaded. <button className="underline" onClick={() => void entities.refetch()}>Try again</button></p>}
      <aside className="flex items-start gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-white"><TagsIcon className="h-5 w-5"/></span>
        <div><h2 className="font-semibold text-emerald-950">One stock. One assignment, everywhere.</h2><p className="mt-1 text-sm leading-6 text-emerald-900">The entity filter only changes this list. Manual assignments apply by symbol across every entity and custodian, take precedence over automatic classifications, and remain in place after future uploads. Original statement data is unchanged.</p></div>
      </aside>
      <LiquiditySectorManager key={entityId ?? 'all'} entityId={entityId}/>
    </div>
  </AppShell>
}

export function LiquiditySectorsPage() {
  const { session } = useSession()
  if (session?.role !== 'Admin') return <Navigate to="/liquidity" replace/>
  return <SectorWorkspace/>
}
