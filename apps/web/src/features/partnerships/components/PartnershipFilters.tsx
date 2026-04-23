import React from 'react'
import { FilterToolbar } from '../../../components/FilterToolbar'
import type { PartnershipFilters } from '../hooks/usePartnershipQueries'

const STATUS_OPTIONS = [
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Pending', value: 'PENDING' },
  { label: 'Liquidated', value: 'LIQUIDATED' },
  { label: 'Closed', value: 'CLOSED' },
]

const ASSET_CLASS_OPTIONS = [
  { label: 'Private Equity', value: 'PE' },
  { label: 'Real Estate', value: 'RE' },
  { label: 'Venture Capital', value: 'VC' },
  { label: 'Infrastructure', value: 'Infra' },
  { label: 'Credit', value: 'Credit' },
  { label: 'Hedge Fund', value: 'HF' },
  { label: 'Other', value: 'Other' },
]

interface PartnershipFiltersProps {
  filters: PartnershipFilters
  onSearchChange: (value: string) => void
  onFilterChange: (key: keyof Omit<PartnershipFilters, 'search'>, value: PartnershipFilters[typeof key]) => void
  onClear: () => void
  resultCount?: number
}

export function PartnershipFilters({
  filters,
  onSearchChange,
  onFilterChange,
  onClear,
  resultCount,
}: PartnershipFiltersProps) {
  // FilterToolbar supports a single-value select per filter key.
  // Status is multi-select in the API but we simplify to single here;
  // parent converts empty string → [] and non-empty → [value].
  const statusValue = filters.status[0] ?? ''

  return (
    <FilterToolbar
      searchValue={filters.search}
      onSearchChange={onSearchChange}
      searchPlaceholder="Search partnerships or entities…"
      resultCount={resultCount}
      filters={[
        {
          key: 'assetClass',
          label: 'Asset Class',
          options: [{ label: 'All', value: '' }, ...ASSET_CLASS_OPTIONS],
          value: filters.assetClass,
          onChange: (v) => onFilterChange('assetClass', v),
        },
        {
          key: 'status',
          label: 'Status',
          options: [{ label: 'All', value: '' }, ...STATUS_OPTIONS],
          value: statusValue,
          onChange: (v) => onFilterChange('status', v ? [v] : []),
        },
      ]}
    />
  )
}
