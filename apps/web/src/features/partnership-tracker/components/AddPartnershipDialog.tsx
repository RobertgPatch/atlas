import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { PARTNERSHIP_TYPES, type PartnershipTrackerSummary, type PartnershipType } from '../../../../../../packages/types/src/partnership-tracker'
import { useEntityList } from '../../partnerships/hooks/useEntityQueries'
import { PartnershipTrackerApiError } from '../api/partnershipTrackerClient'
import { usePartnershipTrackerActions, usePartnershipTrackerDetail, usePartnershipTrackerList } from '../hooks/usePartnershipTracker'
import { CurrencyInput } from '../../../components/shared/CurrencyField'

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
  const [inceptionDate, setInceptionDate] = useState('')
  const [ein, setEin] = useState('')
  const [fundManager, setFundManager] = useState('')
  const [addressLine1, setAddressLine1] = useState('')
  const [addressLine2, setAddressLine2] = useState('')
  const [addressCity, setAddressCity] = useState('')
  const [addressRegion, setAddressRegion] = useState('')
  const [addressPostalCode, setAddressPostalCode] = useState('')
  const [addressCountry, setAddressCountry] = useState('United States')
  const [capitalCommitment, setCapitalCommitment] = useState('')
  const [initialValuationAmount, setInitialValuationAmount] = useState('')
  const [initialValuationDate, setInitialValuationDate] = useState('')
  const [copyK1Years, setCopyK1Years] = useState(false)
  const [copySourcePartnershipId, setCopySourcePartnershipId] = useState('')
  const [excludedCopyYears, setExcludedCopyYears] = useState<number[]>([])
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
  const copySource = usePartnershipTrackerDetail(copyK1Years ? copySourcePartnershipId : undefined)
  const availableCopyYears = useMemo(
    () => [...(copySource.data?.years ?? [])].sort((left, right) => right.taxYear - left.taxYear),
    [copySource.data?.years],
  )
  const selectedCopyYears = useMemo(() => availableCopyYears
    .map((year) => year.taxYear)
    .filter((taxYear) => !excludedCopyYears.includes(taxYear))
    .sort((left, right) => left - right), [availableCopyYears, excludedCopyYears])

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
    setCopyK1Years(false)
    setCopySourcePartnershipId('')
    setExcludedCopyYears([])
    setCapitalCommitment('')
    if (nextMode === 'new') setExistingPartnershipId('')
  }

  const chooseExistingPartnership = (partnershipId: string) => {
    const selected = existingOptions.find((summary) => summary.partnership.id === partnershipId)
    setExistingPartnershipId(partnershipId)
    setEntityId('')
    setCapitalCommitment(selected?.currentCommittedCapital?.amount ?? '')
    if (copyK1Years) chooseCopySource(partnershipId)
  }

  const chooseCopySource = (partnershipId: string) => {
    setCopySourcePartnershipId(partnershipId)
    setExcludedCopyYears([])
    setError(undefined)
  }

  const toggleCopyYear = (taxYear: number) => {
    setExcludedCopyYears((current) => current.includes(taxYear)
      ? current.filter((year) => year !== taxYear)
      : [...current, taxYear])
  }

  const copySelectionInvalid = copyK1Years && (
    !copySourcePartnershipId
    || copySource.isLoading
    || copySource.isError
    || !availableCopyYears.length
    || !selectedCopyYears.length
  )

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(undefined)
    if (!entityId) { setError('Choose the owner of this partnership.'); return }
    if (mode === 'existing' && !selectedPartnership) { setError('Choose the existing partnership to add for this owner.'); return }
    if (mode === 'new' && Boolean(initialValuationAmount) !== Boolean(initialValuationDate)) { setError('Enter both the initial valuation and its valuation date.'); return }
    if (copyK1Years && !copySourcePartnershipId) { setError('Choose the partnership whose K-1 years should be copied.'); return }
    if (copyK1Years && !selectedCopyYears.length) { setError('Select at least one K-1 year to copy.'); return }
    try {
      const inherited = selectedPartnership?.partnership
      const result = await actions.createPartnership.mutateAsync({
        entityId,
        name: inherited?.name ?? name.trim(),
        partnershipType: inherited?.partnershipType ?? type,
        ...(mode === 'existing' && inherited ? { existingPartnershipId: inherited.id } : {}),
        ...(copyK1Years ? { copyK1YearsFrom: { partnershipId: copySourcePartnershipId, taxYears: selectedCopyYears } } : {}),
        capitalCommitment: capitalCommitment || null,
        notes: notes.trim() || null,
        ...(mode === 'new' ? {
          inceptionDate: inceptionDate || null,
          ein: ein.trim() || null,
          fundManager: fundManager.trim() || null,
          addressLine1: addressLine1.trim() || null,
          addressLine2: addressLine2.trim() || null,
          addressCity: addressCity.trim() || null,
          addressRegion: addressRegion.trim() || null,
          addressPostalCode: addressPostalCode.trim() || null,
          addressCountry: addressCountry.trim() || null,
          initialValuationAmount: initialValuationAmount || null,
          initialValuationDate: initialValuationDate || null,
        } : {}),
      })
      onCreated(result.partnership.partnership.id)
      setMode('new')
      setExistingPartnershipId('')
      setEntityId('')
      setName('')
      setType('Private Equity')
      setNotes('')
      setCapitalCommitment('')
      setCopyK1Years(false)
      setCopySourcePartnershipId('')
      setExcludedCopyYears([])
      setInceptionDate(''); setEin(''); setFundManager(''); setAddressLine1(''); setAddressLine2(''); setAddressCity(''); setAddressRegion(''); setAddressPostalCode(''); setAddressCountry('United States'); setInitialValuationAmount(''); setInitialValuationDate('')
    } catch (caught) {
      setError(caught instanceof PartnershipTrackerApiError && caught.code === 'DUPLICATE_PARTNERSHIP_NAME'
        ? 'This owner already has a record for that partnership.'
        : 'The partnership could not be created. Please try again.')
    }
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/60 p-4" role="presentation">
    <div role="dialog" aria-modal="true" aria-labelledby="add-partnership-title" className="flex max-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
      <div className="shrink-0 border-b border-gray-200 px-6 py-5">
        <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-jackson-hover">Partnership workspace</p>
        <h2 id="add-partnership-title" className="mt-1 font-serif text-xl font-semibold text-gray-950">Add partnership</h2>
        <p className="mt-1 text-sm text-gray-500">Create an independent owner record or add another owner to an existing aggregate.</p>
      </div>
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-6 py-5 [scrollbar-gutter:stable]" data-testid="add-partnership-form-scroll">
        <fieldset>
          <legend className="text-sm font-bold text-gray-900">What are you adding?</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className={`cursor-pointer rounded-md border p-3 transition-colors ${mode === 'new' ? 'border-jackson-gold bg-jackson-gold/10 ring-1 ring-jackson-gold' : 'border-gray-300 hover:border-gray-400'}`}>
              <span className="flex items-start gap-3"><input type="radio" name="creation-mode" value="new" checked={mode === 'new'} onChange={() => chooseMode('new')} className="mt-1 h-4 w-4 border-gray-300 text-jackson-gold focus:ring-jackson-gold" /><span><span className="block text-sm font-semibold text-gray-950">New partnership</span><span className="mt-1 block text-xs leading-4 text-gray-500">Start a new aggregate and owner record.</span></span></span>
            </label>
            <label className={`cursor-pointer rounded-md border p-3 transition-colors ${mode === 'existing' ? 'border-jackson-gold bg-jackson-gold/10 ring-1 ring-jackson-gold' : 'border-gray-300 hover:border-gray-400'}`}>
              <span className="flex items-start gap-3"><input type="radio" name="creation-mode" value="existing" checked={mode === 'existing'} onChange={() => chooseMode('existing')} className="mt-1 h-4 w-4 border-gray-300 text-jackson-gold focus:ring-jackson-gold" /><span><span className="block text-sm font-semibold text-gray-950">Existing partnership, new owner</span><span className="mt-1 block text-xs leading-4 text-gray-500">Reuse its name and type in the All Partnerships rollup.</span></span></span>
            </label>
          </div>
        </fieldset>

        {mode === 'existing' ? <label className="block text-sm font-medium text-gray-800">Existing partnership
          <select ref={existingRef} value={existingPartnershipId} required onChange={(event) => chooseExistingPartnership(event.target.value)} disabled={partnerships.isLoading || !existingOptions.length} className="mt-1 min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 outline-none focus:border-jackson-gold focus:ring-2 focus:ring-jackson-gold/30">
            <option value="">{partnerships.isLoading ? 'Loading partnerships...' : 'Select a partnership'}</option>
            {existingOptions.map((summary) => <option key={groupKey(summary)} value={summary.partnership.id}>{summary.partnership.name} — {summary.partnership.partnershipType}</option>)}
          </select>
          {selectedPartnership && <span className="mt-2 block border-l-2 border-jackson-gold pl-3 text-xs leading-5 text-gray-500">The new record will appear under <strong className="text-gray-700">{selectedPartnership.partnership.name}</strong> on All Partnerships. K-1s remain owner-specific unless you copy selected years below.</span>}
        </label> : <>
          <label className="block text-sm font-medium text-gray-800">Partnership name<input ref={nameRef} value={name} required maxLength={120} onChange={(event) => setName(event.target.value)} className="mt-1 min-h-11 w-full rounded-md border border-gray-300 px-3 outline-none focus:border-jackson-gold focus:ring-2 focus:ring-jackson-gold/30" /></label>
          <label className="block text-sm font-medium text-gray-800">Partnership type<select value={type} onChange={(event) => setType(event.target.value as PartnershipType)} className="mt-1 min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 outline-none focus:border-jackson-gold focus:ring-2 focus:ring-jackson-gold/30">{PARTNERSHIP_TYPES.map((option) => <option key={option}>{option}</option>)}</select></label>
        </>}

        <label className="block text-sm font-medium text-gray-800">Owner<select value={entityId} required onChange={(event) => setEntityId(event.target.value)} disabled={entities.isLoading || !availableOwners.length || (mode === 'existing' && !selectedPartnership)} className="mt-1 min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 outline-none focus:border-jackson-gold focus:ring-2 focus:ring-jackson-gold/30"><option value="">{entities.isLoading ? 'Loading owners...' : mode === 'existing' && !selectedPartnership ? 'Select a partnership first' : 'Select an owner'}</option>{availableOwners.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select></label>
        {mode === 'existing' && selectedPartnership && !availableOwners.length ? <p className="border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-sm text-amber-950">Every available owner already has a record for this partnership.</p> : null}
        {entities.isError ? <p role="alert" className="text-sm text-red-700">Owners could not be loaded. Refresh and try again.</p> : !entities.isLoading && !entities.data?.items.length ? <p className="text-sm text-gray-600">Create an <Link to="/entities" className="font-medium text-jackson-gold underline">owner</Link> before adding a partnership.</p> : null}
        <section aria-labelledby="capital-commitment-heading" className="rounded-md border border-gray-200 bg-gray-50/70 p-4">
          <h3 id="capital-commitment-heading" className="text-sm font-bold text-gray-950">Capital commitment</h3>
          <p className="mt-1 text-xs leading-5 text-gray-500">Enter this owner position's committed capital. It remains on the partnership profile; recallable distributions increase the effective commitment automatically.</p>
          <label className="mt-3 block text-sm font-medium text-gray-800">Committed amount <span className="font-normal text-gray-500">(optional)</span><CurrencyInput value={capitalCommitment} onChange={setCapitalCommitment} allowNegative={false} placeholder="$0.00" /></label>
        </section>
        <section aria-labelledby="copy-k1-years-heading" className="relative overflow-hidden rounded-md border border-gray-200 bg-gray-50/70 p-4 pl-5">
          <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-jackson-gold" />
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={copyK1Years}
              onChange={(event) => {
                const checked = event.target.checked
                setCopyK1Years(checked)
                chooseCopySource(checked && mode === 'existing' ? existingPartnershipId : '')
              }}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-jackson-gold focus:ring-jackson-gold"
            />
            <span><span id="copy-k1-years-heading" className="block text-sm font-bold text-gray-950">Copy K-1 entry years</span><span className="mt-1 block text-xs leading-5 text-gray-500">Start with another partnership's current K-1 values and dated cash activity.</span></span>
          </label>
          {copyK1Years ? <div className="mt-4 space-y-4 border-t border-gray-200 pt-4">
            <label className="block text-sm font-medium text-gray-800">Source partnership
              <select value={copySourcePartnershipId} required onChange={(event) => chooseCopySource(event.target.value)} disabled={partnerships.isLoading} className="mt-1 min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 outline-none focus:border-jackson-gold focus:ring-2 focus:ring-jackson-gold/30">
                <option value="">{partnerships.isLoading ? 'Loading partnerships...' : 'Select a source partnership'}</option>
                {(partnerships.data?.items ?? []).map((summary) => <option key={summary.partnership.id} value={summary.partnership.id}>{summary.partnership.name} — {summary.partnership.entity.name}</option>)}
              </select>
            </label>
            {copySource.isLoading ? <p aria-live="polite" className="text-sm text-gray-600">Loading available K-1 years…</p> : copySource.isError ? <p role="alert" className="text-sm text-red-700">The source partnership's K-1 years could not be loaded.</p> : copySourcePartnershipId && !availableCopyYears.length ? <p className="text-sm text-amber-800">This partnership does not have any K-1 entry years to copy.</p> : availableCopyYears.length ? <fieldset>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <legend className="text-sm font-bold text-gray-900">Years to copy <span className="font-normal text-gray-500">({selectedCopyYears.length} of {availableCopyYears.length})</span></legend>
                <span className="flex gap-3 text-xs font-semibold"><button type="button" onClick={() => setExcludedCopyYears([])} className="text-jackson-hover underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jackson-gold">Select all</button><button type="button" onClick={() => setExcludedCopyYears(availableCopyYears.map((year) => year.taxYear))} className="text-gray-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jackson-gold">Clear</button></span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {availableCopyYears.map((year) => <label key={year.taxYear} className={`flex min-h-11 cursor-pointer items-center justify-between rounded-md border px-3 py-2 text-sm font-semibold ${selectedCopyYears.includes(year.taxYear) ? 'border-jackson-gold bg-white text-gray-950 ring-1 ring-jackson-gold/40' : 'border-gray-300 bg-white/60 text-gray-600'}`}><span>{year.taxYear}</span><input type="checkbox" checked={selectedCopyYears.includes(year.taxYear)} onChange={() => toggleCopyYear(year.taxYear)} className="h-4 w-4 rounded border-gray-300 text-jackson-gold focus:ring-jackson-gold" /></label>)}
              </div>
              <p className="mt-3 text-xs leading-5 text-gray-500">All years are selected by default. Copied years open in progress for review; sign-offs, uploaded files, and revision history stay with the source.</p>
            </fieldset> : null}
          </div> : null}
        </section>
        {mode === 'new' && <>
          <section aria-labelledby="partnership-profile-heading" className="border-t border-gray-200 pt-5">
            <div><h3 id="partnership-profile-heading" className="font-serif text-lg font-semibold text-gray-950">Partnership profile</h3><p className="mt-1 text-xs text-gray-500">Enter shared fund details once. They will appear on the partnership overview and carry to future owner records.</p></div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-gray-800">Inception date<input type="date" max={new Date().toISOString().slice(0, 10)} value={inceptionDate} onChange={(event) => setInceptionDate(event.target.value)} className="mt-1 min-h-11 w-full rounded-md border border-gray-300 px-3 outline-none focus:border-jackson-gold focus:ring-2 focus:ring-jackson-gold/30" /></label>
              <label className="block text-sm font-medium text-gray-800">EIN <span className="font-normal text-gray-500">(masked on overview)</span><input inputMode="numeric" autoComplete="off" value={ein} onChange={(event) => setEin(event.target.value)} placeholder="12-3456789" pattern="[0-9]{2}-?[0-9]{7}" className="mt-1 min-h-11 w-full rounded-md border border-gray-300 px-3 outline-none focus:border-jackson-gold focus:ring-2 focus:ring-jackson-gold/30" /></label>
              <label className="block text-sm font-medium text-gray-800 sm:col-span-2">Fund manager<input value={fundManager} maxLength={200} onChange={(event) => setFundManager(event.target.value)} className="mt-1 min-h-11 w-full rounded-md border border-gray-300 px-3 outline-none focus:border-jackson-gold focus:ring-2 focus:ring-jackson-gold/30" /></label>
              <label className="block text-sm font-medium text-gray-800 sm:col-span-2">Address<input value={addressLine1} maxLength={200} onChange={(event) => setAddressLine1(event.target.value)} placeholder="Street address" className="mt-1 min-h-11 w-full rounded-md border border-gray-300 px-3 outline-none focus:border-jackson-gold focus:ring-2 focus:ring-jackson-gold/30" /></label>
              <label className="block text-sm font-medium text-gray-800 sm:col-span-2"><span className="sr-only">Address line 2</span><input value={addressLine2} maxLength={200} onChange={(event) => setAddressLine2(event.target.value)} placeholder="Suite, unit, or building (optional)" className="min-h-11 w-full rounded-md border border-gray-300 px-3 outline-none focus:border-jackson-gold focus:ring-2 focus:ring-jackson-gold/30" /></label>
              <label className="block text-sm font-medium text-gray-800">City<input value={addressCity} maxLength={120} onChange={(event) => setAddressCity(event.target.value)} className="mt-1 min-h-11 w-full rounded-md border border-gray-300 px-3 outline-none focus:border-jackson-gold focus:ring-2 focus:ring-jackson-gold/30" /></label>
              <label className="block text-sm font-medium text-gray-800">State / region<input value={addressRegion} maxLength={120} onChange={(event) => setAddressRegion(event.target.value)} className="mt-1 min-h-11 w-full rounded-md border border-gray-300 px-3 outline-none focus:border-jackson-gold focus:ring-2 focus:ring-jackson-gold/30" /></label>
              <label className="block text-sm font-medium text-gray-800">Postal code<input value={addressPostalCode} maxLength={30} onChange={(event) => setAddressPostalCode(event.target.value)} className="mt-1 min-h-11 w-full rounded-md border border-gray-300 px-3 outline-none focus:border-jackson-gold focus:ring-2 focus:ring-jackson-gold/30" /></label>
              <label className="block text-sm font-medium text-gray-800">Country<input value={addressCountry} maxLength={120} onChange={(event) => setAddressCountry(event.target.value)} className="mt-1 min-h-11 w-full rounded-md border border-gray-300 px-3 outline-none focus:border-jackson-gold focus:ring-2 focus:ring-jackson-gold/30" /></label>
            </div>
          </section>
          <section aria-labelledby="entry-valuation-heading" className="border-t border-gray-200 pt-5"><h3 id="entry-valuation-heading" className="font-serif text-lg font-semibold text-gray-950">Entry valuation</h3><p className="mt-1 text-xs text-gray-500">Optional. This becomes the first dated NAV entry.</p><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium text-gray-800">Initial valuation<CurrencyInput value={initialValuationAmount} onChange={setInitialValuationAmount} allowNegative={false} placeholder="$0.00" /></label><label className="block text-sm font-medium text-gray-800">Valuation date<input type="date" value={initialValuationDate} onChange={(event) => setInitialValuationDate(event.target.value)} className="mt-1 min-h-11 w-full rounded-md border border-gray-300 px-3 outline-none focus:border-jackson-gold focus:ring-2 focus:ring-jackson-gold/30" /></label></div></section>
        </>}
        <label className="block text-sm font-medium text-gray-800">Notes <span className="font-normal text-gray-500">(optional, owner-specific)</span><textarea value={notes} maxLength={10_000} rows={3} onChange={(event) => setNotes(event.target.value)} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-jackson-gold focus:ring-2 focus:ring-jackson-gold/30" /></label>
        </div>
        <div className="shrink-0 border-t border-gray-200 bg-white px-6 py-4 shadow-[0_-8px_20px_-16px_rgba(15,23,42,0.45)]" data-testid="add-partnership-dialog-footer">
          {error && <p role="alert" className="mb-3 border-l-4 border-red-600 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} className="min-h-11 rounded-md border border-gray-300 px-4 text-sm font-semibold text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jackson-gold">Cancel</button><button type="submit" disabled={actions.createPartnership.isPending || !availableOwners.length || copySelectionInvalid} className="min-h-11 rounded-md bg-gray-950 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jackson-gold focus-visible:ring-offset-2">{actions.createPartnership.isPending ? 'Creating…' : mode === 'existing' ? 'Add owner record' : 'Create partnership'}</button></div>
        </div>
      </form>
    </div>
  </div>
}
