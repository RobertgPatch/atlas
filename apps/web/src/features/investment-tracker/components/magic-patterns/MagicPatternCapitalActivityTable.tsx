import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  RotateCcw,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import {
  formatCurrency,
  formatDate,
  formatMultiple,
  formatPercent,
  multipleOf,
  totalsOf,
  type InvestmentActivityRecord,
  type InvestmentActivityTotals,
  type InvestmentGroupBy,
  type InvestmentSortDirection,
} from '../../investmentTrackerModel'

type ColumnKey =
  | 'name'
  | 'assetClass'
  | 'fund'
  | 'entity'
  | 'ownerType'
  | 'vintage'
  | 'commitment'
  | 'invested'
  | 'unfunded'
  | 'distributions'
  | 'currentValue'
  | 'multiple'
  | 'share'
  | 'lastActivity'
  | 'status'

interface TableEntry {
  id: string
  label: string
  meta: string
  depth: 0 | 1
  groupId: string | null
  childCount: number | null
  totals: InvestmentActivityTotals
  assetClass: string | null
  fundName: string | null
  ownerName: string | null
  ownerType: string | null
  vintage: number | null
  status: string | null
  lastActivityDate: string | null
  lastActivityType: string | null
}

interface TableContext {
  grandInvested: number | null
}

interface ColumnDefinition {
  key: ColumnKey
  header: string
  width: number
  align: 'left' | 'right'
  value: (entry: TableEntry, context: TableContext) => string | number
  render: (entry: TableEntry, context: TableContext) => ReactNode
}

function Figure({
  children,
  tone = 'default',
}: {
  children: ReactNode
  tone?: 'default' | 'positive' | 'negative' | 'muted'
}) {
  const toneClass = tone === 'positive'
    ? 'text-[#15803d]'
    : tone === 'negative'
      ? 'text-[#b91c1c]'
      : tone === 'muted'
        ? 'text-[#5f7185]'
        : 'text-[#17263a]'
  return <span className={`font-mono tabular-nums ${toneClass}`}>{children}</span>
}

function StatusBadge({ status }: { status: string }) {
  const tone = status === 'Active'
    ? 'border-[#8fe0ab] bg-[#e8faee] text-[#15803d]'
    : status === 'Pending'
      ? 'border-[#a3c4fa] bg-[#e7f0fe] text-[#1d4ed8]'
      : status === 'Winding down'
        ? 'border-[#f5ce72] bg-[#fff6e3] text-[#92400e]'
        : 'border-[#d6e0ea] bg-[#f4f7fa] text-[#44566a]'
  const dot = status === 'Active'
    ? 'bg-[#16a34a]'
    : status === 'Pending'
      ? 'bg-[#2563eb]'
      : status === 'Winding down'
        ? 'bg-[#d97706]'
        : 'bg-[#8c9cb0]'

  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[0.68rem] font-medium ${tone}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden="true" />
      {status}
    </span>
  )
}

function textCell(value: string | null) {
  return value ? (
    <span className="block truncate text-[#3e5169]" title={value}>{value}</span>
  ) : (
    <span className="text-[#5f7185]">Mixed</span>
  )
}

