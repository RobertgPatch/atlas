import { AlertTriangle, Loader2, Plus } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { K1TrackerFieldChange, K1TrackerYearDetail } from '../../../../../packages/types/src/k1-tracker'
import { PageHeader } from '../../../components/shared/PageHeader'
import { K1TrackerApiError } from '../api/k1TrackerClient'
import { useK1TrackerActions, useK1TrackerList, useK1TrackerPartnership, useK1TrackerYear, useK1TrackerYearPrefetch } from '../hooks/useK1Tracker'
import { AddYearDialog } from './AddYearDialog'
import { CompareYearsDrawer } from './CompareYearsDrawer'
import { EditYearDrawer } from './EditYearDrawer'
import { JournalEntryPanel } from './JournalEntryPanel'
import { PartnershipPicker } from './PartnershipPicker'
import { SelectedYearTabs } from './SelectedYearTabs'
import { SignOffPanel } from './SignOffPanel'
import { YearRail } from './YearRail'
import { YearStatusPanel } from './YearStatusPanel'

const currency = (amount: string | null | undefined) => amount == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(amount))
const errorText = (error: unknown) => error instanceof K1TrackerApiError && error.code === 'DATABASE_REQUIRED' ? 'K1 Tracker needs the configured database connection before it can load your partnership history.' : error instanceof Error ? error.message : 'Unable to load K1 Tracker.'

export function K1TrackerPageContent({ canEdit }: { canEdit: boolean }) {
  const [urlState, setUrlState] = useSearchParams()
  const [search, setSearch] = useState('')
  const [partnershipId, setPartnershipId] = useState<string | undefined>(() => urlState.get('partnership') ?? undefined)
  const [taxYear, setTaxYear] = useState<number | undefined>(() => { const parsed = Number(urlState.get('year')); return Number.isInteger(parsed) ? parsed : undefined })
  const [editing, setEditing] = useState(false)
  const [addingYear, setAddingYear] = useState(false)
  const [comparing, setComparing] = useState(false)
  const [message, setMessage] = useState<string>()
  const list = useK1TrackerList(search)
  const effectivePartnershipId = partnershipId ?? list.data?.items[0]?.partnershipId
  const partnership = useK1TrackerPartnership(effectivePartnershipId)
  const effectiveTaxYear = taxYear ?? partnership.data?.years.at(-1)?.taxYear
  const year = useK1TrackerYear(effectivePartnershipId, effectiveTaxYear)
  const actions = useK1TrackerActions()
  const prefetchYear = useK1TrackerYearPrefetch(effectivePartnershipId)
  const detail = year.data
  const defaultTaxYear = (partnership.data?.years.at(-1)?.taxYear ?? new Date().getFullYear() - 1) + 1

  const selectPartnership = (id: string, selectedTaxYear?: number) => {
    setPartnershipId(id); setTaxYear(selectedTaxYear)
    const next = new URLSearchParams(urlState); next.set('partnership', id)
    if (selectedTaxYear) next.set('year', String(selectedTaxYear)); else next.delete('year')
    setUrlState(next, { replace: true })
  }
  const selectYear = (nextYear: number) => {
    setTaxYear(nextYear)
    const next = new URLSearchParams(urlState)
    if (effectivePartnershipId) next.set('partnership', effectivePartnershipId)
    next.set('year', String(nextYear)); setUrlState(next, { replace: true })
  }
  const addYear = async (selectedTaxYear: number) => {
    if (!effectivePartnershipId) throw new Error('Choose a partnership before adding a tracker year.')
    try {
      const created = await actions.createYear.mutateAsync({ id: effectivePartnershipId, year: selectedTaxYear })
      selectYear(created.taxYear); setAddingYear(false)
    } catch (error) { const text = errorText(error); setMessage(text); throw new Error(text) }
  }
  const calculate = async (changes: K1TrackerFieldChange[]) => {
    if (!effectivePartnershipId || !effectiveTaxYear || !detail) throw new Error('Choose a partnership year before previewing changes.')
    try { return await actions.calculate.mutateAsync({ id: effectivePartnershipId, year: effectiveTaxYear, revision: detail.revision, changes }) } catch (error) { const text = errorText(error); setMessage(text); throw new Error(text) }
  }
  const save = async (changes: K1TrackerFieldChange[]) => {
    if (!effectivePartnershipId || !effectiveTaxYear || !detail) throw new Error('Choose a partnership year before saving changes.')
    try {
      const result = await actions.updateYear.mutateAsync({ id: effectivePartnershipId, year: effectiveTaxYear, revision: detail.revision, changes })
      setMessage(result.invalidatedTaxYears.length ? `Saved. ${result.invalidatedTaxYears.length} later year(s) now need review.` : 'Saved tracker revisions.')
    } catch (error) { const text = errorText(error); setMessage(text); throw new Error(text) }
  }
  const deleteYear = async () => {
    if (!effectivePartnershipId || !effectiveTaxYear || !detail || !window.confirm(`Delete ${effectiveTaxYear}?`)) return
    try { await actions.deleteYear.mutateAsync({ id: effectivePartnershipId, year: effectiveTaxYear, revision: detail.revision }); const prior = partnership.data?.years.at(-2)?.taxYear; if (prior) selectYear(prior) } catch (error) { setMessage(errorText(error)) }
  }
  const signoff = async (action: 'PREPARED' | 'REVIEWED') => {
    if (!effectivePartnershipId || !effectiveTaxYear || !detail) return
    try { await actions.signoff.mutateAsync({ id: effectivePartnershipId, year: effectiveTaxYear, revision: detail.revision, action }); setMessage(action === 'PREPARED' ? 'Year prepared for review.' : 'Year independently reviewed.') } catch (error) { setMessage(errorText(error)) }
  }

  return <><PageHeader title="K1 Tracker" subtitle="A partnership-first, year-by-year basis workspace with source provenance and reconciliation checks." actions={canEdit ? <button type="button" onClick={() => setAddingYear(true)} className="inline-flex items-center gap-2 rounded-lg bg-atlas-gold px-4 py-2 text-sm font-medium text-white hover:bg-atlas-hover"><Plus className="h-4 w-4" />Add year</button> : null} />{message && <div role="status" className="mb-5 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{message}</div>}<div className="grid gap-5 xl:grid-cols-[20rem_minmax(0,1fr)]"><PartnershipPicker items={list.data?.items ?? []} search={search} selectedId={effectivePartnershipId} loading={list.isLoading} error={list.isError ? errorText(list.error) : undefined} onSearch={setSearch} onSelect={(item) => selectPartnership(item.partnershipId, item.latestTaxYear ?? undefined)} /><section className="min-w-0">{partnership.data ? <TrackerWorkspace detail={detail} partnership={partnership.data} selectedYear={effectiveTaxYear} canEdit={canEdit} onSelectYear={selectYear} onPrefetchYear={prefetchYear} onCompare={() => setComparing(true)} onEdit={() => setEditing(true)} onDelete={() => void deleteYear()} onSignoff={signoff} pending={actions.updateYear.isPending || actions.signoff.isPending} /> : list.isLoading || partnership.isLoading ? <div className="flex min-h-64 items-center justify-center rounded-xl border border-gray-200 bg-white"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div> : <div className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center text-sm text-gray-500">Choose a partnership to open its tracker.</div>}</section></div>{addingYear && <AddYearDialog defaultTaxYear={defaultTaxYear} pending={actions.createYear.isPending} onClose={() => setAddingYear(false)} onAdd={addYear} />}{editing && detail && <EditYearDrawer detail={detail} pending={actions.calculate.isPending || actions.updateYear.isPending} onClose={() => setEditing(false)} onCalculate={calculate} onSave={save} />}{comparing && partnership.data && <CompareYearsDrawer years={partnership.data.years} selectedYear={effectiveTaxYear} onClose={() => setComparing(false)} />}</>
}

