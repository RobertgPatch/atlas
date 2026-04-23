import React, { useState } from 'react'
import { ArrowUpIcon, ArrowDownIcon, ChevronsUpDownIcon } from 'lucide-react'
import { LoadingState } from './LoadingState'
import { EmptyState } from './EmptyState'
import { ErrorState } from './ErrorState'

export interface Column<T> {
  key: string
  header: string
  sortable?: boolean
  width?: string
  align?: 'left' | 'center' | 'right'
  render: (row: T, index: number) => React.ReactNode
}

type SortDirection = 'asc' | 'desc' | null

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  state: 'loading' | 'empty' | 'error' | 'populated'
  onRowClick?: (row: T, index: number) => void
  onRetry?: () => void
  emptyTitle?: string
  emptyDescription?: string
  emptyAction?: { label: string; onClick: () => void }
  onSort?: (key: string, direction: SortDirection) => void
  stickyHeader?: boolean
}

export function DataTable<T>({
  columns,
  data,
  state,
  onRowClick,
  onRetry,
  emptyTitle = 'No data found',
  emptyDescription = 'Try adjusting your filters or check back later.',
  emptyAction,
  onSort,
  stickyHeader = true,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDirection>(null)

  const handleSort = (key: string) => {
    let newDir: SortDirection
    if (sortKey === key) {
      newDir = sortDir === 'asc' ? 'desc' : sortDir === 'desc' ? null : 'asc'
    } else {
      newDir = 'asc'
    }
    setSortKey(newDir ? key : null)
    setSortDir(newDir)
    onSort?.(key, newDir)
  }

  if (state === 'loading') {
    return (
      <div className="bg-surface border border-border rounded-card overflow-hidden">
        <LoadingState rows={6} columns={columns.length} />
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="bg-surface border border-border rounded-card overflow-hidden">
        <ErrorState onRetry={onRetry} />
      </div>
    )
  }

  if (state === 'empty') {
    return (
      <div className="bg-surface border border-border rounded-card overflow-hidden">
        <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
      </div>
    )
  }

  return (
    <div className="bg-surface border border-border rounded-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr
              className={`border-b border-border bg-gray-50/70 ${stickyHeader ? 'sticky top-0 z-10' : ''}`}
            >
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-2.5 text-xs font-medium text-text-tertiary uppercase tracking-wider whitespace-nowrap ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'} ${col.sortable ? 'cursor-pointer select-none hover:text-text-secondary transition-colors' : ''}`}
                  style={col.width ? { width: col.width } : undefined}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {col.sortable && (
                      <span className="inline-flex w-3.5 h-3.5">
                        {sortKey === col.key && sortDir === 'asc' ? (
                          <ArrowUpIcon className="w-3.5 h-3.5 text-accent" />
                        ) : sortKey === col.key && sortDir === 'desc' ? (
                          <ArrowDownIcon className="w-3.5 h-3.5 text-accent" />
                        ) : (
                          <ChevronsUpDownIcon className="w-3.5 h-3.5 opacity-30" />
                        )}
                      </span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, idx) => (
              <tr
                key={idx}
                onClick={onRowClick ? () => onRowClick(row, idx) : undefined}
                className={`border-b border-border-subtle last:border-b-0 transition-colors ${onRowClick ? 'cursor-pointer hover:bg-gray-50/50' : ''}`}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 py-3 whitespace-nowrap ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}
                  >
                    {col.render(row, idx)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
