import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  Clock3Icon,
  LoaderCircleIcon,
  XCircleIcon,
} from 'lucide-react'
import type { ConsolidatedHoldingsResponse } from '../../../../../../packages/types/src/reports'

interface ConsolidatedHoldingsSyncStatusProps {
  sync: ConsolidatedHoldingsResponse['sync'] | undefined
  pricing?: ConsolidatedHoldingsResponse['pricing']
}

export function ConsolidatedHoldingsSyncStatus({
  sync,
  pricing,
}: ConsolidatedHoldingsSyncStatusProps) {
  if (!sync) return null

  const freshnessStatus = sync.freshnessStatus ?? 'unavailable'
  const statusView = getStatusView(freshnessStatus)
  const Icon = statusView.icon
  const dataAsOf = sync.dataAsOfDate
    ? formatDateOnly(sync.dataAsOfDate)
    : 'No saved snapshot'
  const fetchedAt = sync.dataFetchedAt
    ? formatDateTime(sync.dataFetchedAt)
    : null
  const nextRefreshAt = sync.nextRefreshAt
    ? formatDateTime(sync.nextRefreshAt)
    : null
  const priceAsOf = pricing?.priceAsOf ? formatDateTime(pricing.priceAsOf) : null
  const pricingLabel = getPricingLabel(pricing)
  const warnings = [...sync.warnings, ...(pricing?.warnings ?? [])]

  return (
    <div
      className={`flex flex-col gap-3 rounded-lg border px-4 py-3 text-sm ${statusView.className}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-2">
          <Icon
            className={`mt-0.5 h-4 w-4 flex-shrink-0 ${sync.refreshing ? 'animate-spin' : ''}`}
          />
          <div>
            <div className="font-medium">{statusView.label}</div>
            <div className="mt-0.5 text-xs opacity-90">
              Holdings as of {dataAsOf}
              {fetchedAt ? ` - Fetched ${fetchedAt}` : ''}
            </div>
            {pricing ? (
              <div className="mt-0.5 text-xs opacity-90">
                {pricingLabel}
                {priceAsOf ? ` as of ${priceAsOf}` : ''}
                {pricing.pricedHoldingCount > 0
                  ? ` - ${pricing.pricedHoldingCount} position${pricing.pricedHoldingCount === 1 ? '' : 's'} repriced`
                  : ''}
              </div>
            ) : null}
          </div>
        </div>
        {nextRefreshAt ? (
          <div className="text-xs opacity-90">Next refresh {nextRefreshAt}</div>
        ) : null}
      </div>

      {warnings.length > 0 ? (
        <div className="flex items-start gap-2 border-t border-current/15 pt-3">
          <AlertTriangleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            <div className="font-medium">Some holdings need attention</div>
            <div>{warnings.join(' ')}</div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

const getPricingLabel = (
  pricing: ConsolidatedHoldingsResponse['pricing'] | undefined,
): string => {
  if (!pricing) return 'Pricing unavailable'
  const source = pricing.provider
    ?.split('+')
    .map((provider) =>
      provider === 'alpaca'
        ? 'Alpaca'
        : provider === 'massive'
          ? 'Massive'
          : provider,
    )
    .join(' + ')
  const feed = pricing.feed ? ` ${pricing.feed.toUpperCase()}` : ''
  switch (pricing.status) {
    case 'live':
      return `Live${feed} prices${source ? ` via ${source}` : ''}`
    case 'delayed':
      return `Delayed${feed} prices${source ? ` via ${source}` : ''}`
    case 'eod':
      return `Official closing prices${source ? ` via ${source}` : ''}`
    case 'fallback':
      return 'Custodian-provided prices'
    case 'unavailable':
    default:
      return 'Pricing unavailable'
  }
}

const formatDateOnly = (value: string): string =>
  new Intl.DateTimeFormat('en-US', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${value}T12:00:00.000Z`))

const formatDateTime = (value: string): string =>
  new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))

const getStatusView = (
  status: NonNullable<ConsolidatedHoldingsResponse['sync']>['freshnessStatus'],
) => {
  switch (status) {
    case 'fresh':
      return {
        label: 'Fresh',
        icon: CheckCircle2Icon,
        className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
      }
    case 'stale':
      return {
        label: 'Stale',
        icon: Clock3Icon,
        className: 'border-amber-200 bg-amber-50 text-amber-800',
      }
    case 'refreshing':
      return {
        label: 'Refreshing',
        icon: LoaderCircleIcon,
        className: 'border-blue-200 bg-blue-50 text-blue-800',
      }
    case 'failed':
      return {
        label: 'Failed',
        icon: XCircleIcon,
        className: 'border-red-200 bg-red-50 text-red-800',
      }
    case 'unavailable':
    default:
      return {
        label: 'Unavailable',
        icon: AlertTriangleIcon,
        className: 'border-gray-200 bg-gray-50 text-gray-700',
      }
  }
}
