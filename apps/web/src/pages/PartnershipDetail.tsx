import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  PencilIcon,
  ChevronRightIcon,
  AlertCircleIcon,
} from 'lucide-react'
import { AppShell } from '../components/shared/AppShell'
import { PageHeader } from '../components/PageHeader'
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
import { usePartnershipAssets } from '../features/partnerships/hooks/useAssetQueries'
import { AssetsSection } from '../features/partnerships/components/AssetsSection'
import { AddAssetDialog } from '../features/partnerships/components/AddAssetDialog'
import { AssetDetailDrawer } from '../features/partnerships/components/AssetDetailDrawer'
import { RecordAssetFmvDialog } from '../features/partnerships/components/RecordAssetFmvDialog'
import { CapitalOverviewSection } from '../features/partnerships/components/CapitalOverviewSection'
import { CapitalActivitySection } from '../features/partnerships/components/CapitalActivitySection'
import { AddCommitmentDrawer } from '../features/partnerships/components/AddCommitmentDrawer'
import { AddCapitalActivityDrawer } from '../features/partnerships/components/AddCapitalActivityDrawer'
import { useSession, sessionStore } from '../auth/sessionStore'
import { authClient } from '../auth/authClient'
import {
  useCreateCapitalActivity,
  useCreateCommitment,
} from '../features/partnerships/hooks/usePartnershipMutations'
import type {
  CreateCapitalActivityEventRequest,
  CreatePartnershipCommitmentRequest,
} from 'packages/types/src'

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString()
}

function formatUsdAbsolute(value: number): string {
  return `$${Math.abs(value).toLocaleString()}`
}

function getValuationVarianceContext(
  totalLatestAssetFmvUsd: number | null | undefined,
  latestPartnershipFmvUsd: number | null | undefined,
) {
  if (totalLatestAssetFmvUsd == null || latestPartnershipFmvUsd == null) return null

  const deltaUsd = totalLatestAssetFmvUsd - latestPartnershipFmvUsd
  const direction = deltaUsd === 0 ? 'aligned' : deltaUsd > 0 ? 'higher' : 'lower'
  const deltaPercent = latestPartnershipFmvUsd === 0
    ? null
    : Math.abs((deltaUsd / latestPartnershipFmvUsd) * 100)

  return {
    deltaUsd,
    direction,
    deltaPercent,
  }
}

