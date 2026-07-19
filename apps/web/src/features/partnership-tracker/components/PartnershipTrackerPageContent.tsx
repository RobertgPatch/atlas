import { Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { PageHeader } from '../../../components/shared/PageHeader'
import { PartnershipTrackerApiError } from '../api/partnershipTrackerClient'
import { usePartnershipTrackerDetail, usePartnershipTrackerList } from '../hooks/usePartnershipTracker'
import { AddPartnershipDialog } from './AddPartnershipDialog'
import { CommitmentHistoryPanel } from './CommitmentHistoryPanel'
import { EditPartnershipDialog } from './EditPartnershipDialog'
import { K1BasisWorkspace } from './K1BasisWorkspace'
import { NavHistoryPanel } from './NavHistoryPanel'
import { PartnershipOverview } from './PartnershipOverview'
import { PartnershipPicker } from './PartnershipPicker'

type Area = 'overview' | 'k1' | 'capital'
const areas: Array<{ id: Area; label: string }> = [{ id: 'overview', label: 'Overview' }, { id: 'k1', label: 'K-1 & Basis' }, { id: 'capital', label: 'Capital & NAV' }]
const errorText = (error: unknown) => error instanceof PartnershipTrackerApiError && error.code === 'DATABASE_UNAVAILABLE'
  ? 'Partnership Tracker needs the configured database connection before it can load.'
  : 'There was a problem loading the partnership directory. Please try again.'

export function PartnershipTrackerPageContent({ canEdit }: { canEdit: boolean }) {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(false)
  const [hasUnsavedK1Changes, setHasUnsavedK1Changes] = useState(false)
  const [defaultSelectedId, setDefaultSelectedId] = useState<string | undefined>()
  const listParams = useMemo(() => ({ search: search.trim() || undefined, limit: 100 }), [search])
  const list = usePartnershipTrackerList(listParams)
  const requestedId = params.get('partnership') ?? undefined
  const firstListedId = list.data?.items[0]?.partnership.id
  const selectedId = requestedId ?? defaultSelectedId
  const detail = usePartnershipTrackerDetail(selectedId)
  const parsedArea = params.get('area')
  const area: Area = parsedArea === 'k1' || parsedArea === 'capital' ? parsedArea : 'overview'
  const parsedYear = Number(params.get('year'))
  const selectedYear = Number.isInteger(parsedYear) && parsedYear >= 1900 && parsedYear <= 2100 ? parsedYear : undefined

  useEffect(() => {
    if (requestedId) {
      setDefaultSelectedId(requestedId)
      return
    }
    setDefaultSelectedId((current) => current ?? firstListedId)
  }, [firstListedId, requestedId])

  useEffect(() => {
    if (!hasUnsavedK1Changes) return
    const guardRouteChange = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const target = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!target || target.target || target.hasAttribute('download')) return
      const destination = new URL(target.href, window.location.href)
      if (destination.origin !== window.location.origin) return
      if (destination.pathname === location.pathname && destination.search === location.search && destination.hash === location.hash) return
      if (window.confirm('Discard unsaved K-1 changes?')) {
        setHasUnsavedK1Changes(false)
        return
      }
      event.preventDefault()
      event.stopPropagation()
    }
    document.addEventListener('click', guardRouteChange, true)
    return () => document.removeEventListener('click', guardRouteChange, true)
  }, [hasUnsavedK1Changes, location.hash, location.pathname, location.search])

  const updateUrl = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value == null) next.delete(key)
      else next.set(key, value)
    }
    setParams(next, { replace: true })
  }
  const confirmK1Discard = () => !hasUnsavedK1Changes || window.confirm('Discard unsaved K-1 changes?')
  const selectPartnership = (id: string) => {
    if (!confirmK1Discard()) return
    setHasUnsavedK1Changes(false)
    updateUrl({ partnership: id, year: undefined })
  }
  const selectYear = (year: number) => updateUrl({ partnership: selectedId, year: String(year), area: 'k1' })
  const created = (id: string) => { setAdding(false); setHasUnsavedK1Changes(false); updateUrl({ partnership: id, area: 'k1', year: undefined }) }

  return <>
    <PageHeader title="Partnership Tracker" subtitle="Manage partnership identity, manual K-1 history, committed capital, and NAV from one bounded workspace." actions={canEdit ? <button type="button" onClick={() => setAdding(true)} className="rounded-lg bg-atlas-gold px-4 py-2 text-sm font-semibold text-white hover:bg-atlas-hover">Add partnership</button> : null} />
    <div className="grid gap-5 xl:grid-cols-[20rem_minmax(0,1fr)]">
      <PartnershipPicker items={list.data?.items ?? []} selectedId={selectedId} search={search} loading={list.isLoading} error={list.isError ? errorText(list.error) : undefined} canEdit={canEdit} onSearch={setSearch} onSelect={selectPartnership} onAdd={() => setAdding(true)} />
      <main className="min-w-0" aria-label="Selected partnership workspace">
        {!selectedId && !list.isLoading ? <section className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center"><h2 className="font-semibold text-gray-900">No partnership selected</h2><p className="mt-2 text-sm text-gray-500">{canEdit ? 'Add a partnership to begin, or adjust the search.' : 'No partnership is available in your entity scope.'}</p></section> : detail.isLoading ? <div className="flex min-h-72 items-center justify-center rounded-xl border border-gray-200 bg-white" aria-label="Loading selected partnership"><Loader2 className="h-6 w-6 animate-spin text-gray-400 motion-reduce:animate-none" /></div> : detail.isError ? <section role="alert" className="rounded-xl border border-red-200 bg-red-50 p-6"><h2 className="font-semibold text-red-900">Failed to load partnership</h2><p className="mt-2 text-sm text-red-700">{errorText(detail.error)}</p><button type="button" onClick={() => void detail.refetch()} className="mt-4 rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-800">Try again</button></section> : detail.data ? <div className="space-y-4"><div className="overflow-x-auto rounded-xl border border-gray-200 bg-white p-1 shadow-sm" role="tablist" aria-label="Partnership Tracker areas"><div className="flex min-w-max gap-1">{areas.map((item) => <button key={item.id} type="button" role="tab" aria-selected={area === item.id} onClick={() => { if (item.id !== area && !confirmK1Discard()) return; if (item.id !== area) setHasUnsavedK1Changes(false); updateUrl({ area: item.id }) }} className={`rounded-lg px-4 py-2.5 text-sm font-medium ${area === item.id ? 'bg-gray-950 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>{item.label}</button>)}</div></div>
          <div role="tabpanel">{area === 'overview' ? <PartnershipOverview summary={detail.data.summary} canEdit={canEdit} onEdit={() => setEditing(true)} /> : area === 'k1' ? <K1BasisWorkspace detail={detail.data} selectedYear={selectedYear} canEdit={canEdit} onSelectYear={selectYear} onDirtyChange={setHasUnsavedK1Changes} /> : <div className="space-y-5"><CommitmentHistoryPanel partnershipId={detail.data.summary.partnership.id} items={detail.data.commitments} canEdit={canEdit} /><NavHistoryPanel partnershipId={detail.data.summary.partnership.id} items={detail.data.navEntries} canEdit={canEdit} /></div>}</div>
        </div> : null}
      </main>
    </div>
    <AddPartnershipDialog open={adding} onClose={() => setAdding(false)} onCreated={created} />
    {editing && detail.data && <EditPartnershipDialog summary={detail.data.summary} onClose={() => setEditing(false)} />}
  </>
}
