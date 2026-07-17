import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ExternalLink, FileDown, GripVertical, Minus, Plus } from 'lucide-react'
import { Fragment, useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type {
  PartnershipAggregateGroup,
  PartnershipAggregateRow,
  PartnershipAggregationDirection,
  PartnershipAggregationPageInfo,
  PartnershipAggregationPageSize,
  PartnershipAggregationSort,
  PartnershipPortfolioRollup,
} from '../../../../../../../packages/types/src/partnership-tracker'
import { formatLedgerDate, formatMultiple, formatPercent, formatWholeMoney, humanizeCode } from './aggregationFormatters'
import { PartnershipLedgerPdfExportDialog } from './PartnershipLedgerPdfExportDialog'
import { partnershipLedgerColumns, type PartnershipLedgerColumn, type PartnershipLedgerColumnId } from './partnershipAggregationColumns'

interface PartnershipAggregationTableProps {
  items: PartnershipAggregateGroup[]
  rollup: PartnershipPortfolioRollup
  sort: PartnershipAggregationSort
  direction: PartnershipAggregationDirection
  pageInfo: PartnershipAggregationPageInfo
  onSort: (sort: PartnershipAggregationSort) => void
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: PartnershipAggregationPageSize) => void
}

const qualityStyles = {
  COMPLETE: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20',
  MISSING_DATA: 'bg-amber-50 text-amber-900 ring-amber-600/20',
  WARNINGS: 'bg-red-50 text-red-800 ring-red-600/20',
} as const

const lifecycleStyles: Record<string, string> = {
  ACTIVE: 'text-emerald-800',
  PENDING: 'text-amber-800',
  CLOSED: 'text-gray-500',
  LIQUIDATED: 'text-gray-600',
}

const defaultColumnWidths = partnershipLedgerColumns.reduce((widths, column) => {
  widths[column.id] = column.width
  return widths
}, {} as Record<PartnershipLedgerColumnId, number>)

function MissingValue({ reason }: { reason: string }) {
  return <span className="block text-xs leading-4 text-gray-400"><span aria-hidden="true">-</span><span className="sr-only">Not available: </span> {reason}</span>
}

function MoneyCell({ value, missing = 'No data' }: { value: string | null | undefined; missing?: string }) {
  const formatted = formatWholeMoney(value)
  return formatted ? <span className="font-mono text-sm tabular-nums text-gray-900">{formatted}</span> : <MissingValue reason={missing} />
}

function RatioCell({ value, status, percent = false }: { value: string | null | undefined; status: string; percent?: boolean }) {
  const formatted = percent ? formatPercent(value) : formatMultiple(value)
  return formatted ? <span className="font-mono text-sm tabular-nums text-gray-900">{formatted}</span> : <MissingValue reason={humanizeCode(status)} />
}

