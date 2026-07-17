import { Plus, Trash2, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import type { K1TrackerCashFlowEvent, K1TrackerCashFlowKind } from '../../../../../../packages/types/src/k1-tracker'
import type { CreatePartnershipCashFlowRequest } from '../../../../../../packages/types/src/partnership-tracker'
import { CurrencyInput } from '../../../components/shared/CurrencyField'
import { normalizeCurrencyInput } from '../../../components/shared/currencyInput'

const money = (value: number | string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value))
const date = (value: string) => new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
const labelFor = (kind: K1TrackerCashFlowKind) => kind === 'CAPITAL_CALL' ? 'Capital call' : 'Distribution'

export function DatedCashFlowPanel({ taxYear, events, canEdit, pending, onCreate, onDelete }: {
  taxYear: number
  events: K1TrackerCashFlowEvent[]
  canEdit: boolean
  pending: boolean
  onCreate: (body: CreatePartnershipCashFlowRequest) => Promise<void>
  onDelete: (event: K1TrackerCashFlowEvent) => Promise<void>
}) {
  const [draftKind, setDraftKind] = useState<K1TrackerCashFlowKind>()
  const [activityDate, setActivityDate] = useState(() => new Date().getFullYear() === taxYear ? new Date().toISOString().slice(0, 10) : `${taxYear}-12-31`)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [notice, setNotice] = useState<string>()
  const amountRef = useRef<HTMLInputElement>(null)
  const totals = useMemo(() => events.reduce((current, event) => ({
    ...current,
    [event.kind]: current[event.kind] + Number(event.amount),
  }), { CAPITAL_CALL: 0, DISTRIBUTION: 0 }), [events])

  const startRow = (kind: K1TrackerCashFlowKind) => {
    setDraftKind(kind)
    setAmount('')
    setNote('')
    setNotice(undefined)
    window.setTimeout(() => amountRef.current?.focus(), 0)
  }
  const save = async () => {
    if (!draftKind) return
    const parsed = normalizeCurrencyInput(amount)
    if (parsed.error || parsed.value == null || Number(parsed.value) <= 0) { setNotice(parsed.error ?? 'Enter an amount greater than zero.'); return }
    if (!activityDate.startsWith(`${taxYear}-`)) { setNotice(`Use a date within ${taxYear}.`); return }
    try {
      await onCreate({ kind: draftKind, activityDate, amount: parsed.value, note: note.trim() || null })
      setDraftKind(undefined)
      setNotice(`${labelFor(draftKind)} added and ${taxYear} performance recalculated.`)
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Cash activity could not be saved.') }
  }

  return <section aria-labelledby="cash-activity-title" className="border border-gray-200 bg-white">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
      <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-atlas-hover">Dated cash activity</p><h3 id="cash-activity-title" className="mt-1 text-lg font-semibold text-gray-950">Capital calls and distributions</h3><p className="mt-1 max-w-2xl text-sm text-gray-600">Record activity as it occurs. These rows become the annual K-1 totals below and their exact dates are used in XIRR.</p></div>
      {canEdit && <div className="flex flex-wrap gap-2"><button type="button" onClick={() => startRow('CAPITAL_CALL')} disabled={pending || Boolean(draftKind)} className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atlas-gold"><Plus className="h-3.5 w-3.5" />Capital call</button><button type="button" onClick={() => startRow('DISTRIBUTION')} disabled={pending || Boolean(draftKind)} className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atlas-gold"><Plus className="h-3.5 w-3.5" />Distribution</button></div>}
    </div>
    <div className="grid border-b border-gray-200 sm:grid-cols-2 sm:divide-x sm:divide-gray-200"><div className="px-5 py-3"><p className="text-xs uppercase tracking-wide text-gray-500">{taxYear} capital calls</p><p className="mt-1 font-serif text-xl font-semibold tabular-nums text-gray-950">{money(totals.CAPITAL_CALL)}</p></div><div className="px-5 py-3"><p className="text-xs uppercase tracking-wide text-gray-500">{taxYear} distributions</p><p className="mt-1 font-serif text-xl font-semibold tabular-nums text-gray-950">{money(totals.DISTRIBUTION)}</p></div></div>
    <div className="overflow-x-auto"><table className="w-full min-w-[44rem] text-left text-sm"><thead className="bg-gray-50 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-gray-500"><tr><th className="px-5 py-3">Activity</th><th className="px-3 py-3">Date</th><th className="px-3 py-3 text-right">Amount</th><th className="px-3 py-3">Note</th><th className="w-14 px-3 py-3"><span className="sr-only">Actions</span></th></tr></thead><tbody className="divide-y divide-gray-100">
      {draftKind && <tr className="bg-atlas-light"><td className="px-5 py-3 font-semibold text-gray-900">{labelFor(draftKind)}</td><td className="px-3 py-3"><input aria-label="Cash activity date" type="date" min={`${taxYear}-01-01`} max={`${taxYear}-12-31`} value={activityDate} onChange={(event) => setActivityDate(event.target.value)} className="min-h-10 rounded-md border border-gray-300 bg-white px-2 outline-none focus:border-atlas-gold focus:ring-2 focus:ring-atlas-gold/30" /></td><td className="px-3 py-3"><CurrencyInput ref={amountRef} aria-label="Cash activity amount" value={amount} onChange={setAmount} /></td><td className="px-3 py-3"><input aria-label="Cash activity note" value={note} maxLength={2000} onChange={(event) => setNote(event.target.value)} placeholder="Optional" className="min-h-10 w-full rounded-md border border-gray-300 bg-white px-3 outline-none focus:border-atlas-gold focus:ring-2 focus:ring-atlas-gold/30" /></td><td className="px-3 py-3"><div className="flex"><button type="button" onClick={() => void save()} disabled={pending} className="min-h-10 rounded-md bg-gray-950 px-3 text-xs font-semibold text-white disabled:opacity-40">Save</button><button type="button" aria-label="Cancel new cash activity" onClick={() => setDraftKind(undefined)} className="grid min-h-10 min-w-10 place-items-center text-gray-500 hover:text-gray-900"><X className="h-4 w-4" /></button></div></td></tr>}
      {events.map((event) => <tr key={event.id}><td className="px-5 py-3 font-semibold text-gray-800">{labelFor(event.kind)}</td><td className="px-3 py-3 text-gray-600">{date(event.activityDate)}</td><td className="px-3 py-3 text-right font-mono font-semibold tabular-nums text-gray-900">{money(event.amount)}</td><td className="max-w-xs truncate px-3 py-3 text-gray-500" title={event.note ?? ''}>{event.note ?? '—'}</td><td className="px-3 py-3">{canEdit && <button type="button" aria-label={`Delete ${labelFor(event.kind).toLowerCase()} from ${event.activityDate}`} onClick={() => { if (window.confirm(`Delete this ${labelFor(event.kind).toLowerCase()}?`)) void onDelete(event) }} disabled={pending} className="grid min-h-10 min-w-10 place-items-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-700 disabled:opacity-40"><Trash2 className="h-4 w-4" /></button>}</td></tr>)}
      {!events.length && !draftKind && <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-gray-500">No dated cash activity for {taxYear}. Add a capital call or distribution when it occurs.</td></tr>}
    </tbody></table></div>
    {notice && <p role="status" className="border-t border-gray-200 bg-amber-50 px-5 py-3 text-sm text-amber-900">{notice}</p>}
  </section>
}
