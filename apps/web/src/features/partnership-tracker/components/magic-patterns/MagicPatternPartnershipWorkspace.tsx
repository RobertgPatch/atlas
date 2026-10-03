import {
  ArrowLeft,
  CalendarDays,
  Landmark,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { useId, useState } from 'react'
import type {
  PartnershipActivityDetail,
  PartnershipAggregationCoveredRatio,
  PartnershipCommitmentEntry,
  PartnershipNavEntry,
  PartnershipTrackerDetail,
} from '../../../../../../../packages/types/src/partnership-tracker'
import type { K1TrackerCashFlowEvent } from '../../../../../../../packages/types/src/k1-tracker'
import { normalizeCurrencyInput } from '../../../../components/shared/currencyInput'
import { PartnershipTrackerApiError } from '../../api/partnershipTrackerClient'
import { usePartnershipTrackerActions } from '../../hooks/usePartnershipTracker'
import { useEqualActionButtonWidths } from '../../hooks/useEqualActionButtonWidths'
import { MagicPatternActivitySummaryTable } from './MagicPatternActivitySummaryTable'
import { MagicPatternInvestmentPerformance } from './MagicPatternInvestmentPerformance'
import { MagicPatternInvestmentVisuals } from './MagicPatternInvestmentVisuals'
import { MagicPatternInKindPositionsCard } from './MagicPatternInKindPositionsCard'
import { MagicPatternOperationalChart } from './MagicPatternOperationalChart'
import { MagicPatternPartnershipRecordDialog } from './MagicPatternPartnershipRecordDialog'
import {
  MagicPatternCashActivityDrawer,
  MagicPatternValuationDrawer,
} from './MagicPatternOperationalDrawers'
import { capitalActivityLedger, formatLedgerMoney } from './capitalActivityLedger'
import { MagicPatternRelationshipsPanel } from './MagicPatternRelationshipsPanel'
import {
  MagicButton,
  MagicCard,
  MagicConfirmDialog,
  MagicModal,
  MagicStatusBadge,
  mpInputClass,
  mpLabelClass,
} from './MagicPatternPrimitives'

export type MagicWorkspaceArea = 'overview' | 'capital-activity' | 'k1-history' | 'underlying-assets'

const money = (value: string | null | undefined, negative = false) => {
  if (value == null || value === '') return null
  const amount = Number(value)
  if (!Number.isFinite(amount)) return null
  const formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(amount))
  return negative && amount !== 0 ? `(${formatted})` : formatted
}
const date = (value: string | null | undefined) => value ? new Intl.DateTimeFormat('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`)) : 'Not available'
const humanize = (value: string) => value.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
const sourceLabel = (entry: PartnershipNavEntry) => {
  const tagged = entry.note?.match(/^\[([^\]]+)\]/)?.[1]
  return tagged ?? humanize(entry.sourceType)
}
const noteWithoutSource = (entry: PartnershipNavEntry) => entry.note?.replace(/^\[[^\]]+\]\s*/, '') || '—'

function WorkspaceHeader({ detail, canEdit, onEdit }: { detail: PartnershipTrackerDetail; canEdit: boolean; onEdit: () => void }) {
  const partnership = detail.summary.partnership
  const tooltipId = useId()
  const [editTooltipOpen, setEditTooltipOpen] = useState(false)
  return <MagicCard>
    <div className="flex flex-wrap items-start justify-between gap-5 p-5">
      <div className="min-w-0 max-w-full">
        <div className="flex flex-wrap gap-2">
          <span className="rounded bg-slate-100 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-slate-700">{partnership.partnershipType}</span>
          <MagicStatusBadge tone={partnership.status === 'ACTIVE' ? 'success' : partnership.status === 'PENDING' ? 'info' : 'neutral'}>
            <span className={`mr-1 h-1.5 w-1.5 rounded-full ${partnership.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-sky-500'}`} />{humanize(partnership.status)}
          </MagicStatusBadge>
        </div>
        <div className="relative mt-2 flex items-center gap-1.5">
          <h1 className="min-w-0 break-words text-2xl font-semibold tracking-tight text-slate-950">{partnership.name}</h1>
          {canEdit ? <button
            type="button"
            aria-label="Edit partnership details"
            aria-describedby={editTooltipOpen ? tooltipId : undefined}
            onClick={() => { setEditTooltipOpen(false); onEdit() }}
            onMouseEnter={() => setEditTooltipOpen(true)}
            onMouseLeave={() => setEditTooltipOpen(false)}
            onFocus={() => setEditTooltipOpen(true)}
            onBlur={() => setEditTooltipOpen(false)}
            onKeyDown={(event) => { if (event.key === 'Escape') setEditTooltipOpen(false) }}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </button> : null}
          {canEdit && editTooltipOpen ? <span id={tooltipId} role="tooltip" className="pointer-events-none absolute left-0 top-full z-30 mt-1 rounded-md bg-slate-950 px-3 py-2 text-xs text-white shadow-lg">Edit partnership details</span> : null}
        </div>
        <p className="mt-1 text-sm text-slate-600"><Landmark className="mr-1 inline h-4 w-4" />Owned by <strong className="font-semibold text-slate-950">{partnership.entity.name}</strong></p>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-600">
          <span><CalendarDays className="mr-1 inline h-3.5 w-3.5" />Inception <strong className="ml-1 font-mono font-medium text-slate-800">{date(partnership.inceptionDate)}</strong></span>
          <span>Vintage <strong className="ml-1 font-mono font-medium text-slate-800">{partnership.inceptionDate?.slice(0, 4) ?? '—'}</strong></span>
          <span>Manager <strong className="ml-1 font-mono font-medium text-slate-800">{partnership.fundManager ?? 'Not on file'}</strong></span>
          <span>EIN <strong className="ml-1 font-mono font-medium text-slate-800">{partnership.ein ?? 'Not on file'}</strong></span>
        </div>
      </div>
    </div>
  </MagicCard>
}

