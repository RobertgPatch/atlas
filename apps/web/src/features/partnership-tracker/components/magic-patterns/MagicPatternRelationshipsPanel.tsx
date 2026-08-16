import { MapPinned, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { PartnershipTrackerSummary } from '../../../../../../../packages/types/src/partnership-tracker'
import {
  loadPartnershipRelationships,
  loadEstateMaps,
  savePartnershipRelationships,
  subscribeToEstateMapChanges,
  type EstateMapDefinition,
  type EstateRelationshipKind,
  type EstateRelationshipRecord,
} from '../../../estate-map/estateMapStorage'
import { useEntityList } from '../../../partnerships/hooks/useEntityQueries'
import {
  MagicButton,
  MagicCard,
  MagicConfirmDialog,
  MagicModal,
  MagicStatusBadge,
  mpInputClass,
  mpLabelClass,
} from './MagicPatternPrimitives'

const today = () => new Date().toISOString().slice(0, 10)
const displayDate = (value: string) => new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))

function AddRelationshipDialog({
  open,
  entityName,
  parties,
  estateMaps,
  linkedEntityId,
  onClose,
  onSubmit,
}: {
  open: boolean
  entityName: string
  parties: Array<{ id: string; name: string; subtitle: string }>
  estateMaps: EstateMapDefinition[]
  linkedEntityId: string
  onClose: () => void
  onSubmit: (record: Omit<EstateRelationshipRecord, 'id' | 'partyName'>) => void
}) {
  const [step, setStep] = useState(1)
  const [query, setQuery] = useState('')
  const [partyId, setPartyId] = useState('')
  const [kind, setKind] = useState<EstateRelationshipKind>('ownership')
  const [ownershipPercent, setOwnershipPercent] = useState('')
  const [controlRole, setControlRole] = useState('')
  const [effectiveDate, setEffectiveDate] = useState(today())
  const [note, setNote] = useState('')
  const [estateMapIds, setEstateMapIds] = useState<string[]>([])

  const party = parties.find((candidate) => candidate.id === partyId)
  const eligibleMaps = useMemo(
    () => estateMaps.filter((map) => map.rootEntityId === partyId || map.rootEntityId === linkedEntityId),
    [estateMaps, linkedEntityId, partyId],
  )
  const visibleParties = parties.filter((candidate) => `${candidate.name} ${candidate.subtitle}`.toLowerCase().includes(query.trim().toLowerCase()))
  const detailsValid = kind === 'ownership'
    ? Number(ownershipPercent) > 0 && Number(ownershipPercent) <= 100 && Boolean(effectiveDate)
    : Boolean(controlRole.trim() && effectiveDate)
  const placementValid = eligibleMaps.length === 0 || estateMapIds.length > 0
  const canContinue = step === 1 ? Boolean(partyId) : step === 2 ? true : step === 3 ? detailsValid && placementValid : true

  const continueFlow = () => {
    if (step < 4) {
      if (step === 1) {
        setEstateMapIds(
          estateMaps
            .filter((map) => map.rootEntityId === partyId || map.rootEntityId === linkedEntityId)
            .map((map) => map.id),
        )
      }
      setStep((current) => current + 1)
      return
    }
    onSubmit({
      partyId,
      kind,
      ownershipPercent: kind === 'ownership' ? Number(ownershipPercent) : undefined,
      controlRole: kind === 'control' ? controlRole.trim() : undefined,
      effectiveDate,
      note: note.trim() || undefined,
      estateMapIds: eligibleMaps.length ? estateMapIds : undefined,
    })
  }

  return (
    <MagicModal
      open={open}
      onClose={onClose}
      size="md"
      title="Add relationship"
      description={`Link a counterparty to ${entityName}`}
      footer={
        <>
          {step > 1 ? <MagicButton type="button" variant="ghost" onClick={() => setStep((current) => current - 1)}>Back</MagicButton> : null}
          <MagicButton type="button" variant="secondary" onClick={onClose}>Cancel</MagicButton>
          <MagicButton type="button" disabled={!canContinue} onClick={continueFlow}>{step === 4 ? 'Add relationship' : 'Continue'}</MagicButton>
        </>
      }
    >
      <ol className="mb-5 grid grid-cols-4 gap-2" aria-label="Relationship steps">
        {['Party', 'Type', 'Details', 'Review'].map((label, index) => {
          const value = index + 1
          return <li key={label} className="text-center"><span className={`mx-auto grid h-7 w-7 place-items-center rounded-full border text-xs font-semibold ${value <= step ? 'border-[#166534] bg-[#166534] text-white' : 'border-slate-300 bg-white text-slate-500'}`}>{value}</span><span className="mt-1 block text-[0.65rem] text-slate-500">{label}</span></li>
        })}
      </ol>

      {step === 1 ? (
        <section aria-label="Select counterparty">
          <label className={mpLabelClass}>Search counterparties<input type="search" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} className={mpInputClass} /></label>
          <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
            {visibleParties.map((candidate) => (
              <button key={candidate.id} type="button" onClick={() => setPartyId(candidate.id)} className={`w-full rounded-md border px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${partyId === candidate.id ? 'border-[#166534] bg-emerald-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                <span className="block text-sm font-medium text-slate-950">{candidate.name}</span>
                <span className="mt-0.5 block text-xs text-slate-500">{candidate.subtitle}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section aria-label="Relationship type" className="grid gap-3 sm:grid-cols-2">
          {([
            ['ownership', 'Ownership', 'Counterparty holds equity or a beneficial interest.'],
            ['control', 'Control', 'Counterparty directs management without equity.'],
          ] as const).map(([value, label, description]) => (
            <button key={value} type="button" aria-pressed={kind === value} onClick={() => setKind(value)} className={`rounded-md border p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${kind === value ? 'border-[#166534] bg-emerald-50' : 'border-slate-300 bg-white hover:bg-slate-50'}`}>
              <span className="block text-sm font-semibold text-slate-950">{label}</span>
              <span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span>
            </button>
          ))}
        </section>
      ) : null}

      {step === 3 ? (
        <section aria-label="Relationship details" className="space-y-4">
          {kind === 'ownership' ? <label className={mpLabelClass}>Ownership percentage <span className="text-red-700">*</span><span className="relative block"><input type="number" min="0.01" max="100" step="0.01" required value={ownershipPercent} onChange={(event) => setOwnershipPercent(event.target.value)} className={`${mpInputClass} pr-9`} /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">%</span></span></label> : <label className={mpLabelClass}>Control role <span className="text-red-700">*</span><input required value={controlRole} onChange={(event) => setControlRole(event.target.value)} placeholder="Manager, trustee, general partner…" className={mpInputClass} /></label>}
          <label className={mpLabelClass}>Effective date <span className="text-red-700">*</span><input type="date" required value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} className={mpInputClass} /></label>
          <label className={mpLabelClass}>Notes <span className="font-normal text-slate-500">Optional</span><textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Supporting context, document references…" className={`${mpInputClass} py-2`} /></label>
          {eligibleMaps.length ? (
            <fieldset>
              <legend className={mpLabelClass}>Estate map placement <span className="text-red-700">*</span></legend>
              <p className="mt-1 text-xs leading-5 text-slate-500">Choose which maps for this owner or holding entity should include this branch.</p>
              <div className="mt-2 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
                {eligibleMaps.map((map) => (
                  <label key={map.id} className="flex items-center gap-2 text-sm text-slate-800">
                    <input type="checkbox" checked={estateMapIds.includes(map.id)} onChange={(event) => setEstateMapIds((current) => event.target.checked ? [...current, map.id] : current.filter((id) => id !== map.id))} className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-700" />
                    {map.name}
                  </label>
                ))}
              </div>
              {!placementValid ? <p className="mt-1 text-xs text-red-700">Select at least one estate map.</p> : null}
            </fieldset>
          ) : null}
        </section>
      ) : null}

      {step === 4 ? (
        <section aria-label="Review relationship" className="rounded-md border border-slate-300 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold text-slate-950">Review relationship</h3>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs uppercase tracking-wide text-slate-500">Counterparty</dt><dd className="mt-1 font-medium text-slate-950">{party?.name}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-slate-500">Relationship</dt><dd className="mt-1 font-medium capitalize text-slate-950">{kind}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-slate-500">Stake / role</dt><dd className="mt-1 font-medium text-slate-950">{kind === 'ownership' ? `${Number(ownershipPercent).toFixed(2)}%` : controlRole}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-slate-500">Effective</dt><dd className="mt-1 font-medium text-slate-950">{displayDate(effectiveDate)}</dd></div>
            <div className="sm:col-span-2"><dt className="text-xs uppercase tracking-wide text-slate-500">Estate maps</dt><dd className="mt-1 font-medium text-slate-950">{eligibleMaps.length ? eligibleMaps.filter((map) => estateMapIds.includes(map.id)).map((map) => map.name).join(', ') : 'All future maps rooted at this owner'}</dd></div>
          </dl>
        </section>
      ) : null}
    </MagicModal>
  )
}

function RelationshipMapPlacementDialog({
  record,
  maps,
  linkedEntityId,
  onClose,
  onSave,
}: {
  record: EstateRelationshipRecord
  maps: EstateMapDefinition[]
  linkedEntityId: string
  onClose: () => void
  onSave: (estateMapIds: string[] | undefined) => void
}) {
  const eligibleMaps = maps.filter(
    (map) => map.rootEntityId === record.partyId || map.rootEntityId === linkedEntityId,
  )
  const [selectedIds, setSelectedIds] = useState(
    record.estateMapIds ?? eligibleMaps.map((map) => map.id),
  )
  const allSelected = eligibleMaps.length > 0 && eligibleMaps.every((map) => selectedIds.includes(map.id))
  return (
    <MagicModal
      open
      onClose={onClose}
      size="md"
      title="Manage estate map placement"
      description={`Choose where the relationship with ${record.partyName} appears.`}
      footer={<><MagicButton type="button" variant="secondary" onClick={onClose}>Cancel</MagicButton><MagicButton type="button" onClick={() => onSave(allSelected ? undefined : selectedIds)}>Save placement</MagicButton></>}
    >
      {eligibleMaps.length ? (
        <fieldset>
          <legend className="text-sm font-semibold text-slate-950">Eligible estate maps</legend>
          <p className="mt-1 text-xs leading-5 text-slate-500">Clear every map to hide this branch until it is assigned again. Choosing every current map also includes it on future maps for this owner.</p>
          <div className="mt-4 space-y-2">
            {eligibleMaps.map((map) => (
              <label key={map.id} className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-medium text-slate-800">
                <input type="checkbox" checked={selectedIds.includes(map.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, map.id] : current.filter((id) => id !== map.id))} className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-700" />
                {map.name}
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">There are no estate maps for this owner or holding entity yet. This relationship will be available to matching future maps.</p>
      )}
    </MagicModal>
  )
}

export function MagicPatternRelationshipsPanel({ summary }: { summary: PartnershipTrackerSummary }) {
  const partnership = summary.partnership
  const entities = useEntityList()
  const [records, setRecords] = useState<EstateRelationshipRecord[]>(() => loadPartnershipRelationships(partnership.id))
  const [addOpen, setAddOpen] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<EstateRelationshipRecord>()
  const [placementTarget, setPlacementTarget] = useState<EstateRelationshipRecord>()
  const [estateMaps, setEstateMaps] = useState<EstateMapDefinition[]>(loadEstateMaps)

  useEffect(() => subscribeToEstateMapChanges(() => setEstateMaps(loadEstateMaps())), [])

  useEffect(() => {
    savePartnershipRelationships(partnership.id, records)
  }, [partnership.id, records])

  const parties = useMemo(() => {
    const values = (entities.data?.items ?? [])
      .filter((entity) => entity.id !== partnership.entity.id)
      .map((entity) => ({ id: entity.id, name: entity.name, subtitle: 'Entity or owner on file' }))
    if (partnership.fundManager && !values.some((party) => party.name === partnership.fundManager)) {
      values.unshift({ id: `manager:${partnership.fundManager}`, name: partnership.fundManager, subtitle: 'Fund manager / sponsor' })
    }
    return values
  }, [entities.data?.items, partnership.entity.id, partnership.fundManager])
  const ownershipTotal = records.filter((record) => record.kind === 'ownership').reduce((total, record) => total + (record.ownershipPercent ?? 0), 0)

  return (
    <>
      <MagicCard className="overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
          <div><h3 className="text-sm font-semibold text-slate-950">Ownership and control relationships</h3><p className="mt-1 text-sm text-slate-500">Who owns and who directs {partnership.entity.name}, the entity holding this position.</p></div>
          <MagicButton type="button" variant="secondary" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" />Add relationship</MagicButton>
        </div>
        {records.length === 0 ? <p className="mt-4 border-t border-slate-200 bg-slate-50 px-5 py-6 text-sm text-slate-500">No relationships recorded for {partnership.entity.name}. Add the owners and control roles so the ownership chain behind this position is documented.</p> : <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[64rem] border-collapse text-sm"><thead><tr className="border-y border-slate-300 bg-slate-100 text-left text-[0.66rem] font-semibold uppercase tracking-wide text-slate-600"><th className="px-5 py-2">Counterparty</th><th className="px-5 py-2">Relationship</th><th className="px-5 py-2 text-right">Stake / role</th><th className="px-5 py-2">Effective</th><th className="px-5 py-2">Estate maps</th><th className="px-5 py-2">Notes</th><th className="w-24 px-5 py-2"><span className="sr-only">Actions</span></th></tr></thead><tbody>{records.map((record, index) => { const eligibleMaps = estateMaps.filter((map) => map.rootEntityId === record.partyId || map.rootEntityId === partnership.entity.id); const assignedMaps = eligibleMaps.filter((map) => record.estateMapIds === undefined || record.estateMapIds.includes(map.id)); return <tr key={record.id} className={`border-b border-slate-200 ${index % 2 ? 'bg-slate-50' : 'bg-white'}`}><td className="px-5 py-2.5 font-medium text-slate-950">{record.partyName}</td><td className="px-5 py-2.5"><MagicStatusBadge tone={record.kind === 'ownership' ? 'success' : 'info'}>{record.kind === 'ownership' ? 'Ownership' : 'Control'}</MagicStatusBadge></td><td className="px-5 py-2.5 text-right font-mono text-xs tabular-nums text-slate-900">{record.kind === 'ownership' ? `${record.ownershipPercent?.toFixed(2)}%` : record.controlRole}</td><td className="px-5 py-2.5 font-mono text-xs tabular-nums text-slate-700">{displayDate(record.effectiveDate)}</td><td className="max-w-48 truncate px-5 py-2.5 text-xs text-slate-600" title={assignedMaps.map((map) => map.name).join(', ')}>{assignedMaps.length ? assignedMaps.map((map) => map.name).join(', ') : eligibleMaps.length ? 'Hidden from maps' : 'All matching future maps'}</td><td className="max-w-xs truncate px-5 py-2.5 text-slate-600" title={record.note}>{record.note ?? 'No note recorded'}</td><td className="px-5 py-2.5"><div className="flex items-center gap-1"><button type="button" aria-label={`Manage estate maps for ${record.partyName}`} onClick={() => setPlacementTarget(record)} className="grid min-h-9 min-w-9 place-items-center rounded text-slate-500 hover:bg-blue-50 hover:text-blue-700"><MapPinned className="h-4 w-4" /></button><button type="button" aria-label={`Remove relationship with ${record.partyName}`} onClick={() => setRemoveTarget(record)} className="grid min-h-9 min-w-9 place-items-center rounded text-slate-500 hover:bg-red-50 hover:text-red-700"><Trash2 className="h-4 w-4" /></button></div></td></tr>})}</tbody></table></div>}
        {records.some((record) => record.kind === 'ownership') && Math.abs(ownershipTotal - 100) > 0.01 ? <div className="border-t border-slate-200 px-5 py-4"><p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"><strong>Recorded ownership does not total 100%.</strong> Ownership relationships currently account for {ownershipTotal.toFixed(2)}% of {partnership.entity.name}.</p></div> : null}
      </MagicCard>
      {addOpen ? <AddRelationshipDialog open onClose={() => setAddOpen(false)} entityName={partnership.entity.name} linkedEntityId={partnership.entity.id} parties={parties} estateMaps={estateMaps} onSubmit={(draft) => { const party = parties.find((candidate) => candidate.id === draft.partyId); setRecords((current) => [...current, { ...draft, id: crypto.randomUUID(), partyName: party?.name ?? 'Unknown counterparty' }]); setAddOpen(false) }} /> : null}
      {placementTarget ? <RelationshipMapPlacementDialog key={placementTarget.id} record={placementTarget} maps={estateMaps} linkedEntityId={partnership.entity.id} onClose={() => setPlacementTarget(undefined)} onSave={(estateMapIds) => { setRecords((current) => current.map((record) => record.id === placementTarget.id ? { ...record, estateMapIds } : record)); setPlacementTarget(undefined) }} /> : null}
      <MagicConfirmDialog open={Boolean(removeTarget)} title={removeTarget ? `Remove the ${removeTarget.kind} relationship with ${removeTarget.partyName}?` : 'Remove relationship?'} description={<>This removes the link between {partnership.entity.name} and {removeTarget?.partyName}. The partnership's financial history is unaffected.</>} confirmLabel="Remove relationship" onClose={() => setRemoveTarget(undefined)} onConfirm={() => { if (removeTarget) setRecords((current) => current.filter((record) => record.id !== removeTarget.id)); setRemoveTarget(undefined) }} />
    </>
  )
}
