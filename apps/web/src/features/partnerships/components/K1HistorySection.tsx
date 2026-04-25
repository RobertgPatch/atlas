import React from 'react'
import { useNavigate } from 'react-router-dom'
import { SectionCard } from './SectionCard'
import { DataTable, type Column } from '../../../components/DataTable'
import { ExternalLinkIcon } from 'lucide-react'
import type { PartnershipDetail } from '../../../../../packages/types/src/partnership-management'

type K1Row = PartnershipDetail['k1History'][number]

const STATUS_LABEL: Record<string, string> = {
  UPLOADED: 'Uploaded',
  PROCESSING: 'Processing',
  NEEDS_REVIEW: 'Needs Review',
  READY_FOR_APPROVAL: 'Ready for Approval',
  FINALIZED: 'Finalized',
}

const COLUMNS: Column<K1Row>[] = [
  {
    key: 'taxYear',
    header: 'Tax Year',
    sortable: true,
    render: (row) => <span className="font-medium tabular-nums">{row.taxYear}</span>,
  },
  {
    key: 'processingStatus',
    header: 'Status',
    render: (row) => (
      <span className="text-text-secondary text-sm">
        {STATUS_LABEL[row.processingStatus] ?? row.processingStatus}
      </span>
    ),
  },
  {
    key: 'reportedDistributionUsd',
    header: 'Distribution',
    align: 'right',
    render: (row) =>
      row.reportedDistributionUsd != null ? (
        <span className="tabular-nums">${row.reportedDistributionUsd.toLocaleString()}</span>
      ) : (
        <span className="text-text-tertiary">—</span>
      ),
  },
  {
    key: 'finalizedAt',
    header: 'Finalized',
    render: (row) =>
      row.finalizedAt ? (
        <span className="text-text-secondary text-sm">
          {new Date(row.finalizedAt).toLocaleDateString()}
        </span>
      ) : (
        <span className="text-text-tertiary">—</span>
      ),
  },
  {
    key: 'review',
    header: '',
    render: (row) => (
      <span className="flex items-center gap-1 text-accent text-xs font-medium">
        Review <ExternalLinkIcon className="w-3 h-3" />
      </span>
    ),
  },
]

interface K1HistorySectionProps {
  rows: K1Row[]
  loading?: boolean
}

export function K1HistorySection({ rows, loading = false }: K1HistorySectionProps) {
  const navigate = useNavigate()

  return (
    <SectionCard
      title="K-1 History"
      subtitle={rows.length ? `${rows.length} document${rows.length === 1 ? '' : 's'}` : undefined}
    >
      <DataTable
        columns={COLUMNS}
        data={rows}
        state={loading ? 'loading' : rows.length ? 'populated' : 'empty'}
        onRowClick={(row) => navigate(`/k1/${row.k1DocumentId}/review`)}
        emptyTitle="No K-1 documents"
        emptyDescription="No K-1 documents have been processed for this partnership yet."
      />
    </SectionCard>
  )
}
