import React from 'react'
import { Search, Filter, Download, Plus } from 'lucide-react'
import { Button } from './Button'

export interface FilterToolbarProps {
  onSearch?: (query: string) => void
  actions?: React.ReactNode
  showExport?: boolean
  primaryAction?: {
    label: string
    onClick: () => void
    icon?: React.ReactNode
  }
}

export function FilterToolbar({ onSearch, actions, showExport, primaryAction }: FilterToolbarProps) {
  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
      <div className="flex items-center gap-3 w-full sm:w-auto">
        <div className="relative w-full sm:w-64">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg leading-5 bg-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-focus focus:border-focus sm:text-sm transition-colors"
            placeholder="Search..."
            onChange={(e) => onSearch?.(e.target.value)}
          />
        </div>

        <Button variant="secondary" size="sm">
          <Filter className="h-4 w-4 mr-2 text-gray-400" />
          Filters
        </Button>
      </div>

      <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
        {actions}

        {showExport && (
          <Button variant="secondary" size="sm">
            <Download className="h-4 w-4 mr-2 text-gray-400" />
            Export
          </Button>
        )}

        {primaryAction && (
          <Button
            onClick={primaryAction.onClick}
          >
            {primaryAction.icon || <Plus className="h-4 w-4 mr-2" />}
            {primaryAction.label}
          </Button>
        )}
      </div>
    </div>
  )
}
