import { useMemo, useState } from 'react'
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  BarChart3Icon,
  BitcoinIcon,
  LandmarkIcon,
  LayersIcon,
  MinusIcon,
  PlusIcon,
  SearchIcon,
  TrendingUpIcon,
} from 'lucide-react'
import type { ComponentType } from 'react'
import type {
  ConsolidatedHoldingRow,
  ConsolidatedHoldingsQuery,
} from '../../../../../../packages/types/src/reports'
import { inferSector } from '../utils/consolidatedHoldingsAnalytics'
import { formatCurrency } from '../utils/formatters'
import { ConsolidatedHoldingsRow } from './ConsolidatedHoldingsRow'

interface ConsolidatedHoldingsTableProps {
  rows: ConsolidatedHoldingRow[]
  selectedAccountCount: number
  search: string
  sort: NonNullable<ConsolidatedHoldingsQuery['sort']>
  direction: 'asc' | 'desc'
  onSearchChange: (value: string) => void
  onSortChange: (
    sort: NonNullable<ConsolidatedHoldingsQuery['sort']>,
    direction: 'asc' | 'desc',
  ) => void
}

type SortKey = NonNullable<ConsolidatedHoldingsQuery['sort']>

interface TableColumn {
  key?: SortKey
  label: string
  align: string
}

interface AssetCategory {
  key: string
  label: string
  Icon: ComponentType<{ className?: string }>
  color: string
  bgColor: string
  borderColor: string
  accentBorderColor: string
  matches: (type: string) => boolean
}

const columns: TableColumn[] = [
  { key: 'symbol', label: 'Symbol', align: 'text-left' },
  { label: 'Description', align: 'text-left' },
  { key: 'costBasis', label: 'Cost Basis', align: 'text-right' },
  { key: 'unrealizedGainLoss', label: 'Unrealized G/L', align: 'text-right' },
  { label: 'Custodian', align: 'text-center' },
  { key: 'quantity', label: 'Quantity', align: 'text-right' },
  { key: 'marketValue', label: 'Market Value', align: 'text-right' },
]

const assetCategories: AssetCategory[] = [
  {
    key: 'stocks',
    label: 'Equities',
    Icon: TrendingUpIcon,
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    accentBorderColor: 'border-l-blue-400',
    matches: (type) => ['stock', 'equity', 'equities'].includes(type),
  },
  {
    key: 'funds',
    label: 'ETFs & Funds',
    Icon: BarChart3Icon,
    color: 'text-violet-700',
    bgColor: 'bg-violet-50',
    borderColor: 'border-violet-200',
    accentBorderColor: 'border-l-violet-400',
    matches: (type) => type.includes('etf') || type.includes('fund'),
  },
  {
    key: 'crypto',
    label: 'Cryptocurrency',
    Icon: BitcoinIcon,
    color: 'text-amber-700',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    accentBorderColor: 'border-l-amber-400',
    matches: (type) => type.includes('crypto'),
  },
  {
    key: 'fixed-income',
    label: 'Fixed Income',
    Icon: LandmarkIcon,
    color: 'text-indigo-700',
    bgColor: 'bg-indigo-50',
    borderColor: 'border-indigo-200',
    accentBorderColor: 'border-l-indigo-400',
    matches: (type) => type.includes('fixed') || type.includes('bond'),
  },
  {
    key: 'cash',
    label: 'Cash & Equivalents',
    Icon: LandmarkIcon,
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    accentBorderColor: 'border-l-emerald-400',
    matches: (type) => type.includes('cash') || type.includes('money market'),
  },
]

const otherCategory: AssetCategory = {
  key: 'other',
  label: 'Other',
  Icon: LayersIcon,
  color: 'text-gray-700',
  bgColor: 'bg-gray-50',
  borderColor: 'border-gray-200',
  accentBorderColor: 'border-l-gray-300',
  matches: () => true,
}

const getAccountKey = (detail: ConsolidatedHoldingRow['details'][number]) =>
  `${detail.custodian}::${detail.accountName}::${detail.accountMask ?? ''}`

const getAccountCount = (row: ConsolidatedHoldingRow): number =>
  new Set(row.details.map(getAccountKey)).size || row.details.length

