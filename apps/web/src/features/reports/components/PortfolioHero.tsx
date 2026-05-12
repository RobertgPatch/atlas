import {
  BriefcaseIcon,
  BuildingIcon,
  LayersIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from 'lucide-react'
import { formatCurrency } from '../utils/formatters'

interface PortfolioHeroProps {
  totalValue: number
  totalCostBasis: number | null
  costBasisIsPartial: boolean
  totalGainLoss: number | null
  totalGainLossPercent: number | null
  totalPositions: number
  connectedAccounts: number
}

function formatCompactCurrency(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return 'N/A'
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}K`
  return formatCurrency(value)
}

export function PortfolioHero({
  totalValue,
  totalCostBasis,
  costBasisIsPartial,
  totalGainLoss,
  totalGainLossPercent,
  totalPositions,
  connectedAccounts,
}: PortfolioHeroProps) {
  const isPositive = (totalGainLoss ?? 0) >= 0

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gray-900 p-8 text-white">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-blue-900/20 via-transparent to-violet-900/20" />

      <div className="relative z-10">
        <p className="mb-1 text-sm font-medium uppercase tracking-wider text-gray-400">
          Total Portfolio Value
        </p>
        <div className="flex flex-wrap items-baseline gap-4">
          <h2 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
            {formatCurrency(totalValue)}
          </h2>
          {totalGainLoss !== null && totalGainLossPercent !== null ? (
            <div
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold ${
                isPositive
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-red-500/20 text-red-400'
              }`}
            >
              {isPositive ? (
                <TrendingUpIcon className="h-4 w-4" />
              ) : (
                <TrendingDownIcon className="h-4 w-4" />
              )}
              {isPositive ? '+' : ''}
              {formatCurrency(totalGainLoss)}
              <span className="text-xs opacity-80">
                ({isPositive ? '+' : ''}
                {totalGainLossPercent.toFixed(2)}%)
              </span>
            </div>
          ) : null}
        </div>

        <div className="mt-8 grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
              <BriefcaseIcon className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-400">Cost Basis</p>
              <p className="text-sm font-semibold text-white">
                {formatCompactCurrency(totalCostBasis)}
                {costBasisIsPartial && (
                  <span className="ml-1 text-xs font-medium text-amber-400">
                    Partial
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
              <LayersIcon className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-400">Positions</p>
              <p className="text-sm font-semibold text-white">{totalPositions}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
              <BuildingIcon className="h-5 w-5 text-teal-400" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-400">Accounts</p>
              <p className="text-sm font-semibold text-white">{connectedAccounts}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
