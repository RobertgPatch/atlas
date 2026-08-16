import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Landmark,
  Pencil,
  Plus,
  Radio,
  Trash2,
} from 'lucide-react'
import { useQueries } from '@tanstack/react-query'
import { useState } from 'react'
import type {
  PartnershipCommitmentEntry,
  PartnershipNavEntry,
  PartnershipTrackerDetail,
  PartnershipTrackerYearDetail,
} from '../../../../../../../packages/types/src/partnership-tracker'
import type { K1TrackerCashFlowEvent } from '../../../../../../../packages/types/src/k1-tracker'
import { normalizeCurrencyInput } from '../../../../components/shared/currencyInput'
import { partnershipTrackerClient, PartnershipTrackerApiError } from '../../api/partnershipTrackerClient'
import { partnershipTrackerKeys, usePartnershipTrackerActions } from '../../hooks/usePartnershipTracker'
import { K1BasisWorkspace } from '../K1BasisWorkspace'
import { MagicPatternInKindPositionsCard } from './MagicPatternInKindPositionsCard'
import { MagicPatternOperationalChart } from './MagicPatternOperationalChart'
import { MagicPatternPartnershipRecordDialog } from './MagicPatternPartnershipRecordDialog'
import {
  MagicPatternCashActivityDrawer,
  MagicPatternValuationDrawer,
} from './MagicPatternOperationalDrawers'
import { allCashFlows, extractActivitySource, inKindLotsFor } from './MagicPatternOperationalUtils'
import { MagicPatternRelationshipsPanel } from './MagicPatternRelationshipsPanel'
import { MagicPatternUnderlyingAssets } from './MagicPatternUnderlyingAssets'
import {
  MagicButton,
  MagicCard,
  MagicConfirmDialog,
  MagicModal,
  MagicStatusBadge,
  mpInputClass,
  mpLabelClass,
} from './MagicPatternPrimitives'

export type MagicWorkspaceArea = 'overview' | 'cash-activity' | 'valuations' | 'k1-history' | 'underlying-assets'

const money = (value: string | null | undefined, negative = false) => {
  if (value == null || value === '') return null
  const amount = Number(value)
  if (!Number.isFinite(amount)) return null
  const formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(amount))
  return negative && amount !== 0 ? `(${formatted})` : formatted
}
const multiple = (value: string | null | undefined) => value == null ? null : `${Number(value).toFixed(2)}x`
const percent = (value: string | null | undefined) => value == null ? null : `${(Number(value) * 100).toFixed(1)}%`
const date = (value: string | null | undefined) => value ? new Intl.DateTimeFormat('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`)) : 'Not available'
const humanize = (value: string) => value.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
const sourceLabel = (entry: PartnershipNavEntry) => {
  const tagged = entry.note?.match(/^\[([^\]]+)\]/)?.[1]
  return tagged ?? humanize(entry.sourceType)
}
const noteWithoutSource = (entry: PartnershipNavEntry) => entry.note?.replace(/^\[[^\]]+\]\s*/, '') || '—'

function FinancialMetric({ label, value, note, tone = 'default', calculated = false }: { label: string; value: string | null; note?: string; tone?: 'default' | 'inflow' | 'outflow'; calculated?: boolean }) {
  return <div className="min-w-0"><p className="text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-slate-600">{label}</p><p className={`mt-2 truncate font-mono text-xl font-semibold tabular-nums ${tone === 'inflow' ? 'text-emerald-700' : tone === 'outflow' ? 'text-red-800' : 'text-slate-950'}`} title={value ?? 'Not available'}>{value ?? '— Not available'}</p>{calculated ? <div className="mt-1"><MagicStatusBadge tone="calculated">Calculated</MagicStatusBadge></div> : null}{note ? <p className="mt-1 text-xs leading-5 text-slate-600">{note}</p> : null}</div>
}

