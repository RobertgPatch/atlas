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

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Mock data ────────────────────────────────────────────────────────────────

const mockDocuments: K1Document[] = [
  {
    id: '1',
    documentName: 'K-1 — Blackstone Capital Partners VII',
    partnership: 'Blackstone Capital Partners VII',
    entity: 'Whitfield Family Trust',
    taxYear: '2024',
    status: 'needs_review',
    issuesCount: 3,
    uploadedDate: '2025-04-18',
  },
  {
    id: '2',
    documentName: 'K-1 — Sequoia Heritage Fund',
    partnership: 'Sequoia Heritage Fund',
    entity: 'Whitfield Holdings LLC',
    taxYear: '2024',
    status: 'processing',
    issuesCount: 0,
    uploadedDate: '2025-04-18',
  },
  {
    id: '3',
    documentName: 'K-1 — KKR Americas Fund XII',
    partnership: 'KKR Americas Fund XII',
    entity: 'Whitfield Family Trust',
    taxYear: '2024',
    status: 'ready_for_approval',
    issuesCount: 0,
    uploadedDate: '2025-04-17',
  },
  {
    id: '4',
    documentName: 'K-1 — Carlyle Realty Partners IX',
    partnership: 'Carlyle Realty Partners IX',
    entity: 'Whitfield Realty LLC',
    taxYear: '2024',
    status: 'uploaded',
    issuesCount: 0,
    uploadedDate: '2025-04-17',
  },
  {
    id: '5',
    documentName: 'K-1 — Apollo Investment Fund IX',
    partnership: 'Apollo Investment Fund IX',
    entity: 'Whitfield Holdings LLC',
    taxYear: '2024',
    status: 'finalized',
    issuesCount: 0,
    uploadedDate: '2025-04-15',
  },
  {
    id: '6',
    documentName: 'K-1 — Warburg Pincus Fund XIII',
    partnership: 'Warburg Pincus Fund XIII',
    entity: 'Whitfield Family Trust',
    taxYear: '2024',
    status: 'needs_review',
    issuesCount: 1,
    uploadedDate: '2025-04-15',
  },
  {
    id: '7',
    documentName: 'K-1 — TPG Capital Partners VIII',
    partnership: 'TPG Capital Partners VIII',
    entity: 'Whitfield Holdings LLC',
    taxYear: '2023',
    status: 'finalized',
    issuesCount: 0,
    uploadedDate: '2025-03-20',
  },
  {
    id: '8',
    documentName: 'K-1 — Ares Capital Corp',
    partnership: 'Ares Capital Corp',
    entity: 'Whitfield Realty LLC',
    taxYear: '2023',
    status: 'finalized',
    issuesCount: 0,
    uploadedDate: '2025-03-18',
  },
  {
    id: '9',
    documentName: 'K-1 — Brookfield Asset Mgmt',
    partnership: 'Brookfield Asset Management',
    entity: 'Whitfield Family Trust',
    taxYear: '2024',
    status: 'processing',
    issuesCount: 0,
    uploadedDate: '2025-04-19',
  },
  {
    id: '10',
    documentName: 'K-1 — Silver Lake Partners VI',
    partnership: 'Silver Lake Partners VI',
    entity: 'Whitfield Holdings LLC',
    taxYear: '2024',
    status: 'uploaded',
    issuesCount: 0,
    uploadedDate: '2025-04-19',
  },
]

const statusOptions = [
  { label: 'Uploaded', value: 'uploaded' },
  { label: 'Processing', value: 'processing' },
  { label: 'Needs Review', value: 'needs_review' },
  { label: 'Ready for Approval', value: 'ready_for_approval' },
  { label: 'Finalized', value: 'finalized' },
]

const taxYearOptions = [
  { label: '2024', value: '2024' },
  { label: '2023', value: '2023' },
  { label: '2022', value: '2022' },
]

const entityOptions = [
  { label: 'Whitfield Family Trust', value: 'Whitfield Family Trust' },
  { label: 'Whitfield Holdings LLC', value: 'Whitfield Holdings LLC' },
  { label: 'Whitfield Realty LLC', value: 'Whitfield Realty LLC' },
]

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── Component ────────────────────────────────────────────────────────────────

