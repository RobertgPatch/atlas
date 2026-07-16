import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import { Link } from 'react-router-dom'
import type {
  PartnershipAggregateRow,
  PartnershipAggregationDirection,
  PartnershipAggregationPageInfo,
  PartnershipAggregationPageSize,
  PartnershipAggregationSort,
} from '../../../../../../../packages/types/src/partnership-tracker'
import { formatExactMoney, formatLedgerDate, formatMultiple, formatPercent, humanizeCode } from './aggregationFormatters'

interface PartnershipAggregationTableProps {
  items: PartnershipAggregateRow[]
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

function MissingValue({ reason }: { reason: string }) {
  return <span className="block max-w-32 text-xs leading-4 text-gray-400"><span aria-hidden="true">—</span><span className="sr-only">Not available: </span> {reason}</span>
}

function MoneyCell({ value, missing }: { value: string | null | undefined; missing: string }) {
  const formatted = formatExactMoney(value)
  return formatted ? <span className="font-mono text-sm tabular-nums text-gray-900">{formatted}</span> : <MissingValue reason={missing} />
}

function RatioCell({ value, status, percent = false }: { value: string | null | undefined; status: string; percent?: boolean }) {
  const formatted = percent ? formatPercent(value) : formatMultiple(value)
  return formatted ? <span className="font-mono text-sm tabular-nums text-gray-900">{formatted}</span> : <MissingValue reason={humanizeCode(status)} />
}

function SortHeader({ label, value, active, direction, className = '' }: { label: string; value: PartnershipAggregationSort; active: boolean; direction: PartnershipAggregationDirection; className?: string }) {
  return (
    <th scope="col" aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'} className={`whitespace-nowrap px-3 py-3 text-left text-[0.68rem] font-bold uppercase tracking-[0.12em] text-gray-600 ${className}`}>
      <button type="button" data-sort={value} className="inline-flex min-h-11 items-center gap-1 rounded-sm outline-none hover:text-gray-950 focus-visible:ring-2 focus-visible:ring-atlas-gold focus-visible:ring-offset-2" aria-label={`Sort by ${label}${active ? `, currently ${direction === 'asc' ? 'ascending' : 'descending'}` : ''}`}>
        {label}
        {active ? direction === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" /> : <span aria-hidden="true" className="text-gray-300">↕</span>}
      </button>
    </th>
  )
}

export function PartnershipAggregationTable({ items, sort, direction, pageInfo, onSort, onPageChange, onPageSizeChange }: PartnershipAggregationTableProps) {
  const captureSort = (event: React.MouseEvent<HTMLTableSectionElement>) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button[data-sort]') : null
    if (target?.dataset.sort) onSort(target.dataset.sort as PartnershipAggregationSort)
  }

  return (
    <section aria-labelledby="partnership-ledger-title" className="border border-gray-300 bg-white">
      <div className="flex flex-col gap-2 border-b border-gray-300 px-4 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-atlas-hover">Partnership ledger</p>
          <h2 id="partnership-ledger-title" className="mt-1 font-serif text-xl font-semibold text-gray-950">Comparable partnership records</h2>
        </div>
        <p className="text-xs text-gray-500">Amounts are server-calculated; missing values remain explicit.</p>
      </div>
      <div className="max-w-full overflow-x-auto overscroll-x-contain" data-testid="aggregation-table-viewport">
        <table className="w-full min-w-[116rem] border-collapse text-left">
          <thead className="bg-gray-50" onClick={captureSort}>
            <tr className="border-b border-gray-300">
              <SortHeader label="Partnership" value="partnership" active={sort === 'partnership'} direction={direction} className="sticky left-0 z-20 min-w-56 border-r border-gray-300 bg-gray-50 pl-5" />
              <SortHeader label="Owner" value="owner" active={sort === 'owner'} direction={direction} />
              <SortHeader label="Type" value="type" active={sort === 'type'} direction={direction} />
              <SortHeader label="Lifecycle" value="status" active={sort === 'status'} direction={direction} />
              <th scope="col" className="px-3 py-3 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-gray-600">K-1 workflow</th>
              <SortHeader label="Commitment" value="commitment" active={sort === 'commitment'} direction={direction} />
              <SortHeader label="Paid in" value="paidIn" active={sort === 'paidIn'} direction={direction} />
              <SortHeader label="Distributions" value="distributions" active={sort === 'distributions'} direction={direction} />
              <SortHeader label="Latest NAV" value="nav" active={sort === 'nav'} direction={direction} />
              <SortHeader label="Unfunded" value="unfunded" active={sort === 'unfunded'} direction={direction} />
              <SortHeader label="DPI" value="dpi" active={sort === 'dpi'} direction={direction} />
              <SortHeader label="TVPI" value="tvpi" active={sort === 'tvpi'} direction={direction} />
              <SortHeader label="IRR" value="irr" active={sort === 'irr'} direction={direction} />
              <SortHeader label="Tax year" value="latestTaxYear" active={sort === 'latestTaxYear'} direction={direction} />
              <SortHeader label="Warnings" value="warningCount" active={sort === 'warningCount'} direction={direction} />
              <th scope="col" className="px-3 py-3 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-gray-600">Quality</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {items.map((row) => (
              <tr key={row.partnership.id} className="group hover:bg-atlas-light">
                <th scope="row" className="sticky left-0 z-10 min-w-56 border-r border-gray-200 bg-white py-3 pl-5 pr-3 text-left group-hover:bg-atlas-light">
                  <Link to={`/partnership-tracker?partnership=${encodeURIComponent(row.partnership.id)}`} className="inline-flex min-h-11 items-center gap-2 font-semibold text-gray-950 underline decoration-atlas-gold decoration-2 underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-atlas-gold focus-visible:ring-offset-2">
                    <span className="max-w-44 truncate">{row.partnership.name}</span><ExternalLink className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                  </Link>
                </th>
                <td className="max-w-48 truncate px-3 py-3 text-sm text-gray-700" title={row.partnership.entity.name}>{row.partnership.entity.name}</td>
                <td className="px-3 py-3 text-sm text-gray-700">{row.partnership.partnershipType}</td>
                <td className={`px-3 py-3 text-xs font-bold tracking-wide ${lifecycleStyles[row.partnership.status] ?? 'text-gray-700'}`}>{humanizeCode(row.partnership.status)}</td>
                <td className="px-3 py-3 text-sm text-gray-700">{row.latestWorkflowStatus ? humanizeCode(row.latestWorkflowStatus) : 'No K-1 year'}</td>
                <td className="px-3 py-3"><MoneyCell value={row.currentCommittedCapital?.amount} missing="No commitment" /></td>
                <td className="px-3 py-3"><MoneyCell value={row.totalCapitalContributions} missing="No paid-in data" /></td>
                <td className="px-3 py-3"><MoneyCell value={row.totalDistributions} missing="No distribution data" /></td>
                <td className="px-3 py-3"><MoneyCell value={row.latestNav?.amount} missing="No NAV" />{row.latestNav && <span className="mt-1 block text-[0.68rem] text-gray-400">{formatLedgerDate(row.latestNav.date)}</span>}</td>
                <td className="px-3 py-3"><MoneyCell value={row.unfundedCommitmentAmount} missing={humanizeCode(row.performanceStatus.unfundedCommitment)} /></td>
                <td className="px-3 py-3"><RatioCell value={row.dpi} status={row.performanceStatus.dpi} /></td>
                <td className="px-3 py-3"><RatioCell value={row.tvpi} status={row.performanceStatus.tvpi} /></td>
                <td className="px-3 py-3"><RatioCell value={row.irr} status={row.performanceStatus.irr} percent /></td>
                <td className="px-3 py-3 font-mono text-sm tabular-nums text-gray-700">{row.latestTaxYear ?? <MissingValue reason="No K-1 year" />}</td>
                <td className="px-3 py-3 font-mono text-sm tabular-nums text-gray-700">{row.warningCount}</td>
                <td className="px-3 py-3"><span className={`inline-flex rounded-sm px-2 py-1 text-[0.68rem] font-bold uppercase tracking-wide ring-1 ring-inset ${qualityStyles[row.dataQuality]}`}>{humanizeCode(row.dataQuality)}</span></td>
              </tr>
            ))}
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
    </section>
  )
}
