import { AlertTriangle, Loader2, Plus } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { K1TrackerFieldChange, PartnershipTrackerDetail } from '../../../../../../packages/types/src/partnership-tracker'
import type { K1TrackerOfficialFormData } from '../../../../../../packages/types/src/k1-tracker'
import { K1YearEntryForm } from '../../k1-tracker/components/K1YearEntryForm'
import { K1YearResults } from '../../k1-tracker/components/K1YearResults'
import { ConfirmationDialog } from '../../../components/shared/ConfirmationDialog'
import { PartnershipTrackerApiError } from '../api/partnershipTrackerClient'
import { usePartnershipTrackerActions, usePartnershipTrackerYear } from '../hooks/usePartnershipTracker'
import { AddYearDialog } from './AddYearDialog'
import { CompareYearsDrawer } from './CompareYearsDrawer'
import { YearRail } from './YearRail'

const errorText = (error: unknown) => error instanceof PartnershipTrackerApiError && error.isStale
  ? 'This K-1 year changed in another session. The latest revision has been reloaded.'
  : error instanceof PartnershipTrackerApiError && error.code === 'STALE_TRACKER_REVISION'
    ? 'This K-1 year changed in another session. The latest revision has been reloaded.'
    : error instanceof Error ? error.message : 'The K-1 year could not be updated.'

