import { EmptyState } from '../../../components/EmptyState'
import { ErrorState } from '../../../components/ErrorState'
import { LoadingState } from '../../../components/LoadingState'
import type { ActivityDetailResponse, ActivityDetailRow } from '../../../../../../packages/types/src/reports'
import { EditableCell } from './EditableCell'
import { formatCurrency } from '../utils/formatters'

interface ActivityDetailReportProps {
  data: ActivityDetailResponse | undefined
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  isAdmin?: boolean
  undoRowId?: string | null
  onUndoLatestEdit?: () => void
  onCommitContributions?: (args: {
    row: ActivityDetailRow
    nextValue: number
  }) => Promise<{ status: 'ok' } | { status: 'conflict'; message: string }>
}

const headerClass =
  'sticky top-0 z-10 bg-gray-50 px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-text-tertiary'

const textHeaderClass =
  'sticky top-0 z-10 bg-gray-50 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-text-tertiary'

const nameCellClass = 'px-3 py-2 text-left whitespace-nowrap text-sm font-medium text-text-primary'

const cellClass = 'px-3 py-2 text-right whitespace-nowrap text-sm tabular-nums text-text-primary'

const textCellClass = 'px-3 py-2 text-left whitespace-nowrap text-sm text-text-primary'

const formatYear = (value: number): string => String(value)

const formatNegativeBasis = (value: boolean): string => (value ? 'Yes' : 'No')

export function ActivityDetailReport({
  data,
  isLoading,
  isError,
  onRetry,
  isAdmin = false,
  undoRowId = null,
  onUndoLatestEdit,
  onCommitContributions,
}: ActivityDetailReportProps) {
  if (isLoading) {
    return (
      <div className="rounded-card border border-border bg-surface" data-testid="activity-detail-loading">
        <LoadingState rows={10} columns={21} />
      </div>
    )
  }

  if (isError) {
    return (
      <div data-testid="activity-detail-error">
        <ErrorState
          title="Unable to load Activity Detail"
          message="Try again or adjust your filters."
          onRetry={onRetry}
        />
      </div>
    )
  }

  const rows = data?.rows ?? []
  if (rows.length === 0) {
    return (
      <div data-testid="activity-detail-empty">
        <EmptyState
          title="No activity detail rows match your filters"
          description="Try a broader search, different tax year, or clear filters."
        />
      </div>
    )
  }

  return (
    <div
      className="max-h-[36rem] overflow-auto rounded-card border border-border bg-surface"
      data-testid="activity-detail-table"
    >
      <table className="min-w-full border-collapse">
        <thead>
          <tr>
            <th className={textHeaderClass}>Year</th>
            <th className={textHeaderClass}>Entity</th>
            <th className={textHeaderClass}>Partnership</th>
            <th className={headerClass}>Beginning Basis</th>
            <th className={headerClass}>Contributions</th>
            <th className={headerClass}>Interest</th>
            <th className={headerClass}>Dividends</th>
            <th className={headerClass}>Cap Gains</th>
            <th className={headerClass}>Remaining K-1</th>
            <th className={headerClass}>Total Income</th>
            <th className={headerClass}>Distributions</th>
            <th className={headerClass}>Other Adjustments</th>
            <th className={headerClass}>Ending Tax Basis</th>
            <th className={headerClass}>Ending GL Balance</th>
            <th className={headerClass}>Book-To-Book Adj</th>
            <th className={headerClass}>K-1 Capital Account</th>
            <th className={headerClass}>K-1 vs Tax Diff</th>
            <th className={headerClass}>Excess Distribution</th>
            <th className={headerClass}>Negative Basis</th>
            <th className={headerClass}>Ending Basis</th>
            <th className={textHeaderClass}>Notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-border-subtle last:border-b-0">
              <td className={textCellClass}>{formatYear(row.taxYear)}</td>
              <td className={nameCellClass}>{row.entityName}</td>
              <td className={textCellClass}>{row.partnershipName}</td>
              <td className={cellClass}>{formatCurrency(row.beginningBasisUsd)}</td>
              <td className={cellClass}>
                {isAdmin && onCommitContributions ? (
                  <EditableCell
                    value={row.contributionsUsd}
                    editable={true}
                    onCommit={(nextValue) =>
                      onCommitContributions({ row, nextValue })
                    }
                    showUndo={undoRowId === row.id}
                    onUndo={onUndoLatestEdit}
                  />
                ) : (
                  formatCurrency(row.contributionsUsd)
                )}
              </td>
              <td className={cellClass}>{formatCurrency(row.interestUsd)}</td>
              <td className={cellClass}>{formatCurrency(row.dividendsUsd)}</td>
              <td className={cellClass}>{formatCurrency(row.capitalGainsUsd)}</td>
              <td className={cellClass}>{formatCurrency(row.remainingK1Usd)}</td>
              <td className={cellClass}>{formatCurrency(row.totalIncomeUsd)}</td>
              <td className={cellClass}>{formatCurrency(row.distributionsUsd)}</td>
              <td className={cellClass}>{formatCurrency(row.otherAdjustmentsUsd)}</td>
              <td className={cellClass}>{formatCurrency(row.endingTaxBasisUsd)}</td>
              <td className={cellClass}>{formatCurrency(row.endingGlBalanceUsd)}</td>
              <td className={cellClass}>{formatCurrency(row.bookToBookAdjustmentUsd)}</td>
              <td className={cellClass}>{formatCurrency(row.k1CapitalAccountUsd)}</td>
              <td className={cellClass}>{formatCurrency(row.k1VsTaxDifferenceUsd)}</td>
              <td className={cellClass}>{formatCurrency(row.excessDistributionUsd)}</td>
              <td className={cellClass}>{formatNegativeBasis(row.negativeBasis)}</td>
              <td className={cellClass}>{formatCurrency(row.endingBasisUsd)}</td>
              <td className={textCellClass}>
                {row.notes ? (
                  <span className="max-w-[220px] truncate block" title={row.notes}>
                    {row.notes}
                  </span>
                ) : (
                  'N/A'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
