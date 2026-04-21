import React from 'react'
import { Building2, FileText, AlertCircle, TrendingUp } from 'lucide-react'
import { AppShell } from '../components/shared/AppShell'
import { PageHeader } from '../components/shared/PageHeader'
import { KPICard } from '../components/shared/KPICard'
import { DataTable, type Column } from '../components/shared/DataTable'
import { StatusBadge } from '../components/shared/StatusBadge'
import { useSession, sessionStore } from '../auth/sessionStore'
import { authClient } from '../auth/authClient'

interface K1Record {
  id: string
  entity: string
  partnership: string
  taxYear: number
  status: string
  receivedDate: string
}

interface Issue {
  id: string
  entity: string
  description: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  assignee: string
}

const recentK1s: K1Record[] = [
  { id: '1', entity: 'Blackstone Real Estate IX', partnership: 'BRE-IX LLC', taxYear: 2024, status: 'Complete', receivedDate: 'Jan 15, 2025' },
  { id: '2', entity: 'KKR Infrastructure IV', partnership: 'KKR Infra Fund IV', taxYear: 2024, status: 'In Review', receivedDate: 'Jan 14, 2025' },
  { id: '3', entity: 'Apollo Global Credit', partnership: 'AGC Partners LP', taxYear: 2024, status: 'Pending', receivedDate: 'Jan 12, 2025' },
  { id: '4', entity: 'Carlyle Equity Partners', partnership: 'CEP XII LLC', taxYear: 2024, status: 'Complete', receivedDate: 'Jan 10, 2025' },
  { id: '5', entity: 'Vista Equity Fund VIII', partnership: 'Vista VIII LP', taxYear: 2024, status: 'Error', receivedDate: 'Jan 8, 2025' },
]

const openIssues: Issue[] = [
  { id: '1', entity: 'Vista Equity Fund VIII', description: 'Missing Schedule K-1 attachment for TY2024', priority: 'critical', assignee: 'Sarah Chen' },
  { id: '2', entity: 'TPG Rise Climate', description: 'Discrepancy in reported ordinary income', priority: 'high', assignee: 'Michael Torres' },
  { id: '3', entity: 'Warburg Pincus Private Equity', description: 'Partner capital account reconciliation needed', priority: 'medium', assignee: 'Emily Zhao' },
]

const k1Columns: Column<K1Record>[] = [
  { key: 'entity', header: 'Entity', sortable: true },
  { key: 'partnership', header: 'Partnership' },
  { key: 'taxYear', header: 'Tax Year', align: 'center' },
  {
    key: 'status',
    header: 'Status',
    accessor: (row) => <StatusBadge status={row.status} />,
    align: 'center',
  },
  { key: 'receivedDate', header: 'Received', align: 'right' },
]

const priorityColors: Record<Issue['priority'], string> = {
  critical: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-gray-100 text-gray-600',
}

export function DashboardPage() {
  const { session } = useSession()

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

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-8">
        <KPICard
          label="Total Entities"
          value="42"
          icon={Building2}
          change={{ value: '+3', trend: 'up', timeframe: 'this quarter' }}
        />
        <KPICard
          label="K-1s Processed"
          value="1,284"
          icon={FileText}
          change={{ value: '98.2% complete', trend: 'up', timeframe: 'TY2024' }}
        />
        <KPICard
          label="Issues Open"
          value="12"
          icon={AlertCircle}
          change={{ value: '-4', trend: 'down', timeframe: 'vs last week' }}
        />
        <KPICard
          label="Portfolio Value"
          value="$4.2B"
          icon={TrendingUp}
          change={{ value: '+8.3%', trend: 'up', timeframe: 'YTD' }}
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
          <DataTable columns={k1Columns} data={recentK1s} />
        </div>

        {/* Open Issues */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">Open Issues</h2>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
              {openIssues.length} open
            </span>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm divide-y divide-gray-100">
            {openIssues.map((issue) => (
              <div key={issue.id} className="p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="text-sm font-medium text-gray-900 line-clamp-1">{issue.entity}</span>
                  <span className={`flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${priorityColors[issue.priority]}`}>
                    {issue.priority}
                  </span>
                </div>
                <p className="text-xs text-gray-500 line-clamp-2 mb-2">{issue.description}</p>
                <p className="text-xs text-gray-400">Assigned to {issue.assignee}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
