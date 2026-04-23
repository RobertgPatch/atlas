import React from 'react'
import { SectionCard } from './SectionCard'
import { DataTable, type Column } from '../../../components/DataTable'
import type { PartnershipDetail } from '../../../../../packages/types/src/partnership-management'

type DistributionRow = PartnershipDetail['expectedDistributionHistory'][number]

const COLUMNS: Column<DistributionRow>[] = [
  {
    key: 'taxYear',
    header: 'Tax Year',
    sortable: true,
    render: (row) => <span className="font-medium tabular-nums">{row.taxYear}</span>,
  },
  {
    key: 'reportedDistributionUsd',
    header: 'Distribution (USD)',
    align: 'right',
    render: (row) =>
      row.reportedDistributionUsd != null ? (
        <span className="tabular-nums">${row.reportedDistributionUsd.toLocaleString()}</span>
      ) : (
        <span className="text-text-tertiary">—</span>
      ),
  },
  {
    key: 'finalizedFromK1DocumentId',
    header: 'Source K-1',
    render: (row) =>
      row.finalizedFromK1DocumentId ? (
        <span className="text-text-secondary font-mono text-xs">
          {row.finalizedFromK1DocumentId.slice(0, 8)}…
        </span>
      ) : (
        <span className="text-text-tertiary">—</span>
      ),
  },
]

interface ExpectedDistributionSectionProps {
  rows: DistributionRow[]
  loading?: boolean
}

export function ExpectedDistributionSection({ rows, loading = false }: ExpectedDistributionSectionProps) {
  return (
    <SectionCard
      title="Expected Distribution History"
      subtitle="Read-only — derived from finalized K-1 documents"
    >
      <DataTable
        columns={COLUMNS}
        data={rows}
        state={loading ? 'loading' : rows.length ? 'populated' : 'empty'}
        emptyTitle="No distribution history"
        emptyDescription="Distribution history will appear once K-1 documents are finalized."
      />
    </SectionCard>
  )
}
