import { AlertTriangle, FileText, Loader2, Plus, UploadCloud } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { CreatePartnershipCashFlowRequest, K1TrackerFieldChange, PartnershipTrackerDetail } from '../../../../../../packages/types/src/partnership-tracker'
import type { K1TrackerCashFlowEvent, K1TrackerOfficialFormData } from '../../../../../../packages/types/src/k1-tracker'
import { K1YearEntryForm } from '../../k1-tracker/components/K1YearEntryForm'
import { K1YearResults } from '../../k1-tracker/components/K1YearResults'
import { K1PartnershipIntakeRail } from '../../k1/components/K1PartnershipIntakeRail'
import { K1UploadDialog } from '../../k1/components/K1UploadDialog'
import { ConfirmationDialog } from '../../../components/shared/ConfirmationDialog'
import { PartnershipTrackerApiError } from '../api/partnershipTrackerClient'
import { usePartnershipTrackerActions, usePartnershipTrackerYear } from '../hooks/usePartnershipTracker'
import { AddYearDialog } from './AddYearDialog'
import { CompareYearsDrawer } from './CompareYearsDrawer'
import { DatedCashFlowPanel } from './DatedCashFlowPanel'
import { YearRail } from './YearRail'

const errorText = (error: unknown) => error instanceof PartnershipTrackerApiError && error.isStale
  ? 'This K-1 year changed in another session. The latest revision has been reloaded.'
  : error instanceof PartnershipTrackerApiError && error.code === 'STALE_TRACKER_REVISION'
    ? 'This K-1 year changed in another session. The latest revision has been reloaded.'
    : error instanceof PartnershipTrackerApiError && error.code === 'SIGNOFF_GATE_FAILED'
      ? 'Reconciliation is blocked by required checks. Complete each Required item in the reconciliation checklist, save the values, and try again.'
    : error instanceof Error ? error.message : 'The K-1 year could not be updated.'

