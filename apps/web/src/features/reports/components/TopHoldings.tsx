import { MinusIcon, TrendingDownIcon, TrendingUpIcon } from 'lucide-react'
import type { TopHoldingDatum } from '../utils/consolidatedHoldingsAnalytics'

interface TopHoldingsProps {
  holdings: TopHoldingDatum[]
}

function formatCompactCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}K`
  return `$${value.toFixed(2)}`
}

export function TopHoldings({ holdings }: TopHoldingsProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Top Holdings</h3>
          <p className="mt-0.5 text-xs text-gray-500">By market value</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {holdings.map((holding, index) => {
          const isPositive =
            holding.gainLossPercent !== null && holding.gainLossPercent >= 0
          const hasGainLoss =
            holding.gainLossPercent !== null &&
            holding.costBasisStatus === 'complete'

          return (
            <div
              key={holding.id}
              className="group relative rounded-xl border border-gray-100 p-4 transition-all hover:border-gray-200 hover:shadow-sm"
            >
              <div className="absolute -left-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-gray-900 text-xs font-bold text-white">
                {index + 1}
              </div>

              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="truncate text-base font-bold text-gray-900">
                  {holding.symbol}
                </span>
                {hasGainLoss ? (
                  <div
                    className={`flex items-center gap-0.5 text-xs font-semibold ${
                      isPositive ? 'text-emerald-600' : 'text-red-600'
                    }`}
                  >
                    {isPositive ? (
                      <TrendingUpIcon className="h-3 w-3" />
                    ) : (
                      <TrendingDownIcon className="h-3 w-3" />
                    )}
                    {isPositive ? '+' : ''}
                    {holding.gainLossPercent?.toFixed(1)}%
                  </div>
                ) : (
                  <div className="flex items-center gap-0.5 text-xs font-medium text-gray-400">
                    <MinusIcon className="h-3 w-3" />
                    {holding.costBasisStatus === 'partial' ? 'Partial' : 'N/A'}
                  </div>
                )}
              </div>

              <p className="mb-3 truncate text-xs text-gray-500">
                {holding.description}
              </p>

              <p className="mb-2 text-lg font-bold text-gray-900">
                {formatCompactCurrency(holding.marketValue)}
              </p>

              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-blue-500"
                    style={{ width: `${Math.max(holding.weight, 2)}%` }}
                  />
                </div>
                <span className="w-10 text-right text-[11px] font-medium text-gray-400">
                  {holding.weight.toFixed(1)}%
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