const columns: ColumnDefinition[] = [
  { key: 'name', header: 'Name', width: 320, align: 'left', value: (entry) => entry.label, render: (entry) => entry.label },
  { key: 'assetClass', header: 'Asset class', width: 156, align: 'left', value: (entry) => entry.assetClass ?? 'zzz', render: (entry) => textCell(entry.assetClass) },
  { key: 'fund', header: 'Fund', width: 236, align: 'left', value: (entry) => entry.fundName ?? 'zzz', render: (entry) => textCell(entry.fundName) },
  { key: 'entity', header: 'Owner entity', width: 224, align: 'left', value: (entry) => entry.ownerName ?? 'zzz', render: (entry) => textCell(entry.ownerName) },
  { key: 'ownerType', header: 'Entity type', width: 136, align: 'left', value: (entry) => entry.ownerType ?? 'zzz', render: (entry) => textCell(entry.ownerType) },
  { key: 'vintage', header: 'Vintage', width: 108, align: 'right', value: (entry) => entry.vintage ?? 0, render: (entry) => <Figure tone={entry.vintage == null ? 'muted' : 'default'}>{entry.vintage ?? '—'}</Figure> },
  { key: 'commitment', header: 'Commitment', width: 152, align: 'right', value: (entry) => entry.totals.commitment ?? Number.NEGATIVE_INFINITY, render: (entry) => <Figure tone={entry.totals.commitment == null ? 'muted' : 'default'}>{formatCurrency(entry.totals.commitment)}</Figure> },
  { key: 'invested', header: 'Total invested', width: 152, align: 'right', value: (entry) => entry.totals.invested ?? Number.NEGATIVE_INFINITY, render: (entry) => <Figure tone={entry.totals.invested == null ? 'muted' : 'default'}>{formatCurrency(entry.totals.invested)}</Figure> },
  { key: 'unfunded', header: 'Unfunded', width: 144, align: 'right', value: (entry) => entry.totals.unfunded ?? Number.NEGATIVE_INFINITY, render: (entry) => <Figure tone={!entry.totals.unfunded ? 'muted' : 'default'}>{formatCurrency(entry.totals.unfunded)}</Figure> },
  { key: 'distributions', header: 'Distributions', width: 152, align: 'right', value: (entry) => entry.totals.distributions ?? Number.NEGATIVE_INFINITY, render: (entry) => <Figure tone={entry.totals.distributions == null || entry.totals.distributions === 0 ? 'muted' : 'positive'}>{formatCurrency(entry.totals.distributions)}</Figure> },
  { key: 'currentValue', header: 'Current value', width: 152, align: 'right', value: (entry) => entry.totals.currentValue ?? Number.NEGATIVE_INFINITY, render: (entry) => <Figure tone={entry.totals.currentValue == null ? 'muted' : 'default'}>{formatCurrency(entry.totals.currentValue)}</Figure> },
  { key: 'multiple', header: 'Net multiple', width: 136, align: 'right', value: (entry) => multipleOf(entry.totals) ?? Number.NEGATIVE_INFINITY, render: (entry) => { const value = multipleOf(entry.totals); return <Figure tone={value == null ? 'muted' : value >= 1 ? 'positive' : 'negative'}>{formatMultiple(value)}</Figure> } },
  { key: 'share', header: 'Percentage', width: 128, align: 'right', value: (entry, context) => entry.totals.invested != null && context.grandInvested ? (entry.totals.invested / context.grandInvested) * 100 : Number.NEGATIVE_INFINITY, render: (entry, context) => { const value = entry.totals.invested != null && context.grandInvested ? (entry.totals.invested / context.grandInvested) * 100 : null; return <Figure tone="muted">{formatPercent(value)}</Figure> } },
  { key: 'lastActivity', header: 'Last activity', width: 176, align: 'left', value: (entry) => entry.lastActivityDate ?? '', render: (entry) => <span className="block"><span className="font-mono tabular-nums text-[#17263a]">{formatDate(entry.lastActivityDate)}</span>{entry.lastActivityType ? <span className="mt-0.5 block text-[0.68rem] uppercase tracking-wide text-[#5f7185]">{entry.lastActivityType}</span> : null}</span> },
  { key: 'status', header: 'Status', width: 148, align: 'left', value: (entry) => entry.status ?? 'zzz', render: (entry) => entry.status ? <StatusBadge status={entry.status} /> : <span className="text-[#5f7185]">Mixed</span> },
]

const nameHeaders: Record<InvestmentGroupBy, string> = {
  fund: 'Fund / owner entity',
  assetClass: 'Asset class / position',
  entity: 'Owner entity / fund',
  none: 'Fund — owner entity',
}

const redundantColumns: Record<InvestmentGroupBy, ColumnKey[]> = {
  fund: ['fund'],
  assetClass: ['assetClass'],
  entity: ['entity'],
  none: [],
}