export function K1BasisWorkspace({ detail, selectedYear, canEdit, onSelectYear, onDirtyChange, appearance = 'default' }: {
  detail: PartnershipTrackerDetail
  selectedYear?: number
  canEdit: boolean
  onSelectYear: (year: number) => void
  onDirtyChange: (dirty: boolean) => void
  appearance?: 'default' | 'magic-pattern'
}) {
  const magicPattern = appearance === 'magic-pattern'
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
  const [uploading, setUploading] = useState(false)
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
      setMessage(`${effectiveYear} was deleted. The retained K-1 PDF can now be reviewed and saved again, or replaced with a new upload.`)
    } catch (error) { setMessage(errorText(error)) }
    finally { setConfirmDeleteYear(false) }
  }
  const createCashFlows = async (entries: CreatePartnershipCashFlowRequest[]) => {
    if (effectiveYear == null) return
    await actions.createCashFlows.mutateAsync({ id: partnershipId, year: effectiveYear, body: { entries } })
  }
  const deleteCashFlow = async (event: K1TrackerCashFlowEvent) => {
    if (effectiveYear == null) return
    await actions.deleteCashFlow.mutateAsync({ id: partnershipId, year: effectiveYear, cashFlowId: event.id, expectedUpdatedAt: event.updatedAt })
  }
  const signoff = async () => {
    if (!selected || effectiveYear == null) return
    const warningKeys = selected.calculation.checks.filter((check) => check.status === 'WARNING').map((check) => check.key)
    try {
      await actions.signoff.mutateAsync({
        id: partnershipId,
        year: effectiveYear,
        expectedRevision: selected.revision,
        action: 'REVIEW',
        reason: warningKeys.length ? `Reviewed calculated warnings: ${warningKeys.join(', ')}` : undefined,
      })
      setMessage('Year signed off and reconciled.')
    } catch (error) {
      const message = errorText(error)
      setMessage(message)
      throw new Error(message)
    }
  }

  return <div className={magicPattern ? 'space-y-6' : 'space-y-4'}>
    {magicPattern ? <section aria-labelledby="k1-entry-heading" className="overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 bg-[linear-gradient(110deg,#f8fafc_0%,#ffffff_62%,#ecfdf5_100%)] px-4 py-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#166534]">Partnership tax workpaper</p>
          <h2 id="k1-entry-heading" className="mt-1 text-base font-semibold text-slate-950">K-1 entry and outside basis</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">Upload one or more K-1 PDFs, review the extracted fields, then apply them to this partnership. Manual entry remains available for every tax year.</p>
        </div>
        <div role="group" aria-label="K-1 year actions" className="flex flex-wrap gap-2">
          {canEdit && <button type="button" onClick={() => setUploading(true)} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[#14532d] bg-[#14532d] px-3 text-xs font-semibold text-white shadow-sm hover:bg-[#0f3d22] focus:outline-none focus:ring-2 focus:ring-[#166534] focus:ring-offset-2"><UploadCloud className="h-3.5 w-3.5" />Upload K-1 PDFs</button>}
          <button type="button" disabled={!detail.years.length} onClick={() => setComparing(true)} className="min-h-9 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-100 disabled:opacity-40">Compare years</button>
          {canEdit && selected && <button type="button" onClick={() => setConfirmDeleteYear(true)} className="min-h-9 rounded-md border border-red-200 bg-white px-3 text-xs font-semibold text-red-700 hover:bg-red-50">Delete {effectiveYear}</button>}
          {canEdit && <button type="button" onClick={() => setAdding(true)} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-100"><Plus className="h-3.5 w-3.5" />Add tax year</button>}
        </div>
      </div>
      <YearRail years={detail.years} selectedYear={effectiveYear} onSelect={selectYear} onPrefetch={() => undefined} appearance="magic-pattern" />
    </section> : <section className="overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <FileText aria-hidden="true" className="h-4 w-4 text-[#166534]" />
            <h3 className="text-sm font-semibold text-slate-950">K-1 tax data and outside basis</h3>
            <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 font-mono text-[0.65rem] font-medium tabular-nums text-slate-600">{detail.years.length} years</span>
          </div>
          <p className="mt-0.5 max-w-2xl text-xs text-slate-600">Select a tax year to review its Schedule K-1 workpaper, dated cash activity, and calculated basis.</p>
        </div>
        <div role="group" aria-label="K-1 year actions" className="flex flex-wrap gap-2">
          <button type="button" disabled={!detail.years.length} onClick={() => setComparing(true)} className="min-h-9 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-100 disabled:opacity-40">Compare years</button>
          {canEdit && selected && <button type="button" onClick={() => setConfirmDeleteYear(true)} className="min-h-9 rounded-md border border-red-200 bg-white px-3 text-xs font-semibold text-red-700 hover:bg-red-50">Delete year</button>}
          {canEdit && <button type="button" onClick={() => setAdding(true)} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[#14532d] bg-[#14532d] px-3 text-xs font-semibold text-white shadow-sm hover:bg-[#0f3d22]"><Plus className="h-3.5 w-3.5" />Add year</button>}
        </div>
      </div>
      <YearRail years={detail.years} selectedYear={effectiveYear} onSelect={selectYear} onPrefetch={() => undefined} appearance="workspace" />
    </section>}
    {message && <p role="status" className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{message}</p>}
    {!detail.years.length ? <div className="grid min-w-0 items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_19.5rem]"><section className="overflow-hidden rounded-lg border border-dashed border-slate-300 bg-white shadow-sm">
      <div className="mx-auto max-w-xl px-6 py-12 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-800"><UploadCloud className="h-6 w-6" /></div>
        <h3 className="mt-4 font-semibold text-slate-950">Bring in the first K-1</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">Upload PDFs for AWS extraction or create a blank tax year for manual entry. Extracted values are always reviewed before they are applied.</p>
        {canEdit && <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => setUploading(true)} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[#14532d] px-4 text-sm font-semibold text-white hover:bg-[#0f3d22]"><UploadCloud className="h-4 w-4" />Upload K-1 PDFs</button>
          <button type="button" onClick={() => setAdding(true)} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100"><Plus className="h-4 w-4" />Add tax year manually</button>
        </div>}
      </div>
    </section><K1PartnershipIntakeRail entityId={partnership.entity.id} entityName={partnership.entity.name} partnershipId={partnershipId} partnershipName={partnership.name} canUpload={canEdit} onUpload={() => setUploading(true)} /></div> : year.isLoading ? <div className="flex min-h-64 items-center justify-center rounded-lg border border-slate-300 bg-white shadow-sm"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div> : year.isError ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-700">{errorText(year.error)}</p> : selected ? magicPattern ? <div className="grid min-w-0 items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_19.5rem]">
      <section aria-label={`${selected.taxYear} K-1 workpaper`} className="min-w-0">
        <K1YearEntryForm appearance="magic-pattern" datedActivityLocation="capital-activity-tab" key={`${selected.taxYear}-${selected.revision}`} detail={selected} identity={identity} canEdit={canEdit} pending={actions.calculate.isPending || actions.updateYear.isPending || actions.signoff.isPending} onCalculate={calculate} onSave={save} onReconcile={signoff} onDirtyChange={updateDirty} />
      </section>
      <K1PartnershipIntakeRail detail={selected} entityId={partnership.entity.id} entityName={partnership.entity.name} partnershipId={partnershipId} partnershipName={partnership.name} canUpload={canEdit} onUpload={() => setUploading(true)} />
    </div> : <div className="space-y-4"><DatedCashFlowPanel appearance="workspace" taxYear={selected.taxYear} events={selected.cashFlowEvents ?? []} canEdit={canEdit} pending={(actions.createCashFlows?.isPending ?? false) || (actions.deleteCashFlow?.isPending ?? false)} onCreate={createCashFlows} onDelete={deleteCashFlow} /><K1YearEntryForm appearance="workspace" key={`${selected.taxYear}-${selected.revision}`} detail={selected} identity={identity} canEdit={canEdit} pending={actions.calculate.isPending || actions.updateYear.isPending} onCalculate={calculate} onSave={save} onDirtyChange={updateDirty} /><K1YearResults detail={selected} canEdit={canEdit} pending={actions.signoff.isPending} onSignoff={() => void signoff()} /></div> : null}
    {adding && <AddYearDialog defaultTaxYear={detail.years.at(-1)?.taxYear ? detail.years.at(-1)!.taxYear + 1 : new Date().getFullYear() - 1} pending={actions.createYear.isPending} onClose={() => setAdding(false)} onAdd={addYear} />}
    {uploading && <K1UploadDialog open entityScope={{ id: partnership.entity.id, name: partnership.entity.name }} onClose={() => setUploading(false)} onUploaded={() => setMessage('Upload queued for AWS extraction. Follow its progress in Recent uploads, then review and apply the extracted fields.')} />}
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
    <ConfirmationDialog open={confirmDeleteYear} title={`Delete the ${effectiveYear ?? ''} K-1 year?`} description={<p>All entered K-1 values for this year will be permanently removed. The uploaded PDF and extraction evidence will be retained so you can review and save it again, or upload a replacement. Later years will be recalculated from the remaining history.</p>} confirmLabel="Delete year" pending={actions.deleteYear.isPending} pendingLabel="Deleting year…" onClose={() => setConfirmDeleteYear(false)} onConfirm={deleteYear} />
  </div>
}
