import { useMemo, useState } from 'react'
import { AlertTriangleIcon, RefreshCcwIcon, XIcon } from 'lucide-react'
import { authClient } from '../auth/authClient'
import { sessionStore, useSession } from '../auth/sessionStore'
import { AppShell } from '../components/shared/AppShell'
import { PageHeader } from '../components/shared/PageHeader'
import { FilterToolbar } from '../components/FilterToolbar'
import { reportsClient } from '../features/reports/api/reportsClient'
import { ActivityDetailReport } from '../features/reports/components/ActivityDetailReport'
import { AssetClassSummaryReport } from '../features/reports/components/AssetClassSummaryReport'
import { PortfolioSummaryReport } from '../features/reports/components/PortfolioSummaryReport'
import { ReportsHeaderActions } from '../features/reports/components/ReportsHeaderActions'
import { useActivityDetail } from '../features/reports/hooks/useActivityDetail'
import { useAssetClassSummary } from '../features/reports/hooks/useAssetClassSummary'
import { usePortfolioSummary } from '../features/reports/hooks/usePortfolioSummary'
import { useReportMutations } from '../features/reports/hooks/useReportMutations'
import type { ReportExportFormat } from '../../../../packages/types/src/reports'

type ReportsTab = 'portfolio_summary' | 'asset_class_summary' | 'activity_detail'

const ASSET_CLASS_SORT_FIELDS = new Set([
  'assetClass',
  'partnershipCount',
  'originalCommitmentUsd',
  'calledPct',
  'unfundedUsd',
  'paidInUsd',
  'distributionsUsd',
  'residualValueUsd',
  'dpi',
  'rvpi',
  'tvpi',
  'irr',
])

const ACTIVITY_DETAIL_SORT_FIELDS = new Set([
  'taxYear',
  'entityName',
  'partnershipName',
  'distributionsUsd',
  'endingBasisUsd',
  'updatedAt',
])

