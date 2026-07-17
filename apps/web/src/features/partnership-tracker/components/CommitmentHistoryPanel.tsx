import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { PartnershipCommitmentEntry } from '../../../../../../packages/types/src/partnership-tracker'
import { PartnershipTrackerApiError } from '../api/partnershipTrackerClient'
import { usePartnershipTrackerActions } from '../hooks/usePartnershipTracker'
import { CommitmentEntryDialog } from './CommitmentEntryDialog'

const currency = (value: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(value))
const displayDate = (value: string) => new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))

export function CommitmentHistoryPanel({ partnershipId, items, canEdit }: { partnershipId: string; items: PartnershipCommitmentEntry[]; canEdit: boolean }) {
  const actions = usePartnershipTrackerActions()
  const [editing, setEditing] = useState<PartnershipCommitmentEntry | 'new'>()
  const [error, setError] = useState<string>()
  const remove = async (entry: PartnershipCommitmentEntry) => {
    if (!window.confirm(`Delete the ${displayDate(entry.effectiveDate)} committed-capital entry? Later values will remain unchanged.`)) return
    setError(undefined)
    try { await actions.deleteCommitment.mutateAsync({ id: partnershipId, entryId: entry.id, expectedUpdatedAt: entry.updatedAt }) }
    catch (caught) { setError(caught instanceof PartnershipTrackerApiError && caught.isStale ? 'This entry changed before it could be deleted. Review the refreshed history.' : 'The committed-capital entry could not be deleted.') }
  }
  const current = items.find((entry) => entry.isCurrent)
  return <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-gray-950">Committed capital</h3><p className="mt-1 text-sm text-gray-500">Effective-dated totals preserve changes over time.</p></div>{canEdit && <button type="button" onClick={() => setEditing('new')} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50"><Plus className="h-4 w-4" />Add entry</button>}</div>
    <div className="mt-5 rounded-lg bg-gray-50 p-4"><p className="text-xs font-medium uppercase tracking-wide text-gray-500">Current commitment</p><p className="mt-1 text-2xl font-semibold text-gray-950">{current ? currency(current.amount) : 'Not entered'}</p>{current && <p className="mt-1 text-xs text-gray-500">Effective {displayDate(current.effectiveDate)}</p>}</div>
    {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {items.length ? <div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Committed-capital history</caption><thead><tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500"><th className="py-2 pr-3">Effective date</th><th className="py-2 pr-3">Total commitment</th><th className="py-2 pr-3">Note</th>{canEdit && <th className="py-2 text-right">Actions</th>}</tr></thead><tbody>{items.map((entry) => <tr key={entry.id} className="border-b border-gray-100"><td className="py-3 pr-3">{displayDate(entry.effectiveDate)}{entry.isCurrent && <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Current</span>}</td><td className="py-3 pr-3 font-medium tabular-nums">{currency(entry.amount)}</td><td className="max-w-xs py-3 pr-3 text-gray-600">{entry.note ?? '—'}</td>{canEdit && <td className="py-3 text-right"><button type="button" aria-label={`Edit commitment effective ${entry.effectiveDate}`} onClick={() => setEditing(entry)} className="rounded p-1.5 text-gray-600 hover:bg-gray-100"><Pencil className="h-4 w-4" /></button><button type="button" aria-label={`Delete commitment effective ${entry.effectiveDate}`} onClick={() => void remove(entry)} className="rounded p-1.5 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button></td>}</tr>)}</tbody></table></div> : <p className="mt-5 rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">No committed-capital history yet.</p>}
    {editing && <CommitmentEntryDialog partnershipId={partnershipId} entry={editing === 'new' ? undefined : editing} onClose={() => setEditing(undefined)} />}
  </section>
}
