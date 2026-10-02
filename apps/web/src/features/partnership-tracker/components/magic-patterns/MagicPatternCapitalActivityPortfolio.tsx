import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react'
import { AlertTriangle, ChevronDown, Download, Loader2, Minus, Plus, RefreshCw, RotateCcw, Search } from 'lucide-react'
import { Fragment, useMemo, useRef, useState, type RefObject } from 'react'
import { exportInvestmentTrackerPdf } from '../../../investment-tracker/exportInvestmentTrackerPdf'
import { useInvestmentTrackerData } from '../../../investment-tracker/hooks/useInvestmentTrackerData'
import {
  groupInvestmentRecordsByFund,
  recordsFromAggregation,
  type InvestmentActivityRecord,
  type InvestmentPositionStatus,
} from '../../../investment-tracker/investmentTrackerModel'
import { MagicButton, MagicCard } from './MagicPatternPrimitives'
import { MagicPatternPartnershipActivitySummary } from './MagicPatternPartnershipIndex'
import { PortfolioSecondaryCharts, PortfolioTopCharts } from './MagicPatternPortfolioCharts'
import { buildPortfolioChartData } from './portfolioChartData'

const ALL = 'all'

function money(value: number | null, outflow = false) {
  if (value == null || !Number.isFinite(value)) return '—'
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value))
  return outflow && value !== 0 ? `(${formatted})` : formatted
}

const multiple = (value: number | null) => value == null || !Number.isFinite(value)
  ? '—'
  : `${value.toFixed(2)}x`

const returnPercent = (value: number | null) => value == null || !Number.isFinite(value)
  ? '—'
  : `${(value * 100).toFixed(1)}%`

const statusTone: Record<InvestmentPositionStatus, string> = {
  Active: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  Pending: 'border-blue-200 bg-blue-50 text-blue-800',
  'Winding down': 'border-amber-200 bg-amber-50 text-amber-800',
  Closed: 'border-slate-300 bg-slate-100 text-slate-700',
}

const ownerEntityLabel = (count: number) => `${count} owner ${count === 1 ? 'entity' : 'entities'}`
const ownerRecordLabel = (count: number) => `${count} owner ${count === 1 ? 'record' : 'records'}`

function FundStatus({ statuses }: { statuses: InvestmentPositionStatus[] }) {
  if (statuses.length !== 1) {
    return <span className="inline-flex rounded border border-violet-200 bg-violet-50 px-2 py-0.5 text-[0.65rem] font-semibold uppercase text-violet-800">Mixed</span>
  }
  const status = statuses[0]!
  return <span className={`inline-flex rounded border px-2 py-0.5 text-[0.65rem] font-semibold uppercase ${statusTone[status]}`}>{status}</span>
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
}) {
  return (
    <label className="block text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-slate-700">
      {label}
      <span className="relative mt-1.5 block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <select
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-11 w-full appearance-none rounded-md border border-slate-300 bg-slate-50 py-2 pl-10 pr-10 text-sm font-normal normal-case tracking-normal text-slate-700 outline-none transition focus:border-focus focus:bg-white focus:ring-2 focus:ring-focus/15"
        >
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
      </span>
    </label>
  )
}