function WorkspaceHeader({ detail, canEdit, onEdit, onActivity, onDelete }: { detail: PartnershipTrackerDetail; canEdit: boolean; onEdit: () => void; onActivity: () => void; onDelete: () => void }) {
  const partnership = detail.summary.partnership
  return <MagicCard className="overflow-hidden"><div className="flex flex-wrap items-start justify-between gap-5 p-5"><div className="min-w-0"><div className="flex flex-wrap gap-2"><span className="rounded bg-slate-100 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-slate-700">{partnership.partnershipType}</span><MagicStatusBadge tone={partnership.status === 'ACTIVE' ? 'success' : partnership.status === 'PENDING' ? 'info' : 'neutral'}><span className={`mr-1 h-1.5 w-1.5 rounded-full ${partnership.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-sky-500'}`} />{humanize(partnership.status)}</MagicStatusBadge></div><h1 className="mt-2 break-words text-2xl font-semibold tracking-tight text-slate-950">{partnership.name}</h1><p className="mt-1 text-sm text-slate-600"><Landmark className="mr-1 inline h-4 w-4" />Owned by <strong className="font-semibold text-slate-950">{partnership.entity.name}</strong></p><div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-600"><span><CalendarDays className="mr-1 inline h-3.5 w-3.5" />Inception <strong className="ml-1 font-mono font-medium text-slate-800">{date(partnership.inceptionDate)}</strong></span><span>Vintage <strong className="ml-1 font-mono font-medium text-slate-800">{partnership.inceptionDate?.slice(0, 4) ?? '—'}</strong></span><span>Manager <strong className="ml-1 font-mono font-medium text-slate-800">{partnership.fundManager ?? 'Not on file'}</strong></span><span>EIN <strong className="ml-1 font-mono font-medium text-slate-800">{partnership.ein ?? 'Not on file'}</strong></span></div></div><div className="text-right"><p className="text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-slate-500">Performance as of <span className="ml-1 font-mono text-slate-800">{date(detail.summary.performanceAsOfDate)}</span></p>{canEdit ? <div className="mt-3 flex flex-wrap justify-end gap-2"><MagicButton type="button" variant="secondary" onClick={onEdit}><Pencil className="h-4 w-4" />Edit</MagicButton><MagicButton type="button" onClick={onActivity}><Plus className="h-4 w-4" />Record activity</MagicButton><MagicButton type="button" variant="danger" onClick={onDelete}><Trash2 className="h-4 w-4" />Delete</MagicButton></div> : null}</div></div></MagicCard>
}

function WorkspaceNav({ area, counts, onChange }: { area: MagicWorkspaceArea; counts: { cash: number; nav: number; k1: number }; onChange: (area: MagicWorkspaceArea) => void }) {
  const items: Array<{ id: MagicWorkspaceArea; label: string; count?: number; disabled?: boolean }> = [{ id: 'overview', label: 'Overview' }, { id: 'cash-activity', label: 'Cash Activity', count: counts.cash }, { id: 'valuations', label: 'Valuations', count: counts.nav }, { id: 'k1-history', label: 'K-1 History', count: counts.k1 }, { id: 'underlying-assets', label: 'Underlying Assets' }]
  return <nav aria-label="Partnership sections" className="sticky top-0 z-20 overflow-x-auto rounded-lg border border-slate-300 bg-white shadow-sm"><div className="flex min-w-max items-stretch"><span className="flex items-center border-r border-slate-200 px-4 text-[0.6rem] font-semibold uppercase tracking-[0.13em] text-slate-500">Investment operations</span>{items.slice(0, 3).map((item) => <NavButton key={item.id} item={item} selected={area === item.id} onChange={onChange} />)}<span className="flex items-center border-x border-slate-200 px-4 text-[0.6rem] font-semibold uppercase tracking-[0.13em] text-slate-500">Tax accounting</span><NavButton item={items[3]} selected={area === 'k1-history'} onChange={onChange} /><span className="flex items-center border-x border-slate-200 px-4 text-[0.6rem] font-semibold uppercase tracking-[0.13em] text-slate-500">Estate planning</span><NavButton item={items[4]} selected={area === 'underlying-assets'} onChange={onChange} /></div></nav>
}

