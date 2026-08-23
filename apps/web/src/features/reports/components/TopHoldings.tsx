import { useMemo, useState } from 'react'
import {
  BarChart3Icon,
  MinusIcon,
  PercentIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from 'lucide-react'
import { focusRingClassName } from '../../../components/shared/colorRecipes'
import type { TopHoldingDatum } from '../utils/consolidatedHoldingsAnalytics'

interface TopHoldingsProps {
  holdings: TopHoldingDatum[]
}

type RankingView = 'market-value' | 'gainers' | 'losers' | 'return'

const rankingViews: Array<{
  id: RankingView
  label: string
  description: string
  emptyMessage: string
}> = [
  {
    id: 'market-value',
    label: 'Largest positions',
    description: 'Highest current market value',
    emptyMessage: 'No positions have a reported market value.',
  },
  {
    id: 'gainers',
    label: 'Top gains',
    description: 'Largest unrealized gains in dollars',
    emptyMessage: 'No positions currently have an unrealized gain.',
  },
  {
    id: 'losers',
    label: 'Biggest losers',
    description: 'Largest unrealized losses in dollars',
    emptyMessage: 'No positions currently have an unrealized loss.',
  },
  {
    id: 'return',
    label: 'Best returns',
    description: 'Highest unrealized return percentage',
    emptyMessage: 'No positions have complete return data.',
  },
]

function formatCompactCurrency(value: number): string {
  const absolute = Math.abs(value)
  const formatted =
    absolute >= 1_000_000
      ? `$${(absolute / 1_000_000).toFixed(2)}M`
      : absolute >= 1_000
        ? `$${(absolute / 1_000).toFixed(1)}K`
        : `$${Math.round(absolute).toLocaleString()}`
  return value < 0 ? `-${formatted}` : formatted
}

const formatSignedCurrency = (value: number): string =>
  `${value > 0 ? '+' : ''}${formatCompactCurrency(value)}`

const formatSignedPercent = (value: number): string =>
  `${value > 0 ? '+' : ''}${value.toFixed(1)}%`

const rankingValue = (holding: TopHoldingDatum, view: RankingView): number => {
  if (view === 'market-value') return holding.marketValue
  if (view === 'return') return holding.gainLossPercent ?? 0
  return holding.unrealizedGainLoss ?? 0
}

const rankHoldings = (
  holdings: TopHoldingDatum[],
  view: RankingView,
): TopHoldingDatum[] => {
  const eligible = holdings.filter((holding) => {
    if (view === 'gainers') {
      return holding.costBasisStatus === 'complete' && (holding.unrealizedGainLoss ?? 0) > 0
    }
    if (view === 'losers') {
      return holding.costBasisStatus === 'complete' && (holding.unrealizedGainLoss ?? 0) < 0
    }
    if (view === 'return') {
      return holding.gainLossPercent != null && holding.costBasisStatus === 'complete'
    }
    return holding.marketValue > 0
  })

  return eligible
    .sort((left, right) => {
      const leftValue = rankingValue(left, view)
      const rightValue = rankingValue(right, view)
      return view === 'losers' ? leftValue - rightValue : rightValue - leftValue
    })
    .slice(0, 5)
}

export function TopHoldings({ holdings }: TopHoldingsProps) {
  const [view, setView] = useState<RankingView>('market-value')
  const activeView = rankingViews.find((item) => item.id === view)!
  const rankedHoldings = useMemo(() => rankHoldings(holdings, view), [holdings, view])
  const maxMagnitude = Math.max(
    ...rankedHoldings.map((holding) => Math.abs(rankingValue(holding, view))),
    1,
  )
  const selectAndFocusView = (nextView: RankingView) => {
    setView(nextView)
    document.getElementById(`holdings-ranking-tab-${nextView}`)?.focus()
  }

  return (
    <section
      className="rounded-xl border border-gray-200 bg-white"
      aria-labelledby="holdings-rankings-title"
    >
      <div className="border-b border-gray-100 px-5 pt-5 sm:px-6">
        <div>
          <h3 id="holdings-rankings-title" className="text-sm font-semibold text-gray-900">
            Holdings rankings
          </h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Compare position size and unrealized performance
          </p>
        </div>

        <div
          className="mt-4 flex gap-5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
          aria-label="Holdings ranking"
        >
          {rankingViews.map((item) => (
            <button
              key={item.id}
              id={`holdings-ranking-tab-${item.id}`}
              type="button"
              role="tab"
              aria-selected={view === item.id}
              aria-controls="holdings-ranking-panel"
              tabIndex={view === item.id ? 0 : -1}
              onClick={() => setView(item.id)}
              onKeyDown={(event) => {
                const currentIndex = rankingViews.findIndex((candidate) => candidate.id === item.id)
                let nextIndex: number | null = null
                if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % rankingViews.length
                if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + rankingViews.length) % rankingViews.length
                if (event.key === 'Home') nextIndex = 0
                if (event.key === 'End') nextIndex = rankingViews.length - 1
                if (nextIndex == null) return
                event.preventDefault()
                selectAndFocusView(rankingViews[nextIndex]!.id)
              }}
              className={`relative min-h-11 shrink-0 border-b-2 px-0.5 pb-3 text-xs font-semibold transition-colors ${focusRingClassName} ${
                view === item.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div
        id="holdings-ranking-panel"
        role="tabpanel"
        aria-labelledby={`holdings-ranking-tab-${view}`}
        className="p-5 sm:p-6"
      >
        <div className="mb-4 flex items-center gap-2 text-xs text-gray-500">
          {view === 'market-value' ? (
            <BarChart3Icon className="h-4 w-4" aria-hidden="true" />
          ) : null}
          {view === 'gainers' ? (
            <TrendingUpIcon className="h-4 w-4 text-success" aria-hidden="true" />
          ) : null}
          {view === 'losers' ? (
            <TrendingDownIcon className="h-4 w-4 text-error" aria-hidden="true" />
          ) : null}
          {view === 'return' ? <PercentIcon className="h-4 w-4" aria-hidden="true" /> : null}
          <span>{activeView.description}</span>
        </div>

        {rankedHoldings.length === 0 ? (
          <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 px-5 text-center">
            <p className="text-sm text-gray-500">{activeView.emptyMessage}</p>
          </div>
        ) : (
          <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {rankedHoldings.map((holding, index) => {
              const gainLoss = holding.unrealizedGainLoss
              const hasGainLoss = gainLoss != null && holding.costBasisStatus === 'complete'
              const isGain = (gainLoss ?? 0) >= 0
              const metric =
                view === 'market-value'
                  ? formatCompactCurrency(holding.marketValue)
                  : view === 'return'
                    ? formatSignedPercent(holding.gainLossPercent ?? 0)
                    : formatSignedCurrency(gainLoss ?? 0)
              const metricLabel =
                view === 'market-value'
                  ? 'Market value'
                  : view === 'return'
                    ? 'Unrealized return'
                    : 'Unrealized gain/loss'
              const barWidth = Math.max(
                (Math.abs(rankingValue(holding, view)) / maxMagnitude) * 100,
                3,
              )
              const performanceIsNegative =
                view === 'losers' ||
                (view === 'return' && (holding.gainLossPercent ?? 0) < 0)

              return (
                <li
                  key={holding.id}
                  className="group relative overflow-hidden rounded-xl border border-gray-100 p-4 transition-all hover:border-gray-200 hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p
                        className="truncate text-base font-bold text-gray-900"
                        title={holding.symbol}
                      >
                        {holding.symbol}
                      </p>
                      <p
                        className="mt-0.5 truncate text-xs text-gray-500"
                        title={holding.description}
                      >
                        {holding.description}
                      </p>
                    </div>
                    <span
                      className="flex h-6 min-w-6 items-center justify-center rounded-full bg-gray-900 px-1.5 text-xs font-bold text-white"
                      aria-label={`Rank ${index + 1}`}
                    >
                      {index + 1}
                    </span>
                  </div>

                  <div className="mt-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                      {metricLabel}
                    </p>
                    <p
                      className={`mt-1 text-lg font-bold ${
                        performanceIsNegative
                          ? 'text-error'
                          : view === 'gainers' || view === 'return'
                            ? 'text-success'
                            : 'text-gray-900'
                      }`}
                    >
                      {metric}
                    </p>
                  </div>

                  <div
                    className="mt-4 h-1.5 overflow-hidden rounded-full bg-gray-100"
                    aria-hidden="true"
                  >
                    <div
                      className={`h-full rounded-full ${
                        performanceIsNegative ? 'bg-error' : 'bg-primary'
                      }`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2 text-[11px]">
                    <span className="truncate text-gray-400">{holding.sector}</span>
                    {view === 'market-value' ? (
                      <span
                        className={`flex shrink-0 items-center gap-0.5 font-semibold ${
                          hasGainLoss
                            ? isGain
                              ? 'text-success'
                              : 'text-error'
                            : 'text-gray-400'
                        }`}
                      >
                        {hasGainLoss ? (
                          isGain ? (
                            <TrendingUpIcon className="h-3 w-3" aria-hidden="true" />
                          ) : (
                            <TrendingDownIcon className="h-3 w-3" aria-hidden="true" />
                          )
                        ) : (
                          <MinusIcon className="h-3 w-3" aria-hidden="true" />
                        )}
                        {hasGainLoss
                          ? formatSignedPercent(holding.gainLossPercent ?? 0)
                          : holding.costBasisStatus === 'partial'
                            ? 'Partial basis'
                            : 'N/A'}
                      </span>
                    ) : (
                      <span className="shrink-0 font-medium text-gray-500">
                        {formatCompactCurrency(holding.marketValue)} value
                      </span>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </section>
  )
}