function FundFilter({
  options,
  selectedIds,
  onToggle,
  onClear,
}: {
  options: Array<{ value: string; label: string }>
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onClear: () => void
}) {
  const selectedLabel = selectedIds.size === 0
    ? 'All funds'
    : selectedIds.size === 1
      ? options.find((option) => selectedIds.has(option.value))?.label ?? '1 fund selected'
      : `${selectedIds.size} funds selected`

  return (
    <Popover className="relative block text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-slate-700">
      <span>Fund</span>
      <PopoverButton
        aria-label={`Fund filter: ${selectedLabel}`}
        className="mt-1.5 flex min-h-11 w-full items-center gap-3 rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-left text-sm font-normal normal-case tracking-normal text-slate-700 outline-none transition hover:bg-white focus:border-focus focus:bg-white focus:ring-2 focus:ring-focus/15"
      >
        <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{selectedLabel}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
      </PopoverButton>
      <PopoverPanel data-pdf-exclude className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-md border border-slate-300 bg-white py-1 shadow-lg">
        <button
          type="button"
          disabled={selectedIds.size === 0}
          onClick={onClear}
          className="flex min-h-10 w-full items-center px-4 text-left text-sm font-medium normal-case tracking-normal text-slate-700 hover:bg-slate-50 focus:bg-slate-50 focus:outline-none disabled:text-slate-400"
        >
          All funds
        </button>
        <div className="border-t border-slate-200" />
        {options.map((option) => (
          <label key={option.value} className="flex min-h-10 cursor-pointer items-center gap-3 px-4 text-sm font-normal normal-case tracking-normal text-slate-700 hover:bg-slate-50">
            <input
              type="checkbox"
              checked={selectedIds.has(option.value)}
              onChange={() => onToggle(option.value)}
              className="h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-focus"
            />
            <span>{option.label}</span>
          </label>
        ))}
      </PopoverPanel>
    </Popover>
  )
}

function uniqueOptions(
  records: InvestmentActivityRecord[],
  valueOf: (record: InvestmentActivityRecord) => string,
  labelOf: (record: InvestmentActivityRecord) => string,
) {
  const options = new Map<string, string>()
  for (const record of records) options.set(valueOf(record), labelOf(record))
  return [...options].map(([value, label]) => ({ value, label })).sort((left, right) => left.label.localeCompare(right.label))
}

