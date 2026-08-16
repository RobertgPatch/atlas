import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Building2,
  ChevronDown,
  ChevronRight,
  Info,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react'
import { Fragment, useDeferredValue, useMemo, useState } from 'react'
import type {
  PartnershipAggregateGroup,
  PartnershipAggregationDirection,
  PartnershipAggregationQuery,
  PartnershipAggregationSort,
  PartnershipPortfolioRollup,
  PartnershipTrackerSummary,
} from '../../../../../../../packages/types/src/partnership-tracker'
import { PartnershipTrackerApiError } from '../../api/partnershipTrackerClient'
import { usePartnershipAggregation, usePartnershipTrackerActions } from '../../hooks/usePartnershipTracker'
import { MagicPatternPartnershipRecordDialog } from './MagicPatternPartnershipRecordDialog'
import {
  MagicButton,
  MagicCard,
  MagicConfirmDialog,
  MagicStatusBadge,
} from './MagicPatternPrimitives'

const defaultQuery: PartnershipAggregationQuery = {
  ownerIds: [],
  partnershipTypes: [],
  statuses: [],
  workflowStatuses: [],
  dataQuality: [],
  sort: 'partnership',
  direction: 'asc',
  page: 1,
  pageSize: 50,
}

const formatMoney = (value: string | null | undefined, compact = false) => {
  if (value == null || value === '') return null
  const number = Number(value)
  if (!Number.isFinite(number)) return null
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: compact ? 'compact' : 'standard',
    minimumFractionDigits: compact ? 0 : 2,
    maximumFractionDigits: compact ? 1 : 2,
  }).format(number)
}
const formatDate = (value: string | null | undefined) => value ? new Intl.DateTimeFormat('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`)) : 'Not available'
const formatMultiple = (value: string | null | undefined) => value == null ? null : `${Number(value).toFixed(2)}x`
const formatPercent = (value: string | null | undefined) => value == null ? null : `${(Number(value) * 100).toFixed(1)}%`
const humanize = (value: string) => value.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())

function CapitalTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <MagicCard className="p-4"><p className="text-sm text-slate-700">{label}</p><p className="mt-2 font-mono text-[1.72rem] font-semibold leading-none tracking-tight text-slate-950">{value}</p><p className="mt-3 text-xs text-slate-500">{detail}</p></MagicCard>
}

function RollupCard({ rollup }: { rollup: PartnershipPortfolioRollup }) {
  const excluded = rollup.latestNav.totalCount - rollup.latestNav.knownCount
  const metrics = [
    {
      label: 'Latest NAV rollup',
      value: formatMoney(rollup.latestNav.amount) ?? 'Not available',
      note: excluded > 0 ? `${excluded} owner record${excluded === 1 ? '' : 's'} excluded — no valuation on file` : `${rollup.latestNav.totalCount} records covered`,
      status: rollup.latestNav.amount == null ? null : 'Calculated',
      asOf: rollup.navValuationRange.latest ? `as of ${formatDate(rollup.navValuationRange.latest)}` : undefined,
    },
    { label: 'DPI', value: formatMultiple(rollup.dpi.value) ?? humanize(rollup.dpi.status), note: rollup.dpi.value == null ? 'Non-recallable distributions divided by paid-in capital' : `${formatMoney(rollup.distributions.amount) ?? '—'} distributed on ${formatMoney(rollup.paidInCapital.amount) ?? '—'} paid in`, status: rollup.dpi.value == null ? null : 'Calculated' },
    { label: 'TVPI', value: formatMultiple(rollup.tvpi.value) ?? '— No NAV on file', note: 'Distributions plus current value against capital deployed', status: rollup.tvpi.value == null ? null : 'Calculated' },
    { label: 'Annualized cash-on-cash', value: formatPercent(rollup.annualizedCashOnCashYield.value) ?? humanize(rollup.annualizedCashOnCashYield.status), note: 'Trailing twelve months, distributions of record', status: rollup.annualizedCashOnCashYield.value == null ? null : 'Calculated' },
  ]
  const stale = rollup.navValuationRange.latest != null && new Date(rollup.navValuationRange.latest) < new Date(new Date(rollup.asOfDate).setMonth(new Date(rollup.asOfDate).getMonth() - 6))
  return <MagicCard className="overflow-hidden p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-semibold text-slate-950">Portfolio rollup</h2><p className="mt-1 text-sm text-slate-500">Aggregated across {rollup.partnershipCount} funds and {rollup.ownerRecordCount} owner records in view · USD. Operational figures only — K-1 tax data is never a source here.</p></div>{stale ? <MagicStatusBadge tone="warning">Contains stale valuations</MagicStatusBadge> : null}</div><dl className="mt-5 grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 xl:grid-cols-4">{metrics.map((metric) => <div key={metric.label}><dt className="flex items-center gap-1 text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-slate-600">{metric.label}<Info className="h-3.5 w-3.5" /></dt><dd className="mt-2 font-mono text-xl font-semibold tabular-nums text-slate-950">{metric.value}</dd><dd className="mt-1 flex flex-wrap items-center gap-1.5">{metric.status ? <MagicStatusBadge tone="calculated">{metric.status}</MagicStatusBadge> : null}{metric.asOf ? <span className="text-xs text-slate-500">{metric.asOf}</span> : null}</dd><dd className="mt-1 text-xs leading-5 text-slate-600">{metric.note}</dd></div>)}</dl></MagicCard>
}

