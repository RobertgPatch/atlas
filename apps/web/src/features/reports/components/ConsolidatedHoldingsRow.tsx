import {
  AlertCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from 'lucide-react'
import type { ConsolidatedHoldingRow } from '../../../../../../packages/types/src/reports'
import { getCostBasisStatus } from '../utils/consolidatedHoldingsAnalytics'
import { formatCurrency, formatPercent } from '../utils/formatters'

interface ConsolidatedHoldingsRowProps {
  row: ConsolidatedHoldingRow
  sector: string
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
  status,
}: {
  value: number | null
  percent: number | null
  status: 'complete' | 'partial' | 'missing'
}) {
  if (status === 'missing' || value == null) {
    return <span className="text-sm text-gray-400">N/A</span>
  }

  const positive = (value ?? 0) >= 0
  const color = positive ? 'text-emerald-600' : 'text-red-600'
  const bg = positive ? 'bg-emerald-50' : 'bg-red-50'

  return (
    <div className="flex flex-col items-end">
      <div className="flex items-center gap-1">
        <span className={`text-sm font-medium ${color}`}>{formatCurrency(value)}</span>
        {status === 'partial' && (
          <AlertCircleIcon className="h-3.5 w-3.5 text-amber-400" />
        )}
      </div>
      {percent !== null && (
        <span className={`mt-0.5 rounded px-1.5 py-0.5 text-xs font-medium ${bg} ${color}`}>
          {formatPercent(percent, 2)}
        </span>
      )}
    </div>
  )
}

const sectorBadgeColors: Record<string, string> = {
  Technology: 'bg-blue-50 text-blue-700',
  'Consumer Cyclical': 'bg-violet-50 text-violet-700',
  'Financial Services': 'bg-sky-50 text-sky-700',
  'Broad Market': 'bg-teal-50 text-teal-700',
  Healthcare: 'bg-emerald-50 text-emerald-700',
  Other: 'bg-gray-100 text-gray-600',
}

export function ConsolidatedHoldingsRow({
  row,
  sector,
  isExpanded,
  onToggle,
}: ConsolidatedHoldingsRowProps) {
  const costBasisStatus = getCostBasisStatus(row)

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
        <td className="px-3 py-3.5">
          <div className="max-w-[180px] truncate text-sm text-gray-600">
            {row.description}
          </div>
          <span
            className={`mt-0.5 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
              sectorBadgeColors[sector] ?? sectorBadgeColors.Other
            }`}
          >
            {sector}
          </span>
        </td>
        <td className="px-3 py-3.5">
          <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700">
            {row.type}
          </span>
        </td>
        <td className="px-3 py-3.5 text-right text-sm font-medium text-gray-900">
          {row.costBasis !== null ? (
            <div>
              <div>{formatCurrency(row.costBasis)}</div>
              {costBasisStatus === 'partial' ? (
                <div className="mt-0.5 flex items-center justify-end gap-1">
                  <AlertCircleIcon className="h-3 w-3 text-amber-400" />
                  <span className="text-[10px] font-medium text-amber-600">
                    Partial
                  </span>
                </div>
              ) : (
                <div className="text-xs font-normal text-gray-400">
                  Avg {formatCurrency(row.averageCostBasis)}
                </div>
              )}
            </div>
          ) : (
            <span className="text-sm text-gray-400">N/A</span>
          )}
        </td>
        <td className="px-3 py-3.5 text-right">
          <GainLossCell
            value={row.unrealizedGainLoss}
            percent={row.gainLossPercent}
            status={costBasisStatus}
          />
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
            <td className="py-2.5 pl-12 pr-2 text-xs text-gray-300">-</td>
            <td className="px-3 py-2.5 text-xs text-gray-500">
              {detail.custodian} - {detail.accountName}
            </td>
            <td className="px-3 py-2.5" />
            <td className="px-3 py-2.5 text-right text-xs text-gray-600">
              {detail.costBasis !== null ? (
                <div>
                  <div>{formatCurrency(detail.costBasis)}</div>
                  <div className="text-gray-400">
                    Avg {formatCurrency(detail.averageCostBasis)}
                  </div>
                </div>
              ) : (
                <span className="italic text-gray-400">Unavailable</span>
              )}
            </td>
            <td className="px-3 py-2.5 text-right">
              <GainLossCell
                value={detail.unrealizedGainLoss}
                percent={detail.gainLossPercent}
                status={detail.costBasis == null ? 'missing' : 'complete'}
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
