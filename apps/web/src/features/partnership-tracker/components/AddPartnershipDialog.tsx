import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { PARTNERSHIP_TYPES, type PartnershipTrackerSummary, type PartnershipType } from '../../../../../../packages/types/src/partnership-tracker'
import { useEntityList } from '../../partnerships/hooks/useEntityQueries'
import { PartnershipTrackerApiError } from '../api/partnershipTrackerClient'
import { usePartnershipTrackerActions, usePartnershipTrackerList } from '../hooks/usePartnershipTracker'

type CreationMode = 'new' | 'existing'

const fallbackGroupKey = (summary: PartnershipTrackerSummary) => `${summary.partnership.partnershipType}:${summary.partnership.name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')}`
const groupKey = (summary: PartnershipTrackerSummary) => summary.partnership.aggregationGroupId ?? fallbackGroupKey(summary)

export function AddPartnershipDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const entities = useEntityList()
  const partnerships = usePartnershipTrackerList({ limit: 200 })
  const actions = usePartnershipTrackerActions()
  const [mode, setMode] = useState<CreationMode>('new')
  const [existingPartnershipId, setExistingPartnershipId] = useState('')
  const [entityId, setEntityId] = useState('')
  const [name, setName] = useState('')
  const [type, setType] = useState<PartnershipType>('Private Equity')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string>()
  const nameRef = useRef<HTMLInputElement>(null)
  const existingRef = useRef<HTMLSelectElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)

  const existingOptions = useMemo(() => {
    const seen = new Set<string>()
    return (partnerships.data?.items ?? []).filter((summary) => {
      const key = groupKey(summary)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [partnerships.data?.items])

  const selectedPartnership = existingOptions.find((summary) => summary.partnership.id === existingPartnershipId)
  const selectedGroupKey = selectedPartnership ? groupKey(selectedPartnership) : undefined
  const currentOwnerIds = useMemo(() => new Set((partnerships.data?.items ?? [])
    .filter((summary) => selectedGroupKey && groupKey(summary) === selectedGroupKey)
    .map((summary) => summary.partnership.entity.id)), [partnerships.data?.items, selectedGroupKey])
  const availableOwners = (entities.data?.items ?? []).filter((entity) => mode === 'new' || !currentOwnerIds.has(entity.id))

  useEffect(() => {
    if (!open) return
    returnFocus.current = document.activeElement as HTMLElement | null
    const timer = window.setTimeout(() => (mode === 'new' ? nameRef.current : existingRef.current)?.focus(), 0)
    return () => { window.clearTimeout(timer); returnFocus.current?.focus() }
  }, [open, mode])

  if (!open) return null

  const chooseMode = (nextMode: CreationMode) => {
    setMode(nextMode)
    setError(undefined)
    setEntityId('')
    if (nextMode === 'new') setExistingPartnershipId('')
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(undefined)
    if (!entityId) { setError('Choose the owner of this partnership.'); return }
    if (mode === 'existing' && !selectedPartnership) { setError('Choose the existing partnership to add for this owner.'); return }
    try {
      const inherited = selectedPartnership?.partnership
      const result = await actions.createPartnership.mutateAsync({
        entityId,
        name: inherited?.name ?? name.trim(),
        partnershipType: inherited?.partnershipType ?? type,
        ...(mode === 'existing' && inherited ? { existingPartnershipId: inherited.id } : {}),
        notes: notes.trim() || null,
      })
      onCreated(result.partnership.partnership.id)
      setMode('new')
      setExistingPartnershipId('')
      setEntityId('')
      setName('')
      setType('Private Equity')
      setNotes('')
    } catch (caught) {
      setError(caught instanceof PartnershipTrackerApiError && caught.code === 'DUPLICATE_PARTNERSHIP_NAME'
        ? 'This owner already has a record for that partnership.'
        : 'The partnership could not be created. Please try again.')
    }
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/60 p-4" role="presentation">
    <div role="dialog" aria-modal="true" aria-labelledby="add-partnership-title" className="w-full max-w-xl overflow-hidden rounded-lg bg-white shadow-2xl">
      <div className="border-b border-gray-200 px-6 py-5">
        <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-atlas-hover">Partnership workspace</p>
        <h2 id="add-partnership-title" className="mt-1 font-serif text-xl font-semibold text-gray-950">Add partnership</h2>
        <p className="mt-1 text-sm text-gray-500">Create an independent owner record or add another owner to an existing aggregate.</p>
      </div>
      <form onSubmit={submit} className="space-y-5 px-6 py-5">
        <fieldset>
          <legend className="text-sm font-bold text-gray-900">What are you adding?</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className={`cursor-pointer rounded-md border p-3 transition-colors ${mode === 'new' ? 'border-atlas-gold bg-atlas-gold/10 ring-1 ring-atlas-gold' : 'border-gray-300 hover:border-gray-400'}`}>
              <span className="flex items-start gap-3"><input type="radio" name="creation-mode" value="new" checked={mode === 'new'} onChange={() => chooseMode('new')} className="mt-1 h-4 w-4 border-gray-300 text-atlas-gold focus:ring-atlas-gold" /><span><span className="block text-sm font-semibold text-gray-950">New partnership</span><span className="mt-1 block text-xs leading-4 text-gray-500">Start a new aggregate and owner record.</span></span></span>
            </label>
            <label className={`cursor-pointer rounded-md border p-3 transition-colors ${mode === 'existing' ? 'border-atlas-gold bg-atlas-gold/10 ring-1 ring-atlas-gold' : 'border-gray-300 hover:border-gray-400'}`}>
              <span className="flex items-start gap-3"><input type="radio" name="creation-mode" value="existing" checked={mode === 'existing'} onChange={() => chooseMode('existing')} className="mt-1 h-4 w-4 border-gray-300 text-atlas-gold focus:ring-atlas-gold" /><span><span className="block text-sm font-semibold text-gray-950">Existing partnership, new owner</span><span className="mt-1 block text-xs leading-4 text-gray-500">Reuse its name and type in the All Partnerships rollup.</span></span></span>
            </label>
          </div>
        </fieldset>

        {mode === 'existing' ? <label className="block text-sm font-medium text-gray-800">Existing partnership
          <select ref={existingRef} value={existingPartnershipId} required onChange={(event) => { setExistingPartnershipId(event.target.value); setEntityId('') }} disabled={partnerships.isLoading || !existingOptions.length} className="mt-1 min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 outline-none focus:border-atlas-gold focus:ring-2 focus:ring-atlas-gold/30">
            <option value="">{partnerships.isLoading ? 'Loading partnerships...' : 'Select a partnership'}</option>
            {existingOptions.map((summary) => <option key={groupKey(summary)} value={summary.partnership.id}>{summary.partnership.name} — {summary.partnership.partnershipType}</option>)}
          </select>
          {selectedPartnership && <span className="mt-2 block border-l-2 border-atlas-gold pl-3 text-xs leading-5 text-gray-500">The new record will appear under <strong className="text-gray-700">{selectedPartnership.partnership.name}</strong> on All Partnerships. K-1s, commitments, NAV, and notes remain owner-specific.</span>}
        </label> : <>
          <label className="block text-sm font-medium text-gray-800">Partnership name<input ref={nameRef} value={name} required maxLength={120} onChange={(event) => setName(event.target.value)} className="mt-1 min-h-11 w-full rounded-md border border-gray-300 px-3 outline-none focus:border-atlas-gold focus:ring-2 focus:ring-atlas-gold/30" /></label>
          <label className="block text-sm font-medium text-gray-800">Partnership type<select value={type} onChange={(event) => setType(event.target.value as PartnershipType)} className="mt-1 min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 outline-none focus:border-atlas-gold focus:ring-2 focus:ring-atlas-gold/30">{PARTNERSHIP_TYPES.map((option) => <option key={option}>{option}</option>)}</select></label>
        </>}

        <label className="block text-sm font-medium text-gray-800">Owner<select value={entityId} required onChange={(event) => setEntityId(event.target.value)} disabled={entities.isLoading || !availableOwners.length || (mode === 'existing' && !selectedPartnership)} className="mt-1 min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 outline-none focus:border-atlas-gold focus:ring-2 focus:ring-atlas-gold/30"><option value="">{entities.isLoading ? 'Loading owners...' : mode === 'existing' && !selectedPartnership ? 'Select a partnership first' : 'Select an owner'}</option>{availableOwners.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select></label>
        {mode === 'existing' && selectedPartnership && !availableOwners.length ? <p className="border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-sm text-amber-950">Every available owner already has a record for this partnership.</p> : null}
        {entities.isError ? <p role="alert" className="text-sm text-red-700">Owners could not be loaded. Refresh and try again.</p> : !entities.isLoading && !entities.data?.items.length ? <p className="text-sm text-gray-600">Create an <Link to="/entities" className="font-medium text-atlas-gold underline">owner</Link> before adding a partnership.</p> : null}
        <label className="block text-sm font-medium text-gray-800">Notes <span className="font-normal text-gray-500">(optional, owner-specific)</span><textarea value={notes} maxLength={10_000} rows={3} onChange={(event) => setNotes(event.target.value)} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-atlas-gold focus:ring-2 focus:ring-atlas-gold/30" /></label>
        {error && <p role="alert" className="border-l-4 border-red-600 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <div className="flex flex-col-reverse gap-3 border-t border-gray-200 pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} className="min-h-11 rounded-md border border-gray-300 px-4 text-sm font-semibold text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atlas-gold">Cancel</button><button type="submit" disabled={actions.createPartnership.isPending || !availableOwners.length} className="min-h-11 rounded-md bg-gray-950 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atlas-gold focus-visible:ring-offset-2">{actions.createPartnership.isPending ? 'Creating…' : mode === 'existing' ? 'Add owner record' : 'Create partnership'}</button></div>
      </form>
    </div>
  </div>
}
