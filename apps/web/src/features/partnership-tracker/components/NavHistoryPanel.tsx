import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { PartnershipNavEntry } from '../../../../../../packages/types/src/partnership-tracker'
import { PartnershipTrackerApiError } from '../api/partnershipTrackerClient'
import { usePartnershipTrackerActions } from '../hooks/usePartnershipTracker'
import { ConfirmationDialog } from '../../../components/shared/ConfirmationDialog'
import { NavEntryDialog } from './NavEntryDialog'
import { NavHistoryChart } from './NavHistoryChart'

const currency = (value: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(value))
const displayDate = (value: string) => new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))

export function NavHistoryPanel({ partnershipId, items, canEdit }: { partnershipId: string; items: PartnershipNavEntry[]; canEdit: boolean }) {
  const actions = usePartnershipTrackerActions()
  const [editing, setEditing] = useState<PartnershipNavEntry | 'new'>()
  const [error, setError] = useState<string>()
  const [deleteTarget, setDeleteTarget] = useState<PartnershipNavEntry>()
  const remove = async () => {
    if (!deleteTarget) return
    const entry = deleteTarget
    setError(undefined)
    try { await actions.deleteNav.mutateAsync({ id: partnershipId, entryId: entry.id, expectedUpdatedAt: entry.updatedAt }) }
    catch (caught) { setError(caught instanceof PartnershipTrackerApiError && caught.isStale ? 'This entry changed before it could be deleted. Review the refreshed history.' : 'The NAV entry could not be deleted.') }
    finally { setDeleteTarget(undefined) }
  }
  return <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-gray-950">NAV history</h3><p className="mt-1 text-sm text-gray-500">Dated observations, including multiple entries in the same year.</p></div>{canEdit && <button type="button" onClick={() => setEditing('new')} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50"><Plus className="h-4 w-4" />Add NAV</button>}</div>
    {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="mt-5"><NavHistoryChart items={items} /></div>
    {items.length > 0 && <div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">NAV history data equivalent to the chart</caption><thead><tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500"><th className="py-2 pr-3">Valuation date</th><th className="py-2 pr-3">NAV</th><th className="py-2 pr-3">Source</th><th className="py-2 pr-3">Note</th>{canEdit && <th className="py-2 text-right">Actions</th>}</tr></thead><tbody>{items.map((entry) => <tr key={entry.id} className="border-b border-gray-100"><td className="py-3 pr-3">{displayDate(entry.valuationDate)}</td><td className="py-3 pr-3 font-medium tabular-nums">{currency(entry.amount)}</td><td className="py-3 pr-3 capitalize text-gray-600">{entry.sourceType.replaceAll('_', ' ')}</td><td className="max-w-xs py-3 pr-3 text-gray-600">{entry.note ?? '—'}</td>{canEdit && <td className="py-3 text-right"><button type="button" aria-label={`Edit NAV dated ${entry.valuationDate}`} onClick={() => setEditing(entry)} className="rounded p-1.5 text-gray-600 hover:bg-gray-100"><Pencil className="h-4 w-4" /></button><button type="button" aria-label={`Delete NAV dated ${entry.valuationDate}`} onClick={() => setDeleteTarget(entry)} className="rounded p-1.5 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button></td>}</tr>)}</tbody></table></div>}
    {editing && <NavEntryDialog partnershipId={partnershipId} entry={editing === 'new' ? undefined : editing} onClose={() => setEditing(undefined)} />}
    <ConfirmationDialog open={Boolean(deleteTarget)} title={`Delete the NAV value dated ${deleteTarget ? displayDate(deleteTarget.valuationDate) : ''}?`} description={<p>This permanently removes this valuation point from NAV history and updates the partnership performance calculations.</p>} confirmLabel="Delete NAV value" pending={actions.deleteNav.isPending} pendingLabel="Deleting NAV…" onClose={() => setDeleteTarget(undefined)} onConfirm={remove} />
  </section>
}