export function ReportsPage() {
  const { session } = useSession()
  const isAdmin = session?.role === 'Admin'
  const [activeTab, setActiveTab] = useState<ReportsTab>('portfolio_summary')

  const [conflictMessage, setConflictMessage] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [activityTaxYear, setActivityTaxYear] = useState('')
  const [isExporting, setIsExporting] = useState(false)

  const { filters, queryInput, query, updateFilter, updateSearch, clearFilters } =
    usePortfolioSummary()

  const assetClassQueryInput = useMemo(() => {
    const sort =
      queryInput.sort && ASSET_CLASS_SORT_FIELDS.has(queryInput.sort)
        ? queryInput.sort
        : 'assetClass'

    return {
      ...queryInput,
      sort,
    }
  }, [queryInput])

  const assetClassQuery = useAssetClassSummary(
    assetClassQueryInput,
    activeTab === 'asset_class_summary',
  )

  const activityDetailQueryInput = useMemo(() => {
    const hasValidSort =
      queryInput.sort != null && ACTIVITY_DETAIL_SORT_FIELDS.has(queryInput.sort)
    const sort = hasValidSort ? queryInput.sort : 'taxYear'
    const direction = hasValidSort ? queryInput.direction : 'desc'

    return {
      ...queryInput,
      taxYear: activityTaxYear ? Number(activityTaxYear) : undefined,
      sort,
      direction,
    }
  }, [activityTaxYear, queryInput])

  const activityDetailQuery = useActivityDetail(
    activityDetailQueryInput,
    activeTab === 'activity_detail',
  )

  const {
    saveOriginalCommitment,
    undoLatestCommitmentEdit,
    saveActivityDetailRow,
    undoLatestActivityDetailEdit,
    undoState,
    activityUndoState,
    clearUndoState,
    clearActivityUndoState,
  } = useReportMutations()

  const data = useMemo(() => {
    if (isAdmin || !query.data) return query.data

    return {
      ...query.data,
      rows: query.data.rows.map((row) => ({
        ...row,
        editability: {
          ...row.editability,
          originalCommitmentEditable: false,
          reason: 'Only Admin users can edit commitments.',
        },
      })),
    }
  }, [isAdmin, query.data])

  const activeResultCount =
    activeTab === 'portfolio_summary'
      ? query.data?.page.total
      : activeTab === 'asset_class_summary'
        ? assetClassQuery.data?.rows.length
        : activityDetailQuery.data?.page.total

  const subtitle =
    activeTab === 'portfolio_summary'
      ? 'Portfolio Summary (Phase 1) with inline commitment edits and single-step undo.'
      : activeTab === 'asset_class_summary'
        ? 'Asset Class Summary (Phase 2) with shared filters, grouped metrics, and weighted N/A behavior.'
        : 'Activity Detail (Phase 3) with annual rows keyed by entity, partnership, and tax year.'

  const entityTypeOptions = useMemo(() => {
    const values = new Set<string>()
    query.data?.rows.forEach((row) => {
      if (row.entityType) values.add(row.entityType)
    })

    return [...values]
      .sort((a, b) => a.localeCompare(b))
      .map((value) => ({ label: value, value }))
  }, [query.data])

  const activityYearOptions = useMemo(() => {
    const years = new Set<string>()
    activityDetailQuery.data?.rows.forEach((row) => years.add(String(row.taxYear)))

    if (years.size === 0) {
      const currentYear = new Date().getUTCFullYear()
      for (let i = 0; i < 6; i += 1) {
        years.add(String(currentYear - i))
      }
    }

    return [...years]
      .sort((a, b) => Number(b) - Number(a))
      .map((value) => ({ label: value, value }))
  }, [activityDetailQuery.data])

  const toolbarFilters = useMemo(() => {
    const commonFilters = [
      {
        key: 'dateRange',
        label: 'Date range',
        value: filters.dateRange,
        onChange: (value: string) => updateFilter('dateRange', value),
        options: [
          { label: 'All years', value: 'all' },
          { label: 'Last 1 year', value: '1y' },
          { label: 'Last 3 years', value: '3y' },
          { label: 'Last 5 years', value: '5y' },
        ],
      },
      {
        key: 'entityType',
        label: 'Entity type',
        value: filters.entityType,
        onChange: (value: string) => updateFilter('entityType', value),
        options: entityTypeOptions,
      },
    ]

    if (activeTab !== 'activity_detail') {
      return commonFilters
    }

    return [
      ...commonFilters,
      {
        key: 'taxYear',
        label: 'Tax year',
        value: activityTaxYear,
        onChange: setActivityTaxYear,
        options: activityYearOptions,
      },
    ]
  }, [
    activeTab,
    activityTaxYear,
    activityYearOptions,
    entityTypeOptions,
    filters.dateRange,
    filters.entityType,
    updateFilter,
  ])

  const handleExport = async (format: ReportExportFormat) => {
    setExportError(null)
    setIsExporting(true)

    const activeQuery =
      activeTab === 'portfolio_summary'
        ? queryInput
        : activeTab === 'asset_class_summary'
          ? assetClassQueryInput
          : activityDetailQueryInput

    try {
      const result = await reportsClient.exportReport({
        ...activeQuery,
        reportType: activeTab,
        format,
      })

      const blobUrl = window.URL.createObjectURL(result.blob)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = result.fileName ?? `atlas-${activeTab}.${format}`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(blobUrl)

      setToast(`Export ready: ${link.download}`)
    } catch {
      setExportError('Export failed. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  const refetchActiveReport = () => {
    if (activeTab === 'portfolio_summary') {
      void query.refetch()
      return
    }

    if (activeTab === 'asset_class_summary') {
      void assetClassQuery.refetch()
      return
    }

    void activityDetailQuery.refetch()
  }

  return (
    <AppShell
      currentPath="/reports"
      userRole={session?.role ?? 'User'}
      userEmail={session?.user.email}
      onSignOut={() => {
        void authClient.logout().finally(() => sessionStore.setUnauthenticated())
      }}
    >
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Reports"
          subtitle={subtitle}
          actions={<ReportsHeaderActions isExporting={isExporting} onExport={(format) => {
            void handleExport(format)
          }} />}
        />

        {conflictMessage && (
          <div
            className="flex items-center justify-between gap-3 rounded-card border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            data-testid="reports-conflict-banner"
          >
            <div className="flex items-center gap-2">
              <AlertTriangleIcon className="h-4 w-4" />
              {conflictMessage}
            </div>
            <button
              type="button"
              onClick={() => {
                setConflictMessage(null)
                clearUndoState()
                clearActivityUndoState()
                refetchActiveReport()
              }}
              className="inline-flex items-center gap-1 rounded border border-red-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-red-100"
            >
              <RefreshCcwIcon className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>
        )}

        {toast && (
          <div
            className="flex items-center justify-between rounded-card border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800"
            role="status"
          >
            <span>{toast}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              aria-label="Dismiss toast"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {exportError && (
          <div
            className="flex items-center justify-between rounded-card border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800"
            role="alert"
          >
            <span>{exportError}</span>
            <button
              type="button"
              onClick={() => setExportError(null)}
              aria-label="Dismiss export error"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <FilterToolbar
          searchValue={filters.search}
          onSearchChange={updateSearch}
          searchPlaceholder="Search entities or partnerships..."
          filters={toolbarFilters}
          resultCount={activeResultCount}
        />

        <div className="inline-flex w-fit items-center gap-1 rounded-card border border-border bg-surface p-1">
          <button
            type="button"
            onClick={() => setActiveTab('portfolio_summary')}
            data-testid="reports-tab-portfolio"
            className={`rounded-card px-3 py-1.5 text-sm font-medium transition ${
              activeTab === 'portfolio_summary'
                ? 'bg-accent text-white'
                : 'text-text-secondary hover:bg-gray-100'
            }`}
          >
            Portfolio Summary
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('asset_class_summary')}
            data-testid="reports-tab-asset-class"
            className={`rounded-card px-3 py-1.5 text-sm font-medium transition ${
              activeTab === 'asset_class_summary'
                ? 'bg-accent text-white'
                : 'text-text-secondary hover:bg-gray-100'
            }`}
          >
            Asset Class Summary
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('activity_detail')}
            data-testid="reports-tab-activity-detail"
            className={`rounded-card px-3 py-1.5 text-sm font-medium transition ${
              activeTab === 'activity_detail'
                ? 'bg-accent text-white'
                : 'text-text-secondary hover:bg-gray-100'
            }`}
          >
            Activity Detail
          </button>
        </div>

        {activeTab === 'portfolio_summary' ? (
          <PortfolioSummaryReport
            data={data}
            isLoading={query.isLoading}
            isError={query.isError}
            onRetry={() => void query.refetch()}
            undoCommitmentId={undoState?.commitmentId ?? null}
            onUndoLatestEdit={() => {
              void undoLatestCommitmentEdit().then((result) => {
                if (result.status === 'conflict') {
                  setConflictMessage(result.message)
                  return
                }
                if (result.status === 'ok') {
                  setToast('Undo complete.')
                }
              })
            }}
            onCommitOriginalCommitment={async ({ row, nextValue }) => {
              const target = row.editability.commitmentTarget
              if (!target) {
                return {
                  status: 'conflict' as const,
                  message: row.editability.reason ?? 'This value cannot be edited.',
                }
              }

              const previousValue = row.originalCommitmentUsd ?? 0
              const result = await saveOriginalCommitment({
                partnershipId: target.partnershipId,
                commitmentId: target.commitmentId,
                previousValue,
                nextValue,
                expectedUpdatedAt: target.updatedAt,
              })

              if (result.status === 'conflict') {
                setConflictMessage(result.message)
                return result
              }

              setConflictMessage(null)
              setToast('Saved. You can undo the latest edit.')
              return result
            }}
          />
        ) : activeTab === 'asset_class_summary' ? (
          <AssetClassSummaryReport
            data={assetClassQuery.data}
            isLoading={assetClassQuery.isLoading}
            isError={assetClassQuery.isError}
            onRetry={() => void assetClassQuery.refetch()}
          />
        ) : (
          <ActivityDetailReport
            data={activityDetailQuery.data}
            isLoading={activityDetailQuery.isLoading}
            isError={activityDetailQuery.isError}
            onRetry={() => void activityDetailQuery.refetch()}
            isAdmin={isAdmin}
            undoRowId={activityUndoState?.rowId ?? null}
            onUndoLatestEdit={() => {
              void undoLatestActivityDetailEdit().then((result) => {
                if (result.status === 'conflict') {
                  setConflictMessage(result.message)
                  return
                }
                if (result.status === 'ok') {
                  setToast('Undo complete.')
                }
              })
            }}
            onCommitContributions={async ({ row, nextValue }) => {
              const result = await saveActivityDetailRow({
                rowId: row.id,
                expectedUpdatedAt: row.updatedAt,
                previousValues: {
                  beginningBasisUsd: row.beginningBasisUsd,
                  contributionsUsd: row.contributionsUsd,
                  otherAdjustmentsUsd: row.otherAdjustmentsUsd,
                  endingGlBalanceUsd: row.endingGlBalanceUsd,
                  notes: row.notes,
                },
                patch: {
                  contributionsUsd: nextValue,
                },
              })

              if (result.status === 'conflict') {
                setConflictMessage(result.message)
                return result
              }

              setConflictMessage(null)
              setToast('Saved. You can undo the latest edit.')
              return result
            }}
          />
        )}

        {(filters.search || filters.dateRange !== 'all' || filters.entityType || activityTaxYear) && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                clearFilters()
                setActivityTaxYear('')
              }}
              className="text-sm font-medium text-accent hover:text-accent-hover"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>
    </AppShell>
  )
}