const defaultWidths = Object.fromEntries(columns.map((column) => [column.key, column.width]))
const MIN_COLUMN_WIDTH = 88
const MAX_COLUMN_WIDTH = 640

function useColumnResize() {
  const [widths, setWidths] = useState<Record<string, number>>(defaultWidths)
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const drag = useRef<{ key: string; startX: number; startWidth: number } | null>(null)

  useEffect(() => {
    const clamp = (value: number) => Math.min(Math.max(value, MIN_COLUMN_WIDTH), MAX_COLUMN_WIDTH)
    const onMove = (event: PointerEvent) => {
      if (!drag.current) return
      const { key, startX, startWidth } = drag.current
      const next = clamp(startWidth + event.clientX - startX)
      setWidths((current) => current[key] === next ? current : { ...current, [key]: next })
    }
    const onEnd = () => {
      if (!drag.current) return
      drag.current = null
      setActiveKey(null)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onEnd)
    window.addEventListener('pointercancel', onEnd)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onEnd)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
  }, [])

  const startResize = useCallback((key: string, event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
    drag.current = { key, startX: event.clientX, startWidth: widths[key] ?? MIN_COLUMN_WIDTH }
    setActiveKey(key)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
  }, [widths])

  const nudgeWidth = useCallback((key: string, direction: -1 | 1) => {
    setWidths((current) => ({
      ...current,
      [key]: Math.min(
        Math.max((current[key] ?? MIN_COLUMN_WIDTH) + direction * 16, MIN_COLUMN_WIDTH),
        MAX_COLUMN_WIDTH,
      ),
    }))
  }, [])

  const resetWidths = useCallback(() => setWidths(defaultWidths), [])
  const isDefault = Object.keys(defaultWidths).every((key) => widths[key] === defaultWidths[key])
  return { widths, activeKey, startResize, nudgeWidth, resetWidths, isDefault }
}

function sharedValue<T>(values: Array<T | null>): T | null {
  if (!values.length || values[0] == null) return null
  return values.every((value) => value === values[0]) ? values[0] : null
}

function recordEntry(
  record: InvestmentActivityRecord,
  groupBy: InvestmentGroupBy,
  groupId: string | null,
  depth: 0 | 1,
): TableEntry {
  const label = groupBy === 'fund'
    ? record.ownerName
    : groupBy === 'entity'
      ? record.fundName
      : `${record.fundName} — ${record.ownerName}`
  const meta = groupBy === 'entity'
    ? `${record.assetClass}${record.vintage ? ` · Vintage ${record.vintage}` : ''}`
    : `Owner record · ${record.ownerType}`
  return {
    id: record.id,
    label,
    meta,
    depth,
    groupId,
    childCount: null,
    totals: totalsOf([record]),
    assetClass: record.assetClass,
    fundName: record.fundName,
    ownerName: record.ownerName,
    ownerType: record.ownerType,
    vintage: record.vintage,
    status: record.status,
    lastActivityDate: record.lastActivityDate,
    lastActivityType: record.lastActivityType,
  }
}