export function PartnershipDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { session } = useSession()
  const isAdmin = session?.role === 'Admin'
  const { data, isLoading, isError, refetch } = usePartnershipDetail(id)
  const assetsQuery = usePartnershipAssets(id)
  const [editOpen, setEditOpen] = useState(false)
  const [recordFmvOpen, setRecordFmvOpen] = useState(false)
  const [addAssetOpen, setAddAssetOpen] = useState(false)
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)
  const [recordAssetFmvOpen, setRecordAssetFmvOpen] = useState(false)
  const [recordAssetTargetId, setRecordAssetTargetId] = useState<string | null>(null)
  const [addCommitmentOpen, setAddCommitmentOpen] = useState(false)
  const [addCapitalActivityOpen, setAddCapitalActivityOpen] = useState(false)
  const createCommitment = useCreateCommitment()
  const createCapitalActivity = useCreateCapitalActivity()

  const assetSummary = assetsQuery.data?.summary
  const assetRows = assetsQuery.data?.rows ?? []
  const valuationVariance = getValuationVarianceContext(
    assetSummary?.totalLatestAssetFmvUsd,
    data?.kpis.latestFmvUsd,
  )

  function openRecordAssetFmv(initialAssetId: string | null = null) {
    setRecordAssetTargetId(initialAssetId)
    setRecordAssetFmvOpen(true)
  }

  async function handleSaveCommitment(payload: CreatePartnershipCommitmentRequest): Promise<boolean> {
    if (!data) return false
    try {
      await createCommitment.mutateAsync({
        partnershipId: data.partnership.id,
        body: payload,
      })
      return true
    } catch {
      return false
    }
  }

  async function handleSaveCapitalActivity(
    payload: CreateCapitalActivityEventRequest,
  ): Promise<boolean> {
    if (!data) return false
    try {
      await createCapitalActivity.mutateAsync({
        partnershipId: data.partnership.id,
        body: payload,
      })
      return true
    } catch {
      return false
    }
  }

  return (
    <AppShell
      currentPath="/partnerships"
      userRole={session?.role ?? 'User'}
      userEmail={session?.user.email}
      onSignOut={() => {
        void authClient.logout().finally(() => sessionStore.setUnauthenticated())
      }}
    >
      <div className="flex flex-col gap-8">
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
            <div className="flex items-center gap-1.5 text-sm text-text-tertiary">
              <button
                type="button"
                className="hover:text-text-primary transition-colors"
                onClick={() => navigate('/partnerships')}
              >
                Partnerships
              </button>
              <ChevronRightIcon className="w-4 h-4" />
              <span className="font-medium text-text-primary">{data.partnership.name}</span>
            </div>

            <PageHeader
              title={data.partnership.name}
              subtitle={
                <button
                  className="text-atlas-gold underline hover:text-atlas-hover hover:no-underline text-sm"
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
            />

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border bg-white px-4 py-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wide text-text-tertiary">Status</span>
                <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-text-primary">
                  {data.partnership.status}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wide text-text-tertiary">Asset Class</span>
                <span className="font-medium text-text-primary">{data.partnership.assetClass ?? '—'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wide text-text-tertiary">Latest K-1</span>
                <span className="font-medium text-text-primary tabular-nums">{data.kpis.latestK1Year ?? '—'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wide text-text-tertiary">Updated</span>
                <span className="text-text-secondary">{formatDateTime(data.partnership.updatedAt)}</span>
              </div>
            </div>

            {valuationVariance && (
              <div
                className={`rounded-lg border px-4 py-3 ${valuationVariance.direction === 'aligned' ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}
              >
                <div className="flex items-start gap-3">
                  <AlertCircleIcon
                    className={`mt-0.5 h-4 w-4 flex-shrink-0 ${valuationVariance.direction === 'aligned' ? 'text-emerald-700' : 'text-amber-700'}`}
                  />
                  <div className="space-y-1">
                    <p
                      className={`text-sm font-medium ${valuationVariance.direction === 'aligned' ? 'text-emerald-900' : 'text-amber-900'}`}
                    >
                      Valuation Context Check
                    </p>
                    <p className={`text-sm ${valuationVariance.direction === 'aligned' ? 'text-emerald-800' : 'text-amber-800'}`}>
                      {valuationVariance.direction === 'aligned'
                        ? 'Asset rollup currently matches partnership-level FMV.'
                        : `Asset rollup is ${formatUsdAbsolute(valuationVariance.deltaUsd)} ${valuationVariance.direction} than partnership-level FMV${valuationVariance.deltaPercent == null ? '.' : ` (${valuationVariance.deltaPercent.toFixed(1)}%).`}`}
                    </p>
                    <p className={`text-xs ${valuationVariance.direction === 'aligned' ? 'text-emerald-700' : 'text-amber-700'}`}>
                      Asset FMV is the bottom-up holdings rollup. Partnership FMV remains a separate whole-partnership valuation context.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <CapitalOverviewSection
              overview={data.capitalOverview}
              isAdmin={isAdmin}
              onAddCommitment={() => setAddCommitmentOpen(true)}
              onAddCapitalActivity={() => setAddCapitalActivityOpen(true)}
            />

            <CapitalActivitySection
              rows={data.capitalActivity}
              isAdmin={isAdmin}
              onAddActivity={() => setAddCapitalActivityOpen(true)}
            />

            <AssetsSection
              rows={assetRows}
              assetCount={assetSummary?.assetCount ?? 0}
              valuedAssetCount={assetSummary?.valuedAssetCount ?? 0}
              totalLatestAssetFmvUsd={assetSummary?.totalLatestAssetFmvUsd ?? null}
              isLoading={assetsQuery.isLoading}
              isError={assetsQuery.isError}
              isAdmin={isAdmin}
              onRetry={() => void assetsQuery.refetch()}
              onSelectAsset={(assetId) => setSelectedAssetId(assetId)}
              onAddAsset={() => setAddAssetOpen(true)}
              onRecordFmv={() => openRecordAssetFmv(null)}
            />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <K1HistorySection rows={data.k1History} />
              <ExpectedDistributionSection rows={data.expectedDistributionHistory} />
            </div>

            <FmvSnapshotsSection
              rows={data.fmvSnapshots}
              recordFmvAction={
                isAdmin ? (
                  <button
                    onClick={() => setRecordFmvOpen(true)}
                    className="px-3 py-1.5 text-xs rounded-lg bg-atlas-gold text-white hover:bg-atlas-hover"
                  >
                    Record Partnership FMV
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

            <ActivityDetailPreview rows={data.activityDetail} />
          </>
        )}
      </div>

      {data && isAdmin && (
        <AddCommitmentDrawer
          open={addCommitmentOpen}
          onClose={() => setAddCommitmentOpen(false)}
          onSave={handleSaveCommitment}
          isSubmitting={createCommitment.isPending}
        />
      )}
      {data && isAdmin && (
        <AddCapitalActivityDrawer
          open={addCapitalActivityOpen}
          onClose={() => setAddCapitalActivityOpen(false)}
          onSave={handleSaveCapitalActivity}
          isSubmitting={createCapitalActivity.isPending}
        />
      )}
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
      {data && isAdmin && (
        <AddAssetDialog
          open={addAssetOpen}
          onClose={() => setAddAssetOpen(false)}
          partnershipId={data.partnership.id}
        />
      )}
      {data && (
        <AssetDetailDrawer
          open={Boolean(selectedAssetId)}
          onClose={() => setSelectedAssetId(null)}
          partnershipId={data.partnership.id}
          assetId={selectedAssetId}
          isAdmin={isAdmin}
          onRecordFmv={() => openRecordAssetFmv(selectedAssetId)}
        />
      )}
      {data && isAdmin && (
        <RecordAssetFmvDialog
          open={recordAssetFmvOpen}
          onClose={() => setRecordAssetFmvOpen(false)}
          partnershipId={data.partnership.id}
          assets={assetRows}
          initialAssetId={recordAssetTargetId}
        />
      )}
    </AppShell>
  )
}
