import { useMemo, useState } from 'react'
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  SearchIcon,
} from 'lucide-react'
import type {
  ConsolidatedHoldingRow,
  ConsolidatedHoldingsQuery,
} from '../../../../../../packages/types/src/reports'
import { inferSector } from '../utils/consolidatedHoldingsAnalytics'
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

const columns: Array<{
  key: NonNullable<ConsolidatedHoldingsQuery['sort']>
  label: string
  align: string
}> = [
  { key: 'symbol', label: 'Symbol', align: 'text-left' },
  { key: 'type', label: 'Type', align: 'text-left' },
  { key: 'costBasis', label: 'Cost Basis', align: 'text-right' },
  { key: 'unrealizedGainLoss', label: 'Unrealized G/L', align: 'text-right' },
  { key: 'quantity', label: 'Quantity', align: 'text-right' },
  { key: 'marketValue', label: 'Market Value', align: 'text-right' },
]

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

  const columnByKey = useMemo(() => new Set(columns.map((column) => column.key)), [])

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSort = (key: NonNullable<ConsolidatedHoldingsQuery['sort']>) => {
    if (!columnByKey.has(key)) return
    onSortChange(key, sort === key && direction === 'desc' ? 'asc' : 'desc')
  }

  const sortIcon = (key: NonNullable<ConsolidatedHoldingsQuery['sort']>) => {
    if (sort !== key) return <ArrowUpDownIcon className="h-3.5 w-3.5 text-gray-300" />
    return direction === 'asc' ? (
      <ArrowUpIcon className="h-3.5 w-3.5 text-blue-600" />
    ) : (
      <ArrowDownIcon className="h-3.5 w-3.5 text-blue-600" />
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">All Positions</h2>
          <p className="text-sm text-gray-500">
            {rows.length} positions across {selectedAccountCount} accounts
          </p>
        </div>
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search symbol, name, or sector..."
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-4 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 sm:w-72"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] table-fixed">
          <colgroup>
            <col className="w-[170px]" />
            <col className="w-[220px]" />
            <col className="w-[150px]" />
            <col className="w-[135px]" />
            <col className="w-[150px]" />
            <col className="w-[145px]" />
            <col className="w-[110px]" />
            <col className="w-[130px]" />
          </colgroup>
          <thead>
            <tr className="bg-gray-50/80">
              <th
                onClick={() => handleSort('symbol')}
                className="cursor-pointer select-none px-3 py-3 pl-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 transition-colors hover:text-gray-700"
              >
                <span className="inline-flex items-center gap-1">
                  Symbol {sortIcon('symbol')}
                </span>
              </th>
              <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                Description
              </th>
              <th
                onClick={() => handleSort('type')}
                className="cursor-pointer select-none px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 transition-colors hover:text-gray-700"
              >
                <span className="inline-flex items-center gap-1">
                  Type {sortIcon('type')}
                </span>
              </th>
              <th
                onClick={() => handleSort('costBasis')}
                className="cursor-pointer select-none px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 transition-colors hover:text-gray-700"
              >
                <span className="inline-flex items-center gap-1">
                  Cost Basis {sortIcon('costBasis')}
                </span>
              </th>
              <th
                onClick={() => handleSort('unrealizedGainLoss')}
                className="cursor-pointer select-none px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 transition-colors hover:text-gray-700"
              >
                <span className="inline-flex items-center gap-1">
                  Unrealized G/L {sortIcon('unrealizedGainLoss')}
                </span>
              </th>
              <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">
                Custodian
              </th>
              <th
                onClick={() => handleSort('quantity')}
                className="cursor-pointer select-none px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 transition-colors hover:text-gray-700"
              >
                <span className="inline-flex items-center gap-1">
                  Quantity {sortIcon('quantity')}
                </span>
              </th>
              <th
                onClick={() => handleSort('marketValue')}
                className="cursor-pointer select-none py-3 pl-3 pr-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 transition-colors hover:text-gray-700"
              >
                <span className="inline-flex items-center gap-1">
                  Market Value {sortIcon('marketValue')}
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-16 text-center text-sm text-gray-400">
                  No holdings found. Try adjusting your search or account selection.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <ConsolidatedHoldingsRow
                  key={row.id}
                  row={row}
                  sector={inferSector(row)}
                  isExpanded={expandedIds.has(row.id)}
                  onToggle={() => toggleExpand(row.id)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