const columns = [
  ['fund', 'Fund', 250], ['owner', 'Owner', 185], ['type', 'Type', 135], ['lifecycle', 'Lifecycle', 118], ['workflow', 'K-1 workflow', 140], ['commitment', 'Commitment', 145], ['paidIn', 'Paid in', 145], ['distributions', 'Distributions', 145], ['nav', 'Latest NAV', 160], ['unfunded', 'Unfunded', 145], ['dpi', 'DPI', 90], ['tvpi', 'TVPI', 90], ['cashYield', 'Ann. COC', 105], ['actions', '', 86],
] as const

function workflowBadge(values: string[]) {
  const label = values.length === 0 ? 'Not started' : values.length > 1 ? 'Mixed' : humanize(values[0])
  const tone = values.some((value) => value === 'NEEDS_REVIEW') || values.length > 1 ? 'warning' : values.length > 0 && values.every((value) => value === 'RECONCILED') ? 'success' : values.some((value) => value === 'IN_PROGRESS') ? 'info' : 'neutral'
  return <MagicStatusBadge tone={tone}>{label}</MagicStatusBadge>
}

function lifecycleBadge(status: string) {
  return <MagicStatusBadge tone={status === 'ACTIVE' ? 'success' : status === 'PENDING' ? 'info' : 'neutral'}><span className={`mr-1 h-1.5 w-1.5 rounded-full ${status === 'ACTIVE' ? 'bg-emerald-500' : status === 'PENDING' ? 'bg-sky-500' : 'bg-slate-400'}`} />{humanize(status)}</MagicStatusBadge>
}

