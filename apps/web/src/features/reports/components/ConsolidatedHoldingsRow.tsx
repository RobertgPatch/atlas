import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react'
import type { ConsolidatedHoldingRow } from '../../../../../../packages/types/src/reports'
import { formatCurrency, formatPercent } from '../utils/formatters'

interface ConsolidatedHoldingsRowProps {
  row: ConsolidatedHoldingRow
  isExpanded: boolean
  onToggle: () => void
}

const formatNumber = (value: number | null | undefined): string =>
  value == null
    ? 'N/A'
    : new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(value)

function GainLossCell({
  value,
  percent,
}: {
  value: number | null
  percent: number | null
}) {
  const positive = (value ?? 0) >= 0
  const color = positive ? 'text-emerald-600' : 'text-red-600'
  const bg = positive ? 'bg-emerald-50' : 'bg-red-50'

  return (
    <div className="flex flex-col items-end">
      <span className={`font-medium ${color}`}>{formatCurrency(value)}</span>
      <span className={`mt-0.5 rounded px-1.5 py-0.5 text-xs font-medium ${bg} ${color}`}>
        {formatPercent(percent, 2)}
      </span>
    </div>
  )
}

export function ConsolidatedHoldingsRow({
  row,
  isExpanded,
  onToggle,
}: ConsolidatedHoldingsRowProps) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="group cursor-pointer border-b border-gray-100 transition-colors hover:bg-gray-50"
      >
        <td className="py-3.5 pl-4 pr-2">
          <div className="flex items-center gap-1.5">
            {isExpanded ? (
              <ChevronDownIcon className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronRightIcon className="h-4 w-4 text-gray-400" />
            )}
            <span className="text-sm font-semibold text-gray-900">
              {row.symbol ?? 'N/A'}
            </span>
            {row.identityConfidence !== 'high' && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                {row.identityConfidence}
              </span>
            )}
          </div>
        </td>
        <td className="max-w-[220px] truncate px-3 py-3.5 text-sm text-gray-600">
          {row.description}
        </td>
        <td className="px-3 py-3.5">
          <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700">
            {row.type}
          </span>
        </td>
        <td className="px-3 py-3.5 text-right text-sm font-medium text-gray-900">
          <div>{formatCurrency(row.costBasis)}</div>
          <div className="text-xs font-normal text-gray-400">
            Avg {formatCurrency(row.averageCostBasis)}
          </div>
        </td>
        <td className="px-3 py-3.5 text-right">
          <GainLossCell value={row.unrealizedGainLoss} percent={row.gainLossPercent} />
        </td>
        <td className="px-3 py-3.5 text-center text-sm text-gray-500">
          <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
            {row.custodianSummary}
          </span>
        </td>
        <td className="px-3 py-3.5 text-right text-sm font-medium text-gray-900">
          {formatNumber(row.quantity)}
        </td>
        <td className="py-3.5 pl-3 pr-4 text-right text-sm font-semibold text-gray-900">
          {formatCurrency(row.marketValue)}
        </td>
      </tr>

      {isExpanded &&
        row.details.map((detail) => (
          <tr key={detail.id} className="border-b border-gray-50 bg-gray-50/70">
            <td className="py-2.5 pl-12 pr-2 text-xs text-gray-400">-</td>
            <td className="px-3 py-2.5 text-xs text-gray-500">
              {detail.custodian} - {detail.accountName}
            </td>
            <td className="px-3 py-2.5" />
            <td className="px-3 py-2.5 text-right text-xs text-gray-600">
              <div>{formatCurrency(detail.costBasis)}</div>
              <div className="text-gray-400">
                Avg {formatCurrency(detail.averageCostBasis)}
              </div>
            </td>
            <td className="px-3 py-2.5 text-right">
              <GainLossCell
                value={detail.unrealizedGainLoss}
                percent={detail.gainLossPercent}
              />
            </td>
            <td className="px-3 py-2.5 text-center text-xs text-gray-500">
              {detail.accountMask ? `${detail.custodian} ****${detail.accountMask}` : detail.custodian}
            </td>
            <td className="px-3 py-2.5 text-right text-xs text-gray-600">
              {formatNumber(detail.quantity)}
            </td>
            <td className="py-2.5 pl-3 pr-4 text-right text-xs text-gray-600">
              {formatCurrency(detail.marketValue)}
            </td>
          </tr>
        ))}
    </>
  )
}
