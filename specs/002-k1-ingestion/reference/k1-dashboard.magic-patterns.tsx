// Magic Patterns seed for Screen #5 — K-1 Processing Dashboard
// Source: Magic Patterns generation (pasted via /speckit.specify 2026-04-21)
// Status: REFERENCE ONLY — presentational starting point.
// Per UI Constitution §10 this MUST be normalized to the Atlas component
// catalog (PageHeader, KpiCard, FilterToolbar, DataTable, StatusBadge,
// EmptyState, ErrorState, LoadingState, RowActionMenu) before merge.
// Do not import this file from production code.

import React, { useMemo, useState } from 'react'
import {
  UploadIcon,
  DownloadIcon,
  FileTextIcon,
  LoaderIcon,
  AlertTriangleIcon,
  CheckCircle2Icon,
  ShieldCheckIcon,
  MoreHorizontalIcon,
} from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { KpiCard } from '../components/KpiCard'
import { StatusBadge, StatusType } from '../components/StatusBadge'
import { FilterToolbar } from '../components/FilterToolbar'
import { DataTable, Column } from '../components/DataTable'

interface K1Document {
  id: string
  documentName: string
  partnership: string
  entity: string
  taxYear: string
  status: StatusType
  issuesCount: number
  uploadedDate: string
}

// NOTE: mock data retained only for reference; production wiring must use
// the `documents` / `k1_documents` API contract defined in this spec.
const mockDocuments: K1Document[] = [
  { id: '1', documentName: 'K-1 — Blackstone Capital Partners VII', partnership: 'Blackstone Capital Partners VII', entity: 'Whitfield Family Trust', taxYear: '2024', status: 'needs_review', issuesCount: 3, uploadedDate: '2025-04-18' },
  { id: '2', documentName: 'K-1 — Sequoia Heritage Fund', partnership: 'Sequoia Heritage Fund', entity: 'Whitfield Holdings LLC', taxYear: '2024', status: 'processing', issuesCount: 0, uploadedDate: '2025-04-18' },
  { id: '3', documentName: 'K-1 — KKR Americas Fund XII', partnership: 'KKR Americas Fund XII', entity: 'Whitfield Family Trust', taxYear: '2024', status: 'ready_for_approval', issuesCount: 0, uploadedDate: '2025-04-17' },
]

export function K1Dashboard() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [taxYearFilter, setTaxYearFilter] = useState('')
  const [entityFilter, setEntityFilter] = useState('')

  const filteredData = useMemo(() => mockDocuments.filter((doc) => {
    const matchesSearch = !search || doc.documentName.toLowerCase().includes(search.toLowerCase()) || doc.partnership.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = !statusFilter || doc.status === statusFilter
    const matchesTaxYear = !taxYearFilter || doc.taxYear === taxYearFilter
    const matchesEntity = !entityFilter || doc.entity === entityFilter
    return matchesSearch && matchesStatus && matchesTaxYear && matchesEntity
  }), [search, statusFilter, taxYearFilter, entityFilter])

  const kpis = useMemo(() => {
    const counts = { uploaded: 0, processing: 0, needs_review: 0, ready_for_approval: 0, finalized: 0 }
    mockDocuments.forEach((doc) => { counts[doc.status]++ })
    return counts
  }, [])

  const columns: Column<K1Document>[] = [
    { key: 'documentName', header: 'Document Name', sortable: true, width: '260px', render: (row) => <span className="font-medium">{row.documentName}</span> },
    { key: 'partnership', header: 'Partnership', sortable: true, render: (row) => <span>{row.partnership}</span> },
    { key: 'entity', header: 'Entity', sortable: true, render: (row) => <span>{row.entity}</span> },
    { key: 'taxYear', header: 'Tax Year', sortable: true, width: '100px', align: 'center', render: (row) => <span className="tabular-nums">{row.taxYear}</span> },
    { key: 'status', header: 'Status', sortable: true, width: '170px', render: (row) => <StatusBadge status={row.status} /> },
    { key: 'issuesCount', header: 'Issues', sortable: true, width: '80px', align: 'center', render: (row) => row.issuesCount > 0 ? <span>{row.issuesCount}</span> : <span>—</span> },
    { key: 'uploadedDate', header: 'Uploaded', sortable: true, width: '130px', render: (row) => <span>{row.uploadedDate}</span> },
    { key: 'actions', header: '', width: '48px', align: 'center', render: () => <button><MoreHorizontalIcon className="w-4 h-4" /></button> },
  ]

  return (
    <div className="w-full min-h-screen bg-background">
      <div className="max-w-[1360px] mx-auto px-6 py-8">
        <PageHeader
          title="K-1 Processing"
          subtitle="Monitor ingestion, review, and finalization workflow"
          primaryAction={{ label: 'Upload Documents', onClick: () => {}, icon: <UploadIcon className="w-4 h-4" /> }}
          secondaryActions={[{ label: 'Export', onClick: () => {}, icon: <DownloadIcon className="w-4 h-4" /> }]}
        />

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mt-8">
          <KpiCard label="Uploaded" value={kpis.uploaded} subtext="Awaiting processing" icon={<FileTextIcon className="w-4 h-4 text-gray-500" />} />
          <KpiCard label="Processing" value={kpis.processing} subtext="Parsing in progress" icon={<LoaderIcon className="w-4 h-4 text-accent" />} />
          <KpiCard label="Needs Review" value={kpis.needs_review} subtext="Requires attention" icon={<AlertTriangleIcon className="w-4 h-4 text-amber-600" />} />
          <KpiCard label="Ready for Approval" value={kpis.ready_for_approval} subtext="Pending sign-off" icon={<CheckCircle2Icon className="w-4 h-4 text-emerald-600" />} />
          <KpiCard label="Finalized" value={kpis.finalized} subtext="Completed" icon={<ShieldCheckIcon className="w-4 h-4 text-green-700" />} />
        </div>

        <div className="mt-8 mb-4">
          <FilterToolbar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search documents or partnerships..."
            resultCount={filteredData.length}
            filters={[
              { key: 'status', label: 'All Statuses', options: [], value: statusFilter, onChange: setStatusFilter },
              { key: 'taxYear', label: 'All Tax Years', options: [], value: taxYearFilter, onChange: setTaxYearFilter },
              { key: 'entity', label: 'All Entities', options: [], value: entityFilter, onChange: setEntityFilter },
            ]}
          />
        </div>

        <DataTable
          columns={columns}
          data={filteredData}
          state={filteredData.length === 0 ? 'empty' : 'populated'}
          onRowClick={(row) => console.log('Open review workspace for:', row.documentName)}
          onRetry={() => {}}
          emptyTitle="No documents found"
          emptyDescription="Try adjusting your search or filters, or upload new K-1 documents to get started."
          emptyAction={{ label: 'Upload Documents', onClick: () => {} }}
        />
      </div>
    </div>
  )
}
