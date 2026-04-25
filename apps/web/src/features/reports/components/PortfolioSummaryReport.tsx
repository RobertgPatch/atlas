import { BarChart3Icon, CircleDollarSignIcon, LandmarkIcon, TrendingUpIcon } from 'lucide-react'
import { EmptyState } from '../../../components/EmptyState'
import { ErrorState } from '../../../components/ErrorState'
import { KpiCard } from '../../../components/KpiCard'
import { LoadingState } from '../../../components/LoadingState'
import type { PortfolioSummaryResponse, PortfolioSummaryRow } from '../../../../../../packages/types/src/reports'
import type { SaveCommitmentResult } from '../hooks/useReportMutations'
import { EditableCell } from './EditableCell'
import { formatCurrency, formatMultiple, formatPercent } from '../utils/formatters'

interface PortfolioSummaryReportProps {
  data: PortfolioSummaryResponse | undefined
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  onCommitOriginalCommitment: (args: {
    row: PortfolioSummaryRow
    nextValue: number
  }) => Promise<SaveCommitmentResult>
  onUndoLatestEdit: () => void
  undoCommitmentId: string | null
}

const headerClass =
  'sticky top-0 z-10 bg-gray-50 px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-text-tertiary'

const cellClass = 'px-3 py-2 text-right whitespace-nowrap text-sm tabular-nums text-text-primary'

const nameCellClass = 'px-3 py-2 text-left whitespace-nowrap text-sm font-medium text-text-primary'

