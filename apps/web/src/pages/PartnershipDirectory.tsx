import React, { useState } from 'react'
import { PlusIcon, DownloadIcon, Building2Icon } from 'lucide-react'
import { AppShell } from '../components/shared/AppShell'
import { PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { useSession, sessionStore } from '../auth/sessionStore'
import { authClient } from '../auth/authClient'
import { usePartnershipList, usePartnershipNavigate } from '../features/partnerships/hooks/usePartnershipQueries'
import { usePartnershipExport } from '../features/partnerships/hooks/usePartnershipExport'
import { PartnershipKpiStrip } from '../features/partnerships/components/PartnershipKpiStrip'
import { PartnershipFilters } from '../features/partnerships/components/PartnershipFilters'
import { PartnershipDirectoryTable } from '../features/partnerships/components/PartnershipDirectoryTable'
import { AddPartnershipDialog } from '../features/partnerships/components/AddPartnershipDialog'

export function PartnershipDirectory() {
  const { session } = useSession()
  const isAdmin = session?.role === 'Admin'
  const [addDialogOpen, setAddDialogOpen] = useState(false)

  const { filters, updateSearch, updateFilter, clearFilters, query } = usePartnershipList()
  const navigate = usePartnershipNavigate()
  const exportCsv = usePartnershipExport(filters)

  const hasFilters =
    !!filters.search || !!filters.entityId || !!filters.assetClass || filters.status.length > 0

  const tableState = (() => {
    if (query.isLoading) return 'loading' as const
    if (query.isError) return 'error' as const
    if (!query.data?.rows.length) return 'empty' as const
    return 'populated' as const
  })()

  const data = query.data

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
        <PageHeader
          title="Partnerships"
          subtitle={
            data && !query.isLoading
              ? `${data.totals.partnershipCount.toLocaleString()} total`
              : undefined
          }
          primaryAction={
            isAdmin
              ? {
                  label: 'Add Partnership',
                  icon: <PlusIcon className="w-4 h-4" />,
                  onClick: () => setAddDialogOpen(true),
                }
              : undefined
          }
          secondaryActions={[
            {
              label: 'Export',
              icon: <DownloadIcon className="w-4 h-4" />,
              onClick: exportCsv,
            },
          ]}
        />

        <PartnershipKpiStrip
          partnershipCount={data?.totals.partnershipCount ?? 0}
          totalDistributionsUsd={data?.totals.totalDistributionsUsd ?? 0}
          totalFmvUsd={data?.totals.totalFmvUsd ?? 0}
          loading={query.isLoading}
        />

        <PartnershipFilters
          filters={filters}
          onSearchChange={updateSearch}
          onFilterChange={updateFilter}
          onClear={clearFilters}
          resultCount={data?.totals.partnershipCount}
        />

        {query.isError ? (
          <ErrorState
            title="Failed to load partnerships"
            message="There was a problem loading the partnership directory. Please try again."
            onRetry={() => query.refetch()}
          />
        ) : tableState === 'empty' && hasFilters ? (
          <EmptyState
            icon={<Building2Icon className="w-5 h-5 text-text-tertiary" />}
            title="No partnerships match your filters"
            description="Try clearing your filters or adjusting your search."
            action={{ label: 'Clear filters', onClick: clearFilters }}
          />
        ) : tableState === 'empty' && isAdmin ? (
          <EmptyState
            icon={<Building2Icon className="w-5 h-5 text-text-tertiary" />}
            title="No partnerships yet"
            description="Add your first partnership to get started."
            action={{
              label: 'Add Partnership',
              onClick: () => setAddDialogOpen(true),
            }}
          />
        ) : tableState === 'empty' ? (
          <EmptyState
            icon={<Building2Icon className="w-5 h-5 text-text-tertiary" />}
            title="No partnerships"
            description="No partnerships have been added yet."
          />
        ) : (
          <PartnershipDirectoryTable
            rows={data?.rows ?? []}
            state={tableState}
            onRowClick={(row) => navigate(row.id)}
            onRetry={() => query.refetch()}
          />
        )}
      </div>

      <AddPartnershipDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
      />
    </AppShell>
  )
}
