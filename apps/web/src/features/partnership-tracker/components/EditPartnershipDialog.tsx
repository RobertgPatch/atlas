import { useEffect, useRef, useState } from 'react'
import { PARTNERSHIP_TYPES, type PartnershipTrackerSummary, type PartnershipType } from '../../../../../../packages/types/src/partnership-tracker'
import { PartnershipTrackerApiError } from '../api/partnershipTrackerClient'
import { usePartnershipTrackerActions } from '../hooks/usePartnershipTracker'

export function EditPartnershipDialog({ summary, onClose }: { summary: PartnershipTrackerSummary; onClose: () => void }) {
  const partnership = summary.partnership
  const actions = usePartnershipTrackerActions()
  const [name, setName] = useState(partnership.name)
  const [type, setType] = useState<PartnershipType>(partnership.partnershipType)
  const [status, setStatus] = useState(partnership.status)
  const [notes, setNotes] = useState(partnership.notes ?? '')
  const [error, setError] = useState<string>()
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; input.current?.focus(); return () => previous?.focus() }, [])
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(undefined)
    try { await actions.updatePartnership.mutateAsync({ id: partnership.id, body: { name: name.trim(), partnershipType: type, status, notes: notes.trim() || null, expectedUpdatedAt: partnership.updatedAt } }); onClose() }
    catch (caught) { setError(caught instanceof PartnershipTrackerApiError && caught.isStale ? 'This partnership changed while you were editing. The latest version has been reloaded; review it and try again.' : caught instanceof PartnershipTrackerApiError && caught.isDuplicate ? 'That partnership name is already in use for this entity.' : 'Changes could not be saved.') }
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div role="dialog" aria-modal="true" aria-labelledby="edit-partnership-title" className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"><h2 id="edit-partnership-title" className="text-lg font-semibold text-gray-950">Edit partnership</h2><form onSubmit={submit} className="mt-5 space-y-4"><label className="block text-sm font-medium">Name<input ref={input} value={name} required onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label><label className="block text-sm font-medium">Partnership type<select value={type} onChange={(event) => setType(event.target.value as PartnershipType)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2">{PARTNERSHIP_TYPES.map((option) => <option key={option}>{option}</option>)}</select></label><label className="block text-sm font-medium">Status<select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2">{['ACTIVE', 'PENDING', 'LIQUIDATED', 'CLOSED'].map((option) => <option key={option}>{option}</option>)}</select></label><label className="block text-sm font-medium">Notes<textarea value={notes} rows={3} onChange={(event) => setNotes(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label>{error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}<div className="flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">Cancel</button><button type="submit" disabled={actions.updatePartnership.isPending} className="rounded-lg bg-atlas-gold px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{actions.updatePartnership.isPending ? 'Saving…' : 'Save changes'}</button></div></form></div></div>
}