function memberCellContent(row: PartnershipAggregateRow, column: PartnershipLedgerColumn): ReactNode {
  switch (column.id) {
    case 'partnership':
      return <Link to={`/partnership-tracker?partnership=${encodeURIComponent(row.partnership.id)}`} className="inline-flex min-h-11 max-w-full items-center gap-2 font-semibold text-gray-950 underline decoration-atlas-gold decoration-2 underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-atlas-gold focus-visible:ring-offset-2"><span className="truncate">{row.partnership.name}</span><ExternalLink className="h-3.5 w-3.5 shrink-0 text-gray-400" /></Link>
    case 'owner': return <span className="block truncate" title={row.partnership.entity.name}>{row.partnership.entity.name}</span>
    case 'type': return row.partnership.partnershipType
    case 'lifecycle': return <span className={`text-xs font-bold tracking-wide ${lifecycleStyles[row.partnership.status] ?? 'text-gray-700'}`}>{humanizeCode(row.partnership.status)}</span>
    case 'workflow': return row.latestWorkflowStatus ? humanizeCode(row.latestWorkflowStatus) : 'No K-1 year'
    case 'commitment': return <MoneyCell value={row.currentCommittedCapital?.amount} missing="No commitment" />
    case 'paidIn': return <MoneyCell value={row.totalCapitalContributions} missing="No paid-in data" />
    case 'distributions': return <MoneyCell value={row.totalDistributions ?? '0.00'} />
    case 'nav': return <><MoneyCell value={row.latestNav?.amount} missing="No NAV" />{row.latestNav && <span className="mt-1 block text-[0.68rem] text-gray-400">{formatLedgerDate(row.latestNav.date)}</span>}</>
    case 'unfunded': return <MoneyCell value={row.unfundedCommitmentAmount} missing={humanizeCode(row.performanceStatus.unfundedCommitment)} />
    case 'dpi': return <RatioCell value={row.dpi} status={row.performanceStatus.dpi} />
    case 'tvpi': return <RatioCell value={row.tvpi} status={row.performanceStatus.tvpi} />
    case 'irr': return <RatioCell value={row.irr} status={row.performanceStatus.irr} percent />
    case 'taxYear': return row.latestTaxYear ?? <MissingValue reason="No K-1 year" />
    case 'warnings': return row.warningCount
    case 'quality': return <span className={`inline-flex rounded-sm px-2 py-1 text-[0.68rem] font-bold uppercase tracking-wide ring-1 ring-inset ${qualityStyles[row.dataQuality]}`}>{humanizeCode(row.dataQuality)}</span>
  }
}