export function K1Dashboard() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [taxYearFilter, setTaxYearFilter] = useState('')
  const [entityFilter, setEntityFilter] = useState('')
  const [tableState] = useState<'loading' | 'empty' | 'error' | 'populated'>('populated')

  const filteredData = useMemo(() => {
    return mockDocuments.filter((doc) => {
      const matchesSearch =
        !search ||
        doc.documentName.toLowerCase().includes(search.toLowerCase()) ||
        doc.partnership.toLowerCase().includes(search.toLowerCase())
      const matchesStatus = !statusFilter || doc.status === statusFilter
      const matchesTaxYear = !taxYearFilter || doc.taxYear === taxYearFilter
      const matchesEntity = !entityFilter || doc.entity === entityFilter
      return matchesSearch && matchesStatus && matchesTaxYear && matchesEntity
    })
  }, [search, statusFilter, taxYearFilter, entityFilter])

  const kpis = useMemo(() => {
    const counts = { uploaded: 0, processing: 0, needs_review: 0, ready_for_approval: 0, finalized: 0 }
    mockDocuments.forEach((doc) => { counts[doc.status]++ })
    return counts
  }, [])

  const columns: Column<K1Document>[] = [
    {
      key: 'documentName',
      header: 'Document Name',
      sortable: true,
      width: '260px',
      render: (row) => <span className="font-medium text-text-primary">{row.documentName}</span>,
    },
    {
      key: 'partnership',
      header: 'Partnership',
      sortable: true,
      render: (row) => <span className="text-text-secondary">{row.partnership}</span>,
    },
    {
      key: 'entity',
      header: 'Entity',
      sortable: true,
      render: (row) => <span className="text-text-secondary">{row.entity}</span>,
    },
    {
      key: 'taxYear',
      header: 'Tax Year',
      sortable: true,
      width: '100px',
      align: 'center',
      render: (row) => <span className="text-text-secondary tabular-nums">{row.taxYear}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      width: '170px',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'issuesCount',
      header: 'Issues',
      sortable: true,
      width: '80px',
      align: 'center',
      render: (row) =>
        row.issuesCount > 0 ? (
          <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-amber-50 text-amber-700 text-xs font-medium tabular-nums">
            {row.issuesCount}
          </span>
        ) : (
          <span className="text-text-tertiary">—</span>
        ),
    },
    {
      key: 'uploadedDate',
      header: 'Uploaded',
      sortable: true,
      width: '130px',
      render: (row) => (
        <span className="text-text-tertiary tabular-nums text-xs">{formatDate(row.uploadedDate)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '48px',
      align: 'center',
      render: () => (
        <button
          onClick={(e) => e.stopPropagation()}
          className="p-1 rounded hover:bg-gray-100 transition-colors text-text-tertiary hover:text-text-secondary"
        >
          <MoreHorizontalIcon className="w-4 h-4" />
        </button>
      ),
    },
  ]

  return (
    <div className="w-full min-h-screen bg-background">
      <div className="max-w-[1360px] mx-auto px-6 py-8">
        {/* Header */}
        <PageHeader
          title="K-1 Processing"
          subtitle="Monitor ingestion, review, and finalization workflow"
          primaryAction={{
            label: 'Upload Documents',
            onClick: () => {},
            icon: <UploadIcon className="w-4 h-4" />,
          }}
          secondaryActions={[
            {
              label: 'Export',
              onClick: () => {},
              icon: <DownloadIcon className="w-4 h-4" />,
            },
          ]}
        />

        {/* KPI Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mt-8">
          <KpiCard
            label="Uploaded"
            value={kpis.uploaded}
            subtext="Awaiting processing"
            icon={<FileTextIcon className="w-4 h-4 text-gray-500" />}
            accentColor="#6B7280"
          />
          <KpiCard
            label="Processing"
            value={kpis.processing}
            subtext="Parsing in progress"
            icon={<LoaderIcon className="w-4 h-4 text-accent" />}
            accentColor="#1E3A5F"
          />
          <KpiCard
            label="Needs Review"
            value={kpis.needs_review}
            subtext="Requires attention"
            icon={<AlertTriangleIcon className="w-4 h-4 text-amber-600" />}
            accentColor="#D97706"
          />
          <KpiCard
            label="Ready for Approval"
            value={kpis.ready_for_approval}
            subtext="Pending sign-off"
            icon={<CheckCircle2Icon className="w-4 h-4 text-emerald-600" />}
            accentColor="#059669"
          />
          <KpiCard
            label="Finalized"
            value={kpis.finalized}
            subtext="Completed"
            icon={<ShieldCheckIcon className="w-4 h-4 text-green-700" />}
            accentColor="#15803D"
          />
        </div>

        {/* Filter Toolbar */}
        <div className="mt-8 mb-4">
          <FilterToolbar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search documents or partnerships..."
            resultCount={filteredData.length}
            filters={[
              {
                key: 'status',
                label: 'All Statuses',
                options: statusOptions,
                value: statusFilter,
                onChange: setStatusFilter,
              },
              {
                key: 'taxYear',
                label: 'All Tax Years',
                options: taxYearOptions,
                value: taxYearFilter,
                onChange: setTaxYearFilter,
              },
              {
                key: 'entity',
                label: 'All Entities',
                options: entityOptions,
                value: entityFilter,
                onChange: setEntityFilter,
              },
            ]}
          />
        </div>

        {/* Data Table */}
        <DataTable
          columns={columns}
          data={filteredData}
          state={filteredData.length === 0 && tableState === 'populated' ? 'empty' : tableState}
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
