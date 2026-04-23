import React from 'react'
import { Link } from 'react-router-dom'
import { Building2, FileText, AlertCircle, TrendingUp, ArrowRight } from 'lucide-react'
import { AppShell } from '../components/shared/AppShell'
import { PageHeader } from '../components/shared/PageHeader'
import { KPICard } from '../components/shared/KPICard'
import { DataTable, type Column } from '../components/shared/DataTable'
import { StatusBadge } from '../components/shared/StatusBadge'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import { useSession, sessionStore } from '../auth/sessionStore'
import { authClient } from '../auth/authClient'
import { useDashboardSummary } from '../features/dashboard/hooks/useDashboardSummary'
import type { DashboardSummaryResponse } from '../features/dashboard/api/dashboardClient'

type RecentK1Record = DashboardSummaryResponse['recentK1Activity'][number]
type OpenIssue = DashboardSummaryResponse['openIssues'][number]

const formatCount = (value: number) => value.toLocaleString()

const formatUsd = (value: number | null | undefined) => {
  if (value == null) return '—'
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
  return `$${value.toLocaleString()}`
}

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

const formatStatusLabel = (status: RecentK1Record['status']) => {
  switch (status) {
    case 'UPLOADED':
      return 'Uploaded'
    case 'PROCESSING':
      return 'Processing'
    case 'NEEDS_REVIEW':
      return 'Needs Review'
    case 'READY_FOR_APPROVAL':
      return 'Ready for Approval'
    case 'FINALIZED':
      return 'Finalized'
  }
}

const statusTypeFor = (status: RecentK1Record['status']) => {
  switch (status) {
    case 'FINALIZED':
      return 'success' as const
    case 'NEEDS_REVIEW':
      return 'warning' as const
    case 'READY_FOR_APPROVAL':
      return 'info' as const
    case 'PROCESSING':
      return 'info' as const
    default:
      return 'default' as const
  }
}

const k1Columns: Column<RecentK1Record>[] = [
  { key: 'entity', header: 'Entity', sortable: true },
  { key: 'partnership', header: 'Partnership' },
  {
    key: 'taxYear',
    header: 'Tax Year',
    align: 'center',
    accessor: (row) => row.taxYear ?? '—',
  },
  {
    key: 'status',
    header: 'Status',
    accessor: (row) => <StatusBadge status={formatStatusLabel(row.status)} type={statusTypeFor(row.status)} />,
    align: 'center',
  },
  {
    key: 'uploadedAt',
    header: 'Received',
    align: 'right',
    accessor: (row) => formatDate(row.uploadedAt),
  },
]

const priorityColors: Record<OpenIssue['severity'], string> = {
  HIGH: 'bg-orange-100 text-orange-700',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  LOW: 'bg-gray-100 text-gray-600',
}

