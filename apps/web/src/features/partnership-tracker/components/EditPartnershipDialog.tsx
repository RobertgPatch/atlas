import { useEffect, useRef, useState } from 'react'
import { PARTNERSHIP_TYPES, type PartnershipTrackerSummary, type PartnershipType } from '../../../../../../packages/types/src/partnership-tracker'
import { useEntityList } from '../../partnerships/hooks/useEntityQueries'
import { PartnershipTrackerApiError } from '../api/partnershipTrackerClient'
import { usePartnershipTrackerActions } from '../hooks/usePartnershipTracker'
import { formatEinInput } from '../einInput'

export function EditPartnershipDialog({ summary, onClose }: { summary: PartnershipTrackerSummary; onClose: () => void }) {
  const partnership = summary.partnership
  const owners = useEntityList()
  const actions = usePartnershipTrackerActions()
  const [entityId, setEntityId] = useState(partnership.entity.id)
  const [name, setName] = useState(partnership.name)
  const [type, setType] = useState<PartnershipType>(partnership.partnershipType)
  const [status, setStatus] = useState(partnership.status)
  const [notes, setNotes] = useState(partnership.notes ?? '')
  const [inceptionDate, setInceptionDate] = useState(partnership.inceptionDate ?? '')
  const [ein, setEin] = useState(formatEinInput(partnership.ein))
  const [fundManager, setFundManager] = useState(partnership.fundManager ?? '')
  const [addressLine1, setAddressLine1] = useState(partnership.addressLine1 ?? '')
  const [addressLine2, setAddressLine2] = useState(partnership.addressLine2 ?? '')
  const [addressCity, setAddressCity] = useState(partnership.addressCity ?? '')
  const [addressRegion, setAddressRegion] = useState(partnership.addressRegion ?? '')
  const [addressPostalCode, setAddressPostalCode] = useState(partnership.addressPostalCode ?? '')
  const [addressCountry, setAddressCountry] = useState(partnership.addressCountry ?? '')
  const [error, setError] = useState<string>()
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    input.current?.focus()
    return () => previous?.focus()
  }, [])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(undefined)
    try {
      await actions.updatePartnership.mutateAsync({
        id: partnership.id,
        body: { entityId, name: name.trim(), partnershipType: type, status, notes: notes.trim() || null, inceptionDate: inceptionDate || null, ein: ein.trim() || null, fundManager: fundManager.trim() || null, addressLine1: addressLine1.trim() || null, addressLine2: addressLine2.trim() || null, addressCity: addressCity.trim() || null, addressRegion: addressRegion.trim() || null, addressPostalCode: addressPostalCode.trim() || null, addressCountry: addressCountry.trim() || null, expectedUpdatedAt: partnership.updatedAt },
      })
      onClose()
    } catch (caught) {
      setError(caught instanceof PartnershipTrackerApiError && caught.isStale
        ? 'This partnership changed while you were editing. The latest version has been reloaded; review it and try again.'
        : caught instanceof PartnershipTrackerApiError && caught.isDuplicate
          ? 'That partnership name is already in use for this owner.'
          : 'Changes could not be saved.')
    }
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div role="dialog" aria-modal="true" aria-labelledby="edit-partnership-title" className="max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl"><h2 id="edit-partnership-title" className="font-serif text-xl font-semibold text-gray-950">Edit partnership</h2><form onSubmit={submit} className="mt-5 space-y-4">
    <label className="block text-sm font-medium">Owner<select value={entityId} required onChange={(event) => setEntityId(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2">{owners.data?.items.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select></label>
    <label className="block text-sm font-medium">Name<input ref={input} value={name} required onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
    <label className="block text-sm font-medium">Partnership type<select value={type} onChange={(event) => setType(event.target.value as PartnershipType)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2">{PARTNERSHIP_TYPES.map((option) => <option key={option}>{option}</option>)}</select></label>
    <label className="block text-sm font-medium">Status<select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2">{['ACTIVE', 'PENDING', 'LIQUIDATED', 'CLOSED'].map((option) => <option key={option}>{option}</option>)}</select></label>
    <section className="border-t border-gray-200 pt-5"><h3 className="font-serif text-lg font-semibold text-gray-950">Partnership profile</h3><div className="mt-4 grid gap-4 sm:grid-cols-2">
      <label className="block text-sm font-medium">Inception date<input type="date" max={new Date().toISOString().slice(0, 10)} value={inceptionDate} onChange={(event) => setInceptionDate(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3" /></label>
      <label className="block text-sm font-medium">EIN<input inputMode="numeric" autoComplete="off" value={ein} pattern="[0-9]{2}-[0-9]{7}" placeholder="12-3456789" onChange={(event) => setEin(formatEinInput(event.target.value))} className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3" /><span className="mt-1 block text-xs font-normal text-gray-500">Formatted automatically as 12-3456789.</span></label>
      <label className="block text-sm font-medium sm:col-span-2">Fund manager<input value={fundManager} onChange={(event) => setFundManager(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3" /></label>
      <label className="block text-sm font-medium sm:col-span-2">Address<input value={addressLine1} onChange={(event) => setAddressLine1(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3" /></label>
      <label className="block text-sm font-medium sm:col-span-2"><span className="sr-only">Address line 2</span><input value={addressLine2} onChange={(event) => setAddressLine2(event.target.value)} placeholder="Suite, unit, or building" className="min-h-11 w-full rounded-lg border border-gray-300 px-3" /></label>
      <label className="block text-sm font-medium">City<input value={addressCity} onChange={(event) => setAddressCity(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3" /></label>
      <label className="block text-sm font-medium">State / region<input value={addressRegion} onChange={(event) => setAddressRegion(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3" /></label>
      <label className="block text-sm font-medium">Postal code<input value={addressPostalCode} onChange={(event) => setAddressPostalCode(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3" /></label>
      <label className="block text-sm font-medium">Country<input value={addressCountry} onChange={(event) => setAddressCountry(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3" /></label>
    </div></section>
    <label className="block text-sm font-medium">Notes<textarea value={notes} rows={3} onChange={(event) => setNotes(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">Cancel</button><button type="submit" disabled={actions.updatePartnership.isPending || owners.isLoading} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{actions.updatePartnership.isPending ? 'Saving...' : 'Save changes'}</button></div>
  </form></div></div>
}
