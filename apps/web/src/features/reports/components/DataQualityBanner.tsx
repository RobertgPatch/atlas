import { AlertTriangleIcon, InfoIcon } from 'lucide-react'

interface DataQualityBannerProps {
  nullCostBasisCount: number
  affectedAccountCount: number
}

export function DataQualityBanner({
  nullCostBasisCount,
  affectedAccountCount,
}: DataQualityBannerProps) {
  if (nullCostBasisCount === 0) return null

  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3.5">
      <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-amber-100">
        <AlertTriangleIcon className="h-4 w-4 text-amber-600" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-amber-800">Partial Cost Basis Data</p>
        <p className="mt-0.5 text-sm text-amber-700">
          Cost basis is unavailable for {nullCostBasisCount} position
          {nullCostBasisCount > 1 ? 's' : ''} across {affectedAccountCount}{' '}
          account{affectedAccountCount > 1 ? 's' : ''}. Unrealized gain/loss
          figures marked as Partial exclude those positions. This is a limitation
          of the custodian data feed.
        </p>
      </div>
      <div className="flex-shrink-0">
        <div className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-600">
          <InfoIcon className="h-3 w-3" />
          Plaid API
        </div>
      </div>
    </div>
  )
}