function Ledger({
  groups,
  sort,
  direction,
  onSort,
  onOpen,
  onEdit,
  onDelete,
}: {
  groups: PartnershipAggregateGroup[]
  sort: PartnershipAggregationSort
  direction: PartnershipAggregationDirection
  onSort: (value: PartnershipAggregationSort) => void
  onOpen: (id: string) => void
  onEdit: (summary: PartnershipTrackerSummary) => void
  onDelete: (summary: PartnershipTrackerSummary) => void
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const defaults = useMemo(() => Object.fromEntries(columns.map(([id, , width]) => [id, width])) as Record<string, number>, [])
  const [widths, setWidths] = useState(defaults)
  const changed = columns.some(([id, , width]) => widths[id] !== width)
  const toggle = (key: string) => setExpanded((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next })
  const resizeStart = (event: React.PointerEvent, id: string) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = widths[id]
    const move = (moveEvent: PointerEvent) => setWidths((current) => ({ ...current, [id]: Math.max(72, startWidth + moveEvent.clientX - startX) }))
    const end = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
  }
  const sortable = new Set(['fund', 'commitment', 'paidIn', 'distributions', 'nav', 'unfunded'])
  const sortMap: Record<string, PartnershipAggregationSort> = { fund: 'partnership', commitment: 'commitment', paidIn: 'paidIn', distributions: 'distributions', nav: 'nav', unfunded: 'unfunded' }
  const cell = (value: string | null, tone = 'text-slate-900') => <span className={`block truncate font-mono text-xs tabular-nums ${tone}`} title={value ?? 'Not available'}>{value ?? '—'}</span>
  return <MagicCard className="overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-300 bg-slate-50 px-4 py-2.5"><p className="text-xs text-slate-600">Funds held by several entities expand to a rollup — pick the owner you want to open. Drag a column edge to resize it; clipped values show in full on hover.</p>{changed ? <button type="button" onClick={() => setWidths(defaults)} className="text-xs font-semibold text-[#166534] underline underline-offset-2">Reset column widths</button> : null}</div><div className="overflow-x-auto"><table className="w-full min-w-[88rem] table-fixed border-collapse text-left text-sm" aria-label="Partnership records grouped by fund. Each fund row rolls up every owning entity beneath it; amounts are in USD. Column widths are adjustable."><colgroup>{columns.map(([id]) => <col key={id} style={{ width: widths[id] }} />)}</colgroup><thead className="bg-slate-100 text-[0.64rem] font-semibold uppercase tracking-[0.08em] text-slate-600"><tr className="border-b border-slate-300">{columns.map(([id, label, defaultWidth]) => <th key={id} scope="col" className={`relative px-3 py-2 ${['commitment','paidIn','distributions','nav','unfunded','dpi','tvpi','cashYield'].includes(id) ? 'text-right' : ''}`}><button type="button" disabled={!sortable.has(id)} onClick={() => sortable.has(id) && onSort(sortMap[id])} className="inline-flex min-h-8 max-w-full items-center gap-1 disabled:cursor-default"><span className="truncate">{label || <span className="sr-only">Record actions</span>}</span>{sortMap[id] === sort ? direction === 'asc' ? <ArrowUp className="h-3 w-3 shrink-0" /> : <ArrowDown className="h-3 w-3 shrink-0" /> : null}</button>{id !== 'actions' ? <span role="separator" aria-label={`Resize the ${label} column`} aria-orientation="vertical" tabIndex={0} onDoubleClick={() => setWidths((current) => ({ ...current, [id]: defaultWidth }))} onPointerDown={(event) => resizeStart(event, id)} onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setWidths((current) => ({ ...current, [id]: Math.max(72, current[id] + (event.key === 'ArrowRight' ? 12 : -12)) })) } }} className="absolute inset-y-0 right-0 w-2 cursor-col-resize border-r border-transparent hover:border-slate-400 focus:border-blue-600 focus:outline-none" /> : null}</th>)}</tr></thead><tbody>{groups.map((group) => {
    const multi = group.members.length > 1
    const open = expanded.has(group.groupKey)
    const primary = group.members[0]
    return <Fragment key={group.groupKey}><tr className="border-b border-slate-200 bg-white hover:bg-slate-50"><th scope="row" className="px-3 py-2.5"><div className="flex min-w-0 items-center gap-2">{multi ? <button type="button" aria-label={`${open ? 'Collapse' : 'Expand'} owner records for ${group.name}`} aria-expanded={open} onClick={() => toggle(group.groupKey)} className="grid h-6 w-6 shrink-0 place-items-center rounded border border-slate-300 text-slate-600 hover:bg-slate-100">{open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</button> : <span className="h-6 w-1 shrink-0 rounded-full bg-[#166534]" />}<button type="button" onClick={() => multi ? toggle(group.groupKey) : onOpen(primary.partnership.id)} className="min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"><span className="block truncate font-semibold text-slate-950" title={group.name}>{group.name}</span><span className="block truncate text-[0.62rem] font-normal uppercase tracking-wide text-slate-500" title={multi ? `Rollup of ${group.ownerCount} owners` : primary.partnership.fundManager ?? 'Manager not on file'}>{multi ? `Rollup of ${group.ownerCount} owners · ${open ? 'select an owner below' : 'expand to select an owner'}` : primary.partnership.fundManager ?? 'Manager not on file'}</span></button></div></th><td className="px-3 py-2.5">{multi ? <span className="block truncate text-sm font-semibold text-slate-800" title={group.members.map((member) => member.partnership.entity.name).join(', ')}>{group.ownerCount} owners</span> : <span className="block truncate text-sm text-slate-700" title={primary.partnership.entity.name}>{primary.partnership.entity.name}</span>}</td><td className="px-3 py-2.5"><span className="block truncate text-xs text-slate-700" title={group.partnershipType}>{group.partnershipType}</span></td><td className="px-3 py-2.5">{lifecycleBadge(group.lifecycleStatuses[0] ?? 'ACTIVE')}</td><td className="px-3 py-2.5">{workflowBadge(group.workflowStatuses)}</td><td className="px-3 py-2.5 text-right">{cell(formatMoney(group.totals.committedCapital.amount))}</td><td className="px-3 py-2.5 text-right">{cell(group.totals.paidInCapital.amount == null ? null : `(${formatMoney(group.totals.paidInCapital.amount)})`, 'text-red-800')}</td><td className="px-3 py-2.5 text-right">{cell(formatMoney(group.totals.distributions.amount), 'text-emerald-700')}</td><td className="px-3 py-2.5 text-right">{cell(formatMoney(group.totals.latestNav.amount))}<span className="block truncate text-right text-[0.62rem] text-slate-500">{group.totals.navValuationRange.latest ? `as of ${formatDate(group.totals.navValuationRange.latest)}` : 'No NAV'}</span></td><td className="px-3 py-2.5 text-right">{cell(formatMoney(group.totals.unfundedCommitment.amount))}</td><td className="px-3 py-2.5 text-right">{cell(formatMultiple(group.totals.dpi.value))}</td><td className="px-3 py-2.5 text-right">{cell(formatMultiple(group.totals.tvpi.value))}</td><td className="px-3 py-2.5 text-right">{cell(formatPercent(group.totals.annualizedCashOnCashYield.value))}</td><td className="px-3 py-2.5 text-right">{!multi ? <div className="flex justify-end gap-1"><button type="button" aria-label={`Edit ${primary.partnership.name} — ${primary.partnership.entity.name}`} onClick={() => onEdit(primary)} className="grid min-h-8 min-w-8 place-items-center rounded text-slate-600 hover:bg-slate-100"><Pencil className="h-3.5 w-3.5" /></button><button type="button" aria-label={`Delete ${primary.partnership.name} — ${primary.partnership.entity.name}`} onClick={() => onDelete(primary)} className="grid min-h-8 min-w-8 place-items-center rounded text-slate-600 hover:bg-red-50 hover:text-red-700"><Trash2 className="h-3.5 w-3.5" /></button></div> : null}</td></tr>{multi && open ? group.members.map((member) => <tr key={member.partnership.id} className="border-b border-slate-200 bg-slate-50/80"><th scope="row" className="px-3 py-2.5 pl-12"><span className="block truncate text-xs font-medium text-slate-600" title={member.partnership.fundManager ?? 'Manager not on file'}>{member.partnership.fundManager ?? 'Manager not on file'}</span></th><td className="px-3 py-2.5"><button type="button" onClick={() => onOpen(member.partnership.id)} className="block max-w-full truncate text-left text-sm font-semibold text-[#166534] underline decoration-emerald-300 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600" title={member.partnership.entity.name}>{member.partnership.entity.name}</button></td><td className="px-3 py-2.5 text-xs text-slate-600">{member.partnership.partnershipType}</td><td className="px-3 py-2.5">{lifecycleBadge(member.partnership.status)}</td><td className="px-3 py-2.5">{workflowBadge(member.latestWorkflowStatus ? [member.latestWorkflowStatus] : [])}</td><td className="px-3 py-2.5 text-right">{cell(formatMoney(member.currentCommittedCapital?.amount))}</td><td className="px-3 py-2.5 text-right">{cell(member.totalCapitalContributions == null ? null : `(${formatMoney(member.totalCapitalContributions)})`, 'text-red-800')}</td><td className="px-3 py-2.5 text-right">{cell(formatMoney(member.totalDistributions), 'text-emerald-700')}</td><td className="px-3 py-2.5 text-right">{cell(formatMoney(member.latestNav?.amount))}</td><td className="px-3 py-2.5 text-right">{cell(formatMoney(member.unfundedCommitmentAmount))}</td><td className="px-3 py-2.5 text-right">{cell(formatMultiple(member.dpi))}</td><td className="px-3 py-2.5 text-right">{cell(formatMultiple(member.tvpi))}</td><td className="px-3 py-2.5 text-right">{cell(formatPercent(member.annualizedCashOnCashYield))}</td><td className="px-3 py-2.5"><div className="flex justify-end gap-1"><button type="button" aria-label={`Edit ${member.partnership.name} — ${member.partnership.entity.name}`} onClick={() => onEdit(member)} className="grid min-h-8 min-w-8 place-items-center rounded text-slate-600 hover:bg-white"><Pencil className="h-3.5 w-3.5" /></button><button type="button" aria-label={`Delete ${member.partnership.name} — ${member.partnership.entity.name}`} onClick={() => onDelete(member)} className="grid min-h-8 min-w-8 place-items-center rounded text-slate-600 hover:bg-red-50 hover:text-red-700"><Trash2 className="h-3.5 w-3.5" /></button></div></td></tr>) : null}</Fragment>
  })}</tbody></table></div></MagicCard>
}