const getAssetCategory = (row: ConsolidatedHoldingRow): AssetCategory => {
  const normalizedType = row.type.trim().toLowerCase()
  return (
    assetCategories.find((category) => category.matches(normalizedType)) ??
    otherCategory
  )
}

const categoryOrder = new Map([
  ...assetCategories.map((category, index) => [category.key, index] as const),
  [otherCategory.key, assetCategories.length] as const,
])

const categoryLabelColumnWidth = `${
  Math.max(
    ...[...assetCategories, otherCategory].map((category) => category.label.length),
  ) + 9
}ch`

const compareRowsAlphabetically = (
  a: ConsolidatedHoldingRow,
  b: ConsolidatedHoldingRow,
): number => {
  const aLabel = a.symbol ?? a.description
  const bLabel = b.symbol ?? b.description
  return aLabel.localeCompare(bLabel, undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}

const sortValueFor = (
  row: ConsolidatedHoldingRow,
  key: SortKey,
): string | number | null => {
  if (key === 'symbol') return row.symbol ?? row.description
  return row[key] ?? null
}

const compareRowsBySort = (
  a: ConsolidatedHoldingRow,
  b: ConsolidatedHoldingRow,
  key: SortKey,
  sortDirection: 'asc' | 'desc',
): number => {
  const aValue = sortValueFor(a, key)
  const bValue = sortValueFor(b, key)

  if (aValue == null && bValue == null) return compareRowsAlphabetically(a, b)
  if (aValue == null) return sortDirection === 'asc' ? 1 : -1
  if (bValue == null) return sortDirection === 'asc' ? -1 : 1

  const result =
    typeof aValue === 'string' || typeof bValue === 'string'
      ? String(aValue).localeCompare(String(bValue), undefined, {
          numeric: true,
          sensitivity: 'base',
        })
      : aValue - bValue

  if (result !== 0) return sortDirection === 'asc' ? result : -result
  return compareRowsAlphabetically(a, b)
}

export function ConsolidatedHoldingsTable({
  rows,
  selectedAccountCount,
  search,
  sort,
  direction,
  onSearchChange,
  onSortChange,
}: ConsolidatedHoldingsTableProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())

  const columnByKey = useMemo(
    () => new Set(columns.flatMap((column) => (column.key ? [column.key] : []))),
    [],
  )

  const groupedByCategory = useMemo(() => {
    const groups = new Map<
      string,
      {
        category: AssetCategory
        rows: ConsolidatedHoldingRow[]
        totalValue: number
        totalGainLoss: number
        hasGainLoss: boolean
        accountCount: number
      }
    >()

    for (const row of rows) {
      const category = getAssetCategory(row)
      const existing = groups.get(category.key) ?? {
        category,
        rows: [],
        totalValue: 0,
        totalGainLoss: 0,
        hasGainLoss: false,
        accountCount: 0,
      }

      existing.rows.push(row)
      existing.totalValue += row.marketValue ?? 0
      if (row.unrealizedGainLoss != null) {
        existing.totalGainLoss += row.unrealizedGainLoss
        existing.hasGainLoss = true
      }
      groups.set(category.key, existing)
    }

    for (const group of groups.values()) {
      const accounts = new Set<string>()
      for (const row of group.rows) {
        for (const detail of row.details) {
          accounts.add(getAccountKey(detail))
        }
      }
      group.accountCount = accounts.size
      group.rows.sort((a, b) => compareRowsBySort(a, b, sort, direction))
    }

    return [...groups.values()].sort(
      (a, b) =>
        (categoryOrder.get(a.category.key) ?? assetCategories.length + 1) -
          (categoryOrder.get(b.category.key) ?? assetCategories.length + 1) ||
        b.totalValue - a.totalValue,
    )
  }, [direction, rows, sort])

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleCategory = (key: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleSort = (key: SortKey) => {
    if (!columnByKey.has(key)) return
    onSortChange(key, sort === key && direction === 'desc' ? 'asc' : 'desc')
  }

  const sortIcon = (key: SortKey) => {
    if (sort !== key) return <ArrowUpDownIcon className="h-3 w-3 text-gray-300" />
    return direction === 'asc' ? (
      <ArrowUpIcon className="h-3 w-3 text-blue-600" />
    ) : (
      <ArrowDownIcon className="h-3 w-3 text-blue-600" />
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">All Positions</h2>
          <p className="text-sm text-gray-500">
            {rows.length} positions across {selectedAccountCount} accounts -{' '}
            {groupedByCategory.length} asset class
            {groupedByCategory.length === 1 ? '' : 'es'}
          </p>
        </div>
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search symbol, name, or custodian..."
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-4 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 sm:w-72"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] table-fixed">
          <colgroup>
            <col className="w-[13%]" />
            <col className="w-[31%]" />
            <col className="w-[13%]" />
            <col className="w-[13%]" />
            <col className="w-[9%]" />
            <col className="w-[8%]" />
            <col className="w-[13%]" />
          </colgroup>
          <thead>
            <tr className="bg-gray-50/80">
              {columns.map((column, index) => (
                <th
                  key={`${column.label}-${index}`}
                  onClick={() => (column.key ? handleSort(column.key) : undefined)}
                  className={`select-none px-3 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 transition-colors ${
                    column.key ? 'cursor-pointer hover:text-gray-700' : ''
                  } ${column.align} ${index === 0 ? 'pl-4' : ''} ${
                    index === columns.length - 1 ? 'pr-4' : ''
                  }`}
                >
                  <span className="inline-flex items-center gap-1">
                    {column.label}
                    {column.key ? sortIcon(column.key) : null}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          {rows.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={7} className="py-16 text-center text-sm text-gray-400">
                  No holdings found. Try adjusting your search or account selection.
                </td>
              </tr>
            </tbody>
          ) : (
            groupedByCategory.map((group) => {
              const isCollapsed = collapsedCategories.has(group.category.key)
              const CategoryIcon = group.category.Icon
              const gainLossPositive = group.totalGainLoss >= 0

              return (
                <tbody key={group.category.key}>
                  <tr
                    onClick={() => toggleCategory(group.category.key)}
                    className={`cursor-pointer transition-colors hover:bg-gray-50 ${group.category.bgColor}`}
                  >
                    <td
                      colSpan={4}
                      className={`border-l-4 py-3 pl-3 pr-3 ${group.category.accentBorderColor}`}
                    >
                      <div
                        className="grid items-center gap-3"
                        style={{
                          gridTemplateColumns: `${categoryLabelColumnWidth} 7.5rem 10rem`,
                        }}
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center text-gray-400">
                            {isCollapsed ? (
                              <PlusIcon className="h-3 w-3" />
                            ) : (
                              <MinusIcon className="h-3 w-3" />
                            )}
                          </span>
                          <div
                            className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border ${group.category.bgColor} ${group.category.color} ${group.category.borderColor}`}
                          >
                            <CategoryIcon className="h-3.5 w-3.5" />
                          </div>
                          <span
                            className={`min-w-0 truncate text-sm font-semibold ${group.category.color}`}
                          >
                            {group.category.label}
                          </span>
                        </div>
                        <span className="whitespace-nowrap text-left text-xs font-medium text-gray-400">
                          {group.rows.length} position
                          {group.rows.length === 1 ? '' : 's'}
                        </span>
                        <div className="text-left">
                          {group.hasGainLoss ? (
                            <span
                              className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${
                                gainLossPositive
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-red-100 text-red-700'
                              }`}
                            >
                              {gainLossPositive ? '+' : ''}
                              {formatCurrency(group.totalGainLoss)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-left">
                      <span
                        className="text-xs font-medium text-gray-400"
                        title={`${group.accountCount} account${group.accountCount === 1 ? '' : 's'}`}
                      >
                        {group.accountCount}
                      </span>
                    </td>
                    <td className="px-3 py-3" />
                    <td className="py-3 pl-3 pr-4 text-right">
                      <span className="text-sm font-bold text-gray-900">
                        {formatCurrency(group.totalValue)}
                      </span>
                    </td>
                  </tr>
                  {!isCollapsed &&
                    group.rows.map((row) => (
                      <ConsolidatedHoldingsRow
                        key={row.id}
                        row={row}
                        sector={inferSector(row)}
                        accountCount={getAccountCount(row)}
                        groupAccentClassName={group.category.accentBorderColor}
                        isExpanded={expandedIds.has(row.id)}
                        onToggle={() => toggleExpand(row.id)}
                      />
                    ))}
                </tbody>
              )
            })
          )}
        </table>
      </div>
    </div>
  )
}
