import React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeftIcon, Building2Icon, DollarSignIcon, TrendingUpIcon, CalendarIcon } from 'lucide-react'
import { AppShell } from '../components/shared/AppShell'
import { PageHeader } from '../components/PageHeader'
import { KpiCard } from '../components/KpiCard'
import { LoadingState } from '../components/LoadingState'
import { ErrorState } from '../components/ErrorState'
import { PartnershipDirectoryTable } from '../features/partnerships/components/PartnershipDirectoryTable'
import { EntityReportsPreviewSection } from '../features/partnerships/components/EntityReportsPreviewSection'
import { useEntityDetail } from '../features/partnerships/hooks/useEntityQueries'
import { useSession, sessionStore } from '../auth/sessionStore'
import { authClient } from '../auth/authClient'

function formatUsd(value: number | null | undefined): string {
  if (value == null) return '—'
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
  return `$${value.toLocaleString()}`
}

export function EntityDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { session } = useSession()
  const { data, isLoading, isError, refetch } = useEntityDetail(id)

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
            title="Failed to load entity"
            message="There was a problem loading this entity. Please try again."
            onRetry={() => refetch()}
          />
        ) : !data ? (
          <ErrorState title="Entity not found" message="This entity could not be found." />
        ) : (
          <>
            <PageHeader
              title={data.entity.name}
              subtitle={data.entity.entityType ?? undefined}
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
                label="Partnerships"
                value={data.rollup.partnershipCount}
                icon={<Building2Icon className="w-4 h-4 text-accent" />}
                accentColor="#2563EB"
              />
              <KpiCard
                label="Total Distributions"
                value={formatUsd(data.rollup.totalDistributionsUsd)}
                icon={<DollarSignIcon className="w-4 h-4 text-emerald-600" />}
                accentColor="#059669"
              />
              <KpiCard
                label="Total FMV"
                value={formatUsd(data.rollup.totalFmvUsd)}
                icon={<TrendingUpIcon className="w-4 h-4 text-violet-600" />}
                accentColor="#7C3AED"
              />
              <KpiCard
                label="Latest K-1 Year"
                value={data.rollup.latestK1Year ?? '—'}
                icon={<CalendarIcon className="w-4 h-4 text-amber-600" />}
                accentColor="#D97706"
              />
            </div>

            {/* Embedded partnership table */}
            <PartnershipDirectoryTable
              rows={data.partnerships}
              isLoading={false}
              onRowClick={(row) => navigate(`/partnerships/${row.id}`)}
            />

            <EntityReportsPreviewSection />
          </>
        )}
      </div>
    </AppShell>
  )
}