export function K1BasisWorkspace({ detail, selectedYear, canEdit, onSelectYear, onDirtyChange }: {
  detail: PartnershipTrackerDetail
  selectedYear?: number
  canEdit: boolean
  onSelectYear: (year: number) => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const partnershipId = detail.summary.partnership.id
  const partnership = detail.summary.partnership
  const locality = [partnership.addressCity, partnership.addressRegion, partnership.addressPostalCode].filter(Boolean).join(' ')
  const partnershipAddress = [
    partnership.addressLine1,
    partnership.addressLine2,
    locality || null,
    partnership.addressCountry,
  ].filter(Boolean).join(', ') || null
  const identity = {
    partnershipName: partnership.name,
    partnershipEin: partnership.ein,
    partnershipAddress,
    partnerName: partnership.entity.name,
  }
  const effectiveYear = selectedYear ?? detail.years.at(-1)?.taxYear
  const year = usePartnershipTrackerYear(partnershipId, effectiveYear)
  const actions = usePartnershipTrackerActions()
  const [adding, setAdding] = useState(false)
  const [comparing, setComparing] = useState(false)
  const [message, setMessage] = useState<string>()
  const [dirty, setDirty] = useState(false)
  const [discardYearTarget, setDiscardYearTarget] = useState<number>()
  const [confirmDeleteYear, setConfirmDeleteYear] = useState(false)
  const selected = year.data

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [dirty])

  const updateDirty = useCallback((next: boolean) => {
    setDirty(next)
    onDirtyChange(next)
  }, [onDirtyChange])
  const selectYear = (nextYear: number) => {
    if (nextYear === effectiveYear) return
    if (dirty) {
      setDiscardYearTarget(nextYear)
      return
    }
    onSelectYear(nextYear)
  }
  const discardAndSelectYear = () => {
    if (discardYearTarget == null) return
    const nextYear = discardYearTarget
    setDiscardYearTarget(undefined)
    updateDirty(false)
    onSelectYear(nextYear)
  }
  const addYear = async (taxYear: number) => {
    try { const created = await actions.createYear.mutateAsync({ id: partnershipId, year: taxYear }); setAdding(false); onSelectYear(created.taxYear); setMessage(`${taxYear} is ready for manual K-1 entry.`) }
    catch (error) { throw new Error(errorText(error)) }
  }
  const calculate = (changes: K1TrackerFieldChange[]) => !selected || effectiveYear == null
    ? Promise.resolve(undefined)
    : actions.calculate.mutateAsync({ id: partnershipId, year: effectiveYear, expectedRevision: selected.revision, changes })
  const save = async (changes: K1TrackerFieldChange[], officialFormData?: K1TrackerOfficialFormData) => {
    if (!selected || effectiveYear == null) return
    try {
      await actions.updateYear.mutateAsync({ id: partnershipId, year: effectiveYear, expectedRevision: selected.revision, changes, officialFormData })
      updateDirty(false)
      setMessage('Manual K-1 revisions saved and dependent years recalculated.')
    } catch (error) { setMessage(errorText(error)); throw new Error(errorText(error)) }
  }
  const deleteYear = async () => {
    if (!selected || effectiveYear == null) return
    try {
      await actions.deleteYear.mutateAsync({ id: partnershipId, year: effectiveYear, expectedRevision: selected.revision })
      const remaining = detail.years.filter((item) => item.taxYear !== effectiveYear)
      const next = remaining.at(-1)?.taxYear
      if (next) onSelectYear(next)
      setMessage(`${effectiveYear} was deleted.`)
    } catch (error) { setMessage(errorText(error)) }
    finally { setConfirmDeleteYear(false) }
  }
  const signoff = async () => {
    if (!selected || effectiveYear == null) return
    try { await actions.signoff.mutateAsync({ id: partnershipId, year: effectiveYear, expectedRevision: selected.revision, action: 'REVIEW' }); setMessage('Year signed off and reconciled.') } catch (error) { setMessage(errorText(error)) }
  }

  return <div className="space-y-5">
    <section className="border border-gray-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-gray-950">K-1 entry and outside basis</h3><p className="mt-1 text-sm text-gray-500">Enter the values reported on each K-1 document. Net cash activity is maintained separately.</p></div><div role="group" aria-label="K-1 year actions" className="flex flex-wrap gap-2"><button type="button" disabled={!detail.years.length} onClick={() => setComparing(true)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium disabled:opacity-40">Compare years</button>{canEdit && selected && <button type="button" onClick={() => setConfirmDeleteYear(true)} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700">Delete year</button>}{canEdit && <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-2 rounded-lg bg-jackson-gold px-3 py-2 text-sm font-semibold text-white"><Plus className="h-4 w-4" />Add any year</button>}</div></div><YearRail years={detail.years} selectedYear={effectiveYear} onSelect={selectYear} onPrefetch={() => undefined} /></section>
    {message && <p role="status" className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{message}</p>}
    {!detail.years.length ? <section className="border border-dashed border-gray-300 bg-white p-12 text-center"><h3 className="font-semibold text-gray-900">No K-1 years yet</h3><p className="mt-2 text-sm text-gray-500">Start with any tax year. Years are not forced to be consecutive.</p>{canEdit && <button type="button" onClick={() => setAdding(true)} className="mt-4 rounded-lg bg-jackson-gold px-4 py-2 text-sm font-semibold text-white">Add first K-1 year</button>}</section> : year.isLoading ? <div className="flex min-h-64 items-center justify-center border border-gray-200 bg-white"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div> : year.isError ? <p role="alert" className="bg-red-50 p-5 text-sm text-red-700">{errorText(year.error)}</p> : selected ? <div className="space-y-5"><K1YearEntryForm key={`${selected.taxYear}-${selected.revision}`} detail={selected} identity={identity} canEdit={canEdit} pending={actions.calculate.isPending || actions.updateYear.isPending} onCalculate={calculate} onSave={save} onDirtyChange={updateDirty} /><K1YearResults detail={selected} canEdit={canEdit} pending={actions.signoff.isPending} onSignoff={() => void signoff()} /></div> : null}
    {adding && <AddYearDialog defaultTaxYear={detail.years.at(-1)?.taxYear ? detail.years.at(-1)!.taxYear + 1 : new Date().getFullYear() - 1} pending={actions.createYear.isPending} onClose={() => setAdding(false)} onAdd={addYear} />}
    {comparing && <CompareYearsDrawer years={detail.years} selectedYear={effectiveYear} onClose={() => setComparing(false)} />}
    <ConfirmationDialog
      open={discardYearTarget != null}
      tone="warning"
      title="Discard unsaved K-1 changes?"
      description={<p>Your edits to the {effectiveYear ?? 'current'} K-1 have not been saved. Moving to {discardYearTarget ?? 'another year'} will discard this draft.</p>}
      confirmLabel="Discard changes"
      cancelLabel="Keep editing"
      onClose={() => setDiscardYearTarget(undefined)}
      onConfirm={discardAndSelectYear}
    />
    <ConfirmationDialog open={confirmDeleteYear} title={`Delete the ${effectiveYear ?? ''} K-1 year?`} description={<p>All entered K-1 values for this year will be permanently removed. Later years will be recalculated from the remaining history.</p>} confirmLabel="Delete year" pending={actions.deleteYear.isPending} pendingLabel="Deleting year…" onClose={() => setConfirmDeleteYear(false)} onConfirm={deleteYear} />
  </div>
}
