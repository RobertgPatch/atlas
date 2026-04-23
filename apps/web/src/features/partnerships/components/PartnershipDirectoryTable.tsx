import React from 'react'
import { DataTable, type Column } from '../../../components/DataTable'
import type { PartnershipDirectoryRow } from '../../../../../packages/types/src/partnership-management'

interface PartnershipStatusBadgeProps {
  status: string
}

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  ACTIVE: { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
  PENDING: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  LIQUIDATED: { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
  CLOSED: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-400' },
}

function PartnershipStatusBadge({ status }: PartnershipStatusBadgeProps) {
  const cfg = STATUS_STYLES[status] ?? STATUS_STYLES.CLOSED!
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  )
}

function formatUsd(value: number | null | undefined): string {
  if (value == null) return '—'
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
  return `$${value.toLocaleString()}`
}

interface PartnershipDirectoryTableProps {
  rows: PartnershipDirectoryRow[]
  state: 'loading' | 'empty' | 'error' | 'populated'
  onRowClick: (row: PartnershipDirectoryRow) => void
  onRetry?: () => void
  onSort?: (key: string, dir: 'asc' | 'desc' | null) => void
}

const COLUMNS: Column<PartnershipDirectoryRow>[] = [
  {
    key: 'name',
    header: 'Partnership Name',
    sortable: true,
    render: (row) => (
      <span className="font-medium text-text-primary">{row.name}</span>
    ),
  },
  {
    key: 'entity',
    header: 'Entity',
    sortable: true,
    render: (row) => (
      <span className="text-text-secondary">{row.entity.name}</span>
    ),
  },
  {
    key: 'assetClass',
    header: 'Asset Class',
    sortable: true,
    render: (row) => row.assetClass ?? <span className="text-text-tertiary">—</span>,
  },
  {
    key: 'status',
    header: 'Status',
    sortable: true,
    render: (row) => <PartnershipStatusBadge status={row.status} />,
  },
  {
    key: 'latestK1Year',
    header: 'Latest K-1 Year',
    sortable: true,
    align: 'right',
    render: (row) =>
      row.latestK1Year != null ? (
        String(row.latestK1Year)
      ) : (
        <span className="text-text-tertiary">—</span>
      ),
  },
  {
    key: 'latestDistributionUsd',
    header: 'Distribution',
    sortable: true,
    align: 'right',
    render: (row) => (
      <span className="tabular-nums">{formatUsd(row.latestDistributionUsd)}</span>
    ),
  },
  {
    key: 'latestFmvAmountUsd',
    header: 'Latest FMV',
    sortable: true,
    align: 'right',
    render: (row) => (
      <span className="tabular-nums">
        {row.latestFmv ? formatUsd(row.latestFmv.amountUsd) : '—'}
      </span>
    ),
  },
]

export function PartnershipDirectoryTable({
  rows,
  state,
  onRowClick,
  onRetry,
  onSort,
}: PartnershipDirectoryTableProps) {
  return (
    <DataTable
      columns={COLUMNS}
      data={rows}
      state={state}
      onRowClick={(row) => onRowClick(row)}
      onRetry={onRetry}
      onSort={onSort}
      stickyHeader
      emptyTitle="No partnerships found"
      emptyDescription="Try adjusting your filters or add a new partnership."
    />
  )
}
