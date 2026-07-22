import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'
import { Plus, Trash2, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import type { K1TrackerCashFlowEvent, K1TrackerCashFlowKind } from '../../../../../../packages/types/src/k1-tracker'
import type { CreatePartnershipCashFlowRequest } from '../../../../../../packages/types/src/partnership-tracker'
import { CurrencyInput } from '../../../components/shared/CurrencyField'
import { normalizeCurrencyInput } from '../../../components/shared/currencyInput'
import { ConfirmationDialog } from '../../../components/shared/ConfirmationDialog'

const money = (value: number | string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value))
const date = (value: string) => new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))

const activityOptions: Array<{ kind: K1TrackerCashFlowKind; label: string }> = [
  { kind: 'CAPITAL_CALL', label: 'Capital call' },
  { kind: 'DISTRIBUTION', label: 'Distribution' },
  { kind: 'RECALLABLE_DISTRIBUTION', label: 'Recallable distribution' },
]

const labelFor = (kind: K1TrackerCashFlowKind) => activityOptions.find((option) => option.kind === kind)!.label

interface DraftCashFlowRow {
  id: number
  activityDate: string
  amount: string
  kind: K1TrackerCashFlowKind
}

export function DatedCashFlowPanel({ taxYear, events, canEdit, pending, onCreate, onDelete }: {
  taxYear: number
  events: K1TrackerCashFlowEvent[]
  canEdit: boolean
  pending: boolean
  onCreate: (entries: CreatePartnershipCashFlowRequest[]) => Promise<void>
  onDelete: (event: K1TrackerCashFlowEvent) => Promise<void>
}) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [draftRows, setDraftRows] = useState<DraftCashFlowRow[]>([])
  const [formError, setFormError] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const [deleteTarget, setDeleteTarget] = useState<K1TrackerCashFlowEvent>()
  const [saving, setSaving] = useState(false)
  const nextRowId = useRef(1)
  const totals = useMemo(() => events.reduce<Record<K1TrackerCashFlowKind, number>>((current, event) => ({
    ...current,
    [event.kind]: current[event.kind] + Number(event.amount),
  }), { CAPITAL_CALL: 0, DISTRIBUTION: 0, RECALLABLE_DISTRIBUTION: 0 }), [events])
  const distributionTotal = totals.DISTRIBUTION + totals.RECALLABLE_DISTRIBUTION
  const busy = pending || saving

  const defaultActivityDate = () => new Date().getFullYear() === taxYear ? new Date().toISOString().slice(0, 10) : `${taxYear}-12-31`
  const newDraftRow = (): DraftCashFlowRow => ({ id: nextRowId.current++, activityDate: defaultActivityDate(), amount: '', kind: 'CAPITAL_CALL' })
  const openDialog = () => {
    nextRowId.current = 1
    setDraftRows([newDraftRow()])
    setFormError(undefined)
    setNotice(undefined)
    setDialogOpen(true)
  }
  const closeDialog = () => { if (!busy) setDialogOpen(false) }
  const updateDraftRow = (id: number, patch: Partial<Omit<DraftCashFlowRow, 'id'>>) => {
    setDraftRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row))
    setFormError(undefined)
  }
  const addDraftRow = () => {
    setDraftRows((current) => [...current, newDraftRow()])
    setFormError(undefined)
  }
  const removeDraftRow = (id: number) => {
    setDraftRows((current) => current.length === 1 ? current : current.filter((row) => row.id !== id))
    setFormError(undefined)
  }
  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    const entries: CreatePartnershipCashFlowRequest[] = []
    for (const [index, row] of draftRows.entries()) {
      const parsed = normalizeCurrencyInput(row.amount)
      if (parsed.error || parsed.value == null || Number(parsed.value) <= 0) {
        setFormError(`Row ${index + 1}: ${parsed.error ?? 'Enter an amount greater than zero.'}`)
        return
      }
      if (!row.activityDate.startsWith(`${taxYear}-`)) {
        setFormError(`Row ${index + 1}: use a date within ${taxYear}.`)
        return
      }
      entries.push({ kind: row.kind, activityDate: row.activityDate, amount: parsed.value, note: null })
    }
    setSaving(true)
    try {
      await onCreate(entries)
      setDialogOpen(false)
      const recallableCount = entries.filter((entry) => entry.kind === 'RECALLABLE_DISTRIBUTION').length
      setNotice(`${entries.length} cash activit${entries.length === 1 ? 'y' : 'ies'} added and ${taxYear} performance recalculated.${recallableCount ? ` ${recallableCount} recallable distribution${recallableCount === 1 ? '' : 's'} also increased commitment.` : ''}`)
    } catch (error) { setFormError(error instanceof Error ? error.message : 'Cash activity could not be saved.') }
    finally { setSaving(false) }
  }
  const remove = async () => {
    if (!deleteTarget) return
    try {
      await onDelete(deleteTarget)
      setNotice(deleteTarget.kind === 'RECALLABLE_DISTRIBUTION'
        ? 'Recallable distribution deleted and its commitment increase reversed.'
        : `${labelFor(deleteTarget.kind)} deleted and ${taxYear} performance recalculated.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Cash activity could not be deleted.')
    } finally {
      setDeleteTarget(undefined)
    }
  }

  return <>
    <section aria-labelledby="cash-activity-title" className="border border-gray-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-jackson-hover">Dated cash activity</p><h3 id="cash-activity-title" className="mt-1 text-lg font-semibold text-gray-950">Net cash activity</h3><p className="mt-1 max-w-2xl text-sm text-gray-600">Record exact-dated capital calls and distributions for annual K-1 totals and XIRR. Recallable distributions also restore commitment.</p></div>
        {canEdit && <button type="button" onClick={openDialog} disabled={pending} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-gray-950 px-4 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jackson-gold focus-visible:ring-offset-2"><Plus className="h-4 w-4" aria-hidden="true" />Net Cash Activity</button>}
      </div>
      <div className="grid border-b border-gray-200 sm:grid-cols-3 sm:divide-x sm:divide-gray-200">
        <div className="px-5 py-3"><p className="text-xs uppercase tracking-wide text-gray-500">{taxYear} capital calls</p><p className="mt-1 font-serif text-xl font-semibold tabular-nums text-gray-950">{money(totals.CAPITAL_CALL)}</p></div>
        <div className="border-t border-gray-200 px-5 py-3 sm:border-t-0"><p className="text-xs uppercase tracking-wide text-gray-500">{taxYear} distributions</p><p className="mt-1 font-serif text-xl font-semibold tabular-nums text-gray-950">{money(distributionTotal)}</p></div>
        <div className="border-t border-gray-200 px-5 py-3 sm:border-t-0"><p className="text-xs uppercase tracking-wide text-gray-500">Recallable portion</p><p className="mt-1 font-serif text-xl font-semibold tabular-nums text-gray-950">{money(totals.RECALLABLE_DISTRIBUTION)}</p></div>
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[44rem] text-left text-sm"><thead className="bg-gray-50 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-gray-500"><tr><th className="px-5 py-3">Activity</th><th className="px-3 py-3">Date</th><th className="px-3 py-3 text-right">Amount</th><th className="px-3 py-3">Note</th><th aria-label="Actions" className="w-14 px-3 py-3" /></tr></thead><tbody className="divide-y divide-gray-100">
        {events.map((cashEvent) => <tr key={cashEvent.id}><td className="px-5 py-3 font-semibold text-gray-800">{labelFor(cashEvent.kind)}</td><td className="px-3 py-3 text-gray-600">{date(cashEvent.activityDate)}</td><td className="px-3 py-3 text-right font-mono font-semibold tabular-nums text-gray-900">{money(cashEvent.amount)}</td><td className="max-w-xs truncate px-3 py-3 text-gray-500" title={cashEvent.note ?? ''}>{cashEvent.note ?? '\u2014'}</td><td className="px-3 py-3">{canEdit && <button type="button" aria-label={`Delete ${labelFor(cashEvent.kind).toLowerCase()} from ${cashEvent.activityDate}`} onClick={() => setDeleteTarget(cashEvent)} disabled={pending} className="grid min-h-11 min-w-11 place-items-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-700 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jackson-gold"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>}</td></tr>)}
        {!events.length && <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-gray-500">No net cash activity for {taxYear}.</td></tr>}
      </tbody></table></div>
      {notice && <p role="status" className="border-t border-gray-200 bg-amber-50 px-5 py-3 text-sm text-amber-900">{notice}</p>}
    </section>

    <Dialog open={dialogOpen} onClose={closeDialog} className="relative z-50">
      <DialogBackdrop transition className="fixed inset-0 bg-gray-950/60 backdrop-blur-[2px] transition-opacity data-[closed]:opacity-0 motion-reduce:transition-none" />
      <div className="fixed inset-0 flex items-end justify-center overflow-y-auto sm:items-center sm:p-4">
        <DialogPanel transition className="w-full overflow-hidden rounded-t-xl border border-gray-200 bg-white shadow-2xl transition duration-200 data-[closed]:translate-y-3 data-[closed]:opacity-0 motion-reduce:transform-none motion-reduce:transition-none sm:max-w-3xl sm:rounded-xl">
          <div aria-hidden="true" className="h-1 bg-jackson-gold" />
          <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-5 sm:px-6">
            <div><p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-jackson-hover">{taxYear} cash ledger</p><DialogTitle className="mt-1 font-serif text-xl font-semibold text-gray-950">Net Cash Activity</DialogTitle><p className="mt-1 text-sm text-gray-600">Enter one or more cash activities. Every row is saved together.</p></div>
            <button type="button" aria-label="Close net cash activity" onClick={closeDialog} disabled={busy} className="grid min-h-11 min-w-11 place-items-center rounded-md text-gray-500 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jackson-gold disabled:opacity-40"><X className="h-5 w-5" aria-hidden="true" /></button>
          </div>
          <form onSubmit={save}>
            <div className="space-y-4 px-5 py-5 sm:px-6">
              <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_2.75rem] gap-3 px-3 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-gray-500 sm:grid"><span>Date</span><span>Amount</span><span>Type</span><span className="sr-only">Actions</span></div>
              <div data-testid="cash-activity-draft-list" className="max-h-[45vh] space-y-4 overflow-y-auto pb-1 pl-3 pr-1 pt-3 [scrollbar-gutter:stable]">{draftRows.map((row, index) => <div key={row.id} className="relative grid gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_2.75rem] sm:items-end">
                <span data-testid={`cash-activity-row-number-${index + 1}`} className="absolute -left-2 -top-2 grid h-6 min-w-6 place-items-center rounded-full bg-gray-950 px-1 text-[0.65rem] font-bold text-white shadow-sm ring-2 ring-white" aria-hidden="true">{index + 1}</span>
                <label className="block text-xs font-bold uppercase tracking-wide text-gray-500 sm:text-transparent">Date<input aria-label={`Cash activity date row ${index + 1}`} type="date" required min={`${taxYear}-01-01`} max={`${taxYear}-12-31`} value={row.activityDate} onChange={(event) => updateDraftRow(row.id, { activityDate: event.target.value })} className="mt-1 min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 text-sm font-normal tracking-normal text-gray-950 outline-none focus:border-jackson-gold focus:ring-2 focus:ring-jackson-gold/30" /></label>
                <label className="block text-xs font-bold uppercase tracking-wide text-gray-500 sm:text-transparent">Amount<CurrencyInput aria-label={`Cash activity amount row ${index + 1}`} required value={row.amount} onChange={(amount) => updateDraftRow(row.id, { amount })} className="min-h-11 bg-white font-normal tracking-normal text-gray-950" /></label>
                <label className="block text-xs font-bold uppercase tracking-wide text-gray-500 sm:text-transparent">Type<select aria-label={`Cash activity type row ${index + 1}`} required value={row.kind} onChange={(event) => updateDraftRow(row.id, { kind: event.target.value as K1TrackerCashFlowKind })} className="mt-1 min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 text-sm font-normal tracking-normal text-gray-950 outline-none focus:border-jackson-gold focus:ring-2 focus:ring-jackson-gold/30">{activityOptions.map((option) => <option key={option.kind} value={option.kind}>{option.label}</option>)}</select></label>
                <button type="button" aria-label={`Remove cash activity row ${index + 1}`} onClick={() => removeDraftRow(row.id)} disabled={draftRows.length === 1 || busy} className="grid min-h-11 min-w-11 place-items-center rounded-md border border-gray-300 bg-white text-gray-500 hover:border-red-200 hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jackson-gold disabled:cursor-not-allowed disabled:opacity-30"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
              </div>)}</div>
              <button type="button" onClick={addDraftRow} disabled={busy || draftRows.length >= 50} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-dashed border-gray-400 bg-white px-4 text-sm font-semibold text-gray-800 hover:border-jackson-gold hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jackson-gold disabled:opacity-40"><Plus className="h-4 w-4" aria-hidden="true" />Add another row</button>
              {draftRows.some((row) => row.kind === 'RECALLABLE_DISTRIBUTION') && <p className="border-l-4 border-jackson-gold bg-amber-50 px-3 py-2 text-sm text-amber-950">Each recallable distribution increases committed capital by the same amount. Deleting one later reverses its increase.</p>}
              {formError && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>}
            </div>
            <div className="flex flex-col-reverse gap-3 border-t border-gray-200 bg-gray-50 px-5 py-4 sm:flex-row sm:justify-end sm:px-6"><button type="button" onClick={closeDialog} disabled={busy} className="min-h-11 rounded-md border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jackson-gold disabled:opacity-40">Cancel</button><button type="submit" disabled={busy} className="min-h-11 rounded-md bg-gray-950 px-5 text-sm font-semibold text-white hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jackson-gold focus-visible:ring-offset-2 disabled:opacity-40">{busy ? 'Saving\u2026' : `Add ${draftRows.length} activit${draftRows.length === 1 ? 'y' : 'ies'}`}</button></div>
          </form>
        </DialogPanel>
      </div>
    </Dialog>

    <ConfirmationDialog open={Boolean(deleteTarget)} title={`Delete this ${deleteTarget ? labelFor(deleteTarget.kind).toLowerCase() : 'cash activity'}?`} description={<p>{deleteTarget?.kind === 'RECALLABLE_DISTRIBUTION' ? `This permanently removes the dated distribution, reverses its commitment increase, and recalculates the ${taxYear} K-1 totals.` : `This permanently removes the dated cash activity and recalculates the ${taxYear} K-1 totals and performance results.`}</p>} confirmLabel={`Delete ${deleteTarget ? labelFor(deleteTarget.kind).toLowerCase() : 'activity'}`} pending={pending} pendingLabel="Deleting activity\u2026" onClose={() => setDeleteTarget(undefined)} onConfirm={remove} />
  </>
}
