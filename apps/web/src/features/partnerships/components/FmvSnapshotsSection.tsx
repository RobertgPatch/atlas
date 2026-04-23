import React from 'react'
import { SectionCard } from './SectionCard'
import { DataTable, type Column } from '../../../components/DataTable'
import type { FmvSnapshot } from '../../../../../packages/types/src/partnership-management'

const SOURCE_LABEL: Record<string, string> = {
  manager_statement: 'Manager Statement',
  valuation_409a: '409A Valuation',
  k1: 'K-1',
  manual: 'Manual',
}

const COLUMNS: Column<FmvSnapshot>[] = [
  {
    key: 'valuation_date',
    header: 'As-of Date',
    sortable: true,
    render: (row) => (
      <span className="tabular-nums text-text-primary">
        {new Date(row.asOfDate).toLocaleDateString()}
      </span>
    ),
  },
  {
    key: 'amountUsd',
    header: 'FMV (USD)',
    align: 'right',
    render: (row) => (
      <span className="tabular-nums font-medium">
        ${row.amountUsd.toLocaleString()}
      </span>
    ),
  },
  {
    key: 'source',
    header: 'Source',
    render: (row) => (
      <span className="text-text-secondary text-sm">
        {SOURCE_LABEL[row.source] ?? row.source}
      </span>
    ),
  },
  {
    key: 'note',
    header: 'Note',
    render: (row) =>
      row.note ? (
        <span className="text-text-secondary text-sm truncate max-w-xs block">{row.note}</span>
      ) : (
        <span className="text-text-tertiary">—</span>
      ),
  },
  {
    key: 'createdAt',
    header: 'Recorded',
    render: (row) => (
      <span className="text-text-tertiary text-xs">
        {new Date(row.createdAt).toLocaleDateString()}
      </span>
    ),
  },
]

interface FmvSnapshotsSectionProps {
  rows: FmvSnapshot[]
  loading?: boolean
  /** Slot for the Admin-only "Record FMV" button; wired in T063 */
  recordFmvAction?: React.ReactNode
}

export function FmvSnapshotsSection({ rows, loading = false, recordFmvAction }: FmvSnapshotsSectionProps) {
  return (
    <SectionCard
      title="FMV Snapshots"
      subtitle="Ordered newest first · append-only"
      headerAction={recordFmvAction}
    >
      <DataTable
        columns={COLUMNS}
        data={rows}
        state={loading ? 'loading' : rows.length ? 'populated' : 'empty'}
        emptyTitle="No FMV snapshots"
        emptyDescription="Record the first FMV snapshot to track the fair-market value over time."
      />
    </SectionCard>
  )
}
