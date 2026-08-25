import { useMemo, useState, type PointerEvent } from 'react'
import { CalendarRangeIcon, RotateCcwIcon, TrendingDownIcon, TrendingUpIcon } from 'lucide-react'
import type { LiquidityPerformancePoint } from '../../../../../../packages/types/src/reports'
import { focusRingClassName } from '../../../components/shared/colorRecipes'
import {
  selectPerformancePoints,
  type PerformanceRange,
} from '../utils/liquidityPerformanceAnalytics'

interface LiquidityPerformanceTrackerProps {
  points: LiquidityPerformancePoint[]
  currentPoint?: LiquidityPerformancePoint | null
  isLoading?: boolean
  isError?: boolean
  onRetry?: () => void
}

const rangeOptions: Array<{ value: PerformanceRange; label: string }> = [
  { value: '1d', label: '1D' },
  { value: '1w', label: '1W' },
  { value: '1m', label: '1M' },
  { value: 'ytd', label: 'YTD' },
  { value: 'custom', label: 'Custom' },
]

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const compactCurrency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
})

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})

const shortDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

const parseDate = (value: string): Date => new Date(`${value}T00:00:00.000Z`)

const mergeCurrentPoint = (
  points: LiquidityPerformancePoint[],
  currentPoint?: LiquidityPerformancePoint | null,
): LiquidityPerformancePoint[] => {
  const pointByDate = new Map(points.map((point) => [point.date, point]))
  const hasMarketCloseHistory = points.some((point) => point.source === 'market_close')
  if (currentPoint?.totalMarketValue != null && !hasMarketCloseHistory) {
    pointByDate.set(currentPoint.date, currentPoint)
  }
  return [...pointByDate.values()].sort((left, right) => left.date.localeCompare(right.date))
}

function PerformancePlot({
  points,
  activeDate,
  onActiveDateChange,
}: {
  points: Array<LiquidityPerformancePoint & { totalMarketValue: number }>
  activeDate: string | null
  onActiveDateChange: (date: string | null) => void
}) {
  const width = 800
  const height = 260
  const margin = { top: 18, right: 20, bottom: 38, left: 72 }
  const plotWidth = width - margin.left - margin.right
  const plotHeight = height - margin.top - margin.bottom
  const values = points.map((point) => point.totalMarketValue)
  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)
  const spread = Math.max(rawMax - rawMin, Math.abs(rawMax) * 0.02, 1)
  const min = Math.max(0, rawMin - spread * 0.15)
  const max = rawMax + spread * 0.15
  const scaleX = (index: number) =>
    margin.left + (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth)
  const scaleY = (value: number) => margin.top + ((max - value) / (max - min)) * plotHeight
  const coordinates = points.map((point, index) => ({
    point,
    x: scaleX(index),
    y: scaleY(point.totalMarketValue),
  }))
  const linePath = coordinates
    .map(({ x, y }, index) => `${index === 0 ? 'M' : 'L'} ${x} ${y}`)
    .join(' ')
  const areaPath =
    coordinates.length > 1
      ? `${linePath} L ${coordinates.at(-1)!.x} ${margin.top + plotHeight} L ${coordinates[0]!.x} ${margin.top + plotHeight} Z`
      : ''
  const yTicks = Array.from({ length: 4 }, (_, index) => min + ((max - min) * index) / 3)
    .reverse()
  const xTickIndexes = [...new Set(
    Array.from({ length: Math.min(5, points.length) }, (_, index) =>
      Math.round((index * (points.length - 1)) / Math.max(Math.min(5, points.length) - 1, 1)),
    ),
  )]

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const ratio = Math.min(Math.max((event.clientX - bounds.left) / bounds.width, 0), 1)
    const index = Math.round(ratio * (points.length - 1))
    onActiveDateChange(points[index]?.date ?? null)
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-56 w-full touch-none sm:h-64"
      role="img"
      aria-label={`Portfolio value from ${dateFormatter.format(parseDate(points[0]!.date))} to ${dateFormatter.format(parseDate(points.at(-1)!.date))}`}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => onActiveDateChange(null)}
    >
      <defs>
        <linearGradient id="liquidity-performance-area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" className="text-primary" stopColor="currentColor" stopOpacity="0.2" />
          <stop offset="100%" className="text-primary" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>

      {yTicks.map((tick, index) => {
        const y = margin.top + (index / 3) * plotHeight
        return (
          <g key={tick}>
            <line
              x1={margin.left}
              x2={width - margin.right}
              y1={y}
              y2={y}
              className="text-gray-100"
              stroke="currentColor"
              strokeDasharray="3 5"
            />
            <text
              x={margin.left - 12}
              y={y + 4}
              textAnchor="end"
              className="fill-gray-400 text-[20px] sm:text-[11px]"
            >
              {compactCurrency.format(tick)}
            </text>
          </g>
        )
      })}

      {areaPath ? <path d={areaPath} fill="url(#liquidity-performance-area)" /> : null}
      {linePath ? (
        <path
          d={linePath}
          fill="none"
          className="text-primary"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
        />
      ) : null}

      {coordinates.map(({ point, x, y }) => {
        const isActive = point.date === activeDate || (activeDate == null && point === points.at(-1))
        return (
          <circle
            key={point.date}
            cx={x}
            cy={y}
            r={isActive ? 5 : 2.5}
            className="fill-white text-primary"
            stroke="currentColor"
            strokeWidth={isActive ? 3 : 2}
          >
            <title>{`${dateFormatter.format(parseDate(point.date))}: ${currency.format(point.totalMarketValue)}`}</title>
          </circle>
        )
      })}

      {xTickIndexes.map((index) => (
        <text
          key={points[index]!.date}
          x={scaleX(index)}
          y={height - 10}
          textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}
          className="fill-gray-400 text-[20px] sm:text-[11px]"
        >
          {shortDateFormatter.format(parseDate(points[index]!.date))}
        </text>
      ))}
    </svg>
  )
}