function groupRecords(records: InvestmentActivityRecord[], groupBy: Exclude<InvestmentGroupBy, 'none'>) {
  const buckets = new Map<string, InvestmentActivityRecord[]>()
  for (const record of records) {
    const key = groupBy === 'fund'
      ? record.fundId
      : groupBy === 'entity'
        ? record.ownerId
        : record.assetClass
    const current = buckets.get(key)
    if (current) current.push(record)
    else buckets.set(key, [record])
  }

  return [...buckets.entries()].map(([id, rows]) => {
    const label = groupBy === 'fund'
      ? rows[0].fundName
      : groupBy === 'entity'
        ? rows[0].ownerName
        : rows[0].assetClass
    const fundCount = new Set(rows.map((row) => row.fundId)).size
    const meta = groupBy === 'fund'
      ? `${rows.length} owner ${rows.length === 1 ? 'record' : 'records'}`
      : groupBy === 'entity'
        ? `${fundCount} ${fundCount === 1 ? 'fund' : 'funds'} · ${rows.length} positions`
        : `${fundCount} ${fundCount === 1 ? 'fund' : 'funds'} · ${rows.length} owner records`
    const latest = [...rows]
      .filter((row) => row.lastActivityDate)
      .sort((left, right) => (right.lastActivityDate ?? '').localeCompare(left.lastActivityDate ?? ''))[0]

    return {
      entry: {
        id: `${groupBy}:${id}`,
        label,
        meta,
        depth: 0 as const,
        groupId: `${groupBy}:${id}`,
        childCount: rows.length,
        totals: totalsOf(rows),
        assetClass: sharedValue(rows.map((row) => row.assetClass)),
        fundName: sharedValue(rows.map((row) => row.fundName)),
        ownerName: sharedValue(rows.map((row) => row.ownerName)),
        ownerType: sharedValue(rows.map((row) => row.ownerType)),
        vintage: sharedValue(rows.map((row) => row.vintage)),
        status: sharedValue(rows.map((row) => row.status)),
        lastActivityDate: latest?.lastActivityDate ?? null,
        lastActivityType: latest?.lastActivityType ?? null,
      } satisfies TableEntry,
      rows,
    }
  })
}

function compare(left: string | number, right: string | number, direction: InvestmentSortDirection) {
  const result = typeof left === 'number' && typeof right === 'number'
    ? left - right
    : String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' })
  return direction === 'asc' ? result : -result
}

