import { Info } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  PARTNERSHIP_TYPES,
  type PartnershipTrackerSummary,
  type PartnershipType,
} from '../../../../../../../packages/types/src/partnership-tracker'
import { normalizeCurrencyInput } from '../../../../components/shared/currencyInput'
import { useEntityList } from '../../../partnerships/hooks/useEntityQueries'
import { PartnershipTrackerApiError } from '../../api/partnershipTrackerClient'
import { formatEinInput } from '../../einInput'
import {
  usePartnershipTrackerActions,
  usePartnershipTrackerList,
} from '../../hooks/usePartnershipTracker'
import {
  MagicButton,
  MagicFieldGroup,
  MagicModal,
  mpInputClass,
  mpLabelClass,
} from './MagicPatternPrimitives'

type CreationMode = 'new' | 'existing'

const today = () => new Date().toISOString().slice(0, 10)
const normalizedFund = (name: string, type: string) =>
  `${type}:${name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')}`
const groupKey = (record: PartnershipTrackerSummary) =>
  record.partnership.aggregationGroupId ?? normalizedFund(record.partnership.name, record.partnership.partnershipType)

export function MagicPatternPartnershipRecordDialog({
  open,
  mode,
  summary,
  onClose,
  onCreated,
}: {
  open: boolean
  mode: 'create' | 'edit'
  summary?: PartnershipTrackerSummary
  onClose: () => void
  onCreated?: (id: string) => void
}) {
  const entities = useEntityList()
  const partnerships = usePartnershipTrackerList({ limit: 200 })
  const actions = usePartnershipTrackerActions()
  const partnership = summary?.partnership
  const [creationMode, setCreationMode] = useState<CreationMode>('new')
  const [existingPartnershipId, setExistingPartnershipId] = useState('')
  const [name, setName] = useState(partnership?.name ?? '')
  const [entityId, setEntityId] = useState(partnership?.entity.id ?? '')
  const [type, setType] = useState<PartnershipType>(partnership?.partnershipType ?? 'Private Equity')
  const [status, setStatus] = useState<'ACTIVE' | 'PENDING' | 'LIQUIDATED' | 'CLOSED'>(partnership?.status ?? 'ACTIVE')
  const [fundManager, setFundManager] = useState(partnership?.fundManager ?? '')
  const [ein, setEin] = useState(formatEinInput(partnership?.ein))
  const [inceptionDate, setInceptionDate] = useState(partnership?.inceptionDate ?? today())
  const [addressLine1, setAddressLine1] = useState(partnership?.addressLine1 ?? '')
  const [addressLine2, setAddressLine2] = useState(partnership?.addressLine2 ?? '')
  const [addressCity, setAddressCity] = useState(partnership?.addressCity ?? '')
  const [addressRegion, setAddressRegion] = useState(partnership?.addressRegion ?? '')
  const [addressPostalCode, setAddressPostalCode] = useState(partnership?.addressPostalCode ?? '')
  const [addressCountry, setAddressCountry] = useState(partnership?.addressCountry ?? 'United States')
  const [commitment, setCommitment] = useState('')
  const [commitmentEffectiveDate, setCommitmentEffectiveDate] = useState(today())
  const [commitmentSource, setCommitmentSource] = useState('Subscription agreement')
  const [error, setError] = useState<string>()

  const existingFundOptions = useMemo(() => {
    const seen = new Set<string>()
    return (partnerships.data?.items ?? []).filter((record) => {
      const key = groupKey(record)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [partnerships.data?.items])
  const selectedExistingFund = existingFundOptions.find(
    (record) => record.partnership.id === existingPartnershipId,
  )
  const selectedGroupKey = selectedExistingFund ? groupKey(selectedExistingFund) : undefined
  const currentOwners = useMemo(
    () => new Set(
      (partnerships.data?.items ?? [])
        .filter((record) => selectedGroupKey && groupKey(record) === selectedGroupKey)
        .map((record) => record.partnership.entity.id),
    ),
    [partnerships.data?.items, selectedGroupKey],
  )
  const ownerOptions = (entities.data?.items ?? []).filter(
    (entity) => mode === 'edit' || creationMode === 'new' || !currentOwners.has(entity.id),
  )
  const pending = actions.createPartnership.isPending || actions.updatePartnership.isPending || actions.createCommitment.isPending

  const chooseCreationMode = (nextMode: CreationMode) => {
    setCreationMode(nextMode)
    setExistingPartnershipId('')
    setEntityId('')
    setError(undefined)
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(undefined)
    if (mode === 'create' && creationMode === 'existing' && !selectedExistingFund) {
      return setError('Select the existing fund that is gaining a new owner.')
    }
    if ((mode === 'edit' || creationMode === 'new') && !name.trim()) {
      return setError('Enter the fund name as it appears on the agreement.')
    }
    if (!entityId) return setError('Every partnership belongs to exactly one owning legal entity.')
    if ((mode === 'edit' || creationMode === 'new') && !inceptionDate) return setError('Select the inception date.')

    try {
      if (mode === 'edit' && partnership) {
        await actions.updatePartnership.mutateAsync({
          id: partnership.id,
          body: {
            entityId,
            name: name.trim(),
            partnershipType: type,
            status,
            fundManager: fundManager.trim() || null,
            ein: ein.trim() || null,
            inceptionDate,
            addressLine1: addressLine1.trim() || null,
            addressLine2: addressLine2.trim() || null,
            addressCity: addressCity.trim() || null,
            addressRegion: addressRegion.trim() || null,
            addressPostalCode: addressPostalCode.trim() || null,
            addressCountry: addressCountry.trim() || null,
            expectedUpdatedAt: partnership.updatedAt,
          },
        })
        onClose()
        return
      }

      const parsedCommitment = normalizeCurrencyInput(commitment, false)
      if (parsedCommitment.error || parsedCommitment.value == null || Number(parsedCommitment.value) <= 0) {
        return setError(parsedCommitment.error ?? 'Enter the committed amount.')
      }
      if (!commitmentEffectiveDate) return setError('Select the date the new owner\'s commitment became effective.')

      const inheritedFund = selectedExistingFund?.partnership
      const created = await actions.createPartnership.mutateAsync({
        entityId,
        name: inheritedFund?.name ?? name.trim(),
        partnershipType: inheritedFund?.partnershipType ?? type,
        ...(creationMode === 'existing' && inheritedFund
          ? { existingPartnershipId: inheritedFund.id }
          : {
              inceptionDate,
              fundManager: fundManager.trim() || null,
              ein: ein.trim() || null,
              addressLine1: addressLine1.trim() || null,
              addressLine2: addressLine2.trim() || null,
              addressCity: addressCity.trim() || null,
              addressRegion: addressRegion.trim() || null,
              addressPostalCode: addressPostalCode.trim() || null,
              addressCountry: addressCountry.trim() || null,
            }),
      })
      await actions.createCommitment.mutateAsync({
        id: created.partnership.partnership.id,
        body: {
          amount: parsedCommitment.value,
          effectiveDate: commitmentEffectiveDate,
          note: commitmentSource.trim() || null,
        },
      })
      onCreated?.(created.partnership.partnership.id)
    } catch (caught) {
      setError(
        caught instanceof PartnershipTrackerApiError && caught.isDuplicate
          ? 'That owner already has a record for this partnership.'
          : caught instanceof PartnershipTrackerApiError && caught.isStale
            ? 'This partnership changed while you were editing. Review the refreshed record and try again.'
            : 'The partnership could not be saved. Please try again.',
      )
    }
  }

  return (
    <MagicModal
      open={open}
      onClose={onClose}
      title={mode === 'edit' ? 'Edit partnership' : 'Add a partnership'}
      description={
        mode === 'edit'
          ? 'Record-level details only. Commitment, cash activity, valuations, and K-1 years are maintained in the workspace.'
          : 'Create a new fund or add another owning entity to a fund that is already on file.'
      }
      footer={
        <>
          <MagicButton type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </MagicButton>
          <MagicButton type="submit" form="magic-partnership-record-form" disabled={pending || entities.isLoading}>
            {pending
              ? 'Saving…'
              : mode === 'edit'
                ? 'Save changes'
                : creationMode === 'existing'
                  ? 'Add owner record'
                  : 'Create partnership'}
          </MagicButton>
        </>
      }
    >
      <form id="magic-partnership-record-form" onSubmit={submit} className="flex flex-col gap-5">
        {mode === 'create' ? (
          <fieldset>
            <legend className="text-sm font-bold text-slate-900">What are you adding?</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label
                className={`cursor-pointer rounded-md border p-3 transition-colors ${
                  creationMode === 'new'
                    ? 'border-amber-500 bg-amber-50 ring-1 ring-amber-500'
                    : 'border-slate-300 hover:border-slate-400'
                }`}
              >
                <span className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="creation-mode"
                    value="new"
                    checked={creationMode === 'new'}
                    onChange={() => chooseCreationMode('new')}
                    className="mt-1 h-4 w-4 border-slate-300 text-amber-600 focus:ring-amber-500"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-slate-950">New fund</span>
                    <span className="mt-1 block text-xs leading-4 text-slate-500">Create the fund and its first owner record.</span>
                  </span>
                </span>
              </label>
              <label
                className={`cursor-pointer rounded-md border p-3 transition-colors ${
                  creationMode === 'existing'
                    ? 'border-amber-500 bg-amber-50 ring-1 ring-amber-500'
                    : 'border-slate-300 hover:border-slate-400'
                }`}
              >
                <span className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="creation-mode"
                    value="existing"
                    checked={creationMode === 'existing'}
                    onChange={() => chooseCreationMode('existing')}
                    className="mt-1 h-4 w-4 border-slate-300 text-amber-600 focus:ring-amber-500"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-slate-950">Existing fund, new owner</span>
                    <span className="mt-1 block text-xs leading-4 text-slate-500">Reuse a fund and add only the new owner position.</span>
                  </span>
                </span>
              </label>
            </div>
          </fieldset>
        ) : null}

        <MagicFieldGroup
          title="Identity"
          description="The fund and the entity that holds this position — two records for the same fund are only distinguishable by their owner."
        >
          {mode === 'create' && creationMode === 'existing' ? (
            <label className={`${mpLabelClass} sm:col-span-2`}>
              Existing fund <span className="text-red-700">*</span>
              <select
                autoFocus
                required
                value={existingPartnershipId}
                onChange={(event) => {
                  setExistingPartnershipId(event.target.value)
                  setEntityId('')
                  setError(undefined)
                }}
                disabled={partnerships.isLoading || !existingFundOptions.length}
                className={mpInputClass}
              >
                <option value="">{partnerships.isLoading ? 'Loading funds…' : 'Select an existing fund'}</option>
                {existingFundOptions.map((record) => (
                  <option key={groupKey(record)} value={record.partnership.id}>
                    {record.partnership.name} — {record.partnership.partnershipType}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className={`${mpLabelClass} sm:col-span-2`}>
              Fund name <span className="text-red-700">*</span>
              <input
                autoFocus
                required
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Summit Growth Fund IV, L.P."
                className={mpInputClass}
              />
            </label>
          )}
          <label className={`${mpLabelClass} sm:col-span-2`}>
            Owning legal entity <span className="text-red-700">*</span>
            <select
              required
              value={entityId}
              onChange={(event) => setEntityId(event.target.value)}
              disabled={
                entities.isLoading ||
                !ownerOptions.length ||
                (mode === 'create' && creationMode === 'existing' && !selectedExistingFund)
              }
              className={mpInputClass}
            >
              <option value="">
                {entities.isLoading
                  ? 'Loading entities…'
                  : mode === 'create' && creationMode === 'existing' && !selectedExistingFund
                    ? 'Select a fund first'
                    : 'Select an entity'}
              </option>
              {ownerOptions.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {entity.name}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs font-normal text-slate-500">
              Pick from the entities and owners already on file.
            </span>
          </label>
          {mode === 'edit' || creationMode === 'new' ? (
            <>
              <label className={mpLabelClass}>
                Asset class
                <select value={type} onChange={(event) => setType(event.target.value as PartnershipType)} className={mpInputClass}>
                  {PARTNERSHIP_TYPES.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className={mpLabelClass}>
                Lifecycle status
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value as typeof status)}
                  disabled={mode === 'create'}
                  className={mpInputClass}
                >
                  <option value="ACTIVE">Active</option>
                  <option value="PENDING">Pending</option>
                  <option value="LIQUIDATED">Liquidated</option>
                  <option value="CLOSED">Closed</option>
                </select>
              </label>
            </>
          ) : null}
          {mode === 'create' && creationMode === 'existing' && selectedExistingFund ? (
            <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950 sm:col-span-2">
              <p className="font-semibold">Shared fund details will be inherited</p>
              <p className="mt-1 text-xs leading-5 text-blue-800">
                The new position will roll up under {selectedExistingFund.partnership.name} in the Investment Tracker and appear for its new owner there.
              </p>
            </div>
          ) : null}
        </MagicFieldGroup>

        {mode === 'create' && creationMode === 'existing' && selectedExistingFund && !ownerOptions.length ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            Every available owner already has a position in this fund.
          </p>
        ) : null}

        {mode === 'edit' || creationMode === 'new' ? (
          <MagicFieldGroup title="Fund profile">
            <label className={mpLabelClass}>
              Fund manager
              <input value={fundManager} onChange={(event) => setFundManager(event.target.value)} placeholder="Summit Capital Partners" className={mpInputClass} />
            </label>
            <label className={mpLabelClass}>
              Fund EIN
              <input inputMode="numeric" autoComplete="off" value={ein} onChange={(event) => setEin(formatEinInput(event.target.value))} pattern="[0-9]{2}-[0-9]{7}" placeholder="86-1204471" className={mpInputClass} />
              <span className="mt-1 block text-xs font-normal text-slate-500">Formatted automatically as 12-3456789.</span>
            </label>
            <label className={mpLabelClass}>
              Inception date <span className="text-red-700">*</span>
              <input type="date" required max={today()} value={inceptionDate} onChange={(event) => setInceptionDate(event.target.value)} className={mpInputClass} />
              <span className="mt-1 block text-xs font-normal text-slate-500">Sets the vintage year.</span>
            </label>
          </MagicFieldGroup>
        ) : null}

        {mode === 'edit' || creationMode === 'new' ? (
          <MagicFieldGroup title="Fund address" description="Mailing address used on notices and subscription documents.">
            <label className={`${mpLabelClass} sm:col-span-2`}>
              Street address
              <input value={addressLine1} onChange={(event) => setAddressLine1(event.target.value)} placeholder="400 Congress Avenue" className={mpInputClass} />
            </label>
            <label className={`${mpLabelClass} sm:col-span-2`}>
              Suite, floor, or unit
              <input value={addressLine2} onChange={(event) => setAddressLine2(event.target.value)} placeholder="Suite 2200" className={mpInputClass} />
            </label>
            <label className={mpLabelClass}>
              City
              <input value={addressCity} onChange={(event) => setAddressCity(event.target.value)} placeholder="Austin" className={mpInputClass} />
            </label>
            <label className={mpLabelClass}>
              State / province
              <input value={addressRegion} onChange={(event) => setAddressRegion(event.target.value)} placeholder="TX" className={mpInputClass} />
            </label>
            <label className={mpLabelClass}>
              ZIP / postal code
              <input value={addressPostalCode} onChange={(event) => setAddressPostalCode(event.target.value)} placeholder="78701" className={mpInputClass} />
            </label>
            <label className={mpLabelClass}>
              Country
              <input value={addressCountry} onChange={(event) => setAddressCountry(event.target.value)} className={mpInputClass} />
            </label>
          </MagicFieldGroup>
        ) : null}

        {mode === 'create' ? (
          <MagicFieldGroup
            title="Initial commitment"
            description="Commitment is effective-dated — later changes are recorded as new entries, never overwritten."
          >
            <label className={mpLabelClass}>
              Committed capital (USD) <span className="text-red-700">*</span>
              <span className="relative block">
                <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-sm text-slate-500">$</span>
                <input required inputMode="decimal" value={commitment} onChange={(event) => setCommitment(event.target.value)} className={`${mpInputClass} pl-7`} />
              </span>
            </label>
            <label className={mpLabelClass}>
              Effective date <span className="text-red-700">*</span>
              <input
                type="date"
                required
                max={today()}
                value={commitmentEffectiveDate}
                onChange={(event) => setCommitmentEffectiveDate(event.target.value)}
                className={mpInputClass}
              />
            </label>
            <label className={mpLabelClass}>
              Commitment source
              <input value={commitmentSource} onChange={(event) => setCommitmentSource(event.target.value)} className={mpInputClass} />
              <span className="mt-1 block text-xs font-normal text-slate-500">Provenance for the audit trail.</span>
            </label>
          </MagicFieldGroup>
        ) : (
          <div className="flex gap-3 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Commitment is edited separately</p>
              <p className="mt-0.5 text-blue-800">Record a change from the workspace so prior amounts remain in the audit trail.</p>
            </div>
          </div>
        )}

        {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      </form>
    </MagicModal>
  )
}