export function MagicPatternPartnershipIndex({ canEdit, onOpen }: { canEdit: boolean; onOpen: (id: string) => void }) {
  const actions = usePartnershipTrackerActions()
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search.trim())
  const [type, setType] = useState('all')
  const [status, setStatus] = useState('all')
  const [sort, setSort] = useState<PartnershipAggregationSort>('partnership')
  const [direction, setDirection] = useState<PartnershipAggregationDirection>('asc')
  const [page, setPage] = useState(1)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<PartnershipTrackerSummary>()
  const [deleting, setDeleting] = useState<PartnershipTrackerSummary>()
  const [deleteError, setDeleteError] = useState<string>()
  const query = useMemo<PartnershipAggregationQuery>(() => ({ ...defaultQuery, ...(deferredSearch ? { search: deferredSearch.slice(0, 200) } : {}), partnershipTypes: type === 'all' ? [] : [type as PartnershipAggregationQuery['partnershipTypes'][number]], statuses: status === 'all' ? [] : [status as PartnershipAggregationQuery['statuses'][number]], sort, direction, page }), [deferredSearch, direction, page, sort, status, type])
  const aggregation = usePartnershipAggregation(query)
  const data = aggregation.data
  const clearFilters = () => { setSearch(''); setType('all'); setStatus('all'); setPage(1) }
  const sortBy = (next: PartnershipAggregationSort) => { setPage(1); if (next === sort) setDirection((current) => current === 'asc' ? 'desc' : 'asc'); else { setSort(next); setDirection('asc') } }

  return <div className="-m-4 min-h-[calc(100vh-4rem)] space-y-6 bg-[#e7edf4] p-4 pb-10 sm:-m-6 sm:p-6 lg:-m-8 lg:p-8" data-testid="magic-partnership-index"><header className="flex flex-wrap items-start justify-between gap-5 border-b border-slate-300 pb-5"><div><h1 className="text-2xl font-semibold tracking-tight text-slate-950">Partnerships</h1><p className="mt-1 max-w-2xl text-sm leading-5 text-slate-600">Each fund rolls up every owning entity that holds it. Expand a fund to inspect the individual owner records behind the totals.</p></div>{canEdit ? <MagicButton type="button" onClick={() => setAdding(true)}><Plus className="h-4 w-4" />Add partnership</MagicButton> : null}</header>
    {data ? <><section aria-label="Capital totals" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"><CapitalTile label="Committed capital" value={formatMoney(data.rollup.committedCapital.amount, true) ?? 'Not available'} detail={`${data.rollup.partnershipCount} funds · ${data.rollup.ownerRecordCount} owner records`} /><CapitalTile label="Paid in to date" value={formatMoney(data.rollup.paidInCapital.amount, true) ?? 'Not available'} detail={`Unfunded ${formatMoney(data.rollup.unfundedCommitment.amount, true) ?? 'not available'}`} /><CapitalTile label="Distributions received" value={formatMoney(data.rollup.distributions.amount, true) ?? 'Not available'} detail={`${data.rollup.distributions.knownCount} of ${data.rollup.distributions.totalCount} records covered`} /><CapitalTile label="Unsettled activity" value="0" detail="Announced by the manager, not yet settled" /></section><RollupCard rollup={data.rollup} /></> : null}
    <MagicCard className="p-3"><div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between"><div className="flex flex-1 flex-wrap gap-3"><label className="relative block w-full sm:w-72"><span className="sr-only">Search partnerships</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Search fund, entity, manager, or EIN" className="min-h-10 w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#166534] focus:ring-2 focus:ring-[#166534]/15" /></label><select aria-label="Asset class" value={type} onChange={(event) => { setType(event.target.value); setPage(1) }} className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-[#166534] sm:w-52"><option value="all">All asset classes</option>{data?.facets.partnershipTypes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><select aria-label="Lifecycle" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }} className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-[#166534] sm:w-44"><option value="all">All statuses</option>{data?.facets.statuses.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>{search || type !== 'all' || status !== 'all' ? <MagicButton type="button" variant="ghost" onClick={clearFilters}>Clear filters</MagicButton> : null}</div><p className="text-xs text-slate-500">{data ? `Showing ${data.items.length} funds · ${data.rollup.ownerRecordCount} owner records · figures in USD` : 'Loading partnership count'}</p></div></MagicCard>
    {aggregation.isLoading ? <MagicCard className="p-6"><div className="h-24 animate-pulse rounded bg-slate-100 motion-reduce:animate-none" /></MagicCard> : aggregation.isError ? <MagicCard className="border-red-200 bg-red-50 p-6"><div className="flex gap-3 text-red-900"><AlertTriangle className="h-5 w-5 shrink-0" /><div><h2 className="font-semibold">The partnership ledger could not be loaded</h2><p className="mt-1 text-sm">{aggregation.error instanceof PartnershipTrackerApiError && aggregation.error.code === 'DATABASE_UNAVAILABLE' ? 'Partnerships need the configured database connection before they can load.' : 'There was a problem loading the partnership portfolio.'}</p></div></div><MagicButton type="button" variant="secondary" className="mt-4" onClick={() => void aggregation.refetch()}><RefreshCw className="h-4 w-4" />Try again</MagicButton></MagicCard> : data && data.items.length === 0 ? <MagicCard className="border-dashed px-6 py-14 text-center"><Building2 className="mx-auto h-8 w-8 text-slate-300" /><h2 className="mt-3 text-lg font-semibold text-slate-950">No partnerships match these filters</h2><MagicButton type="button" variant="secondary" className="mt-5" onClick={clearFilters}>Clear all filters</MagicButton></MagicCard> : data ? <><Ledger groups={data.items} sort={sort} direction={direction} onSort={sortBy} onOpen={onOpen} onEdit={setEditing} onDelete={setDeleting} />{data.pageInfo.totalPages > 1 ? <nav aria-label="Partnership pages" className="flex items-center justify-end gap-3"><MagicButton type="button" variant="secondary" disabled={!data.pageInfo.hasPreviousPage} onClick={() => setPage((current) => current - 1)}>Previous</MagicButton><span className="text-sm tabular-nums text-slate-600">Page {data.pageInfo.page} of {data.pageInfo.totalPages}</span><MagicButton type="button" variant="secondary" disabled={!data.pageInfo.hasNextPage} onClick={() => setPage((current) => current + 1)}>Next</MagicButton></nav> : null}</> : null}
    {adding ? <MagicPatternPartnershipRecordDialog open mode="create" onClose={() => setAdding(false)} onCreated={(id) => { setAdding(false); onOpen(id) }} /> : null}
    {editing ? <MagicPatternPartnershipRecordDialog open mode="edit" summary={editing} onClose={() => setEditing(undefined)} /> : null}
    <MagicConfirmDialog open={Boolean(deleting)} title={deleting ? `Delete the ${deleting.partnership.entity.name} record in ${deleting.partnership.name}?` : 'Delete partnership?'} description={<>{deleteError ? <p className="mb-2 font-semibold">{deleteError}</p> : null}<p>This removes one owner record and all subordinate commitment, cash activity, valuation, and K-1 history. Other owners of the same fund are unaffected.</p></>} confirmLabel="Delete owner record" pending={actions.deletePartnership.isPending} onClose={() => { setDeleting(undefined); setDeleteError(undefined) }} onConfirm={async () => { if (!deleting) return; try { await actions.deletePartnership.mutateAsync(deleting.partnership.id); setDeleting(undefined) } catch { setDeleteError('The owner record could not be deleted.') } }} />
  </div>
}