export function MagicPatternCapitalActivityTable({
  records,
  groupBy,
  loading = false,
  asOfDate,
}: {
  records: InvestmentActivityRecord[]
  groupBy: InvestmentGroupBy
  loading?: boolean
  asOfDate: string
}) {
  const [sortKey, setSortKey] = useState<ColumnKey>('invested')
  const [sortDirection, setSortDirection] = useState<InvestmentSortDirection>('desc')
  const [expandedGroupIds, setExpandedGroupIds] = useState<string[]>([])
  const { widths, activeKey, startResize, nudgeWidth, resetWidths, isDefault } = useColumnResize()
  const visibleColumns = useMemo(
    () => columns.filter((column) => !redundantColumns[groupBy].includes(column.key)),
    [groupBy],
  )
  const grandTotals = useMemo(() => totalsOf(records), [records])
  const context = useMemo<TableContext>(() => ({ grandInvested: grandTotals.invested }), [grandTotals.invested])
  const sortColumn = visibleColumns.find((column) => column.key === sortKey) ?? visibleColumns[0]

  const groups = useMemo(
    () => groupBy === 'none' ? [] : groupRecords(records, groupBy),
    [groupBy, records],
  )
  const entries = useMemo<TableEntry[]>(() => {
    if (groupBy === 'none') {
      return records
        .map((record) => recordEntry(record, groupBy, null, 0))
        .sort((left, right) => compare(sortColumn.value(left, context), sortColumn.value(right, context), sortDirection))
    }

    const sortedGroups = [...groups].sort((left, right) =>
      compare(sortColumn.value(left.entry, context), sortColumn.value(right.entry, context), sortDirection),
    )
    return sortedGroups.flatMap((group) => {
      if (!expandedGroupIds.includes(group.entry.id)) return [group.entry]
      const children = group.rows
        .map((record) => recordEntry(record, groupBy, group.entry.id, 1))
        .sort((left, right) => compare(sortColumn.value(left, context), sortColumn.value(right, context), sortDirection))
      return [group.entry, ...children]
    })
  }, [context, expandedGroupIds, groupBy, groups, records, sortColumn, sortDirection])

  const groupIds = groups.map((group) => group.entry.id)
  const allExpanded = groupIds.length > 0 && groupIds.every((id) => expandedGroupIds.includes(id))
  const totalWidth = visibleColumns.reduce((total, column) => total + (widths[column.key] ?? column.width), 0)
  const totalEntry: TableEntry = {
    id: 'all-partnerships',
    label: 'All partnerships',
    meta: `${records.length} owner records`,
    depth: 0,
    groupId: null,
    childCount: null,
    totals: grandTotals,
    assetClass: null,
    fundName: null,
    ownerName: null,
    ownerType: null,
    vintage: null,
    status: null,
    lastActivityDate: null,
    lastActivityType: null,
  }

  const toggleSort = (key: ColumnKey) => {
    if (sortKey === key) setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
    else {
      setSortKey(key)
      setSortDirection(key === 'name' || key === 'lastActivity' ? 'asc' : 'desc')
    }
  }

  return (
    <section
      aria-label="Capital activity"
      className="overflow-hidden rounded-lg border border-[#dae2ec] bg-white shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dae2ec] bg-[#f4f7fa] px-4 py-2.5">
        <p className="text-xs text-[#3e5169]">
          {groupBy === 'none'
            ? `${records.length} owner ${records.length === 1 ? 'record' : 'records'}`
            : `${groups.length} ${groupBy === 'fund' ? 'funds' : groupBy === 'entity' ? 'entities' : 'asset classes'} · ${records.length} owner records`}
          <span className="mx-2 text-[#8c9cb0]">|</span>
          Lifetime measures as of {formatDate(asOfDate)} (USD)
        </p>
        <div className="flex items-center gap-2">
          {groupBy !== 'none' ? (
            <button
              type="button"
              onClick={() => setExpandedGroupIds(allExpanded ? [] : groupIds)}
              className="rounded px-2 py-1 text-xs font-semibold text-[#3e5169] hover:bg-[#e8eef5] hover:text-[#17263a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              {allExpanded ? 'Collapse all' : 'Expand all'}
            </button>
          ) : null}
          <button
            type="button"
            disabled={isDefault}
            onClick={resetWidths}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-[#3e5169] hover:bg-[#e8eef5] hover:text-[#17263a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Reset column widths
          </button>
        </div>
      </div>

      <div className="overflow-auto" style={{ maxHeight: 'min(64vh, 720px)' }}>
        <table className="border-collapse text-sm" style={{ tableLayout: 'fixed', width: totalWidth }}>
          <colgroup>
            {visibleColumns.map((column) => (
              <col key={column.key} style={{ width: widths[column.key] ?? column.width }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {visibleColumns.map((column) => {
                const isName = column.key === 'name'
                const isSorted = sortKey === column.key
                const label = isName ? nameHeaders[groupBy] : column.header
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={isSorted ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className={`sticky top-0 border-b border-[#bfcbd9] bg-[#edf2f8] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[#3e5169] ${column.align === 'right' ? 'text-right' : 'text-left'} ${isName ? 'left-0 z-30 border-r border-[#dae2ec]' : 'z-20'}`}
                  >
                    <span className="relative flex items-center">
                      <button
                        type="button"
                        onClick={() => toggleSort(column.key)}
                        className={`inline-flex min-w-0 items-center gap-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${column.align === 'right' ? 'ml-auto' : ''} ${isSorted ? 'text-[#17263a]' : 'hover:text-[#17263a]'}`}
                      >
                        <span className="truncate">{label}</span>
                        {isSorted ? (
                          sortDirection === 'asc' ? <ArrowUp className="h-3 w-3 shrink-0" /> : <ArrowDown className="h-3 w-3 shrink-0" />
                        ) : (
                          <ChevronsUpDown className="h-3 w-3 shrink-0 text-[#8c9cb0]" />
                        )}
                      </button>
                      <span
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={`Resize ${label} column`}
                        tabIndex={0}
                        onPointerDown={(event) => startResize(column.key, event)}
                        onKeyDown={(event) => {
                          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                            event.preventDefault()
                            nudgeWidth(column.key, event.key === 'ArrowLeft' ? -1 : 1)
                          }
                        }}
                        className={`absolute -right-3 top-1/2 h-7 w-2 -translate-y-1/2 cursor-col-resize rounded-full hover:bg-[#2563eb]/60 focus-visible:outline-none focus-visible:bg-[#2563eb] ${activeKey === column.key ? 'bg-[#2563eb]' : 'bg-transparent'}`}
                      />
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>

          <tbody>
            {loading ? Array.from({ length: 6 }, (_, index) => (
              <tr key={index} className="border-b border-[#dae2ec]">
                {visibleColumns.map((column) => (
                  <td key={column.key} className="px-3 py-3">
                    <div className="h-3 w-3/4 animate-pulse rounded bg-[#e8eef5] motion-reduce:animate-none" />
                  </td>
                ))}
              </tr>
            )) : null}
            {!loading && !entries.length ? (
              <tr>
                <td colSpan={visibleColumns.length} className="px-4 py-12 text-center text-sm text-[#3e5169]">
                  No capital activity matches these filters. Clear the fund or asset-class filter to see all partnerships.
                </td>
              </tr>
            ) : null}
            {!loading ? entries.map((entry) => {
              const isGroup = entry.depth === 0 && entry.childCount !== null
              const expanded = entry.groupId ? expandedGroupIds.includes(entry.groupId) : false
              const rowBackground = entry.depth === 1
                ? 'bg-[#f4f7fa]'
                : isGroup && expanded
                  ? 'bg-[#e8eef5]'
                  : 'bg-white'
              return (
                <tr key={entry.id} className={`group border-b border-[#dae2ec] ${rowBackground} hover:bg-[#e4ecf6]`}>
                  {visibleColumns.map((column) => column.key === 'name' ? (
                    <td key={column.key} className={`sticky left-0 z-10 border-r border-[#dae2ec] px-3 py-2.5 ${rowBackground} group-hover:bg-[#e4ecf6]`}>
                      <div className={`flex min-w-0 items-start gap-2 ${entry.depth === 1 ? 'pl-6' : ''}`}>
                        {isGroup ? (
                          <button
                            type="button"
                            aria-expanded={expanded}
                            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${entry.label}`}
                            onClick={() => setExpandedGroupIds((current) => current.includes(entry.id) ? current.filter((id) => id !== entry.id) : [...current, entry.id])}
                            className="mt-0.5 shrink-0 rounded p-0.5 text-[#5f7185] hover:bg-[#dce4ee] hover:text-[#17263a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                          >
                            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        ) : (
                          <span className="mt-2 h-1 w-3 shrink-0 border-t border-dashed border-[#8c9cb0]" aria-hidden="true" />
                        )}
                        <span className="min-w-0">
                          <span className={`block truncate ${isGroup ? 'font-semibold text-[#17263a]' : 'font-medium text-[#3e5169]'}`} title={entry.label}>
                            {entry.label}
                          </span>
                          <span className="mt-0.5 block truncate text-[0.68rem] font-semibold uppercase tracking-wide text-[#5f7185]">
                            {entry.meta}
                          </span>
                        </span>
                      </div>
                    </td>
                  ) : (
                    <td key={column.key} className={`px-3 py-2.5 align-middle ${column.align === 'right' ? 'text-right' : 'text-left'} ${isGroup ? 'font-semibold' : ''}`}>
                      {column.render(entry, context)}
                    </td>
                  ))}
                </tr>
              )
            }) : null}
          </tbody>

          {!loading && entries.length ? (
            <tfoot>
              <tr>
                {visibleColumns.map((column) => column.key === 'name' ? (
                  <th key={column.key} scope="row" className="sticky bottom-0 left-0 z-30 border-r border-t border-[#bfcbd9] bg-[#e8eef5] px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[#17263a]">
                    Total · all partnerships
                  </th>
                ) : (
                  <td key={column.key} className={`sticky bottom-0 z-20 border-t border-[#bfcbd9] bg-[#e8eef5] px-3 py-2.5 text-xs font-semibold ${column.align === 'right' ? 'text-right' : 'text-left'}`}>
                    {['commitment', 'invested', 'unfunded', 'distributions', 'currentValue', 'multiple', 'share'].includes(column.key)
                      ? column.render(totalEntry, context)
                      : null}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      <p className="border-t border-[#dae2ec] px-4 py-2 text-xs text-[#5f7185]">
        Drag a column edge to resize, or focus the divider and use the left/right arrow keys.
      </p>
    </section>
  )
}