export function DashboardPage() {
  const { session } = useSession()
  const dashboard = useDashboardSummary()
  const hasNoEntities =
    !dashboard.isLoading && !dashboard.isError && (dashboard.data?.kpis.totalEntities ?? 0) === 0
  const isAdmin = session?.role === 'Admin'

  const totalK1Documents = dashboard.data?.kpis.totalK1Documents ?? 0
  const finalizedK1Documents = dashboard.data?.kpis.finalizedK1Documents ?? 0
  const finalizedPercent =
    totalK1Documents > 0 ? Math.round((finalizedK1Documents / totalK1Documents) * 100) : 0

  return (
    <AppShell
      currentPath="/dashboard"
      userRole={session?.role ?? 'User'}
      userEmail={session?.user.email}
      onSignOut={() => {
        void authClient.logout().finally(() => sessionStore.setUnauthenticated())
      }}
    >
      <PageHeader
        title="Dashboard"
        subtitle="Good morning. Here's what's happening across your portfolio today."
        breadcrumbs={[{ label: 'Atlas' }, { label: 'Dashboard' }]}
      />

      {dashboard.isLoading && <LoadingState rows={6} columns={4} />}
      {dashboard.isError && (
        <ErrorState
          title="Unable to load dashboard"
          message="The dashboard summary could not be loaded."
          onRetry={() => void dashboard.refetch()}
        />
      )}

      {!dashboard.isLoading && !dashboard.isError && dashboard.data && (
        <>

          {hasNoEntities && (
            <div className="mb-6 bg-gradient-to-r from-atlas-gold/10 to-atlas-gold/5 border border-atlas-gold/30 rounded-lg p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-atlas-gold/20">
                  <Building2 className="w-5 h-5 text-atlas-gold" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">
                    {isAdmin ? 'Create your first entity to get started' : 'No entities available yet'}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    {isAdmin
                      ? 'Entities hold your partnerships and K-1s. You need at least one before uploading K-1 documents.'
                      : 'Ask an Admin to create an entity and grant you access so you can begin uploading K-1s.'}
                  </p>
                </div>
              </div>
              {isAdmin && (
                <Link
                  to="/entities"
                  className="inline-flex items-center px-4 py-2 rounded-lg bg-atlas-gold text-white text-sm font-medium hover:bg-atlas-hover whitespace-nowrap"
                >
                  Create entity
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              )}
            </div>
          )}

          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-8">
            <KPICard
              label="Total Entities"
              value={formatCount(dashboard.data.kpis.totalEntities)}
              icon={Building2}
              change={{
                value: formatCount(dashboard.data.kpis.totalPartnerships),
                trend: 'neutral',
                timeframe: 'partnerships',
              }}
            />
            <KPICard
              label="K-1s Processed"
              value={formatCount(totalK1Documents)}
              icon={FileText}
              change={{
                value: `${finalizedPercent}% finalized`,
                trend: 'neutral',
                timeframe: `${formatCount(finalizedK1Documents)} finalized`,
              }}
            />
            <KPICard
              label="Issues Open"
              value={formatCount(dashboard.data.kpis.openIssuesCount)}
              icon={AlertCircle}
              change={{
                value: formatCount(dashboard.data.kpis.highSeverityOpenIssues),
                trend: 'neutral',
                timeframe: 'high severity',
              }}
            />
            <KPICard
              label="Portfolio Value"
              value={formatUsd(dashboard.data.kpis.portfolioValueUsd)}
              icon={TrendingUp}
              change={
                dashboard.data.kpis.totalDistributionsUsd > 0
                  ? {
                      value: formatUsd(dashboard.data.kpis.totalDistributionsUsd),
                      trend: 'neutral',
                      timeframe: 'distributions',
                    }
                  : undefined
              }
            />
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* K-1 Table */}
            <div className="xl:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-gray-900">Recent K-1 Activity</h2>
                <a href="/k1" className="text-sm text-atlas-gold hover:text-atlas-hover font-medium transition-colors">
                  View all →
                </a>
              </div>
              <DataTable
                columns={k1Columns}
                data={dashboard.data.recentK1Activity}
                emptyMessage="No K-1 activity yet. Upload a K-1 to get started."
              />
            </div>

            {/* Open Issues */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-gray-900">Open Issues</h2>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                  {dashboard.data.openIssues.length} open
                </span>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg shadow-sm divide-y divide-gray-100">
                {dashboard.data.openIssues.length === 0 && (
                  <div className="p-6 text-sm text-gray-500">No open issues right now.</div>
                )}
                {dashboard.data.openIssues.map((issue) => (
                  <div key={issue.id} className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="text-sm font-medium text-gray-900 line-clamp-1">{issue.entity}</span>
                      <span className={`flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${priorityColors[issue.severity]}`}>
                        {issue.severity.toLowerCase()}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 line-clamp-1 mb-1">{issue.partnership}</p>
                    <p className="text-xs text-gray-500 line-clamp-2 mb-2">{issue.message}</p>
                    <p className="text-xs text-gray-400">Opened {formatDate(issue.createdAt)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </AppShell>
  )
}
