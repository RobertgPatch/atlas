import { AlertTriangle, Loader2, Plus } from 'lucide-react'
import { useState } from 'react'
import type { K1TrackerFieldChange, PartnershipTrackerDetail } from '../../../../../../packages/types/src/partnership-tracker'
import { PartnershipTrackerApiError } from '../api/partnershipTrackerClient'
import { usePartnershipTrackerActions, usePartnershipTrackerYear } from '../hooks/usePartnershipTracker'
import { AddYearDialog } from './AddYearDialog'
import { CompareYearsDrawer } from './CompareYearsDrawer'
import { EditYearDrawer } from './EditYearDrawer'
import { JournalEntryPanel } from './JournalEntryPanel'
import { SelectedYearTabs } from './SelectedYearTabs'
import { SignOffPanel } from './SignOffPanel'
import { YearRail } from './YearRail'
import { YearStatusPanel } from './YearStatusPanel'

const errorText = (error: unknown) => error instanceof PartnershipTrackerApiError && error.isStale
  ? 'This K-1 year changed in another session. The latest revision has been reloaded.'
  : error instanceof PartnershipTrackerApiError && error.code === 'STALE_TRACKER_REVISION'
    ? 'This K-1 year changed in another session. The latest revision has been reloaded.'
    : error instanceof Error ? error.message : 'The K-1 year could not be updated.'

export function K1BasisWorkspace({ detail, selectedYear, canEdit, onSelectYear }: { detail: PartnershipTrackerDetail; selectedYear?: number; canEdit: boolean; onSelectYear: (year: number) => void }) {
  const partnershipId = detail.summary.partnership.id
  const effectiveYear = selectedYear ?? detail.years.at(-1)?.taxYear
  const year = usePartnershipTrackerYear(partnershipId, effectiveYear)
  const actions = usePartnershipTrackerActions()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(false)
  const [comparing, setComparing] = useState(false)
  const [message, setMessage] = useState<string>()
  const selected = year.data
  const checksPassing = selected?.calculation.checks.every((check) => check.status === 'PASS') ?? false

  const addYear = async (taxYear: number) => {
    try { const created = await actions.createYear.mutateAsync({ id: partnershipId, year: taxYear }); setAdding(false); onSelectYear(created.taxYear); setMessage(`${taxYear} is ready for manual K-1 entry.`) }
    catch (error) { throw new Error(errorText(error)) }
  }
  const calculate = (changes: K1TrackerFieldChange[]) => {
    if (!selected || effectiveYear == null) return Promise.resolve(undefined)
    return actions.calculate.mutateAsync({ id: partnershipId, year: effectiveYear, expectedRevision: selected.revision, changes })
  }
  const save = async (changes: K1TrackerFieldChange[]) => {
    if (!selected || effectiveYear == null) return
    try { await actions.updateYear.mutateAsync({ id: partnershipId, year: effectiveYear, expectedRevision: selected.revision, changes }); setMessage('Manual K-1 revisions saved and dependent years recalculated.') }
    catch (error) { setMessage(errorText(error)); throw new Error(errorText(error)) }
  }
  const deleteYear = async () => {
    if (!selected || effectiveYear == null || !window.confirm(`Delete the ${effectiveYear} K-1 year? Later years will be recalculated.`)) return
    try { await actions.deleteYear.mutateAsync({ id: partnershipId, year: effectiveYear, expectedRevision: selected.revision }); const remaining = detail.years.filter((item) => item.taxYear !== effectiveYear); const next = remaining.at(-1)?.taxYear; if (next) onSelectYear(next); setMessage(`${effectiveYear} was deleted.`) } catch (error) { setMessage(errorText(error)) }
  }
  const signoff = async (action: 'PREPARED' | 'REVIEWED') => {
    if (!selected || effectiveYear == null) return
    try { await actions.signoff.mutateAsync({ id: partnershipId, year: effectiveYear, expectedRevision: selected.revision, action: action === 'PREPARED' ? 'PREPARE' : 'REVIEW' }); setMessage(action === 'PREPARED' ? 'Year prepared for independent review.' : 'Year independently reviewed.') } catch (error) { setMessage(errorText(error)) }
  }

  return <div className="space-y-5">
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-gray-950">K-1 & outside basis</h3><p className="mt-1 text-sm text-gray-500">Choose any available year and enter K-1 values manually. Workbook and PDF import are intentionally not part of v1.</p></div><div className="flex flex-wrap gap-2"><button type="button" disabled={!detail.years.length} onClick={() => setComparing(true)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium disabled:opacity-40">Compare years</button>{canEdit && <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-2 rounded-lg bg-atlas-gold px-3 py-2 text-sm font-semibold text-white"><Plus className="h-4 w-4" />Add any year</button>}</div></div><YearRail years={detail.years} selectedYear={effectiveYear} onSelect={onSelectYear} onPrefetch={() => undefined} /></section>
    {message && <p role="status" className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{message}</p>}
    {!detail.years.length ? <section className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center"><h3 className="font-semibold text-gray-900">No K-1 years yet</h3><p className="mt-2 text-sm text-gray-500">Start with any tax year. Years are not forced to be consecutive.</p>{canEdit && <button type="button" onClick={() => setAdding(true)} className="mt-4 rounded-lg bg-atlas-gold px-4 py-2 text-sm font-semibold text-white">Add first K-1 year</button>}</section> : year.isLoading ? <div className="flex min-h-64 items-center justify-center rounded-xl border border-gray-200 bg-white"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div> : year.isError ? <p role="alert" className="rounded-xl bg-red-50 p-5 text-sm text-red-700">{errorText(year.error)}</p> : selected ? <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_20rem]"><div className="space-y-3"><div className="flex flex-wrap justify-end gap-2">{canEdit && <><button type="button" onClick={() => setEditing(true)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium">Edit manual inputs</button><button type="button" onClick={() => void deleteYear()} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700">Delete year</button></>}</div><SelectedYearTabs detail={selected} /></div><aside className="space-y-5"><YearStatusPanel detail={selected} /><JournalEntryPanel calculation={selected.calculation} detail={selected} /><SignOffPanel state={selected.signoff} checksPassing={checksPassing} canEdit={canEdit} pending={actions.signoff.isPending} onSignoff={(action) => void signoff(action)} /></aside></div> : null}
    {adding && <AddYearDialog defaultTaxYear={detail.years.at(-1)?.taxYear ? detail.years.at(-1)!.taxYear + 1 : new Date().getFullYear() - 1} pending={actions.createYear.isPending} onClose={() => setAdding(false)} onAdd={addYear} />}
    {editing && selected && <EditYearDrawer detail={selected} pending={actions.calculate.isPending || actions.updateYear.isPending} onClose={() => setEditing(false)} onCalculate={calculate} onSave={save} />}
    {comparing && <CompareYearsDrawer years={detail.years} selectedYear={effectiveYear} onClose={() => setComparing(false)} />}
  </div>
}