export function LiquidityPerformanceTracker({
  points,
  currentPoint,
  isLoading = false,
  isError = false,
  onRetry,
}: LiquidityPerformanceTrackerProps) {
  const [range, setRange] = useState<PerformanceRange>('1m')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [activeDate, setActiveDate] = useState<string | null>(null)
  const mergedPoints = useMemo(() => mergeCurrentPoint(points, currentPoint), [currentPoint, points])
  const availableFrom = mergedPoints[0]?.date ?? ''
  const availableTo = mergedPoints.at(-1)?.date ?? ''
  const effectiveCustomStart = customStart || availableFrom
  const effectiveCustomEnd = customEnd || availableTo

  const selectedPoints = useMemo(
    () =>
      selectPerformancePoints(
        mergedPoints,
        range,
        effectiveCustomStart,
        effectiveCustomEnd,
      ),
    [effectiveCustomEnd, effectiveCustomStart, mergedPoints, range],
  )
  const valuedPoints = selectedPoints.filter(
    (point): point is LiquidityPerformancePoint & { totalMarketValue: number } =>
      point.totalMarketValue != null,
  )
  const firstPoint = valuedPoints[0]
  const lastPoint = valuedPoints.at(-1)
  const activePoint = valuedPoints.find((point) => point.date === activeDate) ?? lastPoint
  const change =
    firstPoint && lastPoint ? lastPoint.totalMarketValue - firstPoint.totalMarketValue : null
  const changePercent =
    change != null && firstPoint?.totalMarketValue
      ? (change / firstPoint.totalMarketValue) * 100
      : null
  const isPositive = (change ?? 0) >= 0
  const customRangeInvalid =
    range === 'custom' &&
    Boolean(effectiveCustomStart && effectiveCustomEnd && effectiveCustomStart > effectiveCustomEnd)

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white" aria-labelledby="performance-title">
      <div className="border-b border-gray-100 px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-5 w-1 rounded-full bg-primary" aria-hidden="true" />
              <h3 id="performance-title" className="text-sm font-semibold text-gray-900">
                Performance tracker
              </h3>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Portfolio value change from saved daily snapshots
            </p>
          </div>

          <div className="inline-flex max-w-full gap-1 overflow-x-auto rounded-lg bg-gray-100 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Performance date range">
            {rangeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={range === option.value}
                onClick={() => {
                  setRange(option.value)
                  setActiveDate(null)
                }}
                className={`min-h-9 whitespace-nowrap rounded-md px-3 text-xs font-semibold transition-colors ${focusRingClassName} ${
                  range === option.value
                    ? 'bg-white text-primary shadow-sm'
                    : 'text-gray-500 hover:bg-white/70 hover:text-gray-900'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {range === 'custom' ? (
          <div className="mt-4 flex flex-col gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label htmlFor="performance-start" className="mb-1 block text-xs font-medium text-gray-600">
                Start date
              </label>
              <input
                id="performance-start"
                type="date"
                value={effectiveCustomStart}
                min={availableFrom || undefined}
                max={effectiveCustomEnd || availableTo || undefined}
                onChange={(event) => {
                  setCustomStart(event.target.value)
                  setActiveDate(null)
                }}
                className={`min-h-10 w-full rounded-md border border-border-control bg-white px-3 text-sm text-content-primary focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus ${focusRingClassName}`}
              />
            </div>
            <div className="flex-1">
              <label htmlFor="performance-end" className="mb-1 block text-xs font-medium text-gray-600">
                End date
              </label>
              <input
                id="performance-end"
                type="date"
                value={effectiveCustomEnd}
                min={effectiveCustomStart || availableFrom || undefined}
                max={availableTo || undefined}
                onChange={(event) => {
                  setCustomEnd(event.target.value)
                  setActiveDate(null)
                }}
                className={`min-h-10 w-full rounded-md border border-border-control bg-white px-3 text-sm text-content-primary focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus ${focusRingClassName}`}
              />
            </div>
            <div className="flex min-h-10 items-center gap-2 text-xs text-gray-500">
              <CalendarRangeIcon className="h-4 w-4" aria-hidden="true" />
              {valuedPoints.length} snapshots
            </div>
          </div>
        ) : null}
        {customRangeInvalid ? (
          <p className="mt-2 text-xs font-medium text-error" role="alert">
            Start date must be on or before the end date.
          </p>
        ) : null}
      </div>

      {isLoading ? (
        <div className="animate-pulse px-5 py-6 sm:px-6" aria-label="Loading performance history">
          <div className="h-8 w-40 rounded bg-gray-100" />
          <div className="mt-3 h-4 w-64 rounded bg-gray-50" />
          <div className="mt-8 h-64 rounded-xl bg-gray-50" />
        </div>
      ) : isError ? (
        <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
          <RotateCcwIcon className="h-6 w-6 text-gray-400" aria-hidden="true" />
          <p className="mt-3 text-sm font-semibold text-gray-900">Performance history is unavailable</p>
          <p className="mt-1 text-xs text-gray-500">Current holdings are still shown below.</p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className={`mt-4 rounded-md border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 ${focusRingClassName}`}
            >
              Try again
            </button>
          ) : null}
        </div>
      ) : valuedPoints.length === 0 ? (
        <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
          <CalendarRangeIcon className="h-7 w-7 text-gray-400" aria-hidden="true" />
          <p className="mt-3 text-sm font-semibold text-gray-900">No snapshots in this range</p>
          <p className="mt-1 max-w-md text-xs leading-5 text-gray-500">
            Choose a wider range. Performance tracking begins after the first daily snapshot is saved.
          </p>
        </div>
      ) : (
        <div className="px-3 pb-4 pt-5 sm:px-6 sm:pb-6">
          <div className="mb-3 flex flex-col gap-3 px-2 sm:flex-row sm:items-end sm:justify-between sm:px-0" aria-live="polite">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-gray-400">
                {activePoint ? dateFormatter.format(parseDate(activePoint.date)) : 'Portfolio value'}
              </p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
                {activePoint ? currency.format(activePoint.totalMarketValue) : '—'}
              </p>
              {activePoint ? (
                <p className="mt-1 text-[11px] font-medium text-gray-400">
                  {activePoint.source === 'market_close'
                    ? `Official close · ${activePoint.pricedHoldingCount} priced${activePoint.fallbackHoldingCount > 0 ? ` · ${activePoint.fallbackHoldingCount} custodian fallback` : ''}`
                    : activePoint.source === 'daily_valuation'
                      ? `Saved daily valuation · ${activePoint.pricedHoldingCount} market priced${activePoint.fallbackHoldingCount > 0 ? ` · ${activePoint.fallbackHoldingCount} custodian fallback` : ''}`
                    : activePoint.source === 'current'
                      ? 'Current valuation · awaiting the next market close'
                      : 'Historical custodian snapshot'}
                </p>
              ) : null}
            </div>
            <div className={`flex items-center gap-2 text-sm font-semibold ${isPositive ? 'text-success' : 'text-error'}`}>
              {isPositive ? (
                <TrendingUpIcon className="h-4 w-4" aria-hidden="true" />
              ) : (
                <TrendingDownIcon className="h-4 w-4" aria-hidden="true" />
              )}
              <span>
                {change == null ? 'Not enough history' : `${change >= 0 ? '+' : '-'}${currency.format(Math.abs(change))}`}
                {changePercent != null ? ` (${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%)` : ''}
              </span>
              <span className="font-normal text-gray-400">for range</span>
            </div>
          </div>

          {valuedPoints.length === 1 ? (
            <div className="flex h-64 items-center justify-center rounded-xl bg-gray-50 px-6 text-center">
              <p className="max-w-md text-sm leading-6 text-gray-500">
                One snapshot is available. The first change will appear after the next daily snapshot.
              </p>
            </div>
          ) : (
            <PerformancePlot
              points={valuedPoints}
              activeDate={activeDate}
              onActiveDateChange={setActiveDate}
            />
          )}

          <p className="mt-2 px-2 text-[11px] leading-5 text-gray-400 sm:px-0">
            Saved once per day and finalized after each U.S. market close. Custodian snapshots fill dates without a saved market valuation. Value change includes deposits, withdrawals, and market movement; it is not a time-weighted investment return.
          </p>
        </div>
      )}
    </section>
  )
}
