import type { Column } from '../../../components/DataTable'
import { DataTable } from '../../../components/DataTable'
import { SectionCard } from './SectionCard'
import type { PartnershipAssetRow, PartnershipAssetSource } from 'packages/types/src'

const SOURCE_BADGE_CLASS: Record<PartnershipAssetSource, string> = {
  manual: 'border-gray-200 bg-gray-100 text-gray-700',
  imported: 'border-blue-100 bg-blue-50 text-blue-700',
  plaid: 'border-emerald-100 bg-emerald-50 text-emerald-700',
}

const SOURCE_LABEL: Record<PartnershipAssetSource, string> = {
  manual: 'Manual',
  imported: 'Imported',
  plaid: 'Linked',
}

const columns: Column<PartnershipAssetRow>[] = [
  {
    key: 'name',
    header: 'Asset',
    sortable: true,
    render: (row) => (
      <div className="min-w-[180px]">
        <p className="font-medium text-text-primary">{row.name}</p>
        <p className="text-xs text-text-tertiary">{row.assetType}</p>
      </div>
    ),
  },
  {
    key: 'sourceType',
    header: 'Source',
    render: (row) => (
      <span
        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${SOURCE_BADGE_CLASS[row.sourceType]}`}
      >
        {SOURCE_LABEL[row.sourceType]}
      </span>
    ),
  },
  {
    key: 'latestFmv',
    header: 'Latest FMV',
    align: 'right',
    render: (row) => (
      <span className="font-medium text-text-primary tabular-nums">
        {row.latestFmv ? `$${row.latestFmv.amountUsd.toLocaleString()}` : '—'}
      </span>
    ),
  },
  {
    key: 'valuationDate',
    header: 'Valuation Date',
    render: (row) => (
      <span className="text-sm text-text-secondary">
        {row.latestFmv ? new Date(row.latestFmv.valuationDate).toLocaleDateString() : 'No FMV yet'}
      </span>
    ),
  },
]

interface AssetsSectionProps {
  rows: PartnershipAssetRow[]
  assetCount: number
  valuedAssetCount: number
  totalLatestAssetFmvUsd: number | null
  isLoading: boolean
  isError: boolean
  isAdmin: boolean
  onRetry: () => void
  onSelectAsset: (assetId: string) => void
  onAddAsset: () => void
  onRecordFmv: () => void
}

export function AssetsSection({
  rows,
  assetCount,
  valuedAssetCount,
  totalLatestAssetFmvUsd,
  isLoading,
  isError,
  isAdmin,
  onRetry,
  onSelectAsset,
  onAddAsset,
  onRecordFmv,
}: AssetsSectionProps) {
  const hasMixedCoverage = rows.length > 0 && valuedAssetCount > 0 && valuedAssetCount < rows.length
  const state = isLoading ? 'loading' : isError ? 'error' : rows.length ? 'populated' : 'empty'

  return (
    <SectionCard
      title="Assets"
      subtitle="Manage underlying assets and their valuations"
      headerAction={
        isAdmin ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRecordFmv}
              disabled={rows.length === 0}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Record Asset FMV
            </button>
            <button
              type="button"
              disabled
              title="Coming soon"
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Link Account
            </button>
            <button
              type="button"
              onClick={onAddAsset}
              className="rounded-lg bg-atlas-gold px-3 py-1.5 text-xs font-medium text-white hover:bg-atlas-hover"
            >
              Add Asset
            </button>
          </div>
        ) : undefined
      }
    >
      <div className="border-b border-border px-5 py-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-white px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-text-tertiary">Total Latest Asset FMV</p>
            <p className="mt-1 text-lg font-semibold text-text-primary tabular-nums">
              {totalLatestAssetFmvUsd == null ? '—' : `$${totalLatestAssetFmvUsd.toLocaleString()}`}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-white px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-text-tertiary">Asset Count</p>
            <p className="mt-1 text-lg font-semibold text-text-primary">{assetCount}</p>
          </div>
          <div className="rounded-xl border border-border bg-white px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-text-tertiary">Valued Assets</p>
            <p className="mt-1 text-lg font-semibold text-text-primary">{valuedAssetCount}</p>
          </div>
        </div>

        {hasMixedCoverage && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Some assets have no FMV yet. Unvalued assets are excluded from the asset rollup until a snapshot is recorded.
          </div>
        )}
      </div>

      <DataTable
        columns={columns}
        data={rows}
        state={state}
        onRetry={onRetry}
        onRowClick={(row) => onSelectAsset(row.id)}
        emptyTitle="No assets recorded"
        emptyDescription="Add the first partnership asset to begin tracking asset-specific FMV and valuation history."
        emptyAction={isAdmin ? { label: 'Add Asset', onClick: onAddAsset } : undefined}
      />

      <div className="border-t border-border bg-gray-50/70 px-5 py-4 text-sm text-text-secondary">
        <p className="font-medium text-text-primary">Future connected account path</p>
        <p className="mt-1">
          Link Account will plug into this same asset model later. Manual asset creation and manual FMV entry remain the primary workflow today.
        </p>
      </div>
    </SectionCard>
  )
}