function TrackerWorkspace({ partnership, detail, selectedYear, canEdit, onSelectYear, onPrefetchYear, onCompare, onEdit, onDelete, onSignoff, pending }: { partnership: NonNullable<ReturnType<typeof useK1TrackerPartnership>['data']>; detail: K1TrackerYearDetail | undefined; selectedYear?: number; canEdit: boolean; onSelectYear: (year: number) => void; onPrefetchYear: (year: number) => void; onCompare: () => void; onEdit: () => void; onDelete: () => void; onSignoff: (action: 'PREPARED' | 'REVIEWED') => void; pending: boolean }) {
  const checksPassing = detail?.calculation.checks.every((check) => check.status === 'PASS') ?? false
  return <div className="space-y-5"><div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><p className="text-xs font-medium uppercase tracking-wide text-gray-500">{partnership.entityName}</p><div className="mt-1 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold text-gray-950">{partnership.partnershipName}</h2><p className="mt-1 text-sm text-gray-500">{partnership.yearCount ? `${partnership.firstTaxYear}–${partnership.latestTaxYear}` : 'No years imported yet'} · Outside basis {currency(partnership.latestEndingOutsideBasis)}</p></div><div className="flex gap-2"><button type="button" onClick={onCompare} className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50">Compare years</button>{detail && canEdit && <><button type="button" onClick={onEdit} className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50">Edit inputs</button><button type="button" onClick={onDelete} className="rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50">Delete year</button></>}</div></div><YearRail years={partnership.years} selectedYear={selectedYear} onSelect={onSelectYear} onPrefetch={onPrefetchYear} /></div>{detail ? <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_20rem]"><SelectedYearTabs detail={detail} /><aside className="space-y-5"><YearStatusPanel detail={detail} /><JournalEntryPanel calculation={detail.calculation} detail={detail} /><SignOffPanel state={detail.signoff} checksPassing={checksPassing} canEdit={canEdit} pending={pending} onSignoff={onSignoff} /></aside></div> : <div className="flex min-h-64 items-center justify-center rounded-xl border border-gray-200 bg-white"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>}</div>
}