function GroupPartnershipCell({ group, expanded, onToggle }: { group: PartnershipAggregateGroup; expanded: boolean; onToggle: () => void }) {
  const singleMember = group.members.length === 1 ? group.members[0] : undefined
  const recordLabel = `${group.members.length} owner ${group.members.length === 1 ? 'record' : 'records'}`
  return <div className="flex min-h-11 items-center gap-2">
    <button
      type="button"
      aria-expanded={expanded}
      aria-controls={`partnership-owner-rows-${encodeURIComponent(group.groupKey)}`}
      aria-label={`${expanded ? 'Collapse' : 'Expand'} ${group.name} owner details`}
      title={`${expanded ? 'Collapse' : 'Expand'} owner details`}
      onClick={(event) => { event.stopPropagation(); onToggle() }}
      className={`grid min-h-11 min-w-11 shrink-0 place-items-center rounded-sm border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-atlas-gold focus-visible:ring-offset-2 ${expanded ? 'border-atlas-gold bg-atlas-gold/15 text-gray-950' : 'border-gray-300 bg-white text-gray-500 hover:border-gray-500 hover:text-gray-950'}`}
    >
      {expanded ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
    </button>
    <div className="min-w-0 py-1">
      {singleMember
        ? <Link onClick={(event) => event.stopPropagation()} to={`/partnership-tracker?partnership=${encodeURIComponent(singleMember.partnership.id)}`} className="inline-flex min-h-11 max-w-full items-center gap-2 font-semibold text-gray-950 underline decoration-atlas-gold decoration-2 underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-atlas-gold focus-visible:ring-offset-2"><span className="truncate">{group.name}</span><ExternalLink className="h-3.5 w-3.5 shrink-0 text-gray-400" /></Link>
        : <span className="block truncate font-semibold text-gray-950" title={group.name}>{group.name}</span>}
      <span className="mt-0.5 block text-[0.68rem] font-medium uppercase tracking-[0.08em] text-gray-400">{recordLabel}</span>
    </div>
  </div>
}

function groupedStatus(values: string[], empty: string) {
  if (!values.length) return <MissingValue reason={empty} />
  if (values.length === 1) return humanizeCode(values[0])
  return <span title={values.map(humanizeCode).join(', ')} className="font-semibold text-gray-700">Mixed <span className="text-xs text-gray-400">({values.length})</span></span>
}

function groupCellContent(group: PartnershipAggregateGroup, column: PartnershipLedgerColumn): ReactNode {
  const singleMember = group.members.length === 1 ? group.members[0] : undefined
  const navRange = group.totals.navValuationRange
  switch (column.id) {
    case 'partnership': return null
    case 'owner': return <span className="font-semibold text-gray-800">{group.ownerCount} {group.ownerCount === 1 ? 'owner' : 'owners'}</span>
    case 'type': return group.partnershipType
    case 'lifecycle': return groupedStatus(group.lifecycleStatuses, 'No lifecycle status')
    case 'workflow': return groupedStatus(group.workflowStatuses, 'No K-1 year')
    case 'commitment': return <MoneyCell value={group.totals.committedCapital.amount} missing="No commitment" />
    case 'paidIn': return <MoneyCell value={group.totals.paidInCapital.amount} missing="No paid-in data" />
    case 'distributions': return <MoneyCell value={group.totals.distributions.amount ?? '0.00'} />
    case 'nav': return <><MoneyCell value={group.totals.latestNav.amount} missing="No NAV" />{navRange.latest && <span className="mt-1 block text-[0.68rem] text-gray-400">{navRange.earliest && navRange.earliest !== navRange.latest ? `${formatLedgerDate(navRange.earliest)} - ` : ''}{formatLedgerDate(navRange.latest)}</span>}</>
    case 'unfunded': return <MoneyCell value={group.totals.unfundedCommitment.amount} missing="No unfunded commitment" />
    case 'dpi': return <RatioCell value={group.totals.dpi.value} status={group.totals.dpi.status} />
    case 'tvpi': return <RatioCell value={group.totals.tvpi.value} status={group.totals.tvpi.status} />
    case 'irr': return singleMember ? <RatioCell value={singleMember.irr} status={singleMember.performanceStatus.irr} percent /> : <MissingValue reason="See owner rows" />
    case 'taxYear': return group.latestTaxYear ?? <MissingValue reason="No K-1 year" />
    case 'warnings': return group.warningCount
    case 'quality': return <span className={`inline-flex rounded-sm px-2 py-1 text-[0.68rem] font-bold uppercase tracking-wide ring-1 ring-inset ${qualityStyles[group.dataQuality]}`}>{humanizeCode(group.dataQuality)}</span>
  }
}

function ColumnResizeHandle({ column, onResizeStart, onResizeByKeyboard }: { column: PartnershipLedgerColumn; onResizeStart: (event: ReactPointerEvent<HTMLButtonElement>, column: PartnershipLedgerColumn) => void; onResizeByKeyboard: (column: PartnershipLedgerColumn, delta: number) => void }) {
  return <button type="button" aria-label={`Resize ${column.label} column`} onPointerDown={(event) => onResizeStart(event, column)} onKeyDown={(event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    onResizeByKeyboard(column, (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 32 : 16))
  }} className="absolute right-0 top-1/2 grid h-8 w-5 -translate-y-1/2 translate-x-1/2 cursor-col-resize place-items-center rounded-sm text-gray-300 hover:bg-gray-200 hover:text-gray-700 focus-visible:text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atlas-gold focus-visible:ring-offset-1"><GripVertical className="h-3.5 w-3.5" /></button>
}

export function PartnershipAggregationTable({ items, rollup, sort, direction, pageInfo, onSort, onPageChange, onPageSizeChange }: PartnershipAggregationTableProps) {
  const [columnWidths, setColumnWidths] = useState<Record<PartnershipLedgerColumnId, number>>(() => ({ ...defaultColumnWidths }))
  const [exportOpen, setExportOpen] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set())
  const resizeCleanup = useRef<(() => void) | null>(null)

  useEffect(() => () => resizeCleanup.current?.(), [])

  const updateColumnWidth = useCallback((column: PartnershipLedgerColumn, nextWidth: number) => {
    setColumnWidths((current) => ({ ...current, [column.id]: Math.min(640, Math.max(column.minWidth, Math.round(nextWidth))) }))
  }, [])

  const startResize = useCallback((event: ReactPointerEvent<HTMLButtonElement>, column: PartnershipLedgerColumn) => {
    event.preventDefault()
    resizeCleanup.current?.()
    const startX = event.clientX
    const startWidth = columnWidths[column.id]
    const move = (moveEvent: PointerEvent) => updateColumnWidth(column, startWidth + moveEvent.clientX - startX)
    const end = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      resizeCleanup.current = null
    }
    resizeCleanup.current = end
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end, { once: true })
  }, [columnWidths, updateColumnWidth])

  const toggleGroup = useCallback((groupKey: string) => {
    setExpandedGroups((current) => {
      const next = new Set(current)
      if (next.has(groupKey)) next.delete(groupKey)
      else next.add(groupKey)
      return next
    })
  }, [])

  return (
    <section aria-labelledby="partnership-ledger-title" className="border border-gray-300 bg-white">
      <div className="flex flex-col gap-4 border-b border-gray-300 px-4 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-atlas-hover">Partnership ledger</p>
          <h2 id="partnership-ledger-title" className="mt-1 font-serif text-xl font-semibold text-gray-950">Comparable partnership records</h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs text-gray-500">Amounts are server-calculated; missing values remain explicit.</p>
          <button type="button" onClick={() => setExportOpen(true)} disabled={!items.length} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-800 shadow-sm disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atlas-gold"><FileDown className="h-4 w-4" />Export PDF</button>
        </div>
      </div>
      <div className="max-w-full overflow-x-auto overscroll-x-contain" data-testid="aggregation-table-viewport">
        <table className="min-w-[116rem] border-collapse text-left" style={{ width: `${partnershipLedgerColumns.reduce((total, column) => total + columnWidths[column.id], 0)}px`, tableLayout: 'fixed' }}>
          <colgroup>{partnershipLedgerColumns.map((column) => <col key={column.id} data-testid={`aggregation-column-${column.id}`} style={{ width: `${columnWidths[column.id]}px` }} />)}</colgroup>
          <thead className="bg-gray-50">
            <tr className="border-b border-gray-300">
              {partnershipLedgerColumns.map((column) => {
                const active = column.sort === sort
                return <th key={column.id} scope="col" aria-sort={column.sort ? (active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none') : undefined} className={`relative px-3 py-3 text-left text-[0.68rem] font-bold uppercase tracking-[0.12em] text-gray-600 ${column.id === 'partnership' ? 'sticky left-0 z-20 border-r border-gray-300 bg-gray-50 pl-5' : ''}`}>
                  {column.sort ? <button type="button" data-sort={column.sort} onClick={() => onSort(column.sort!)} className="inline-flex min-h-11 max-w-[calc(100%-0.5rem)] items-center gap-1 rounded-sm text-left outline-none hover:text-gray-950 focus-visible:ring-2 focus-visible:ring-atlas-gold focus-visible:ring-offset-2" aria-label={`Sort by ${column.label}${active ? `, currently ${direction === 'asc' ? 'ascending' : 'descending'}` : ''}`}><span className="truncate">{column.label}</span>{active ? direction === 'asc' ? <ArrowUp className="h-3.5 w-3.5 shrink-0" /> : <ArrowDown className="h-3.5 w-3.5 shrink-0" /> : <span aria-hidden="true" className="shrink-0 text-gray-300">+-</span>}</button> : <span className="inline-flex min-h-11 items-center">{column.label}</span>}
                  <ColumnResizeHandle column={column} onResizeStart={startResize} onResizeByKeyboard={(resizeColumn, delta) => updateColumnWidth(resizeColumn, columnWidths[resizeColumn.id] + delta)} />
                </th>
              })}
            </tr>
          </thead>
          <tbody>
            {items.map((group) => {
              const expanded = expandedGroups.has(group.groupKey)
              return <Fragment key={group.groupKey}>
                <tr aria-expanded={expanded} onClick={() => toggleGroup(group.groupKey)} className="group cursor-pointer border-b border-gray-200 bg-white transition-colors hover:bg-atlas-light">
                  {partnershipLedgerColumns.map((column) => column.id === 'partnership'
                    ? <th key={column.id} scope="row" className="sticky left-0 z-10 border-l-4 border-l-atlas-gold border-r border-gray-200 bg-white py-2 pl-3 pr-3 text-left group-hover:bg-atlas-light"><GroupPartnershipCell group={group} expanded={expanded} onToggle={() => toggleGroup(group.groupKey)} /></th>
                    : <td key={column.id} className={`px-3 py-3 text-sm text-gray-700 ${column.id === 'taxYear' || column.id === 'warnings' ? 'font-mono tabular-nums' : ''}`}>{groupCellContent(group, column)}</td>)}
                </tr>
                {expanded && group.members.map((member, memberIndex) => <tr id={memberIndex === 0 ? `partnership-owner-rows-${encodeURIComponent(group.groupKey)}` : undefined} key={member.partnership.id} className="border-b border-gray-100 bg-gray-50/80">
                  {partnershipLedgerColumns.map((column) => column.id === 'partnership'
                    ? <th key={column.id} scope="row" className="sticky left-0 z-10 border-l-4 border-l-atlas-gold/50 border-r border-gray-200 bg-gray-50 py-2 pl-5 pr-3 text-left"><div className="flex min-h-11 items-center gap-2 pl-9"><span aria-hidden="true" className="h-px w-4 shrink-0 bg-gray-300" /><Link to={`/partnership-tracker?partnership=${encodeURIComponent(member.partnership.id)}`} className="inline-flex min-h-11 max-w-full items-center gap-2 text-xs font-semibold text-gray-700 underline decoration-atlas-gold underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-atlas-gold focus-visible:ring-offset-2"><span className="truncate">Open owner record</span><ExternalLink className="h-3 w-3 shrink-0 text-gray-400" /><span className="sr-only"> for {group.name}, {member.partnership.entity.name}</span></Link></div></th>
                    : <td key={column.id} className={`px-3 py-2.5 text-xs text-gray-600 ${column.id === 'taxYear' || column.id === 'warnings' ? 'font-mono tabular-nums' : ''}`}>{memberCellContent(member, column)}</td>)}
                </tr>)}
              </Fragment>
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-4 border-t border-gray-300 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex min-h-11 items-center gap-2 text-sm text-gray-600">Rows per page
          <select value={pageInfo.pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value) as PartnershipAggregationPageSize)} className="min-h-11 rounded-md border border-gray-300 bg-white px-3 font-semibold text-gray-900 outline-none focus:border-atlas-gold focus:ring-2 focus:ring-atlas-gold/30">
            <option value={25}>25</option><option value={50}>50</option><option value={100}>100</option>
          </select>
        </label>
        <div className="flex items-center gap-3">
          <span className="text-sm tabular-nums text-gray-600">Page {pageInfo.page} of {Math.max(1, pageInfo.totalPages)}</span>
          <button type="button" aria-label="Previous page" disabled={!pageInfo.hasPreviousPage} onClick={() => onPageChange(pageInfo.page - 1)} className="grid min-h-11 min-w-11 place-items-center rounded-md border border-gray-300 bg-white text-gray-700 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atlas-gold"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" aria-label="Next page" disabled={!pageInfo.hasNextPage} onClick={() => onPageChange(pageInfo.page + 1)} className="grid min-h-11 min-w-11 place-items-center rounded-md border border-gray-300 bg-white text-gray-700 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atlas-gold"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
      <PartnershipLedgerPdfExportDialog open={exportOpen} rows={items} rollup={rollup} onClose={() => setExportOpen(false)} />
    </section>
  )
}