function NavButton({ item, selected, onChange }: { item: { id: MagicWorkspaceArea; label: string; count?: number; disabled?: boolean }; selected: boolean; onChange: (area: MagicWorkspaceArea) => void }) {
  return <button type="button" disabled={item.disabled} onClick={() => onChange(item.id)} className={`relative min-h-12 px-3 text-sm font-medium ${selected ? 'text-slate-950 after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-[#166534]' : 'text-slate-600 hover:bg-slate-50'} disabled:cursor-not-allowed disabled:text-slate-500`}>{item.label}{item.count != null ? <span className={`ml-1.5 inline-grid h-5 min-w-5 place-items-center rounded-full px-1 text-[0.65rem] ${selected ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>{item.count}</span> : null}{item.disabled ? <MagicStatusBadge className="ml-2">Soon</MagicStatusBadge> : null}</button>
}

function CommitmentDialog({ partnershipId, entry, onClose }: { partnershipId: string; entry?: PartnershipCommitmentEntry; onClose: () => void }) {
  const actions = usePartnershipTrackerActions()
  const [amount, setAmount] = useState(entry?.amount ?? '')
  const [effectiveDate, setEffectiveDate] = useState(entry?.effectiveDate ?? new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState(entry?.note ?? '')
  const [error, setError] = useState<string>()
  const pending = actions.createCommitment.isPending || actions.updateCommitment.isPending
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setError(undefined); const parsed = normalizeCurrencyInput(amount, false); if (parsed.error || parsed.value == null) return setError(parsed.error ?? 'Enter the committed amount.'); try { if (entry) await actions.updateCommitment.mutateAsync({ id: partnershipId, entryId: entry.id, body: { amount: parsed.value, effectiveDate, note: note.trim() || null, expectedUpdatedAt: entry.updatedAt } }); else await actions.createCommitment.mutateAsync({ id: partnershipId, body: { amount: parsed.value, effectiveDate, note: note.trim() || null } }); onClose() } catch (caught) { setError(caught instanceof PartnershipTrackerApiError && caught.isStale ? 'This entry changed while you were editing.' : 'The commitment could not be saved.') } }
  return <MagicModal open onClose={onClose} size="md" title={entry ? 'Correct committed capital' : 'Add committed capital'} description="Enter the total commitment effective on this date. Backdated entries do not replace later values." footer={<><MagicButton type="button" variant="secondary" onClick={onClose}>Cancel</MagicButton><MagicButton type="submit" form="magic-commitment-form" disabled={pending}>{pending ? 'Saving…' : 'Save entry'}</MagicButton></>}><form id="magic-commitment-form" onSubmit={submit} className="space-y-4"><label className={mpLabelClass}>Total committed capital<span className="relative block"><span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-slate-500">$</span><input required inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className={`${mpInputClass} pl-7`} /></span></label><label className={mpLabelClass}>Effective date<input type="date" required value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} className={mpInputClass} /></label><label className={mpLabelClass}>Note <span className="font-normal text-slate-500">Optional</span><textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} className={`${mpInputClass} py-2`} /></label>{error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}</form></MagicModal>
}

function Overview({ detail, cashFlows, canEdit, onGo }: { detail: PartnershipTrackerDetail; cashFlows: K1TrackerCashFlowEvent[]; canEdit: boolean; onGo: (area: MagicWorkspaceArea) => void }) {
  const summary = detail.summary
  const partnership = summary.partnership
  const [commitmentDialog, setCommitmentDialog] = useState<PartnershipCommitmentEntry | 'new'>()
  const currentCommitment = detail.commitments.find((entry) => entry.isCurrent)
  const calls = cashFlows.filter((flow) => flow.kind === 'CAPITAL_CALL').reduce((total, flow) => total + Number(flow.amount), 0)
  const distributions = cashFlows.filter((flow) => flow.kind === 'DISTRIBUTION').reduce((total, flow) => total + Number(flow.amount), 0)
  const recallable = cashFlows.filter((flow) => flow.kind === 'RECALLABLE_DISTRIBUTION').reduce((total, flow) => total + Number(flow.amount), 0)
  return <div className="space-y-6"><section aria-label="Investment position"><div className="mb-3 flex flex-wrap justify-between gap-2"><h2 className="text-sm font-semibold text-slate-950">Current investment position</h2><p className="text-xs text-slate-500">Operational data, as of {date(summary.performanceAsOfDate)}</p></div><div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4"><MagicCard className="p-4"><FinancialMetric label="Total invested" value={cashFlows.length ? money(String(calls), true) : money(summary.totalCapitalContributions, true)} tone="outflow" note={`as of ${date(summary.performanceAsOfDate)} · all capital calls paid into the fund`} /></MagicCard><MagicCard className="p-4"><FinancialMetric label="Non-recallable distributions" value={cashFlows.length ? money(String(distributions)) : money(summary.totalDistributions)} tone="inflow" note="Permanent cash returned — used for DPI and TVPI" /><div className="mt-5"><FinancialMetric label="Recallable distributions" value={cashFlows.length ? money(String(recallable)) : null} tone="inflow" note="May be called again; excluded from DPI and TVPI" /></div></MagicCard><MagicCard className="p-4"><FinancialMetric label="Latest NAV / FMV" value={money(summary.latestNav?.amount)} note={summary.latestNav ? `as of ${date(summary.latestNav.date)} · most recent real valuation on file` : 'No valuation on file'} /></MagicCard><MagicCard className="p-4"><FinancialMetric label="Committed capital" value={money(summary.currentCommittedCapital?.amount)} note={summary.currentCommittedCapital ? `effective ${date(summary.currentCommittedCapital.date)}` : 'No commitment on file'} /><div className="mt-5"><FinancialMetric label="Unfunded commitment" value={money(summary.unfundedCommitmentAmount)} calculated /></div></MagicCard></div></section>
    <section><div className="mb-3 flex flex-wrap justify-between gap-2"><h2 className="text-sm font-semibold text-slate-950">Calculated performance</h2><p className="text-xs text-slate-500">Derived from cash activity and the latest valuation — not from K-1 tax data</p></div><MagicCard className="p-4"><div className="grid grid-cols-2 gap-5 lg:grid-cols-4"><FinancialMetric label="DPI" value={multiple(summary.dpi)} calculated /><FinancialMetric label="TVPI" value={multiple(summary.tvpi)} calculated /><FinancialMetric label="XIRR" value={percent(summary.irr)} calculated /><FinancialMetric label="Cash-on-cash yield" value={percent(summary.annualizedCashOnCashYield)} calculated /></div></MagicCard><div className="mt-3 flex gap-2"><MagicButton type="button" variant="secondary" onClick={() => onGo('cash-activity')}>View cash activity <ArrowRight className="h-4 w-4" /></MagicButton><MagicButton type="button" variant="ghost" onClick={() => onGo('valuations')}>View valuations <ArrowRight className="h-4 w-4" /></MagicButton></div></section>
    <MagicCard className="overflow-hidden"><div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-300 bg-slate-50 px-5 py-4"><div><h3 className="text-sm font-semibold text-slate-950">Financial commitment</h3><p className="mt-1 text-xs text-slate-500">Effective-dated commitment history. Amounts in USD.</p></div>{canEdit ? <MagicButton type="button" variant="secondary" onClick={() => setCommitmentDialog('new')}><Plus className="h-4 w-4" />Add entry</MagicButton> : null}</div><div className="grid grid-cols-1 gap-5 p-5 md:grid-cols-3"><FinancialMetric label="Current committed capital" value={money(currentCommitment?.amount)} note={currentCommitment ? `effective ${date(currentCommitment.effectiveDate)}` : 'No commitment on file'} /><FinancialMetric label="Invested to date" value={money(summary.totalCapitalContributions, true)} tone="outflow" note="Total of all capital calls" /><FinancialMetric label="Remaining / unfunded" value={money(summary.unfundedCommitmentAmount)} calculated /></div><div className="border-t border-slate-200"><div className="px-5 py-3"><h4 className="text-xs font-semibold text-slate-950">Commitment history</h4></div>{detail.commitments.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-y border-slate-200 bg-slate-100 text-[0.65rem] uppercase tracking-wide text-slate-600"><th className="px-5 py-2">Effective date</th><th className="px-5 py-2 text-right">Committed capital</th><th className="px-5 py-2">Source / note</th><th className="w-24 px-5 py-2"><span className="sr-only">Actions</span></th></tr></thead><tbody>{detail.commitments.map((entry) => <tr key={entry.id} className="border-b border-slate-200"><td className="px-5 py-2.5 font-mono text-xs">{date(entry.effectiveDate)}{entry.isCurrent ? <MagicStatusBadge className="ml-2" tone="success">Current</MagicStatusBadge> : null}</td><td className="px-5 py-2.5 text-right font-mono text-xs font-semibold">{money(entry.amount)}</td><td className="max-w-md truncate px-5 py-2.5 text-slate-600" title={entry.note ?? ''}>{entry.note ?? 'Source not recorded'}</td><td className="px-5 py-2.5 text-right">{canEdit && !entry.sourceCashFlowEventId ? <button type="button" aria-label={`Edit commitment effective ${entry.effectiveDate}`} onClick={() => setCommitmentDialog(entry)} className="grid min-h-8 min-w-8 place-items-center rounded text-slate-600 hover:bg-slate-100"><Pencil className="h-3.5 w-3.5" /></button> : null}</td></tr>)}</tbody></table></div> : <p className="px-5 pb-5 text-sm text-slate-500">No prior commitment amounts. The original commitment is still in effect.</p>}</div></MagicCard>
    <MagicCard className="p-5"><h3 className="text-sm font-semibold text-slate-950">Fund and owner details</h3><p className="mt-1 text-sm text-slate-500">Record-level profile. Edit these from the header above — commitment and history stay untouched.</p><div className="mt-4 grid gap-6 lg:grid-cols-2"><dl className="grid grid-cols-2 gap-x-5 gap-y-3 text-sm">{[['Owning legal entity', partnership.entity.name], ['Asset class', partnership.partnershipType], ['Fund manager', partnership.fundManager ?? 'Not on file'], ['Fund EIN', partnership.ein ?? 'Not on file'], ['Inception', date(partnership.inceptionDate)], ['Vintage year', partnership.inceptionDate?.slice(0,4) ?? 'Not available']].map(([label, value]) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-0.5 font-medium text-slate-900">{value}</dd></div>)}</dl><div className="rounded-md border border-slate-200 bg-slate-50 p-4"><h4 className="text-[0.65rem] font-semibold uppercase tracking-wide text-slate-600">Fund address</h4><address className="mt-2 text-sm not-italic leading-6 text-slate-800">{[partnership.addressLine1, partnership.addressLine2, [partnership.addressCity, partnership.addressRegion, partnership.addressPostalCode].filter(Boolean).join(', '), partnership.addressCountry].filter(Boolean).map((line) => <span key={line} className="block">{line}</span>)}{!partnership.addressLine1 && !partnership.addressCity ? 'Not on file' : null}</address></div></div></MagicCard>
    <MagicPatternRelationshipsPanel key={partnership.id} summary={summary} />
    {commitmentDialog ? <CommitmentDialog partnershipId={partnership.id} entry={commitmentDialog === 'new' ? undefined : commitmentDialog} onClose={() => setCommitmentDialog(undefined)} /> : null}
  </div>
}

function CashActivity({ detail, years, canEdit, drawerOpen, onDrawerOpenChange }: { detail: PartnershipTrackerDetail; years: Array<PartnershipTrackerYearDetail | undefined>; canEdit: boolean; drawerOpen: boolean; onDrawerOpenChange: (open: boolean) => void }) {
  const actions = usePartnershipTrackerActions()
  const flows = allCashFlows(years)
  const [filter, setFilter] = useState<'all' | K1TrackerCashFlowEvent['kind']>('all')
  const [removing, setRemoving] = useState<K1TrackerCashFlowEvent>()
  const visible = filter === 'all' ? flows : flows.filter((flow) => flow.kind === filter)
  const total = (kind: K1TrackerCashFlowEvent['kind']) => flows.filter((flow) => flow.kind === kind).reduce((sum, flow) => sum + Number(flow.amount), 0)
  const inKindLots = inKindLotsFor(flows)
  const inKindValue = inKindLots.reduce((sum, lot) => sum + lot.security.shares * lot.security.fmvPerShare, 0)
  const inKindBasis = inKindLots.reduce((sum, lot) => sum + lot.security.shares * lot.security.costBasisPerShare, 0)
  const labels: Record<K1TrackerCashFlowEvent['kind'], string> = { CAPITAL_CALL: 'Capital call', DISTRIBUTION: 'Non-recallable distribution', RECALLABLE_DISTRIBUTION: 'Recallable distribution' }
  return <div className="space-y-6"><MagicCard className="p-5"><div className="flex flex-wrap items-start justify-between gap-5"><div className="flex gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-800"><Radio className="h-4 w-4" /></span><div><h2 className="text-sm font-semibold text-slate-950">Live capital activity</h2><p className="mt-1 text-sm text-slate-600">Manager notices and dated entries post here as they arrive. The ledger is the source for operational performance.</p><p className="mt-1 font-mono text-xs text-slate-500">All tax years · USD</p></div></div><div className="grid grid-cols-2 gap-x-8 gap-y-4 lg:grid-cols-4"><FinancialMetric label="Capital called" value={money(String(total('CAPITAL_CALL')), true)} tone="outflow" note="Settled to date" /><FinancialMetric label="Non-recallable" value={money(String(total('DISTRIBUTION')))} tone="inflow" note="Counts toward DPI" /><FinancialMetric label="Recallable" value={money(String(total('RECALLABLE_DISTRIBUTION')))} tone="inflow" note="May be called again" /><FinancialMetric label="Received in kind" value={inKindLots.length ? money(String(inKindValue)) : null} note={inKindLots.length ? `Cost basis ${money(String(inKindBasis))}` : 'No in-kind distributions'} /></div></div></MagicCard>
    <MagicCard className="overflow-hidden"><div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-300 bg-slate-50 px-5 py-4"><div><h2 className="text-sm font-semibold text-slate-950">Cash activity</h2><p className="mt-1 text-xs text-slate-500">Operational ledger, all dates — the source for investment performance. Amounts in USD.</p></div>{canEdit ? <MagicButton type="button" onClick={() => onDrawerOpenChange(true)}><Plus className="h-4 w-4" />Add activity</MagicButton> : null}</div><div className="flex flex-wrap gap-2 border-b border-slate-200 px-4 py-2.5" role="group" aria-label="Filter cash activity">{([['all','All activity'],['CAPITAL_CALL','Capital calls'],['DISTRIBUTION','Non-recallable'],['RECALLABLE_DISTRIBUTION','Recallable']] as const).map(([value,label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`rounded-full border px-3 py-1 text-xs ${filter === value ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-slate-300 bg-white text-slate-700'}`}>{label} <span className="font-mono">{value === 'all' ? flows.length : flows.filter((flow) => flow.kind === value).length}</span></button>)}</div><div className="overflow-x-auto"><table className="w-full min-w-[56rem] text-left text-sm" aria-label="Cash activity: dated capital calls and distributions in USD"><thead><tr className="border-b border-slate-300 bg-slate-100 text-[0.65rem] font-semibold uppercase tracking-wide text-slate-600"><th className="px-4 py-2">Date</th><th className="px-4 py-2">Activity type</th><th className="px-4 py-2 text-right">Amount (USD)</th><th className="px-4 py-2">Source</th><th className="px-4 py-2">Note</th><th className="w-16 px-4 py-2"><span className="sr-only">Actions</span></th></tr></thead><tbody>{visible.map((flow, index) => { const parsed = extractActivitySource(flow.note); return <tr key={flow.id} className={`border-b border-slate-200 ${index % 2 ? 'bg-slate-50' : 'bg-white'}`}><td className="px-4 py-2.5 font-mono text-xs text-slate-700">{date(flow.activityDate)}</td><td className="px-4 py-2.5"><MagicStatusBadge tone={flow.kind === 'CAPITAL_CALL' ? 'danger' : 'success'}>{flow.kind === 'CAPITAL_CALL' ? '↗' : '↙'} {labels[flow.kind]}</MagicStatusBadge></td><td className={`px-4 py-2.5 text-right font-mono text-xs font-semibold ${flow.kind === 'CAPITAL_CALL' ? 'text-red-800' : 'text-emerald-700'}`}>{flow.kind === 'CAPITAL_CALL' ? money(flow.amount, true) : money(flow.amount)}</td><td className="max-w-[15rem] truncate px-4 py-2.5 text-slate-600" title={parsed.source}>{parsed.source}</td><td className="max-w-sm truncate px-4 py-2.5 text-slate-600" title={parsed.note}>{parsed.note}</td><td className="px-4 py-2.5">{canEdit ? <button type="button" aria-label={`Remove ${labels[flow.kind].toLowerCase()} from ${flow.activityDate}`} onClick={() => setRemoving(flow)} className="grid min-h-8 min-w-8 place-items-center rounded text-slate-500 hover:bg-red-50 hover:text-red-700"><Trash2 className="h-3.5 w-3.5" /></button> : null}</td></tr>})}{visible.length === 0 ? <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-slate-500">No capital activity matches this filter.</td></tr> : null}</tbody></table></div></MagicCard>
    <MagicPatternInKindPositionsCard events={flows} />
    {drawerOpen ? <MagicPatternCashActivityDrawer open onClose={() => onDrawerOpenChange(false)} partnershipId={detail.summary.partnership.id} fundName={detail.summary.partnership.name} existingYears={detail.years.map((year) => year.taxYear)} /> : null}
    <MagicConfirmDialog open={Boolean(removing)} title={removing ? `Remove the ${labels[removing.kind].toLowerCase()} dated ${date(removing.activityDate)}?` : 'Remove activity?'} description={<>The dated activity will be removed and performance figures will be recalculated without it.</>} confirmLabel="Remove activity" pending={actions.deleteCashFlow.isPending} onClose={() => setRemoving(undefined)} onConfirm={async () => { if (!removing) return; await actions.deleteCashFlow.mutateAsync({ id: detail.summary.partnership.id, year: removing.taxYear, cashFlowId: removing.id, expectedUpdatedAt: removing.updatedAt }); setRemoving(undefined) }} />
  </div>
}

function Valuations({ detail, canEdit }: { detail: PartnershipTrackerDetail; canEdit: boolean }) {
  const actions = usePartnershipTrackerActions()
  const sorted = [...detail.navEntries].sort((a,b) => b.valuationDate.localeCompare(a.valuationDate))
  const [drawer, setDrawer] = useState<PartnershipNavEntry | 'new'>()
  const [removing, setRemoving] = useState<PartnershipNavEntry>()
  return <div className="space-y-4"><MagicPatternOperationalChart items={sorted} />
    <MagicCard className="overflow-hidden"><div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-300 bg-slate-50 px-5 py-4"><div><h2 className="text-sm font-semibold text-slate-950">NAV / FMV valuations</h2><p className="mt-1 text-xs text-slate-500">Dated valuation history. The latest real valuation drives performance. Amounts in USD.</p></div>{canEdit ? <MagicButton type="button" onClick={() => setDrawer('new')}><Plus className="h-4 w-4" />Add valuation</MagicButton> : null}</div><div className="overflow-x-auto"><table className="w-full min-w-[60rem] text-left text-sm"><thead><tr className="border-b border-slate-300 bg-slate-100 text-[0.65rem] font-semibold uppercase tracking-wide text-slate-600"><th className="px-4 py-2">Valuation date</th><th className="px-4 py-2 text-right">NAV / FMV (USD)</th><th className="px-4 py-2 text-right">Change</th><th className="px-4 py-2">Source</th><th className="px-4 py-2">Recorded</th><th className="px-4 py-2">Note</th><th className="w-24 px-4 py-2"><span className="sr-only">Actions</span></th></tr></thead><tbody>{sorted.map((entry,index) => { const next = sorted[index+1]; const delta = next && Number(next.amount) !== 0 ? (Number(entry.amount)-Number(next.amount))/Number(next.amount) : null; return <tr key={entry.id} className={`border-b border-slate-200 ${index === 0 ? 'bg-blue-50' : 'bg-white'}`}><td className="px-4 py-2.5 font-mono text-xs">{date(entry.valuationDate)}{index === 0 ? <MagicStatusBadge className="ml-2" tone="info">Latest</MagicStatusBadge> : null}</td><td className="px-4 py-2.5 text-right font-mono text-xs font-semibold">{money(entry.amount)}</td><td className={`px-4 py-2.5 text-right font-mono text-xs ${delta != null && delta < 0 ? 'text-red-800' : 'text-slate-700'}`}>{delta == null ? '—' : `${(delta*100).toFixed(1)}%`}</td><td className="px-4 py-2.5"><MagicStatusBadge tone={entry.sourceType === 'manager_statement' ? 'success' : 'info'}>{sourceLabel(entry)}</MagicStatusBadge></td><td className="px-4 py-2.5 font-mono text-xs text-slate-700">{date(entry.createdAt.slice(0,10))}</td><td className="max-w-sm truncate px-4 py-2.5 text-slate-600" title={noteWithoutSource(entry)}>{noteWithoutSource(entry)}</td><td className="px-4 py-2.5"><div className="flex justify-end gap-1">{canEdit ? <><button type="button" aria-label={`Edit valuation dated ${entry.valuationDate}`} onClick={() => setDrawer(entry)} className="grid min-h-8 min-w-8 place-items-center rounded text-slate-600 hover:bg-white"><Pencil className="h-3.5 w-3.5" /></button><button type="button" aria-label={`Remove valuation dated ${entry.valuationDate}`} onClick={() => setRemoving(entry)} className="grid min-h-8 min-w-8 place-items-center rounded text-red-700 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></button></> : null}</div></td></tr>})}{sorted.length === 0 ? <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-slate-500">No NAV or FMV on file. TVPI and IRR remain unavailable until a valuation is recorded.</td></tr> : null}</tbody></table></div></MagicCard>
    {drawer ? <MagicPatternValuationDrawer key={drawer === 'new' ? 'new' : drawer.id} open onClose={() => setDrawer(undefined)} partnershipId={detail.summary.partnership.id} fundName={detail.summary.partnership.name} entry={drawer === 'new' ? undefined : drawer} /> : null}
    <MagicConfirmDialog open={Boolean(removing)} title={removing ? `Remove the valuation dated ${date(removing.valuationDate)}?` : 'Remove valuation?'} description={<>The valuation will be removed from history. Performance metrics will fall back to the next most recent value.</>} confirmLabel="Remove valuation" pending={actions.deleteNav.isPending} onClose={() => setRemoving(undefined)} onConfirm={async () => { if (!removing) return; await actions.deleteNav.mutateAsync({ id: detail.summary.partnership.id, entryId: removing.id, expectedUpdatedAt: removing.updatedAt }); setRemoving(undefined) }} />
  </div>
}

