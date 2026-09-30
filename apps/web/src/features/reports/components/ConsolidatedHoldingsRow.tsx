import {
  AlertCircleIcon,
  MinusIcon,
  PlusIcon,
} from 'lucide-react'
import type { ConsolidatedHoldingRow } from '../../../../../../packages/types/src/reports'
import { getCostBasisStatus } from '../utils/consolidatedHoldingsAnalytics'
import { formatCurrencyWithCents, formatPercent } from '../utils/formatters'

interface ConsolidatedHoldingsRowProps {
  row: ConsolidatedHoldingRow
  sector: string
  accountCount: number
  groupAccentClassName: string
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

type HoldingDisplayValues = Pick<
  ConsolidatedHoldingRow,
  'type' | 'cashDisplayMode' | 'quantity' | 'costBasis' | 'averageCostBasis' | 'marketValue'
>

const isBalanceCash = (holding: Pick<HoldingDisplayValues, 'cashDisplayMode'>): boolean =>
  holding.cashDisplayMode === 'BALANCE_AT_PAR' ||
  holding.cashDisplayMode === 'CASH_CREDIT_OR_DEBIT'

const isUnitizedCash = (holding: Pick<HoldingDisplayValues, 'cashDisplayMode'>): boolean =>
  holding.cashDisplayMode === 'STABLE_NAV_UNITS' ||
  holding.cashDisplayMode === 'FLOATING_NAV_UNITS'

const averageCostBasisFor = (holding: HoldingDisplayValues): number | null => {
  if (holding.averageCostBasis != null) return holding.averageCostBasis
  const equity=['stock','equity','equities'].includes(holding.type.trim().toLocaleLowerCase('en-US'))
  return (equity||isUnitizedCash(holding))&&holding.quantity!=null&&holding.quantity!==0&&holding.costBasis!=null?holding.costBasis/holding.quantity:null
}

const cashBasisCaption = (holding: HoldingDisplayValues): string | null => {
  if (holding.cashDisplayMode === 'CASH_CREDIT_OR_DEBIT') {
    return (holding.marketValue ?? 0) < 0 ? 'Debit balance' : 'Credit balance'
  }
  if (holding.cashDisplayMode === 'BALANCE_AT_PAR') {
    return (holding.marketValue ?? 0) < 0 ? 'Debit balance' : 'At par'
  }
  return null
}

function QuantityCell({ holding }: { holding: HoldingDisplayValues }) {
  if (isBalanceCash(holding)) {
    return (
      <span
        className="text-gray-400"
        title="Balance-based holding; no quantity is reported."
        aria-label="No quantity; balance-based holding"
      >
        &mdash;
      </span>
    )
  }
  return <>{formatNumber(holding.quantity)}</>
}

function GainLossCell({
  value,
  percent,
  status,
  cashDisplayMode,
  currency = 'USD',
}: {
  value: number | null
  percent: number | null
  status: 'complete' | 'partial' | 'missing'
  cashDisplayMode?: ConsolidatedHoldingRow['cashDisplayMode']
  currency?: string
}) {
  if (status === 'missing' || value == null) {
    return <span className="text-sm text-gray-400">N/A</span>
  }

  const positive = (value ?? 0) >= 0
  const color = positive ? 'text-emerald-600' : 'text-red-600'
  const bg = positive ? 'bg-emerald-50' : 'bg-red-50'
  const atPar = cashDisplayMode === 'BALANCE_AT_PAR'
  const cashCreditOrDebit = cashDisplayMode === 'CASH_CREDIT_OR_DEBIT'

  return (
    <div className="flex flex-col items-end">
      <div className="flex items-center gap-1">
        <span className={`text-sm font-medium ${color}`}>
          {formatCurrencyWithCents(value,currency)}
        </span>
        {status === 'partial' && (
          <AlertCircleIcon className="h-3.5 w-3.5 text-amber-400" />
        )}
      </div>
      {(atPar || cashCreditOrDebit) && value === 0 ? (
        <span className="mt-0.5 text-xs font-normal text-gray-400">
          {atPar ? 'At par' : 'Not applicable'}
        </span>
      ) : percent !== null && (
        <span className={`mt-0.5 rounded px-1.5 py-0.5 text-xs font-medium ${bg} ${color}`}>
          {formatPercent(percent, 2)}
        </span>
      )}
    </div>
  )
}

export function ConsolidatedHoldingsRow({
  row,
  sector,
  accountCount,
  groupAccentClassName,
  isExpanded,
  onToggle,
}: ConsolidatedHoldingsRowProps) {
  const costBasisStatus = getCostBasisStatus(row)
  const averageCostBasis=averageCostBasisFor(row)
  const basisCaption=cashBasisCaption(row)
  const positionName = truncatePositionName(row.description)
  const symbolLabel = row.symbol ?? 'N/A'
  const symbolTitle = row.securityIdentifier
    ? `${symbolLabel} (${row.securityIdentifier})`
    : row.symbol ?? undefined

  return (
    <>
      <tr
        onClick={onToggle}
        aria-expanded={isExpanded}
        className="group cursor-pointer border-b border-gray-100 transition-colors hover:bg-gray-50"
      >
        <td className={`border-l-4 py-3.5 pl-12 pr-2 ${groupAccentClassName}`}>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-expanded={isExpanded}
              aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${row.symbol ?? row.description} account details`}
              title={`${isExpanded ? 'Collapse' : 'Expand'} account details`}
              onClick={(event) => {
                event.stopPropagation()
                onToggle()
              }}
              className={`inline-flex h-4 w-4 flex-shrink-0 items-center justify-center text-gray-400 transition-colors hover:text-gray-700 ${
                isExpanded
                  ? 'text-blue-700'
                  : 'group-hover:text-gray-700'
              }`}
            >
              {isExpanded ? (
                <MinusIcon className="h-3 w-3" />
              ) : (
                <PlusIcon className="h-3 w-3" />
              )}
            </button>
            <span className="truncate text-sm font-semibold text-gray-900" title={symbolTitle}>
              {symbolLabel}
            </span>
          </div>
        </td>
        <td className="px-3 py-3.5">
          <div
            className="truncate text-sm text-gray-600"
            title={row.description}
          >
            {positionName}
          </div>
          <div className="mt-0.5 flex min-w-0 items-center">
            <span className="truncate text-xs text-gray-400" title={sector}>
              {sector}
            </span>
          </div>
        </td>
        <td className="px-3 py-3.5 text-right text-sm font-medium text-gray-900">
          {row.costBasis !== null ? (
            <div>
              <div>{formatCurrencyWithCents(row.costBasis,row.currencyCode??'USD')}</div>
              {costBasisStatus === 'partial' ? (
                <div className="mt-0.5 flex items-center justify-end gap-1">
                  <AlertCircleIcon className="h-3 w-3 text-amber-400" />
                  <span className="text-[10px] font-medium text-amber-600">
                    Partial
                  </span>
                </div>
              ) : (
                <div className="text-xs font-normal text-gray-400">
                  {basisCaption ?? `Avg ${formatCurrencyWithCents(averageCostBasis,row.currencyCode??'USD')}`}
                </div>
              )}
            </div>
          ) : (
            <span className="text-sm text-gray-400">N/A</span>
          )}
        </td>
        <td className="px-3 py-3.5 text-right">
          <GainLossCell
            currency={row.currencyCode??'USD'}
            value={row.unrealizedGainLoss}
            percent={row.gainLossPercent}
            status={costBasisStatus}
            cashDisplayMode={row.cashDisplayMode}
          />
        </td>
        <td className="px-3 py-3.5 text-center text-sm text-gray-500">
          <span
            className="text-xs font-medium text-gray-500"
            title={`${accountCount} account${accountCount === 1 ? '' : 's'}`}
          >
            {accountCount}
          </span>
        </td>
        <td className="px-3 py-3.5 text-right text-sm font-medium text-gray-900">
          <QuantityCell holding={row} />
        </td>
        <td className="py-3.5 pl-3 pr-4 text-right text-sm font-semibold text-gray-900">
          <div>{formatCurrencyWithCents(row.marketValue,row.currencyCode??'USD')}</div>
          <div className="text-xs font-normal text-gray-400">
            {isBalanceCash(row)
              ? `Balance${row.priceAsOfDate ? ` ${formatPriceDate(row.priceAsOfDate)}` : ''}`
              : `${formatCurrencyWithCents(row.institutionPrice,row.currencyCode??'USD')} ${formatPriceDate(row.priceAsOfDate)}`}
          </div>
        </td>
      </tr>

      {isExpanded &&
        row.details.map((detail) => {
          const detailAverageCostBasis=averageCostBasisFor(detail)
          const detailBasisCaption=cashBasisCaption(detail)
          return (
          <tr key={detail.id} className="border-b border-gray-50 bg-gray-50/70">
            <td className={`border-l-4 py-2.5 pl-14 pr-2 ${groupAccentClassName}`} />
            <td className="py-2.5 pl-6 pr-3 text-xs text-gray-500">
              <div className="truncate font-medium text-gray-600" title={detail.accountName}>
                {detail.accountName}
              </div>
              <div className="mt-0.5 flex items-center gap-1">
                <span className="truncate text-[10px] text-gray-400" title={detail.custodian}>
                  {detail.custodian}
                </span>
                {detail.accountMask ? (
                  <span className="text-[10px] text-gray-400">****{detail.accountMask}</span>
                ) : null}
              </div>
            </td>
            <td className="px-3 py-2.5 text-right text-xs text-gray-600">
              {detail.costBasis !== null ? (
                <div>
                  <div>{formatCurrencyWithCents(detail.costBasis,detail.currencyCode??'USD')}</div>
                  <div className="text-gray-400">
                    {detailBasisCaption ?? `Avg ${formatCurrencyWithCents(detailAverageCostBasis,detail.currencyCode??'USD')}`}
                  </div>
                </div>
              ) : (
                <span className="italic text-gray-400">Unavailable</span>
              )}
            </td>
            <td className="px-3 py-2.5 text-right">
              <GainLossCell
                currency={detail.currencyCode??'USD'}
                value={detail.unrealizedGainLoss}
                percent={detail.gainLossPercent}
                status={detail.costBasis == null ? 'missing' : 'complete'}
                cashDisplayMode={detail.cashDisplayMode}
              />
            </td>
            <td className="px-3 py-2.5 text-center text-xs text-gray-500">
              <span className="inline-block max-w-full truncate" title={detail.custodian}>
                {detail.custodian}
              </span>
            </td>
            <td className="px-3 py-2.5 text-right text-xs text-gray-600">
              <QuantityCell holding={detail} />
            </td>
            <td className="py-2.5 pl-3 pr-4 text-right text-xs text-gray-600">
              <div>{formatCurrencyWithCents(detail.marketValue,detail.currencyCode??'USD')}</div>
              <div className="text-gray-400">
                {isBalanceCash(detail)
                  ? `Balance${detail.priceAsOfDate ? ` ${formatPriceDate(detail.priceAsOfDate)}` : ''}`
                  : `${formatCurrencyWithCents(detail.institutionPrice,detail.currencyCode??'USD')} ${formatPriceDate(detail.priceAsOfDate)}`}
              </div>
            </td>
          </tr>
          )
        })}
    </>
  )
}
