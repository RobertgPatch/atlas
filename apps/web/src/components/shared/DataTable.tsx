import React from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

export interface Column<T> {
  key: string
  header: string
  accessor?: (row: T) => React.ReactNode
  align?: 'left' | 'right' | 'center'
  sortable?: boolean
  width?: string
}

export interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  onRowClick?: (row: T) => void
  sortColumn?: string
  sortDirection?: 'asc' | 'desc'
  onSort?: (columnKey: string) => void
  isLoading?: boolean
  emptyMessage?: string
}

export function DataTable<T extends { id: string | number }>({
  columns,
  data,
  onRowClick,
  sortColumn,
  sortDirection,
  onSort,
  isLoading,
  emptyMessage = 'No data available',
}: DataTableProps<T>) {
  if (isLoading) {
    return (
      <div className="w-full bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <div className="animate-pulse flex flex-col">
          <div className="h-12 bg-gray-50 border-b border-gray-200 w-full" />
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="h-16 border-b border-gray-100 w-full flex items-center px-6 space-x-4"
            >
              <div className="h-4 bg-gray-200 rounded w-1/4" />
              <div className="h-4 bg-gray-200 rounded w-1/4" />
              <div className="h-4 bg-gray-200 rounded w-1/4" />
              <div className="h-4 bg-gray-200 rounded w-1/4" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="w-full bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={`px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${
                    col.align === 'right'
                      ? 'text-right'
                      : col.align === 'center'
                      ? 'text-center'
                      : 'text-left'
                  } ${col.sortable ? 'cursor-pointer hover:bg-gray-100 transition-colors' : ''}`}
                  style={{ width: col.width }}
                  onClick={() => col.sortable && onSort && onSort(col.key)}
                >
                  <div
                    className={`flex items-center space-x-1 ${
                      col.align === 'right'
                        ? 'justify-end'
                        : col.align === 'center'
                        ? 'justify-center'
                        : 'justify-start'
                    }`}
                  >
                    <span>{col.header}</span>
                    {col.sortable && sortColumn === col.key && (
                      <span className="text-gray-400">
                        {sortDirection === 'asc' ? (
                          <ChevronUp className="w-3 h-3" />
                        ) : (
                          <ChevronDown className="w-3 h-3" />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-6 py-12 text-center text-sm text-gray-500"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => onRowClick && onRowClick(row)}
                  className={onRowClick ? 'cursor-pointer hover:bg-gray-50 transition-colors' : ''}
                >
                  {columns.map((col) => (
                    <td
                      key={`${row.id}-${col.key}`}
                      className={`px-6 py-4 whitespace-nowrap text-sm ${
                        col.align === 'right'
                          ? 'text-right'
                          : col.align === 'center'
                          ? 'text-center'
                          : 'text-left'
                      } ${col.key === columns[0].key ? 'font-medium text-gray-900' : 'text-gray-500'}`}
                    >
                      {col.accessor ? col.accessor(row) : (row as Record<string, unknown>)[col.key] as React.ReactNode}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
