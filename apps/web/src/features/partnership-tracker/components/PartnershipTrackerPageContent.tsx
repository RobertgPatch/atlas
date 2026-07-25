import { Loader2, Pencil, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import type { PartnershipTrackerSummary } from '../../../../../../packages/types/src/partnership-tracker'
import { ConfirmationDialog } from '../../../components/shared/ConfirmationDialog'
import { PageHeader } from '../../../components/shared/PageHeader'
import { PartnershipTrackerApiError } from '../api/partnershipTrackerClient'
import { usePartnershipTrackerActions, usePartnershipTrackerDetail, usePartnershipTrackerList } from '../hooks/usePartnershipTracker'
import { AddPartnershipDialog } from './AddPartnershipDialog'
import { EditPartnershipDialog } from './EditPartnershipDialog'
import { K1BasisWorkspace } from './K1BasisWorkspace'
import { NavHistoryPanel } from './NavHistoryPanel'
import { NetCashActivityWorkspace } from './NetCashActivityWorkspace'
import { PartnershipOverview } from './PartnershipOverview'
import { PartnershipPicker } from './PartnershipPicker'
import { PartnershipViewSwitcher } from './PartnershipViewSwitcher'
import { UnderlyingAssetsPlaceholder } from './UnderlyingAssetsPlaceholder'

type Area = 'overview' | 'k1' | 'cash' | 'capital' | 'assets'
const areas: Array<{ id: Area; label: string }> = [{ id: 'overview', label: 'Overview' }, { id: 'k1', label: 'K1 Entry' }, { id: 'cash', label: 'Cash Activity' }, { id: 'capital', label: 'FMV' }, { id: 'assets', label: 'Underlying Assets' }]
const errorText = (error: unknown) => error instanceof PartnershipTrackerApiError && error.code === 'DATABASE_UNAVAILABLE'
  ? 'Partnership Tracker needs the configured database connection before it can load.'
  : 'There was a problem loading the partnership directory. Please try again.'

function PartnershipWorkspaceHeader({ summary, canEdit, onEdit, onDelete }: { summary: PartnershipTrackerSummary; canEdit: boolean; onEdit: () => void; onDelete: () => void }) {
  const partnership = summary.partnership
  return <section data-testid="partnership-workspace-header" aria-labelledby="selected-partnership-title" className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="selected-partnership-title" className="text-xl font-semibold text-gray-950">{partnership.name}</h2>
          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">{partnership.status}</span>
        </div>
        <p className="mt-1 text-sm text-gray-500">{partnership.entity.name} · {partnership.partnershipType}</p>
        {partnership.notes && <p className="mt-3 max-w-3xl text-sm text-gray-700">{partnership.notes}</p>}
      </div>
      {canEdit && <div className="flex flex-wrap gap-2"><button type="button" onClick={onEdit} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jackson-gold focus-visible:ring-offset-2"><Pencil className="h-4 w-4" aria-hidden="true" />Edit Partnership</button><button type="button" onClick={onDelete} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2"><Trash2 className="h-4 w-4" aria-hidden="true" />Delete partnership</button></div>}
    </div>
  </section>
}

export function PartnershipTrackerPageContent({ canEdit }: { canEdit: boolean }) {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const actions = usePartnershipTrackerActions()
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(false)
  const [confirmDeletePartnership, setConfirmDeletePartnership] = useState(false)
  const [deleteError, setDeleteError] = useState<string>()
  const [hasUnsavedK1Changes, setHasUnsavedK1Changes] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const pendingDiscardAction = useRef<(() => void) | null>(null)
  const [defaultSelectedId, setDefaultSelectedId] = useState<string | undefined>()
  const listParams = useMemo(() => ({ search: search.trim() || undefined, limit: 100 }), [search])
  const list = usePartnershipTrackerList(listParams)
  const requestedId = params.get('partnership') ?? undefined
  const firstListedId = list.data?.items[0]?.partnership.id
  const selectedId = requestedId ?? defaultSelectedId
  const detail = usePartnershipTrackerDetail(selectedId)
  const parsedArea = params.get('area')
  const area: Area = parsedArea === 'k1' || parsedArea === 'cash' || parsedArea === 'capital' || parsedArea === 'assets' ? parsedArea : 'overview'
  const parsedYear = Number(params.get('year'))
  const selectedYear = Number.isInteger(parsedYear) && parsedYear >= 1900 && parsedYear <= 2100 ? parsedYear : undefined

  const updateUrl = useCallback((changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value == null) next.delete(key)
      else next.set(key, value)
    }
    setParams(next, { replace: true })
  }, [params, setParams])

  const requestK1Discard = useCallback((action: () => void) => {
    if (!hasUnsavedK1Changes) {
      action()
      return
    }
    pendingDiscardAction.current = action
    setConfirmDiscard(true)
  }, [hasUnsavedK1Changes])

  const cancelK1Discard = () => {
    pendingDiscardAction.current = null
    setConfirmDiscard(false)
  }

  const discardK1Changes = () => {
    const action = pendingDiscardAction.current
    pendingDiscardAction.current = null
    setConfirmDiscard(false)
    setHasUnsavedK1Changes(false)
    action?.()
  }

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
      event.preventDefault()
      event.stopPropagation()
      requestK1Discard(() => navigate(`${destination.pathname}${destination.search}${destination.hash}`))
    }
    document.addEventListener('click', guardRouteChange, true)
    return () => document.removeEventListener('click', guardRouteChange, true)
  }, [hasUnsavedK1Changes, location.hash, location.pathname, location.search, navigate, requestK1Discard])

  const selectPartnership = (id: string) => {
    requestK1Discard(() => updateUrl({ partnership: id, year: undefined }))
  }
  const selectYear = (year: number) => updateUrl({ partnership: selectedId, year: String(year), area: 'k1' })
  const created = (id: string) => { setAdding(false); setHasUnsavedK1Changes(false); updateUrl({ partnership: id, area: 'k1', year: undefined }) }
  const deletePartnership = async () => {
    if (!selectedId) return
    setDeleteError(undefined)
    try {
      await actions.deletePartnership.mutateAsync(selectedId)
      setEditing(false)
      setHasUnsavedK1Changes(false)
      setConfirmDeletePartnership(false)
      updateUrl({ partnership: undefined, year: undefined, area: 'overview' })
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'The partnership could not be deleted.')
    }
  }

  return <>
    <PageHeader title="Partnership Tracker" subtitle="Manage partnership identity, manual K-1 history, committed capital, and NAV from one bounded workspace." actions={<><PartnershipViewSwitcher view="workspace" />{canEdit ? <button type="button" onClick={() => setAdding(true)} className="min-h-11 rounded-lg bg-jackson-gold px-4 py-2 text-sm font-semibold text-gray-950 hover:bg-jackson-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jackson-gold focus-visible:ring-offset-2">Add partnership</button> : null}</>} />
    <div className="min-w-0 space-y-4" data-testid="partnership-workspace-layout">
      <PartnershipPicker items={list.data?.items ?? []} selectedId={selectedId} selected={detail.data?.summary} search={search} loading={list.isLoading} error={list.isError ? errorText(list.error) : undefined} canEdit={canEdit} onSearch={setSearch} onSelect={selectPartnership} onAdd={() => setAdding(true)} />
      <main className="min-w-0" aria-label="Selected partnership workspace">
        {!selectedId && !list.isLoading ? <section className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center"><h2 className="font-semibold text-gray-900">No partnership selected</h2><p className="mt-2 text-sm text-gray-500">{canEdit ? 'Add a partnership to begin, or adjust the search.' : 'No partnership is available in your entity scope.'}</p></section> : detail.isLoading ? <div className="flex min-h-72 items-center justify-center rounded-xl border border-gray-200 bg-white" aria-label="Loading selected partnership"><Loader2 className="h-6 w-6 animate-spin text-gray-400 motion-reduce:animate-none" /></div> : detail.isError ? <section role="alert" className="rounded-xl border border-red-200 bg-red-50 p-6"><h2 className="font-semibold text-red-900">Failed to load partnership</h2><p className="mt-2 text-sm text-red-700">{errorText(detail.error)}</p><button type="button" onClick={() => void detail.refetch()} className="mt-4 rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-800">Try again</button></section> : detail.data ? <div className="space-y-4"><PartnershipWorkspaceHeader summary={detail.data.summary} canEdit={canEdit} onEdit={() => setEditing(true)} onDelete={() => { setDeleteError(undefined); setConfirmDeletePartnership(true) }} /><div className="overflow-x-auto rounded-xl border border-gray-200 bg-white p-1 shadow-sm" role="tablist" aria-label="Partnership Tracker areas"><div className="flex min-w-max gap-1">{areas.map((item) => <button key={item.id} type="button" role="tab" aria-selected={area === item.id} onClick={() => { if (item.id === area) return; requestK1Discard(() => updateUrl({ area: item.id })) }} className={`rounded-lg px-4 py-2.5 text-sm font-medium ${area === item.id ? 'bg-gray-950 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>{item.label}</button>)}</div></div>
          <div role="tabpanel">{area === 'overview' ? <PartnershipOverview summary={detail.data.summary} /> : area === 'k1' ? <K1BasisWorkspace detail={detail.data} selectedYear={selectedYear} canEdit={canEdit} onSelectYear={selectYear} onDirtyChange={setHasUnsavedK1Changes} /> : area === 'cash' ? <NetCashActivityWorkspace detail={detail.data} canEdit={canEdit} /> : area === 'capital' ? <NavHistoryPanel partnershipId={detail.data.summary.partnership.id} items={detail.data.navEntries} canEdit={canEdit} /> : <UnderlyingAssetsPlaceholder />}</div>
        </div> : null}
      </main>
    </div>
    <AddPartnershipDialog open={adding} onClose={() => setAdding(false)} onCreated={created} />
    {editing && detail.data && <EditPartnershipDialog summary={detail.data.summary} onClose={() => setEditing(false)} />}
    <ConfirmationDialog
      open={confirmDeletePartnership}
      title={`Delete ${detail.data?.summary.partnership.name ?? 'this partnership'}?`}
      description={<div className="space-y-2"><p>This permanently deletes the partnership and every child record inside it, including K-1 years and values, cash activity, commitments, NAV history, assets, and K-1 documents.</p>{deleteError && <p role="alert" className="font-medium text-red-700">{deleteError}</p>}</div>}
      confirmLabel="Delete partnership"
      pending={actions.deletePartnership.isPending}
      pendingLabel="Deleting partnership…"
      onClose={() => { setConfirmDeletePartnership(false); setDeleteError(undefined) }}
      onConfirm={deletePartnership}
    />
    <ConfirmationDialog
      open={confirmDiscard}
      tone="warning"
      title="Discard unsaved K-1 changes?"
      description={<p>Your K-1 edits have not been saved. Leaving this workspace will discard the current draft.</p>}
      confirmLabel="Discard changes"
      cancelLabel="Keep editing"
      onClose={cancelK1Discard}
      onConfirm={discardK1Changes}
    />
  </>
}
