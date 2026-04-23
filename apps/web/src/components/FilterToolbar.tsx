import React from 'react'
import { SearchIcon, XIcon } from 'lucide-react'

interface FilterOption {
  label: string
  value: string
}

interface FilterConfig {
  key: string
  label: string
  options: FilterOption[]
  value: string
  onChange: (value: string) => void
}

interface FilterToolbarProps {
  searchValue: string
  onSearchChange: (value: string) => void
  searchPlaceholder?: string
  filters: FilterConfig[]
  resultCount?: number
}

export function FilterToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search...',
  filters,
  resultCount,
}: FilterToolbarProps) {
  const hasActiveFilters = filters.some((f) => f.value !== '') || searchValue !== ''

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="relative flex-1 min-w-[220px] max-w-sm">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" />
        <input
          type="text"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full pl-9 pr-3 py-2 text-sm bg-surface border border-border rounded-card text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent transition-colors"
        />
        {searchValue && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-gray-100"
          >
            <XIcon className="w-3.5 h-3.5 text-text-tertiary" />
          </button>
        )}
      </div>

      {filters.map((filter) => (
        <select
          key={filter.key}
          value={filter.value}
          onChange={(e) => filter.onChange(e.target.value)}
          className="px-3 py-2 text-sm bg-surface border border-border rounded-card text-text-primary focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent transition-colors appearance-none cursor-pointer pr-8"
          style={filter.value ? { borderColor: '#1E3A5F', backgroundColor: '#FAFBFC' } : {}}
        >
          <option value="">{filter.label}</option>
          {filter.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ))}

      {hasActiveFilters && (
        <button
          onClick={() => {
            onSearchChange('')
            filters.forEach((f) => f.onChange(''))
          }}
          className="text-xs font-medium text-accent hover:text-accent-hover transition-colors px-2 py-1"
        >
          Clear all
        </button>
      )}

      {resultCount !== undefined && (
        <span className="text-xs text-text-tertiary ml-auto tabular-nums">
          {resultCount} {resultCount === 1 ? 'result' : 'results'}
        </span>
      )}
    </div>
  )
}
