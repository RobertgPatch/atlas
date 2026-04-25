import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeftIcon, PencilIcon } from 'lucide-react'
import { AppShell } from '../components/shared/AppShell'
import { PageHeader } from '../components/PageHeader'
import { KpiCard } from '../components/KpiCard'
import { LoadingState } from '../components/LoadingState'
import { ErrorState } from '../components/ErrorState'
import { SectionCard } from '../features/partnerships/components/SectionCard'
import { K1HistorySection } from '../features/partnerships/components/K1HistorySection'
import { ExpectedDistributionSection } from '../features/partnerships/components/ExpectedDistributionSection'
import { FmvSnapshotsSection } from '../features/partnerships/components/FmvSnapshotsSection'
import { ActivityDetailPreview } from '../features/partnerships/components/ActivityDetailPreview'
import { EditPartnershipDialog } from '../features/partnerships/components/EditPartnershipDialog'
import { RecordFmvDialog } from '../features/partnerships/components/RecordFmvDialog'
import { usePartnershipDetail } from '../features/partnerships/hooks/usePartnershipQueries'
import { useSession, sessionStore } from '../auth/sessionStore'
import { authClient } from '../auth/authClient'
import { Building2Icon, DollarSignIcon, TrendingUpIcon, CalendarIcon } from 'lucide-react'

function formatUsd(value: number | null | undefined): string {
  if (value == null) return '—'
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
  return `$${value.toLocaleString()}`
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString()
}

export function PartnershipDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { session } = useSession()
  const isAdmin = session?.role === 'Admin'
  const { data, isLoading, isError, refetch } = usePartnershipDetail(id)
  const [editOpen, setEditOpen] = useState(false)
  const [recordFmvOpen, setRecordFmvOpen] = useState(false)

  return (
    <AppShell
      currentPath="/partnerships"
      userRole={session?.role ?? 'User'}
      userEmail={session?.user.email}
      onSignOut={() => {
        void authClient.logout().finally(() => sessionStore.setUnauthenticated())
      }}
    >
      <div className="flex flex-col gap-6">
        {isLoading ? (
          <LoadingState rows={4} columns={4} />
        ) : isError ? (
          <ErrorState
            title="Failed to load partnership"
            message="There was a problem loading this partnership. Please try again."
            onRetry={() => refetch()}
          />
        ) : !data ? (
          <ErrorState title="Partnership not found" message="This partnership could not be found." />
        ) : (
          <>
            <PageHeader
              title={data.partnership.name}
              subtitle={
                <button
                  className="text-accent underline hover:no-underline text-sm"
                  onClick={() => navigate(`/entities/${data.partnership.entity.id}`)}
                >
                  {data.partnership.entity.name}
                </button>
              }
              primaryAction={
                isAdmin
                  ? {
                      label: 'Edit Partnership',
                      icon: <PencilIcon className="w-4 h-4" />,
                      onClick: () => setEditOpen(true),
                    }
                  : undefined
              }
              secondaryActions={[
                {
                  label: 'Back to Directory',
                  icon: <ArrowLeftIcon className="w-4 h-4" />,
                  onClick: () => navigate('/partnerships'),
                },
              ]}
            />

            {/* Four-card KPI strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <KpiCard
                label="Latest K-1 Year"
                value={data.kpis.latestK1Year ?? '—'}
                icon={<CalendarIcon className="w-4 h-4 text-accent" />}
                accentColor="#2563EB"
              />
              <KpiCard
                label="Latest Distribution"
                value={formatUsd(data.kpis.latestDistributionUsd)}
                icon={<DollarSignIcon className="w-4 h-4 text-emerald-600" />}
                accentColor="#059669"
              />
              <KpiCard
                label="Latest FMV"
                value={formatUsd(data.kpis.latestFmvUsd)}
                icon={<TrendingUpIcon className="w-4 h-4 text-violet-600" />}
                accentColor="#7C3AED"
              />
              <KpiCard
                label="Cumulative Distributions"
                value={formatUsd(data.kpis.cumulativeReportedDistributionsUsd)}
                subtext="All K-1 history"
                icon={<Building2Icon className="w-4 h-4 text-amber-600" />}
                accentColor="#D97706"
              />
            </div>

            <SectionCard title="Partnership Details">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 px-5 py-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">Asset Class</p>
                  <p className="mt-1 text-sm font-medium text-text-primary">
                    {data.partnership.assetClass ?? '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">Status</p>
                  <p className="mt-1 text-sm font-medium text-text-primary">
                    {data.partnership.status}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">Entity</p>
                  <p className="mt-1 text-sm font-medium text-text-primary">
                    {data.partnership.entity.name}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">Last Updated</p>
                  <p className="mt-1 text-sm font-medium text-text-primary">
                    {formatDateTime(data.partnership.updatedAt)}
                  </p>
                </div>
              </div>
            </SectionCard>

            <K1HistorySection rows={data.k1History} />
            <ExpectedDistributionSection rows={data.expectedDistributionHistory} />
            <FmvSnapshotsSection
              rows={data.fmvSnapshots}
              recordFmvAction={
                isAdmin ? (
                  <button
                    onClick={() => setRecordFmvOpen(true)}
                    className="px-3 py-1.5 text-xs rounded-lg bg-accent text-white hover:bg-accent/90"
                  >
                    Record FMV
                  </button>
                ) : undefined
              }
            />

            {/* Notes section */}
            {data.partnership.notes && (
              <SectionCard title="Notes">
                <div className="px-5 py-4 text-sm text-text-secondary whitespace-pre-wrap">
                  {data.partnership.notes}
                </div>
              </SectionCard>
            )}

            <ActivityDetailPreview />
          </>
        )}
      </div>

      {data && isAdmin && (
        <EditPartnershipDialog
          open={editOpen}
          onClose={() => setEditOpen(false)}
          partnership={data.partnership}
        />
      )}
      {data && isAdmin && (
        <RecordFmvDialog
          open={recordFmvOpen}
          onClose={() => setRecordFmvOpen(false)}
          partnershipId={data.partnership.id}
          partnershipStatus={data.partnership.status}
        />
      )}
    </AppShell>
  )
}
