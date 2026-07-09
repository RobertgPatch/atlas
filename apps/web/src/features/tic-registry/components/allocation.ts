import type {
  TicAcquisitionOrigin,
  TicAllocationState,
  TicAllocationStatus,
  TicInterestStatus,
  TicOwnerType,
  TicPropertyStatus,
  TicPropertyType,
} from '../../../../../../packages/types/src/tic-registry'

export const PROPERTY_TYPE_LABELS: Record<TicPropertyType, string> = {
  multifamily: 'Multifamily',
  retail: 'Retail',
  office: 'Office',
  industrial: 'Industrial',
  self_storage: 'Self Storage',
  hospitality: 'Hospitality',
  land: 'Land',
  mixed_use: 'Mixed Use',
  other: 'Other',
}

export const PROPERTY_STATUS_LABELS: Record<TicPropertyStatus, string> = {
  held: 'Held',
  under_contract: 'Under Contract',
  sold: 'Sold',
}

export const INTEREST_STATUS_LABELS: Record<TicInterestStatus, string> = {
  active: 'Active',
  rolled: 'Rolled',
  exited: 'Exited',
}

export const OWNER_TYPE_LABELS: Record<TicOwnerType, string> = {
  individual: 'Individual',
  trust: 'Trust',
  llc: 'LLC',
  partnership: 'Partnership',
  s_corp: 'S Corp',
  ira: 'IRA',
  other: 'Other',
}

export const ACQUISITION_ORIGIN_LABELS: Record<TicAcquisitionOrigin, string> = {
  cash: 'Cash',
  exchange: '1031 Exchange',
}

export const PROPERTY_TYPES = Object.keys(PROPERTY_TYPE_LABELS) as TicPropertyType[]
export const PROPERTY_STATUSES = Object.keys(PROPERTY_STATUS_LABELS) as TicPropertyStatus[]
export const INTEREST_STATUSES = Object.keys(INTEREST_STATUS_LABELS) as TicInterestStatus[]
export const OWNER_TYPES = Object.keys(OWNER_TYPE_LABELS) as TicOwnerType[]

export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '--'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '--'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00`))
}

export function formatPercent(value: number | null | undefined, digits = 2): string {
  if (value == null || Number.isNaN(value)) return '--'
  return `${value.toFixed(digits).replace(/\.?0+$/, '')}%`
}

export function allocationTone(statusOrAllocation: TicAllocationStatus | TicAllocationState): string {
  const status =
    typeof statusOrAllocation === 'string'
      ? statusOrAllocation
      : statusOrAllocation.status
  if (status === 'over') return 'text-red-700 bg-red-50 border-red-200'
  if (status === 'under') return 'text-amber-700 bg-amber-50 border-amber-200'
  return 'text-emerald-700 bg-emerald-50 border-emerald-200'
}

export function statusTone(status: TicPropertyStatus | TicInterestStatus): string {
  if (status === 'held' || status === 'active') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (status === 'under_contract' || status === 'rolled') return 'bg-blue-50 text-blue-700 border-blue-200'
  return 'bg-gray-100 text-gray-700 border-gray-200'
}
