import { useMemo, useRef, useState } from 'react'
import {
  FileText,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  Upload,
  UploadCloud,
  Download,
  RefreshCw,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../components/shared/AppShell'
import { PageHeader } from '../components/shared/PageHeader'
import { KPICard } from '../components/shared/KPICard'
import {
  DataTable,
  type Column,
} from '../components/shared/DataTable'
import { StatusBadge } from '../components/shared/StatusBadge'
import { useSession, sessionStore } from '../auth/sessionStore'
import { authClient } from '../auth/authClient'
import {
  useK1Kpis,
  useK1List,
  useK1Lookups,
  useK1Reparse,
  useK1Upload,
} from '../features/k1/hooks/useK1Queries'
import { K1ApiError, k1Client } from '../features/k1/api/k1Client'
import { K1UploadDialog } from '../features/k1/components/K1UploadDialog'
import type {
  K1DocumentSummary,
  K1Status,
} from '../../../../packages/types/src/k1-ingestion'

const currentYear = new Date().getFullYear()

const STATUS_BADGE_LABEL: Record<K1Status, string> = {
  UPLOADED: 'Uploaded',
  PROCESSING: 'Processing',
  NEEDS_REVIEW: 'Needs Review',
  READY_FOR_APPROVAL: 'Ready for Approval',
  FINALIZED: 'Finalized',
}

const STATUS_BADGE_TYPE: Record<
  K1Status,
  'default' | 'info' | 'warning' | 'success' | 'error'
> = {
  UPLOADED: 'default',
  PROCESSING: 'info',
  NEEDS_REVIEW: 'warning',
  READY_FOR_APPROVAL: 'info',
  FINALIZED: 'success',
}

type TableRow = K1DocumentSummary

export function K1Dashboard() {
  const { session } = useSession()
  const [taxYear, setTaxYear] = useState<number>(currentYear - 1)
  const [entityId, setEntityId] = useState<string>('')
  const [status, setStatus] = useState<K1Status | ''>('')
  const [search, setSearch] = useState<string>('')
  const [sortColumn, setSortColumn] = useState<string>('uploadedAt')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [quickUploadEntityId, setQuickUploadEntityId] = useState('')
  const [quickUploadFile, setQuickUploadFile] = useState<File | null>(null)
  const [quickUploadError, setQuickUploadError] = useState<string | null>(null)
  const [isDragActive, setIsDragActive] = useState(false)
  const quickUploadInputRef = useRef<HTMLInputElement | null>(null)

  const lookups = useK1Lookups()
  const upload = useK1Upload()
  const reparse = useK1Reparse()
  const navigate = useNavigate()

  const apiSort = useMemo(() => {
    switch (sortColumn) {
      case 'partnership': return 'partnership' as const
      case 'entity': return 'entity' as const
      case 'taxYear': return 'tax_year' as const
      case 'status': return 'status' as const
      case 'issuesOpenCount': return 'issues' as const
      default: return 'uploaded_at' as const
    }
  }, [sortColumn])

  const filters = {
    taxYear: taxYear || undefined,
    entityId: entityId || undefined,
    status: (status || undefined) as K1Status | undefined,
    q: search.trim() || undefined,
    sort: apiSort,
    direction: sortDirection,
    limit: 50,
  }

  const listQuery = useK1List(filters)
  const kpiQuery = useK1Kpis({
    taxYear: taxYear || undefined,
    entityId: entityId || undefined,
  })

  const counts = kpiQuery.data?.counts ?? {
    UPLOADED: 0,
    PROCESSING: 0,
    NEEDS_REVIEW: 0,
    READY_FOR_APPROVAL: 0,
    FINALIZED: 0,
  }

  const hasEntities = (lookups.data?.entities.length ?? 0) > 0

  const setPickedFile = (nextFile: File | null) => {
    if (!nextFile) {
      setQuickUploadFile(null)
      return
    }

    const isPdf =
      nextFile.type === 'application/pdf' ||
      nextFile.name.toLowerCase().endsWith('.pdf')

    if (!isPdf) {
      setQuickUploadError('Only PDF files are supported for K-1 upload.')
      setQuickUploadFile(null)
      return
    }

    setQuickUploadError(null)
    setQuickUploadFile(nextFile)
  }

  const handleQuickUpload = async () => {
    if (!quickUploadEntityId) {
      setQuickUploadError('Choose an entity before uploading a file.')
      return
    }

    if (!quickUploadFile) {
      setQuickUploadError('Select a PDF file to upload.')
      return
    }

    setQuickUploadError(null)

    try {
      await upload.mutateAsync({
        file: quickUploadFile,
        entityId: quickUploadEntityId,
      })
      setQuickUploadFile(null)
      void listQuery.refetch()
      void kpiQuery.refetch()
    } catch (err) {
      setQuickUploadError(err instanceof K1ApiError ? err.code : 'Upload failed. Try again.')
    }
  }

  const tableData = listQuery.data?.items ?? []
  const processingRows = tableData.filter((row) => row.status === 'PROCESSING')

  const columns: Column<TableRow>[] = [
    {
      key: 'documentName',
      header: 'Document',
      sortable: false,
      accessor: (row) => (
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <span className="font-medium text-gray-900">{row.documentName}</span>
        </div>
      ),
    },
    {
      key: 'partnership',
      header: 'Partnership',
      sortable: true,
      accessor: (row) => row.partnership.name ?? 'Resolving partnership…',
    },
    {
      key: 'entity',
      header: 'Entity',
      sortable: true,
      accessor: (row) => row.entity.name,
    },
    {
      key: 'taxYear',
      header: 'Year',
      sortable: true,
      align: 'center',
      accessor: (row) => row.taxYear ?? '—',
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      align: 'center',
      accessor: (row) => (
        <div className="flex items-center justify-center gap-1.5">
          <StatusBadge
            status={STATUS_BADGE_LABEL[row.status]}
            type={STATUS_BADGE_TYPE[row.status]}
          />
          {row.status === 'PROCESSING' && (
            <span className="inline-flex items-center gap-1 text-xs text-atlas-gold font-medium">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Parsing…
            </span>
          )}
          {row.parseError && (
            <button
              title={`${row.parseError.code}: ${row.parseError.message}`}
              onClick={(e) => {
                e.stopPropagation()
                reparse.mutate(row.id)
              }}
              disabled={reparse.isPending && reparse.variables === row.id}
              className="inline-flex items-center gap-1 text-error text-xs hover:underline disabled:opacity-50 disabled:cursor-wait"
            >
              {reparse.isPending && reparse.variables === row.id ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5" />
              )}
              {reparse.isPending && reparse.variables === row.id ? 'Re-parsing…' : 'Re-parse'}
            </button>
          )}
        </div>
      ),
    },
    {
      key: 'issuesOpenCount',
      header: 'Issues',
      sortable: true,
      align: 'center',
      accessor: (row) =>
        row.issuesOpenCount > 0 ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-warning-light text-warning">
            {row.issuesOpenCount}
          </span>
        ) : (
          <span className="text-gray-400 text-xs">—</span>
        ),
    },
    {
      key: 'uploadedAt',
      header: 'Uploaded',
      sortable: true,
      align: 'right',
      accessor: (row) => new Date(row.uploadedAt).toLocaleDateString(),
    },
  ]

  const handleSort = (columnKey: string) => {
    if (sortColumn === columnKey) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortColumn(columnKey)
      setSortDirection('desc')
    }
  }

  const handleExport = () => {
    const url = k1Client.exportCsvUrl(filters)
    void fetch(url, { credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const blob = await r.blob()
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `k1-export-${Date.now()}.csv`
        document.body.appendChild(a)
        a.click()
        a.remove()
      })
      .catch((err) => {
        console.error('Export failed', err)
      })
  }

  return (
    <AppShell
      currentPath="/k1"
      userRole={session?.role ?? 'User'}
      userEmail={session?.user.email}
      onSignOut={() => {
        void authClient.logout().finally(() => sessionStore.setUnauthenticated())
      }}
    >
      <PageHeader
        title="K-1 Processing"
        subtitle="Upload, parse, and review K-1 documents per entity and tax year."
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 bg-white hover:bg-gray-50"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
            <button
              onClick={() => setUploadOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white bg-atlas-gold hover:bg-atlas-hover"
            >
              <Upload className="w-4 h-4" />
              Upload K-1
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <KPICard label="Uploaded" value={counts.UPLOADED} icon={FileText} />
        <KPICard label="Processing" value={counts.PROCESSING} icon={Loader2} />
        <KPICard label="Needs Review" value={counts.NEEDS_REVIEW} icon={AlertCircle} />
        <KPICard label="Ready for Approval" value={counts.READY_FOR_APPROVAL} icon={CheckCircle2} />
        <KPICard label="Finalized" value={counts.FINALIZED} icon={ShieldCheck} />
      </div>

      <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Quick K-1 Upload</h2>
            <p className="text-sm text-gray-500">Drag and drop a PDF to upload directly from this page.</p>
          </div>
          <button
            onClick={() => setUploadOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 bg-white hover:bg-gray-50"
          >
            <Upload className="w-4 h-4" />
            Open Upload Dialog
          </button>
        </div>

        {!lookups.isLoading && !hasEntities ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Create an entity first before uploading K-1 files.
          </div>
        ) : (
          <>
            <div className="mb-3">
              <label className="text-sm font-medium text-gray-700">Entity</label>
              <select
                value={quickUploadEntityId}
                onChange={(e) => {
                  setQuickUploadEntityId(e.target.value)
                  setQuickUploadError(null)
                }}
                className="mt-1 block w-full max-w-sm px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                disabled={lookups.isLoading || upload.isPending}
              >
                <option value="">Select entity…</option>
                {lookups.data?.entities.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>

            <div
              className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
                isDragActive
                  ? 'border-atlas-gold bg-atlas-light/20'
                  : 'border-gray-300 bg-gray-50'
              }`}
              onDragOver={(e) => {
                e.preventDefault()
                if (!upload.isPending) setIsDragActive(true)
              }}
              onDragLeave={(e) => {
                e.preventDefault()
                setIsDragActive(false)
              }}
              onDrop={(e) => {
                e.preventDefault()
                setIsDragActive(false)
                if (upload.isPending) return
                setPickedFile(e.dataTransfer.files?.[0] ?? null)
              }}
            >
              <UploadCloud className={`mx-auto mb-3 h-8 w-8 ${isDragActive ? 'text-atlas-gold' : 'text-gray-400'}`} />
              <p className="text-sm font-medium text-gray-900">Drag and drop a K-1 PDF here</p>
              <p className="mt-1 text-sm text-gray-500">or choose a file from your computer</p>
              <button
                type="button"
                onClick={() => quickUploadInputRef.current?.click()}
                disabled={upload.isPending}
                className="mt-4 inline-flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                <Upload className="w-4 h-4" />
                Choose PDF
              </button>
              <input
                ref={quickUploadInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => setPickedFile(e.target.files?.[0] ?? null)}
              />
            </div>

            {quickUploadFile && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                <p className="text-sm text-gray-700">
                  Selected: <span className="font-medium text-gray-900">{quickUploadFile.name}</span>
                </p>
                <button
                  type="button"
                  onClick={handleQuickUpload}
                  disabled={upload.isPending || !quickUploadEntityId}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white bg-atlas-gold hover:bg-atlas-hover disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {upload.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {upload.isPending ? 'Uploading…' : 'Upload PDF'}
                </button>
              </div>
            )}

            {quickUploadError && (
              <div className="mt-3 rounded-md border border-error/30 bg-error-light p-3 text-sm text-error">
                {quickUploadError}
              </div>
            )}
          </>
        )}
      </section>

      {processingRows.length > 0 && (
        <section className="bg-white border border-atlas-gold/30 rounded-lg shadow-sm p-4 mb-4">
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 text-atlas-gold animate-spin" />
            <h3 className="text-sm font-semibold text-gray-900">
              {processingRows.length} {processingRows.length === 1 ? 'document is' : 'documents are'} processing
            </h3>
          </div>
          <p className="mt-1 text-sm text-gray-600">
            Parsing is running in the background. This page refreshes automatically every few seconds.
          </p>
          <div className="mt-3 space-y-2">
            {processingRows.slice(0, 3).map((row) => (
              <div key={row.id} className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-gray-900 truncate">{row.documentName}</span>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-atlas-gold">
                    <span className="h-2 w-2 rounded-full bg-atlas-gold animate-pulse" />
                    Processing
                  </span>
                </div>
                <div className="mt-2 h-1.5 w-full rounded-full bg-gray-200 overflow-hidden">
                  <div className="h-full w-1/3 rounded-full bg-atlas-gold animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search document or partnership…"
          className="flex-1 min-w-[220px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-atlas-gold focus:border-atlas-gold"
        />
        <select
          value={taxYear}
          onChange={(e) => setTaxYear(Number(e.target.value))}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
        >
          <option value={0}>All tax years</option>
          {[currentYear, currentYear - 1, currentYear - 2, currentYear - 3].map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select
          value={entityId}
          onChange={(e) => setEntityId(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
        >
          <option value="">All entities</option>
          {lookups.data?.entities.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as K1Status | '')}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
        >
          <option value="">All statuses</option>
          <option value="UPLOADED">Uploaded</option>
          <option value="PROCESSING">Processing</option>
          <option value="NEEDS_REVIEW">Needs Review</option>
          <option value="READY_FOR_APPROVAL">Ready for Approval</option>
          <option value="FINALIZED">Finalized</option>
        </select>
        <button
          onClick={() => {
            setSearch('')
            setEntityId('')
            setStatus('')
            setTaxYear(currentYear - 1)
          }}
          className="inline-flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:text-gray-900"
        >
          <RefreshCw className="w-4 h-4" />
          Reset
        </button>
      </div>

      <DataTable
        columns={columns}
        data={tableData}
        isLoading={listQuery.isLoading}
        sortColumn={sortColumn}
        sortDirection={sortDirection}
        onSort={handleSort}
        onRowClick={(row) => {
          if (row.status === 'NEEDS_REVIEW' || row.status === 'READY_FOR_APPROVAL' || row.status === 'FINALIZED') {
            navigate(`/k1/${row.id}/review`)
          }
        }}
        emptyMessage={
          listQuery.isError
            ? 'Failed to load K-1 documents. Please try again.'
            : 'No K-1 documents match the current filters.'
        }
      />

      <K1UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={() => {
          void listQuery.refetch()
          void kpiQuery.refetch()
        }}
      />
    </AppShell>
  )
}

export default K1Dashboard
