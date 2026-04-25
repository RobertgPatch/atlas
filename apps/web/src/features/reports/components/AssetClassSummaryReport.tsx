import { EmptyState } from '../../../components/EmptyState'
import { ErrorState } from '../../../components/ErrorState'
import { LoadingState } from '../../../components/LoadingState'
import type { AssetClassSummaryResponse } from '../../../../../../packages/types/src/reports'
import { formatCurrency, formatMultiple, formatPercent } from '../utils/formatters'

interface AssetClassSummaryReportProps {
  data: AssetClassSummaryResponse | undefined
  isLoading: boolean
  isError: boolean
  onRetry: () => void
}

const headerClass =
  'sticky top-0 z-10 bg-gray-50 px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-text-tertiary'

const nameCellClass = 'px-3 py-2 text-left whitespace-nowrap text-sm font-medium text-text-primary'

const cellClass = 'px-3 py-2 text-right whitespace-nowrap text-sm tabular-nums text-text-primary'

export function AssetClassSummaryReport({
  data,
  isLoading,
  isError,
  onRetry,
}: AssetClassSummaryReportProps) {
  if (isLoading) {
    return (
      <div className="rounded-card border border-border bg-surface" data-testid="asset-class-loading">
        <LoadingState rows={8} columns={11} />
      </div>
    )
  }

  if (isError) {
    return (
      <div data-testid="asset-class-error">
        <ErrorState
          title="Unable to load Asset Class Summary"
          message="Try again or adjust your filters."
          onRetry={onRetry}
        />
      </div>
    )
  }

  const rows = data?.rows ?? []
  if (rows.length === 0) {
    return (
      <div data-testid="asset-class-empty">
        <EmptyState
          title="No asset classes match your filters"
          description="Try a broader search, different entity type, or clear filters."
        />
      </div>
    )
  }

  return (
    <div
      className="max-h-[34rem] overflow-auto rounded-card border border-border bg-surface"
      data-testid="asset-class-table"
    >
      <table className="min-w-full border-collapse">
        <thead>
          <tr>
            <th className="sticky top-0 z-10 bg-gray-50 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
              Asset Class
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
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-border-subtle last:border-b-0">
              <td className={nameCellClass}>
                <div className="flex flex-col">
                  <span>{row.assetClass}</span>
                  <span className="text-xs font-normal text-text-tertiary">
                    {row.partnershipCount} partnership{row.partnershipCount === 1 ? '' : 's'}
                  </span>
                </div>
              </td>
              <td className={cellClass}>{formatCurrency(row.originalCommitmentUsd)}</td>
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
          ))}
        </tbody>
        <tfoot>
          <tr
            className="sticky bottom-0 z-10 border-t border-border bg-gray-100/95"
            data-testid="asset-class-sticky-totals"
          >
            <td className="px-3 py-2 text-left text-sm font-semibold text-text-primary">Totals</td>
            <td className="px-3 py-2 text-right text-sm font-semibold text-text-primary">
              {formatCurrency(data?.totals.originalCommitmentUsd ?? 0)}
            </td>
            <td className="px-3 py-2 text-right text-sm font-semibold text-text-primary">
              {formatPercent(data?.totals.calledPct ?? null)}
            </td>
            <td className="px-3 py-2 text-right text-sm font-semibold text-text-primary">
              {formatCurrency(data?.totals.unfundedUsd ?? 0)}
            </td>
            <td className="px-3 py-2 text-right text-sm font-semibold text-text-primary">
              {formatCurrency(data?.totals.paidInUsd ?? 0)}
            </td>
            <td className="px-3 py-2 text-right text-sm font-semibold text-text-primary">
              {formatCurrency(data?.totals.distributionsUsd ?? 0)}
            </td>
            <td className="px-3 py-2 text-right text-sm font-semibold text-text-primary">
              {formatCurrency(data?.totals.residualValueUsd ?? 0)}
            </td>
            <td className="px-3 py-2 text-right text-sm font-semibold text-text-primary">
              {formatMultiple(data?.totals.dpi ?? null)}
            </td>
            <td className="px-3 py-2 text-right text-sm font-semibold text-text-primary">
              {formatMultiple(data?.totals.rvpi ?? null)}
            </td>
            <td className="px-3 py-2 text-right text-sm font-semibold text-text-primary">
              {formatMultiple(data?.totals.tvpi ?? null)}
            </td>
            <td className="px-3 py-2 text-right text-sm font-semibold text-text-primary">
              {formatPercent(data?.totals.irr ?? null, 1)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