export function WorkspaceNav({ area, counts, onChange }: { area: MagicWorkspaceArea; counts: { k1: number }; onChange: (area: MagicWorkspaceArea) => void }) {
  const investmentItems: Array<{ id: MagicWorkspaceArea; label: string; count?: number; disabled?: boolean }> = [{ id: 'capital-activity', label: 'Capital Activity' }]
  const k1Item = { id: 'k1-history' as const, label: 'K-1 History', count: counts.k1 }
  return <nav aria-label="Partnership sections" className="sticky -top-4 z-20 overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm sm:-top-6 lg:-top-8"><div className="flex w-full flex-wrap items-stretch"><span className="hidden items-center border-r border-slate-200 px-4 text-[0.6rem] font-semibold uppercase tracking-[0.13em] text-slate-500 xl:flex">Investment operations</span>{investmentItems.map((item) => <NavButton key={item.id} item={item} selected={area === item.id || area === 'overview'} onChange={onChange} />)}<span className="hidden items-center border-x border-slate-200 px-4 text-[0.6rem] font-semibold uppercase tracking-[0.13em] text-slate-500 xl:flex">Tax accounting</span><NavButton item={k1Item} selected={area === 'k1-history'} onChange={onChange} /></div></nav>
}

function NavButton({ item, selected, onChange }: { item: { id: MagicWorkspaceArea; label: string; count?: number; disabled?: boolean }; selected: boolean; onChange: (area: MagicWorkspaceArea) => void }) {
  return <button type="button" disabled={item.disabled} onClick={() => onChange(item.id)} className={`relative min-h-12 flex-auto px-3 text-sm font-medium xl:flex-none ${selected ? 'text-slate-950 after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-primary' : 'text-slate-600 hover:bg-slate-50'} disabled:cursor-not-allowed disabled:text-slate-500`}>{item.label}{item.count != null ? <span className={`ml-1.5 inline-grid h-5 min-w-5 place-items-center rounded-full px-1 text-[0.65rem] ${selected ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>{item.count}</span> : null}{item.disabled ? <MagicStatusBadge className="ml-2">Soon</MagicStatusBadge> : null}</button>
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

export function MagicPatternPartnershipDetails({ detail, canEdit }: { detail: PartnershipTrackerDetail; canEdit: boolean }) {
  const summary = detail.summary
  const partnership = summary.partnership
  const [commitmentDialog, setCommitmentDialog] = useState<PartnershipCommitmentEntry | 'new'>()
  return <div className="space-y-6">
    <MagicCard className="p-5"><h3 className="text-sm font-semibold text-slate-950">Fund and owner details</h3><p className="mt-1 text-sm text-slate-500">Record-level profile. Edit these from the header above — commitment and history stay untouched.</p><div className="mt-4 grid gap-6 lg:grid-cols-2"><dl className="grid grid-cols-2 gap-x-5 gap-y-3 text-sm">{[['Owning legal entity', partnership.entity.name], ['Asset class', partnership.partnershipType], ['Fund manager', partnership.fundManager ?? 'Not on file'], ['Fund EIN', partnership.ein ?? 'Not on file'], ['Inception', date(partnership.inceptionDate)], ['Vintage year', partnership.inceptionDate?.slice(0,4) ?? 'Not available']].map(([label, value]) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-0.5 font-medium text-slate-900">{value}</dd></div>)}</dl><div className="rounded-md border border-slate-200 bg-slate-50 p-4"><h4 className="text-[0.65rem] font-semibold uppercase tracking-wide text-slate-600">Fund address</h4><address className="mt-2 text-sm not-italic leading-6 text-slate-800">{[partnership.addressLine1, partnership.addressLine2, [partnership.addressCity, partnership.addressRegion, partnership.addressPostalCode].filter(Boolean).join(', '), partnership.addressCountry].filter(Boolean).map((line) => <span key={line} className="block">{line}</span>)}{!partnership.addressLine1 && !partnership.addressCity ? 'Not on file' : null}</address></div></div></MagicCard>
    <MagicPatternRelationshipsPanel key={partnership.id} summary={summary} />
    <MagicCard className="overflow-hidden"><div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-300 bg-slate-50 px-5 py-4"><div><h3 className="text-sm font-semibold text-slate-950">Financial commitment history</h3><p className="mt-1 text-xs text-slate-500">Effective-dated commitment records for this owner.</p></div>{canEdit ? <MagicButton type="button" variant="secondary" onClick={() => setCommitmentDialog('new')}><Plus className="h-4 w-4" />Add entry</MagicButton> : null}</div>{detail.commitments.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-slate-200 bg-slate-100 text-[0.65rem] uppercase tracking-wide text-slate-600"><th className="px-5 py-2">Effective date</th><th className="px-5 py-2 text-right">Committed capital</th><th className="px-5 py-2">Source / note</th><th className="w-24 px-5 py-2"><span className="sr-only">Actions</span></th></tr></thead><tbody>{detail.commitments.map((entry) => <tr key={entry.id} className="border-b border-slate-200"><td className="px-5 py-2.5 font-mono text-xs">{date(entry.effectiveDate)}{entry.isCurrent ? <MagicStatusBadge className="ml-2" tone="success">Current</MagicStatusBadge> : null}</td><td className="px-5 py-2.5 text-right font-mono text-xs font-semibold">{money(entry.amount)}</td><td className="max-w-md truncate px-5 py-2.5 text-slate-600" title={entry.note ?? ''}>{entry.note ?? 'Source not recorded'}</td><td className="px-5 py-2.5 text-right">{canEdit && !entry.sourceCashFlowEventId ? <button type="button" aria-label={`Edit commitment effective ${entry.effectiveDate}`} onClick={() => setCommitmentDialog(entry)} className="grid min-h-8 min-w-8 place-items-center rounded text-slate-600 hover:bg-slate-100"><Pencil className="h-3.5 w-3.5" /></button> : null}</td></tr>)}</tbody></table></div> : <p className="px-5 py-6 text-sm text-slate-500">No prior commitment amounts. The original commitment is still in effect.</p>}</MagicCard>
    {commitmentDialog ? <CommitmentDialog partnershipId={partnership.id} entry={commitmentDialog === 'new' ? undefined : commitmentDialog} onClose={() => setCommitmentDialog(undefined)} /> : null}
  </div>
}

function SettlementDialog({ entry, partnershipId, onClose }: { entry: K1TrackerCashFlowEvent; partnershipId: string; onClose: () => void }) {
  const actions = usePartnershipTrackerActions()
  const [settlementDate, setSettlementDate] = useState(new Date().toISOString().slice(0, 10))
  const [error, setError] = useState<string>()
  const pending = actions.settleCashFlow.isPending
  const announcementDate = entry.announcedDate ?? entry.activityDate
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(undefined)
    if (settlementDate < announcementDate) {
      setError('Settlement date cannot be before the announcement date.')
      return
    }
    try {
      await actions.settleCashFlow.mutateAsync({
        id: partnershipId,
        cashFlowId: entry.id,
        body: { settlementDate, expectedUpdatedAt: entry.updatedAt },
      })
      onClose()
    } catch (caught) {
      setError(caught instanceof PartnershipTrackerApiError && caught.isStale
        ? 'This activity changed while you were settling it. Review the refreshed ledger.'
        : 'The settlement could not be recorded.')
    }
  }
  return (
    <MagicModal
      open
      onClose={onClose}
      size="md"
      title="Settle announced activity"
      description={`Announced ${date(announcementDate)}. Settlement activates this amount in capital and performance calculations.`}
      footer={<><MagicButton type="button" variant="secondary" onClick={onClose} disabled={pending}>Cancel</MagicButton><MagicButton type="submit" form="magic-settle-cash-flow-form" disabled={pending}>{pending ? 'Settling…' : 'Mark as settled'}</MagicButton></>}
    >
      <form id="magic-settle-cash-flow-form" onSubmit={submit} className="space-y-4">
        <label className={mpLabelClass}>Settlement date <span className="text-red-700">*</span><input type="date" required min={announcementDate} value={settlementDate} onChange={(event) => setSettlementDate(event.target.value)} className={mpInputClass} /></label>
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-5 text-amber-950">The activity remains excluded through the announcement date and becomes effective on the settlement date.</p>
        {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      </form>
    </MagicModal>
  )
}

export function MagicPatternPartnershipCapitalActivity({ detail, portfolioItems, cashYieldCoverage, canEdit, drawerOpen, onDrawerOpenChange }: {
  detail: PartnershipActivityDetail
  portfolioItems?: PartnershipActivityDetail[]
  cashYieldCoverage?: PartnershipAggregationCoveredRatio
  canEdit: boolean
  drawerOpen: boolean
  onDrawerOpenChange: (open: boolean) => void
}) {
  const items = portfolioItems ?? [detail]
  const identities = new Map(items.map((item) => [item.summary.partnership.id, item.summary.partnership]))
  const [activityPartnershipId, setActivityPartnershipId] = useState('')
  const targetId = identities.has(activityPartnershipId) ? activityPartnershipId : items.length === 1 ? items[0].summary.partnership.id : ''
  const target = identities.get(targetId)
  const [commitmentOpen, setCommitmentOpen] = useState(false)
  const latestValuationIds = new Set(items.map((item) => [...item.navEntries].sort((a, b) => b.valuationDate.localeCompare(a.valuationDate))[0]?.id))
  const residuals = new Map(items.map((item) => [item.summary.partnership.id, item.investmentPerformance.residualValue]))
  const identityCell = (id: string) => portfolioItems ? <td className="px-4 py-2.5"><span className="block text-xs font-semibold text-slate-900">{identities.get(id)?.name}</span><span className="block text-xs text-slate-500">{identities.get(id)?.entity.name}</span></td> : null
  const actions = usePartnershipTrackerActions()
  const flows = [...detail.cashFlowEvents].sort((a, b) => a.activityDate.localeCompare(b.activityDate))
  const valuations = [...detail.navEntries].sort((a, b) => b.valuationDate.localeCompare(a.valuationDate))
  const settledFlows = flows.filter((flow) => flow.settlementStatus !== 'ANNOUNCED')
  const announcedFlows = flows.filter((flow) => flow.settlementStatus === 'ANNOUNCED')
  const [filter, setFilter] = useState<'all' | 'ANNOUNCED' | 'VALUATION' | K1TrackerCashFlowEvent['kind']>('all')
  const [removing, setRemoving] = useState<K1TrackerCashFlowEvent>()
  const [removingValuation, setRemovingValuation] = useState<PartnershipNavEntry>()
  const [editingCashFlow, setEditingCashFlow] = useState<K1TrackerCashFlowEvent>()
  const [editingValuation, setEditingValuation] = useState<PartnershipNavEntry>()
  const [settling, setSettling] = useState<K1TrackerCashFlowEvent>()
  const visibleFlows = filter === 'all'
    ? flows
    : filter === 'ANNOUNCED' ? announcedFlows : filter === 'VALUATION' ? [] : flows.filter((flow) => flow.kind === filter)
  const visibleValuations = filter === 'all' || filter === 'VALUATION' ? valuations : []
  const visible = [
    ...visibleFlows.map((entry) => ({ type: 'cash-flow' as const, date: entry.activityDate, entry })),
    ...visibleValuations.map((entry) => ({ type: 'valuation' as const, date: entry.valuationDate, entry })),
  ].sort((left, right) => left.date.localeCompare(right.date))
  const labels: Record<K1TrackerCashFlowEvent['kind'], string> = { CAPITAL_CALL: 'Capital call', DISTRIBUTION: 'Non-recallable distribution', RECALLABLE_DISTRIBUTION: 'Recallable distribution' }
  const ledgerAmounts = capitalActivityLedger(detail.cashFlowEvents, detail.investmentPerformance.residualValue, portfolioItems ? residuals : undefined)
  const filters = [
    ['all', 'All activity', flows.length + valuations.length],
    ['ANNOUNCED', 'Awaiting settlement', announcedFlows.length],
    ['CAPITAL_CALL', 'Capital calls', flows.filter((flow) => flow.kind === 'CAPITAL_CALL').length],
    ['DISTRIBUTION', 'Non-recallable', flows.filter((flow) => flow.kind === 'DISTRIBUTION').length],
    ['RECALLABLE_DISTRIBUTION', 'Recallable', flows.filter((flow) => flow.kind === 'RECALLABLE_DISTRIBUTION').length],
    ['VALUATION', 'Valuations', valuations.length],
  ] as const

  return <div className="space-y-6">
    <MagicPatternInvestmentPerformance portfolioCount={items.length} cashYieldCoverage={cashYieldCoverage} performance={detail.investmentPerformance} partnershipName={detail.summary.partnership.name} cashOnCashYield={detail.summary.annualizedCashOnCashYield} cashOnCashEndDate={detail.summary.partnership.finalLiquidationDate ?? detail.summary.performanceAsOfDate} />
    <MagicPatternInvestmentVisuals events={detail.cashFlowEvents} />
    <MagicCard className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-300 bg-slate-50 px-5 py-4"><div><h2 className="text-sm font-semibold text-slate-950">Capital activity</h2><p className="mt-1 text-xs text-slate-500">Oldest first. Net amounts deduct fees and carry; valuations and pending activity are excluded from cumulative net.</p></div>{canEdit ? <div className="flex flex-wrap items-center gap-2">
        {portfolioItems && items.length > 1 ? <select aria-label="Partnership for new activity" value={targetId} onChange={(event) => setActivityPartnershipId(event.target.value)} className={mpInputClass}><option value="">Select partnership to add activity</option>{items.map((item) => <option key={item.summary.partnership.id} value={item.summary.partnership.id}>{item.summary.partnership.name} — {item.summary.partnership.entity.name}</option>)}</select> : null}
        <MagicButton type="button" variant="secondary" disabled={!target} onClick={() => setCommitmentOpen(true)}>Update commitment</MagicButton>
        <MagicButton type="button" disabled={!target} onClick={() => onDrawerOpenChange(true)}><Plus className="h-4 w-4" />Add activity</MagicButton>
      </div> : null}</div>
      <div className="flex flex-wrap gap-2 border-b border-slate-200 px-4 py-2.5" role="group" aria-label="Filter capital activity">{filters.map(([value, label, count]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`rounded-full border px-3 py-1 text-xs ${filter === value ? 'border-primary bg-primary-subtle text-primary' : 'border-slate-300 bg-white text-slate-700'}`}>{label} <span className="font-mono">{count}</span></button>)}</div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[92rem] text-left text-sm" aria-label="Capital activity: dated capital calls, distributions, and valuations in USD">
          <thead>
            <tr className="border-b border-slate-300 bg-slate-100 text-[0.65rem] font-semibold uppercase tracking-wide text-slate-600">
              {portfolioItems ? <th className="px-4 py-2">Partnership / Owner</th> : null}<th className="px-4 py-2">Activity date</th>
              <th className="px-4 py-2">Activity type</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Gross Amount</th>
              <th className="px-4 py-2 text-right">Fees &amp; Carry</th>
              <th className="px-4 py-2 text-right">Net Amount</th>
              <th className="px-4 py-2 text-right">Cumulative Net</th>
              <th className="px-4 py-2 text-right">Net Incl. Residual</th>
              <th className="w-36 px-4 py-2"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row, index) => {
              if (row.type === 'valuation') {
                const entry = row.entry
                return (
                  <tr key={'valuation-' + entry.id} className={'border-b border-slate-200 ' + (latestValuationIds.has(entry.id) ? 'bg-blue-50' : index % 2 ? 'bg-slate-50' : 'bg-white')}>
                    {identityCell(entry.partnershipId)}<td className="px-4 py-2.5 font-mono text-xs text-slate-700">{date(entry.valuationDate)}{latestValuationIds.has(entry.id) ? <MagicStatusBadge className="ml-2" tone="info">Latest</MagicStatusBadge> : null}</td>
                    <td className="px-4 py-2.5"><MagicStatusBadge tone="info">Valuation</MagicStatusBadge></td>
                    <td className="px-4 py-2.5"><MagicStatusBadge tone="calculated">Recorded</MagicStatusBadge></td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold text-slate-900">{money(entry.amount)}<span className="mt-1 block font-sans font-normal text-slate-500">NAV / FMV</span></td>
                    <td className="px-4 py-2.5 text-right text-slate-400">—</td>
                    <td className="px-4 py-2.5 text-right text-slate-400">—</td>
                    <td className="px-4 py-2.5 text-right text-slate-400">—</td>
                    <td className="px-4 py-2.5 text-right text-slate-400">—</td>
                    <td className="px-4 py-2.5">
                      {canEdit ? <div className="flex items-center justify-end gap-1">
                        <button type="button" aria-label={'Edit valuation dated ' + entry.valuationDate} onClick={() => setEditingValuation(entry)} className="grid min-h-8 min-w-8 place-items-center rounded text-slate-600 hover:bg-white focus:outline-none focus:ring-2 focus:ring-focus focus:ring-offset-2"><Pencil className="h-3.5 w-3.5" /></button>
                        <button type="button" aria-label={'Remove valuation dated ' + entry.valuationDate} onClick={() => setRemovingValuation(entry)} className="grid min-h-8 min-w-8 place-items-center rounded text-red-700 hover:bg-white focus:outline-none focus:ring-2 focus:ring-focus focus:ring-offset-2"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div> : null}
                    </td>
                  </tr>
                )
              }

              const flow = row.entry
              const amounts = ledgerAmounts.get(flow.id)!
              const awaitingSettlement = flow.settlementStatus === 'ANNOUNCED'
              const amountTone = awaitingSettlement ? 'text-amber-900' : flow.kind === 'CAPITAL_CALL' ? 'text-red-800' : 'text-emerald-700'
              return (
                <tr key={'cash-flow-' + flow.id} className={'border-b border-slate-200 ' + (awaitingSettlement ? 'bg-amber-50/60' : index % 2 ? 'bg-slate-50' : 'bg-white')}>
                  {identityCell(flow.partnershipId)}<td className="px-4 py-2.5 font-mono text-xs text-slate-700">{date(flow.activityDate)}</td>
                  <td className="px-4 py-2.5"><MagicStatusBadge tone={flow.isFinalLiquidation ? 'info' : flow.kind === 'CAPITAL_CALL' ? 'danger' : 'success'}>{flow.isFinalLiquidation ? 'Liquidating Distribution' : <>{flow.kind === 'CAPITAL_CALL' ? '↗' : '↙'} {labels[flow.kind]}</>}</MagicStatusBadge></td>
                  <td className="px-4 py-2.5"><MagicStatusBadge tone={awaitingSettlement ? 'warning' : 'calculated'}>{awaitingSettlement ? 'Awaiting settlement' : 'Settled'}</MagicStatusBadge></td>
                  <td className={'px-4 py-2.5 text-right font-mono text-xs font-semibold tabular-nums ' + amountTone}>{formatLedgerMoney(amounts.gross)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-700">{formatLedgerMoney(amounts.feesAndCarry)}</td>
                  <td className={'px-4 py-2.5 text-right font-mono text-xs font-semibold tabular-nums ' + amountTone}>{formatLedgerMoney(amounts.net)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-800">{formatLedgerMoney(amounts.cumulativeNet)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-800">{formatLedgerMoney(amounts.netIncludingResidual)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      {canEdit && awaitingSettlement ? <button data-ui-button="" type="button" aria-label={'Settle ' + labels[flow.kind].toLowerCase() + ' announced ' + flow.activityDate} onClick={() => setSettling(flow)} className="min-h-8 rounded border border-emerald-300 bg-emerald-50 px-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-focus focus:ring-offset-2">Settle</button> : null}
                      {canEdit ? <button type="button" aria-label={'Edit ' + labels[flow.kind].toLowerCase() + ' from ' + flow.activityDate} onClick={() => setEditingCashFlow(flow)} className="grid min-h-8 min-w-8 place-items-center rounded text-slate-600 hover:bg-white focus:outline-none focus:ring-2 focus:ring-focus focus:ring-offset-2"><Pencil className="h-3.5 w-3.5" /></button> : null}
                      {canEdit ? <button type="button" aria-label={'Remove ' + labels[flow.kind].toLowerCase() + ' from ' + flow.activityDate} onClick={() => setRemoving(flow)} className="grid min-h-8 min-w-8 place-items-center rounded text-slate-500 hover:bg-red-50 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-focus focus:ring-offset-2"><Trash2 className="h-3.5 w-3.5" /></button> : null}
                    </div>
                  </td>
                </tr>
              )
            })}
            {visible.length === 0 ? <tr><td colSpan={portfolioItems ? 10 : 9} className="px-5 py-10 text-center text-sm text-slate-500">No activity matches this filter.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </MagicCard>
    <MagicPatternInKindPositionsCard events={settledFlows} />
    {drawerOpen && target ? <MagicPatternCashActivityDrawer key={target.id} open onClose={() => onDrawerOpenChange(false)} partnershipId={target.id} fundName={target.name} /> : null}
    {commitmentOpen && target ? <CommitmentDialog partnershipId={target.id} onClose={() => setCommitmentOpen(false)} /> : null}
    {editingCashFlow ? <MagicPatternCashActivityDrawer key={editingCashFlow.id} open onClose={() => setEditingCashFlow(undefined)} partnershipId={editingCashFlow.partnershipId} fundName={identities.get(editingCashFlow.partnershipId)?.name ?? "Partnership"} entry={editingCashFlow} /> : null}
    {editingValuation ? <MagicPatternValuationDrawer key={editingValuation.id} open onClose={() => setEditingValuation(undefined)} partnershipId={editingValuation.partnershipId} fundName={identities.get(editingValuation.partnershipId)?.name ?? "Partnership"} entry={editingValuation} /> : null}
    {settling ? <SettlementDialog entry={settling} partnershipId={settling.partnershipId} onClose={() => setSettling(undefined)} /> : null}
    <MagicConfirmDialog open={Boolean(removing)} title={removing ? `Remove the ${labels[removing.kind].toLowerCase()} dated ${date(removing.activityDate)}?` : 'Remove activity?'} description={<>{removing?.settlementStatus === 'ANNOUNCED' ? 'The announced activity will be removed without changing performance figures.' : 'The dated activity will be removed and performance figures will be recalculated without it.'}</>} confirmLabel="Remove activity" pending={actions.deleteCashFlow.isPending} onClose={() => setRemoving(undefined)} onConfirm={async () => { if (!removing) return; await actions.deleteCashFlow.mutateAsync({ id: removing.partnershipId, year: removing.taxYear, cashFlowId: removing.id, expectedUpdatedAt: removing.updatedAt }); setRemoving(undefined) }} />
    <MagicConfirmDialog open={Boolean(removingValuation)} title={removingValuation ? `Remove the valuation dated ${date(removingValuation.valuationDate)}?` : 'Remove valuation?'} description={<>The valuation will be removed from history. Performance metrics will fall back to the next most recent value.</>} confirmLabel="Remove valuation" pending={actions.deleteNav.isPending} onClose={() => setRemovingValuation(undefined)} onConfirm={async () => { if (!removingValuation) return; await actions.deleteNav.mutateAsync({ id: removingValuation.partnershipId, entryId: removingValuation.id, expectedUpdatedAt: removingValuation.updatedAt }); setRemovingValuation(undefined) }} />
  </div>
}


export function MagicPatternPartnershipValuations({ detail, canEdit }: { detail: PartnershipTrackerDetail; canEdit: boolean }) {
  const actions = usePartnershipTrackerActions()
  const sorted = [...detail.navEntries].sort((a,b) => b.valuationDate.localeCompare(a.valuationDate))
  const [drawer, setDrawer] = useState<PartnershipNavEntry | 'new'>()
  const [removing, setRemoving] = useState<PartnershipNavEntry>()
  const latest = sorted[0]
  const previous = sorted[1]
  const latestChange = latest && previous && Number(previous.amount) !== 0
    ? (Number(latest.amount) - Number(previous.amount)) / Number(previous.amount)
    : null
  const earliest = sorted.at(-1)
  const valuationSummaryRows = [
    { label: 'Latest NAV / FMV', value: latest ? money(latest.amount) ?? '— Not available' : '— Not available', basis: latest ? `Source: ${sourceLabel(latest)}` : 'No valuation on file', context: latest ? date(latest.valuationDate) : 'Not available', status: latest ? 'Latest' : 'Not available', statusTone: latest ? 'info' as const : 'neutral' as const },
    { label: 'Change from previous', value: latestChange == null ? '— Not available' : `${latestChange >= 0 ? '+' : ''}${(latestChange * 100).toFixed(1)}%`, basis: previous ? `Compared with ${money(previous.amount) ?? 'the prior valuation'}` : 'A second valuation is required for comparison', context: latest ? date(latest.valuationDate) : 'Not available', valueTone: latestChange != null && latestChange < 0 ? 'outflow' as const : 'inflow' as const },
    { label: 'Earliest valuation', value: earliest ? money(earliest.amount) ?? '— Not available' : '— Not available', basis: earliest ? `Source: ${sourceLabel(earliest)}` : 'No valuation history', context: earliest ? date(earliest.valuationDate) : 'Not available' },
    { label: 'Valuations on file', value: String(sorted.length), basis: sorted.length ? 'Dated NAV / FMV records in this partnership' : 'Add a manager statement or appraisal to begin', context: sorted.length ? `${date(earliest!.valuationDate)} – ${date(latest!.valuationDate)}` : 'Not available' },
  ]
  return <div className="space-y-4"><MagicPatternActivitySummaryTable title="Valuation summary" description="Dated NAV and fair-market-value aggregations for this partnership · USD." ariaLabel={`Valuation summary for ${detail.summary.partnership.name}`} basisInTooltip groups={[{ label: 'Valuation history', rows: valuationSummaryRows }]} />
    <MagicPatternOperationalChart items={sorted} />
    <MagicCard className="overflow-hidden"><div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-300 bg-slate-50 px-5 py-4"><div><h2 className="text-sm font-semibold text-slate-950">NAV / FMV valuations</h2><p className="mt-1 text-xs text-slate-500">Dated valuation history. The latest real valuation drives performance. Amounts in USD.</p></div>{canEdit ? <MagicButton type="button" onClick={() => setDrawer('new')}><Plus className="h-4 w-4" />Add valuation</MagicButton> : null}</div><div className="overflow-x-auto"><table className="w-full min-w-[60rem] text-left text-sm"><thead><tr className="border-b border-slate-300 bg-slate-100 text-[0.65rem] font-semibold uppercase tracking-wide text-slate-600"><th className="px-4 py-2">Valuation date</th><th className="px-4 py-2 text-right">NAV / FMV (USD)</th><th className="px-4 py-2 text-right">Change</th><th className="px-4 py-2">Source</th><th className="px-4 py-2">Recorded</th><th className="px-4 py-2">Note</th><th className="w-24 px-4 py-2"><span className="sr-only">Actions</span></th></tr></thead><tbody>{sorted.map((entry,index) => { const next = sorted[index+1]; const delta = next && Number(next.amount) !== 0 ? (Number(entry.amount)-Number(next.amount))/Number(next.amount) : null; return <tr key={entry.id} className={`border-b border-slate-200 ${index === 0 ? 'bg-blue-50' : 'bg-white'}`}><td className="px-4 py-2.5 font-mono text-xs">{date(entry.valuationDate)}{index === 0 ? <MagicStatusBadge className="ml-2" tone="info">Latest</MagicStatusBadge> : null}</td><td className="px-4 py-2.5 text-right font-mono text-xs font-semibold">{money(entry.amount)}</td><td className={`px-4 py-2.5 text-right font-mono text-xs ${delta != null && delta < 0 ? 'text-red-800' : 'text-slate-700'}`}>{delta == null ? '—' : `${(delta*100).toFixed(1)}%`}</td><td className="px-4 py-2.5"><MagicStatusBadge tone={entry.sourceType === 'manager_statement' ? 'success' : 'info'}>{sourceLabel(entry)}</MagicStatusBadge></td><td className="px-4 py-2.5 font-mono text-xs text-slate-700">{date(entry.createdAt.slice(0,10))}</td><td className="max-w-sm truncate px-4 py-2.5 text-slate-600" title={noteWithoutSource(entry)}>{noteWithoutSource(entry)}</td><td className="px-4 py-2.5"><div className="flex justify-end gap-1">{canEdit ? <><button type="button" aria-label={`Edit valuation dated ${entry.valuationDate}`} onClick={() => setDrawer(entry)} className="grid min-h-8 min-w-8 place-items-center rounded text-slate-600 hover:bg-white"><Pencil className="h-3.5 w-3.5" /></button><button type="button" aria-label={`Remove valuation dated ${entry.valuationDate}`} onClick={() => setRemoving(entry)} className="grid min-h-8 min-w-8 place-items-center rounded text-red-700 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></button></> : null}</div></td></tr>})}{sorted.length === 0 ? <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-slate-500">No NAV or FMV on file. TVPI and IRR remain unavailable until a valuation is recorded.</td></tr> : null}</tbody></table></div></MagicCard>
    {drawer ? <MagicPatternValuationDrawer key={drawer === 'new' ? 'new' : drawer.id} open onClose={() => setDrawer(undefined)} partnershipId={detail.summary.partnership.id} fundName={detail.summary.partnership.name} entry={drawer === 'new' ? undefined : drawer} /> : null}
    <MagicConfirmDialog open={Boolean(removing)} title={removing ? `Remove the valuation dated ${date(removing.valuationDate)}?` : 'Remove valuation?'} description={<>The valuation will be removed from history. Performance metrics will fall back to the next most recent value.</>} confirmLabel="Remove valuation" pending={actions.deleteNav.isPending} onClose={() => setRemoving(undefined)} onConfirm={async () => { if (!removing) return; await actions.deleteNav.mutateAsync({ id: detail.summary.partnership.id, entryId: removing.id, expectedUpdatedAt: removing.updatedAt }); setRemoving(undefined) }} />
  </div>
}

export function MagicPatternPartnershipWorkspace({ detail, canEdit, onBack }: {
  detail: PartnershipTrackerDetail
  canEdit: boolean
  area?: MagicWorkspaceArea
  selectedYear?: number
  onAreaChange?: (area: MagicWorkspaceArea) => void
  onYearChange?: (year: number) => void
  onBack: () => void
}) {
  const [editing, setEditing] = useState(false)
  const buttonWidthRef = useEqualActionButtonWidths()
  return <div ref={buttonWidthRef} className="-m-4 space-y-5 bg-[#e7edf4] p-4 pb-10 sm:-m-6 sm:p-6 lg:-m-8 lg:p-8" data-testid="magic-partnership-workspace">
    <MagicButton type="button" variant="ghost" className="px-2" onClick={onBack}><ArrowLeft className="h-4 w-4" />All Partnerships</MagicButton>
    <WorkspaceHeader detail={detail} canEdit={canEdit} onEdit={() => setEditing(true)} />
    <main aria-label="Selected partnership workspace"><MagicPatternPartnershipDetails detail={detail} canEdit={false} /></main>
    {editing ? <MagicPatternPartnershipRecordDialog open mode="edit" summary={detail.summary} onClose={() => setEditing(false)} /> : null}
  </div>
}