export function MagicPatternCapitalActivityPortfolio({
  onOpen,
  exportTarget,
}: {
  onOpen: (partnershipId: string) => void
  exportTarget?: RefObject<HTMLDivElement | null>
}) {
  const activity = useInvestmentTrackerData()
  const portfolioRef = useRef<HTMLDivElement>(null)
  const exportPending = useRef(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState(false)
  const exportPdf = async () => {
    const target = exportTarget?.current ?? portfolioRef.current
    if (!target || exportPending.current || activity.isLoading || activity.isFetching || !activity.data) return
    exportPending.current = true
    setExporting(true)
    setExportError(false)
    try {
      await exportInvestmentTrackerPdf(target)
    } catch {
      setExportError(true)
    } finally {
      exportPending.current = false
      setExporting(false)
    }
  }
  const [assetClass, setAssetClass] = useState(ALL)
  const [entityId, setEntityId] = useState(ALL)
  const [selectedFundIds, setSelectedFundIds] = useState<Set<string>>(() => new Set())
  const records = useMemo(
    () => activity.data ? recordsFromAggregation(activity.data) : [],
    [activity.data],
  )
  const assetClassOptions = useMemo(() => [
    { value: ALL, label: 'All asset classes' },
    ...uniqueOptions(records, (record) => record.assetClass, (record) => record.assetClass),
  ], [records])
  const entityOptions = useMemo(() => [
    { value: ALL, label: 'All entities' },
    ...uniqueOptions(records, (record) => record.ownerId, (record) => record.ownerName),
  ], [records])
  const fundOptions = useMemo(() => uniqueOptions(records, (record) => record.fundId, (record) => record.fundName), [records])
  const visibleRecords = useMemo(() => records.filter((record) => (
    (assetClass === ALL || record.assetClass === assetClass)
    && (entityId === ALL || record.ownerId === entityId)
    && (selectedFundIds.size === 0 || selectedFundIds.has(record.fundId))
  )), [assetClass, entityId, selectedFundIds, records])
  const visibleRecordIds = useMemo(() => new Set(visibleRecords.map((record) => record.id)), [visibleRecords])
  const chartData = useMemo(() => buildPortfolioChartData(
    activity.data?.items.flatMap((group) => group.members.filter((member) => visibleRecordIds.has(member.partnership.id))) ?? [],
  ), [activity.data, visibleRecordIds])
  const allFundGroups = useMemo(() => groupInvestmentRecordsByFund(records), [records])
  const visibleFundGroups = useMemo(() => groupInvestmentRecordsByFund(visibleRecords), [visibleRecords])
  const [expandedFundIds, setExpandedFundIds] = useState<Set<string>>(() => new Set())
  const hasFilters = assetClass !== ALL || entityId !== ALL || selectedFundIds.size > 0
  const clearFilters = () => {
    setAssetClass(ALL)
    setEntityId(ALL)
    setSelectedFundIds(new Set())
  }
  const toggleSelectedFund = (id: string) => {
    setSelectedFundIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleFund = (id: string) => {
    setExpandedFundIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (activity.isError) {
    return (
      <MagicCard className="border-red-200 bg-red-50 p-6">
        <div className="flex gap-3 text-red-900">
          <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <h2 className="font-semibold">Capital activity could not be loaded</h2>
            <p className="mt-1 text-sm">The complete partnership portfolio is temporarily unavailable.</p>
          </div>
        </div>
        <MagicButton type="button" variant="secondary" className="mt-4" onClick={() => void activity.refetch()}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Try again
        </MagicButton>
      </MagicCard>
    )
  }

  return (
    <div ref={portfolioRef} className="space-y-5">
      {exportError ? <p role="alert" data-pdf-exclude className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">The PDF could not be exported. Please try again.</p> : null}
      <MagicCard className="p-4" data-pdf-keep-together>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-amber-700">Position summary</p>
            <h2 className="mt-1 whitespace-nowrap text-lg font-semibold tracking-tight text-slate-950">Filter investments</h2>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs font-medium text-slate-600">
              {hasFilters
                ? `Showing ${visibleFundGroups.length} of ${allFundGroups.length} funds · ${visibleRecords.length} of ${records.length} owner records`
                : 'Showing full permitted portfolio'}
            </p>
            <MagicButton data-pdf-exclude type="button" variant="secondary" disabled={!hasFilters} onClick={clearFilters}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Clear all
            </MagicButton>
            <MagicButton
              data-pdf-exclude
              type="button"
              variant="secondary"
              disabled={exporting || activity.isLoading || activity.isFetching || !activity.data}
              onClick={() => void exportPdf()}
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
              {exporting ? 'Exporting PDF…' : 'Export to PDF'}
            </MagicButton>
          </div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3" data-pdf-filter-grid>
          <FilterSelect label="Asset class" value={assetClass} options={assetClassOptions} onChange={setAssetClass} />
          <FilterSelect label="Entity" value={entityId} options={entityOptions} onChange={setEntityId} />
          <FundFilter options={fundOptions} selectedIds={selectedFundIds} onToggle={toggleSelectedFund} onClear={() => setSelectedFundIds(new Set())} />
        </div>
      </MagicCard>

      {!activity.isLoading ? <>
        <PortfolioTopCharts data={chartData} />
        <PortfolioSecondaryCharts data={chartData} />
      </> : null}

      {activity.data ? <div data-pdf-keep-together><MagicPatternPartnershipActivitySummary rollup={activity.data.rollup} /></div> : null}

      <p className="text-sm font-semibold text-slate-950" aria-live="polite">
        {activity.isLoading
          ? 'Loading funds…'
          : `${visibleFundGroups.length} ${visibleFundGroups.length === 1 ? 'fund' : 'funds'} · ${ownerRecordLabel(visibleRecords.length)}`}
      </p>

      <MagicCard className="overflow-hidden">
        <div data-pdf-keep-together className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-300 bg-white px-4 py-4">
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-amber-700">Position summary</p>
            <h2 className="mt-1 whitespace-nowrap text-lg font-semibold tracking-tight text-slate-950">Fund investment summary</h2>
          </div>
          <p data-pdf-exclude className="text-xs text-slate-500">Click a single-owner fund to open it. Multi-owner funds expand so you can choose the owner record.</p>
        </div>
        <div data-pdf-scroll className="overflow-auto" style={{ height: 'min(68vh, 760px)', overflowAnchor: 'none' }}>
          <table className="w-full min-w-[88rem] border-collapse text-left text-xs" aria-label="Capital activity fund investment summary">
            <thead>
              <tr className="border-b border-slate-300 bg-slate-100 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-slate-700">
                <th className="sticky left-0 z-20 min-w-64 bg-slate-100 px-3 py-3">Fund</th>
                <th className="min-w-44 px-3 py-3">Owner entities</th>
                <th className="min-w-28 px-3 py-3">Asset class</th>
                <th className="min-w-32 px-3 py-3 text-right">Total committed</th>
                <th className="min-w-36 px-3 py-3 text-right">Remaining commitment</th>
                <th className="min-w-24 px-3 py-3">Status</th>
                <th className="min-w-20 px-3 py-3 text-center">Vintage</th>
                <th className="min-w-32 px-3 py-3 text-right">Total invested</th>
                <th className="min-w-32 px-3 py-3 text-right">Valuation</th>
                <th className="min-w-16 px-3 py-3 text-right">DPI</th>
                <th className="min-w-16 px-3 py-3 text-right">TVPI</th>
                <th className="min-w-20 px-3 py-3 text-right">Return</th>
              </tr>
            </thead>
            <tbody>
              {activity.isLoading ? Array.from({ length: 6 }, (_, index) => (
                <tr key={index} className="border-b border-slate-200">
                  {Array.from({ length: 12 }, (__, cell) => <td key={cell} className="px-4 py-4"><span className="block h-3 animate-pulse rounded bg-slate-100 motion-reduce:animate-none" /></td>)}
                </tr>
              )) : null}
              {!activity.isLoading ? visibleFundGroups.map((fund, index) => {
                const expanded = expandedFundIds.has(fund.id)
                const childRowsId = `investment-fund-owner-rows-${encodeURIComponent(fund.id)}`
                const rowBackground = index % 2 ? 'bg-slate-50' : 'bg-white'
                const assetClass = fund.assetClasses.length === 1 ? fund.assetClasses[0] : `Mixed (${fund.assetClasses.length})`
                const vintage = fund.vintages.length === 1 ? fund.vintages[0] ?? '—' : 'Mixed'
                const parentReturn = fund.records.length === 1 ? returnPercent(fund.records[0]!.irr) : 'See owner rows'
                return (
                  <Fragment key={fund.id}>
                    <tr
                      tabIndex={0}
                      aria-label={fund.records.length === 1
                        ? `Open ${fund.name} partnership management`
                        : `${expanded ? 'Collapse' : 'Expand'} ${fund.name} owner records`}
                      onClick={() => fund.records.length === 1
                        ? onOpen(fund.records[0]!.id)
                        : toggleFund(fund.id)}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return
                        event.preventDefault()
                        if (fund.records.length === 1) onOpen(fund.records[0]!.id)
                        else toggleFund(fund.id)
                      }}
                      className={`group cursor-pointer border-b border-slate-300 outline-none ${rowBackground} hover:bg-amber-50/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus`}
                    >
                      <th scope="row" className={`sticky left-0 z-10 border-l-4 border-l-amber-500 px-3 py-2 text-left ${rowBackground} group-hover:bg-amber-50`}>
                        <div className="flex min-h-11 items-center gap-2">
                          {fund.records.length > 1 ? (
                            <button
                              type="button"
                              aria-expanded={expanded}
                              aria-controls={childRowsId}
                              aria-label={`${expanded ? 'Collapse' : 'Expand'} ${fund.name} owner details`}
                              title={`${expanded ? 'Collapse' : 'Expand'} owner details`}
                              onClick={(event) => {
                                event.stopPropagation()
                                toggleFund(fund.id)
                              }}
                              className={`grid h-7 w-7 shrink-0 place-items-center rounded border-0 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${expanded ? 'bg-amber-100 text-amber-800' : 'bg-transparent text-slate-400 hover:bg-slate-100 hover:text-slate-800'}`}
                            >
                              {expanded ? <Minus className="h-3.5 w-3.5" aria-hidden="true" /> : <Plus className="h-3.5 w-3.5" aria-hidden="true" />}
                            </button>
                          ) : (
                            <span className="h-7 w-1 shrink-0 rounded-full bg-emerald-700" aria-hidden="true" />
                          )}
                          <div className="min-w-0">
                            <span className="block truncate font-semibold text-slate-950" title={fund.name}>{fund.name}</span>
                            <span className="mt-0.5 block text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-slate-500">{ownerRecordLabel(fund.records.length)}</span>
                          </div>
                        </div>
                      </th>
                      <td className="px-3 py-3 font-semibold text-slate-800">{ownerEntityLabel(fund.ownerCount)}</td>
                      <td className="px-3 py-3 text-slate-700">{assetClass}</td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-950">{money(fund.totals.commitment)}</td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-950">{money(fund.totals.unfunded)}</td>
                      <td className="px-3 py-3"><FundStatus statuses={fund.statuses} /></td>
                      <td className="px-3 py-3 text-center font-mono tabular-nums text-slate-700">{vintage}</td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-950">{money(fund.totals.invested, true)}</td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-950">{money(fund.totals.currentValue)}</td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-950">{multiple(fund.dpi)}</td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-950">{multiple(fund.tvpi)}</td>
                      <td className={`px-3 py-3 text-right ${fund.records.length === 1 ? 'font-mono tabular-nums text-slate-950' : 'text-[0.68rem] font-semibold text-slate-500'}`}>{parentReturn}</td>
                    </tr>
                    {expanded ? fund.records.map((record, recordIndex) => (
                      <tr
                        id={recordIndex === 0 ? childRowsId : undefined}
                        key={record.id}
                        tabIndex={0}
                        aria-label={`Open ${fund.name} partnership management for ${record.ownerName}`}
                        onClick={() => onOpen(record.id)}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' && event.key !== ' ') return
                          event.preventDefault()
                          onOpen(record.id)
                        }}
                        className="cursor-pointer border-b border-slate-200 bg-slate-50/80 outline-none hover:bg-amber-50/70 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
                      >
                        <th scope="row" className="sticky left-0 z-10 border-l-4 border-l-amber-300 bg-slate-50 px-3 py-2 text-left">
                          <div className="flex min-h-11 items-center gap-2 pl-9 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-slate-500">
                            <span className="h-px w-4 shrink-0 bg-slate-300" aria-hidden="true" />
                            Owner record
                          </div>
                        </th>
                        <td className="px-3 py-2.5 font-semibold text-slate-800">{record.ownerName}</td>
                        <td className="px-3 py-2.5 text-slate-600">{record.assetClass}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-800">{money(record.commitment)}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-800">{money(record.unfunded)}</td>
                        <td className="px-3 py-2.5"><FundStatus statuses={[record.status]} /></td>
                        <td className="px-3 py-2.5 text-center font-mono tabular-nums text-slate-600">{record.vintage ?? '—'}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-800">{money(record.invested, true)}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-800">{money(record.currentValue)}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-800">{multiple(record.dpi)}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-800">{multiple(record.tvpi)}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-800">{returnPercent(record.irr)}</td>
                      </tr>
                    )) : null}
                  </Fragment>
                )
              }) : null}
              {!activity.isLoading && !visibleFundGroups.length ? (
                <tr><td colSpan={12} className="px-6 py-12 text-center text-sm text-slate-500">No capital activity matches the selected Asset Class, Entity, and Fund filters.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </MagicCard>
    </div>
  )
}
