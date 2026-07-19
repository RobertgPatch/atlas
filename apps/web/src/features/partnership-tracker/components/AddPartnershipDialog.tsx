import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { PARTNERSHIP_TYPES, type PartnershipType } from '../../../../../../packages/types/src/partnership-tracker'
import { useEntityList } from '../../partnerships/hooks/useEntityQueries'
import { PartnershipTrackerApiError } from '../api/partnershipTrackerClient'
import { usePartnershipTrackerActions } from '../hooks/usePartnershipTracker'

export function AddPartnershipDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const entities = useEntityList()
  const actions = usePartnershipTrackerActions()
  const [entityId, setEntityId] = useState('')
  const [name, setName] = useState('')
  const [type, setType] = useState<PartnershipType>('Private Equity')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string>()
  const nameRef = useRef<HTMLInputElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!open) return
    returnFocus.current = document.activeElement as HTMLElement | null
    const timer = window.setTimeout(() => nameRef.current?.focus(), 0)
    return () => { window.clearTimeout(timer); returnFocus.current?.focus() }
  }, [open])
  if (!open) return null
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(undefined)
    if (!entityId) { setError('Choose the owner of this partnership.'); return }
    try {
      const result = await actions.createPartnership.mutateAsync({ entityId, name: name.trim(), partnershipType: type, notes: notes.trim() || null })
      onCreated(result.partnership.partnership.id)
      setEntityId(''); setName(''); setType('Private Equity'); setNotes('')
    } catch (caught) {
      setError(caught instanceof PartnershipTrackerApiError && caught.code === 'DUPLICATE_PARTNERSHIP_NAME' ? 'A partnership with this name already exists for the selected owner.' : 'The partnership could not be created. Please try again.')
    }
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation"><div role="dialog" aria-modal="true" aria-labelledby="add-partnership-title" className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"><h2 id="add-partnership-title" className="text-lg font-semibold text-gray-950">Add partnership</h2><p className="mt-1 text-sm text-gray-500">Create the partnership first, then start any K-1 year.</p><form onSubmit={submit} className="mt-5 space-y-4">
    <label className="block text-sm font-medium text-gray-800">Owner<select value={entityId} required onChange={(event) => setEntityId(event.target.value)} disabled={entities.isLoading || !entities.data?.items.length} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"><option value="">{entities.isLoading ? 'Loading owners...' : 'Select an owner'}</option>{entities.data?.items.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select></label>
    {entities.isError ? <p role="alert" className="text-sm text-red-700">Owners could not be loaded. Refresh and try again.</p> : !entities.isLoading && !entities.data?.items.length ? <p className="text-sm text-gray-600">Create an <Link to="/entities" className="font-medium text-atlas-gold underline">owner</Link> before adding a partnership.</p> : null}
    <label className="block text-sm font-medium text-gray-800">Partnership name<input ref={nameRef} value={name} required maxLength={120} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
    <label className="block text-sm font-medium text-gray-800">Partnership type<select value={type} onChange={(event) => setType(event.target.value as PartnershipType)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2">{PARTNERSHIP_TYPES.map((option) => <option key={option}>{option}</option>)}</select></label>
    <label className="block text-sm font-medium text-gray-800">Notes <span className="font-normal text-gray-500">(optional)</span><textarea value={notes} maxLength={10_000} rows={3} onChange={(event) => setNotes(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">Cancel</button><button type="submit" disabled={actions.createPartnership.isPending || !entities.data?.items.length} className="rounded-lg bg-atlas-gold px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{actions.createPartnership.isPending ? 'Creating…' : 'Create partnership'}</button></div>
  </form></div></div>
}
