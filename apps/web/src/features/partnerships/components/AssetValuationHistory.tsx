import type { Column } from '../../../components/DataTable'
import { DataTable } from '../../../components/DataTable'
import type { AssetFmvSnapshot } from 'packages/types/src'

const columns: Column<AssetFmvSnapshot>[] = [
  {
    key: 'valuationDate',
    header: 'Valuation Date',
    render: (row) => <span className="tabular-nums">{new Date(row.valuationDate).toLocaleDateString()}</span>,
  },
  {
    key: 'amountUsd',
    header: 'FMV (USD)',
    align: 'right',
    render: (row) => <span className="font-medium tabular-nums">${row.amountUsd.toLocaleString()}</span>,
  },
  {
    key: 'source',
    header: 'Source',
    render: (row) => <span className="capitalize text-text-secondary">{row.source.replaceAll('_', ' ')}</span>,
  },
  {
    key: 'confidenceLabel',
    header: 'Confidence',
    render: (row) => row.confidenceLabel ?? <span className="text-text-tertiary">—</span>,
  },
  {
    key: 'note',
    header: 'Note',
    render: (row) => row.note ?? <span className="text-text-tertiary">—</span>,
  },
]

interface AssetValuationHistoryProps {
  rows: AssetFmvSnapshot[]
  isLoading: boolean
  isError: boolean
  onRetry: () => void
}

export function AssetValuationHistory({ rows, isLoading, isError, onRetry }: AssetValuationHistoryProps) {
  return (
    <div>
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-text-primary">Valuation History</h3>
        <p className="mt-0.5 text-xs text-text-tertiary">Newest recorded snapshot first. Same-day corrections remain visible.</p>
      </div>
      <DataTable
        columns={columns}
        data={rows}
        state={isLoading ? 'loading' : isError ? 'error' : rows.length ? 'populated' : 'empty'}
        onRetry={onRetry}
        emptyTitle="No FMV history yet"
        emptyDescription="Record the first FMV snapshot to begin the append-only valuation history for this asset."
      />
    </div>
  )
}