export function PortfolioSummaryReport({
  data,
  isLoading,
  isError,
  onRetry,
  onCommitOriginalCommitment,
  onUndoLatestEdit,
  undoCommitmentId,
}: PortfolioSummaryReportProps) {
  if (isLoading) {
    return (
      <div className="rounded-card border border-border bg-surface" data-testid="portfolio-loading">
        <LoadingState rows={8} columns={11} />
      </div>
    )
  }

  if (isError) {
    return (
      <div data-testid="portfolio-error">
        <ErrorState
          title="Unable to load Portfolio Summary"
          message="Try again or adjust your filters."
          onRetry={onRetry}
        />
      </div>
    )
  }

  const payload = data
  const rows = payload?.rows ?? []

  if (rows.length === 0) {
    return (
      <div data-testid="portfolio-empty">
        <EmptyState
          title="No portfolio rows match your filters"
          description="Try a broader search, different entity type, or clear filters."
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total Commitment"
          value={formatCurrency(payload?.kpis.totalCommitmentUsd ?? 0)}
          icon={<CircleDollarSignIcon className="h-4 w-4 text-accent" />}
        />
        <KpiCard
          label="Total Distributions"
          value={formatCurrency(payload?.kpis.totalDistributionsUsd ?? 0)}
          icon={<LandmarkIcon className="h-4 w-4 text-accent" />}
        />
        <KpiCard
          label="Weighted IRR"
          value={formatPercent(payload?.kpis.weightedIrr ?? null, 1)}
          icon={<TrendingUpIcon className="h-4 w-4 text-accent" />}
        />
        <KpiCard
          label="Weighted TVPI"
          value={formatMultiple(payload?.kpis.weightedTvpi ?? null)}
          icon={<BarChart3Icon className="h-4 w-4 text-accent" />}
        />
      </div>

      <div
        className="max-h-[34rem] overflow-auto rounded-card border border-border bg-surface"
        data-testid="portfolio-table"
      >
        <table className="min-w-full border-collapse">
          <thead>
            <tr>
              <th className="sticky top-0 z-10 bg-gray-50 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
                Entity
              </th>
              <th className={headerClass}>Original Commitment</th>
              <th className={headerClass}>% Called</th>
              <th className={headerClass}>Unfunded</th>
              <th className={headerClass}>Paid-In</th>
              <th className={headerClass}>Distributions</th>
              <th className={headerClass}>Residual Value</th>
              <th className={headerClass}>DPI</th>
              <th className={headerClass}>RVPI</th>
              <th className={headerClass}>TVPI</th>
              <th className={headerClass}>IRR</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const commitmentTarget = row.editability.commitmentTarget
              const canUndo =
                commitmentTarget != null && undoCommitmentId === commitmentTarget.commitmentId

              return (
                <tr key={row.id} className="border-b border-border-subtle last:border-b-0">
                  <td className={nameCellClass}>
                    <div className="flex flex-col">
                      <span>{row.entityName}</span>
                      <span className="text-xs font-normal text-text-tertiary">
                        {(() => {
                          const typeLabel =
                            row.assetClassSummary ??
                            (row.entityType && row.entityType.toUpperCase() !== 'UNKNOWN'
                              ? row.entityType
                              : null)
                          return typeLabel ? `${typeLabel} • ` : ''
                        })()}
                        {row.partnershipCount} partnership
                        {row.partnershipCount === 1 ? '' : 's'}
                      </span>
                    </div>
                  </td>

                  <td className={cellClass}>
                    {commitmentTarget ? (
                      <EditableCell
                        value={row.originalCommitmentUsd}
                        editable={row.editability.originalCommitmentEditable}
                        onCommit={(nextValue) =>
                          onCommitOriginalCommitment({ row, nextValue })
                        }
                        showUndo={canUndo}
                        onUndo={onUndoLatestEdit}
                      />
                    ) : (
                      <span title={row.editability.reason ?? undefined}>
                        {formatCurrency(row.originalCommitmentUsd)}
                      </span>
                    )}
                  </td>
                  <td className={cellClass}>{formatPercent(row.calledPct)}</td>
                  <td className={cellClass}>{formatCurrency(row.unfundedUsd)}</td>
                  <td className={cellClass}>{formatCurrency(row.paidInUsd)}</td>
                  <td className={cellClass}>{formatCurrency(row.distributionsUsd)}</td>
                  <td className={cellClass}>{formatCurrency(row.residualValueUsd)}</td>
                  <td className={cellClass}>{formatMultiple(row.dpi)}</td>
                  <td className={cellClass}>{formatMultiple(row.rvpi)}</td>
                  <td className={cellClass}>{formatMultiple(row.tvpi)}</td>
                  <td className={cellClass}>{formatPercent(row.irr, 1)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr
              className="sticky bottom-0 z-10 border-t border-border bg-gray-100/95"
              data-testid="portfolio-sticky-totals"
            >
              <td className="px-3 py-2 text-left text-sm font-semibold text-text-primary">Totals</td>
              <td className="px-3 py-2 text-right text-sm font-semibold text-text-primary">
                {formatCurrency(payload?.totals.originalCommitmentUsd ?? 0)}
              </td>
              <td className="px-3 py-2 text-right text-sm font-semibold text-text-primary">
                {formatPercent(payload?.totals.calledPct ?? null)}
              </td>
              <td className="px-3 py-2 text-right text-sm font-semibold text-text-primary">
                {formatCurrency(payload?.totals.unfundedUsd ?? 0)}
              </td>
              <td className="px-3 py-2 text-right text-sm font-semibold text-text-primary">
                {formatCurrency(payload?.totals.paidInUsd ?? 0)}
              </td>
              <td className="px-3 py-2 text-right text-sm font-semibold text-text-primary">
                {formatCurrency(payload?.totals.distributionsUsd ?? 0)}
              </td>
              <td className="px-3 py-2 text-right text-sm font-semibold text-text-primary">
                {formatCurrency(payload?.totals.residualValueUsd ?? 0)}
              </td>
              <td className="px-3 py-2 text-right text-sm font-semibold text-text-primary">
                {formatMultiple(payload?.totals.dpi ?? null)}
              </td>
              <td className="px-3 py-2 text-right text-sm font-semibold text-text-primary">
                {formatMultiple(payload?.totals.rvpi ?? null)}
              </td>
              <td className="px-3 py-2 text-right text-sm font-semibold text-text-primary">
                {formatMultiple(payload?.totals.tvpi ?? null)}
              </td>
              <td className="px-3 py-2 text-right text-sm font-semibold text-text-primary">
                {formatPercent(payload?.totals.irr ?? null, 1)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
