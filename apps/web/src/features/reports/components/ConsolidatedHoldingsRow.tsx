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
  accountCount: number
  isExpanded: boolean
  onToggle: () => void
}

const formatNumber = (value: number | null | undefined): string =>
  value == null
    ? 'N/A'
    : new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(value)

const formatPriceDate = (value: string | null | undefined): string =>
  value
    ? new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(value))
    : 'No date'

const truncatePositionName = (value: string): string =>
  value.length > 80 ? `${value.slice(0, 77)}...` : value

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

const identityConfidenceLabel = (
  confidence: ConsolidatedHoldingRow['identityConfidence'],
): string => {
  if (confidence === 'low') return 'Needs ID'
  if (confidence === 'medium') return 'Provider ID'
  return 'Verified ID'
}

export function ConsolidatedHoldingsRow({
  row,
  sector,
  accountCount,
  isExpanded,
  onToggle,
}: ConsolidatedHoldingsRowProps) {
  const costBasisStatus = getCostBasisStatus(row)
  const positionName = truncatePositionName(row.description)
  const positionTitle = row.description.length > 80 ? row.description : undefined
  const sourceRecordLabel = `${row.details.length} source ${
    row.details.length === 1 ? 'record' : 'records'
  }`

  return (
    <>
      <tr
        onClick={onToggle}
        aria-expanded={isExpanded}
        className="group cursor-pointer border-b border-gray-100 transition-colors hover:bg-gray-50"
      >
        <td className="py-3.5 pl-4 pr-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-expanded={isExpanded}
              aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${row.symbol ?? row.description} account details`}
              title={`${isExpanded ? 'Collapse' : 'Expand'} account details`}
              onClick={(event) => {
                event.stopPropagation()
                onToggle()
              }}
              className={`inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border transition-colors ${
                isExpanded
                  ? 'border-blue-200 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white text-gray-500 group-hover:border-blue-200 group-hover:text-blue-600'
              }`}
            >
              {isExpanded ? (
                <ChevronDownIcon className="h-4 w-4" />
              ) : (
                <ChevronRightIcon className="h-4 w-4" />
              )}
            </button>
            <span className="text-sm font-semibold text-gray-900">
              {row.symbol ?? 'N/A'}
            </span>
            {row.identityConfidence !== 'high' && (
              <span
                className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700"
                title="Security identity could not be fully matched from custodian data"
              >
                {identityConfidenceLabel(row.identityConfidence)}
              </span>
            )}
          </div>
        </td>
        <td className="px-3 py-3.5">
          <div
            className="truncate text-sm text-gray-600"
            title={positionTitle}
          >
            {positionName}
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-1">
            <span
              className={`inline-flex whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                sectorBadgeColors[sector] ?? sectorBadgeColors.Other
              }`}
            >
              {sector}
            </span>
            <span className="truncate text-xs text-gray-400">{row.custodianSummary}</span>
            <span className="whitespace-nowrap rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
              {sourceRecordLabel}
            </span>
          </div>
        </td>
        <td className="px-3 py-3.5 align-top">
          <span
            className="inline-flex max-w-full whitespace-nowrap rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700"
            title={row.type}
          >
            <span className="truncate">{row.type}</span>
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
          <span className="inline-flex rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
            {accountCount} {accountCount === 1 ? 'acct' : 'accts'}
          </span>
        </td>
        <td className="px-3 py-3.5 text-right text-sm font-medium text-gray-900">
          {formatNumber(row.quantity)}
        </td>
        <td className="py-3.5 pl-3 pr-4 text-right text-sm font-semibold text-gray-900">
          <div>{formatCurrency(row.marketValue)}</div>
          <div className="text-xs font-normal text-gray-400">
            {formatCurrency(row.institutionPrice)} {formatPriceDate(row.priceAsOfDate)}
          </div>
        </td>
      </tr>

      {isExpanded &&
        row.details.map((detail) => (
          <tr key={detail.id} className="border-b border-gray-50 bg-gray-50/70">
            <td className="py-2.5 pl-12 pr-2 text-xs text-gray-300">-</td>
            <td className="px-3 py-2.5 text-xs text-gray-500">
              <div className="truncate">{detail.custodian} - {detail.accountName}</div>
              <div className="mt-0.5 flex items-center gap-1">
                {detail.accountMask ? (
                  <span className="text-[10px] text-gray-400">****{detail.accountMask}</span>
                ) : null}
              </div>
            </td>
            <td className="px-3 py-2.5 align-top">
              <span
                className="inline-flex max-w-full whitespace-nowrap rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600"
                title={detail.type}
              >
                <span className="truncate">{detail.type}</span>
              </span>
            </td>
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
              <span className="inline-block max-w-full truncate">
                {detail.custodian}
              </span>
            </td>
            <td className="px-3 py-2.5 text-right text-xs text-gray-600">
              {formatNumber(detail.quantity)}
            </td>
            <td className="py-2.5 pl-3 pr-4 text-right text-xs text-gray-600">
              <div>{formatCurrency(detail.marketValue)}</div>
              <div className="text-gray-400">
                {formatCurrency(detail.institutionPrice)} {formatPriceDate(detail.priceAsOfDate)}
              </div>
            </td>
          </tr>
        ))}
    </>
  )
}