export function MagicPatternPartnershipWorkspace({
  detail,
  canEdit,
  area,
  selectedYear,
  onAreaChange,
  onYearChange,
  onBack,
  onDeleted,
}: {
  detail: PartnershipTrackerDetail
  canEdit: boolean
  area: MagicWorkspaceArea
  selectedYear?: number
  onAreaChange: (area: MagicWorkspaceArea) => void
  onYearChange: (year: number) => void
  onBack: () => void
  onDeleted: () => void
}) {
  const actions = usePartnershipTrackerActions()
  const partnership = detail.summary.partnership
  const yearQueries = useQueries({ queries: detail.years.map((year) => ({ queryKey: partnershipTrackerKeys.year(partnership.id, year.taxYear), queryFn: () => partnershipTrackerClient.getYear(partnership.id, year.taxYear) })) })
  const years = yearQueries.map((query) => query.data)
  const cashCount = allCashFlows(years).length
  const [editing, setEditing] = useState(false)
  const [activityOpen, setActivityOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<string>()
  const [dirty, setDirty] = useState(false)
  return <div className="-m-4 min-h-[calc(100vh-4rem)] space-y-5 bg-[#e7edf4] p-4 pb-10 sm:-m-6 sm:p-6 lg:-m-8 lg:p-8" data-testid="magic-partnership-workspace"><MagicButton type="button" variant="ghost" className="px-2" onClick={onBack}><ArrowLeft className="h-4 w-4" />All partnerships</MagicButton><WorkspaceHeader detail={detail} canEdit={canEdit} onEdit={() => setEditing(true)} onActivity={() => { onAreaChange('cash-activity'); setActivityOpen(true) }} onDelete={() => { setDeleteError(undefined); setDeleteOpen(true) }} /><WorkspaceNav area={area} counts={{ cash: cashCount, nav: detail.navEntries.length, k1: detail.years.length }} onChange={onAreaChange} />
    <main aria-label="Selected partnership workspace">{area === 'overview' ? <Overview detail={detail} cashFlows={allCashFlows(years)} canEdit={canEdit} onGo={onAreaChange} /> : area === 'cash-activity' ? <CashActivity detail={detail} years={years} canEdit={canEdit} drawerOpen={activityOpen} onDrawerOpenChange={setActivityOpen} /> : area === 'valuations' ? <Valuations detail={detail} canEdit={canEdit} /> : area === 'k1-history' ? <div className="magic-k1-shell"><K1BasisWorkspace appearance="magic-pattern" detail={detail} selectedYear={selectedYear} canEdit={canEdit} onSelectYear={onYearChange} onDirtyChange={setDirty} /></div> : <MagicPatternUnderlyingAssets partnershipId={partnership.id} partnershipName={partnership.name} canEdit={canEdit} onOpenRelationships={() => onAreaChange('overview')} />}</main>
    {editing ? <MagicPatternPartnershipRecordDialog open mode="edit" summary={detail.summary} onClose={() => setEditing(false)} /> : null}
    <MagicConfirmDialog open={deleteOpen} title={`Delete ${partnership.name}?`} description={<>{deleteError ? <p className="mb-2 font-semibold">{deleteError}</p> : null}<p>This removes the {partnership.entity.name} record along with its commitment history, cash activity, valuations, and K-1 tax years. This cannot be undone.</p></>} confirmLabel="Delete partnership" pending={actions.deletePartnership.isPending} onClose={() => setDeleteOpen(false)} onConfirm={async () => { try { await actions.deletePartnership.mutateAsync(partnership.id); onDeleted() } catch { setDeleteError('The partnership could not be deleted.') } }} />
    {dirty ? <span className="sr-only" aria-live="polite">K-1 changes are not yet saved.</span> : null}
  </div>
}
