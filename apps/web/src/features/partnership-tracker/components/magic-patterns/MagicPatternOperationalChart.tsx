import { useMemo, useState } from 'react'
import type { PartnershipNavEntry } from '../../../../../../../packages/types/src/partnership-tracker'
import { MagicCard } from './MagicPatternPrimitives'

type RangeKey = '3y' | '5y' | 'all'

const ranges: Array<{ key: RangeKey; label: string; years?: number }> = [
  { key: '3y', label: '3 yr', years: 3 },
  { key: '5y', label: '5 yr', years: 5 },
  { key: 'all', label: 'All' },
]

const compact = (value: number) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
}).format(value)

const exact = (value: number) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(value)

const date = (value: string) => new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
}).format(new Date(`${value}T00:00:00Z`))

const visiblePointsForRange = (items: PartnershipNavEntry[], range: RangeKey) => {
  const sorted = [...items].sort((left, right) => left.valuationDate.localeCompare(right.valuationDate))
  const years = ranges.find((candidate) => candidate.key === range)?.years
  const latest = sorted.at(-1)
  if (!years || !latest) return sorted

  const cutoff = new Date(`${latest.valuationDate}T00:00:00Z`)
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - years)
  const cutoffDate = cutoff.toISOString().slice(0, 10)
  return sorted.filter((item) => item.valuationDate >= cutoffDate)
}

export function MagicPatternOperationalChart({ items }: { items: PartnershipNavEntry[] }) {
  const [range, setRange] = useState<RangeKey>('all')
  const points = useMemo(() => visiblePointsForRange(items, range), [items, range])
  const values = points.map((point) => Number(point.amount)).filter(Number.isFinite)
  const rawMin = values.length ? Math.min(...values) : 0
  const rawMax = values.length ? Math.max(...values) : 1
  const rawSpan = Math.max(rawMax - rawMin, Math.max(Math.abs(rawMax) * 0.1, 1))
  const min = Math.max(0, rawMin - rawSpan * 0.12)
  const max = rawMax + rawSpan * 0.12
  const span = Math.max(max - min, 1)
  const width = 680
  const height = 260
  const padLeft = 68
  const padRight = 14
  const padTop = 14
  const padBottom = 32
  const plotWidth = width - padLeft - padRight
  const plotHeight = height - padTop - padBottom
  const coords = points.map((point, index) => ({
    ...point,
    x: points.length === 1 ? padLeft + plotWidth / 2 : padLeft + (index / (points.length - 1)) * plotWidth,
    y: padTop + ((max - Number(point.amount)) / span) * plotHeight,
  }))
  const path = coords.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  const first = points[0]
  const last = points.at(-1)
  const hasDistinctRange = first && last && first.id !== last.id

  return (
    <MagicCard className="overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">NAV / FMV over time</h3>
          <p className="mt-0.5 text-xs text-slate-600">
            {first && last
              ? `Reported valuations from ${date(first.valuationDate)} to ${date(last.valuationDate)} · USD`
              : 'Reported valuations · USD'}
          </p>
        </div>
        <div className="inline-flex overflow-hidden rounded-md border border-slate-300" role="group" aria-label="Chart date range">
          {ranges.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={range === item.key}
              onClick={() => setRange(item.key)}
              className={`min-h-8 border-l border-slate-300 px-2.5 text-xs font-semibold first:border-l-0 ${
                range === item.key
                  ? 'bg-[#166534] text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-100'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      {points.length === 0 ? (
        <p className="m-4 rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-12 text-center text-sm text-slate-500">
          No valuations on file, so there is nothing to plot. Add a manager statement or appraisal to start the NAV history.
        </p>
      ) : (
        <div className="p-4">
          <div className="mx-auto h-[260px] w-full max-w-[680px]" data-testid="nav-fmv-plot">
            <svg
              viewBox={`0 0 ${width} ${height}`}
              preserveAspectRatio="none"
              className="h-full w-full"
              role="img"
              aria-label="NAV and fair market value history"
            >
              <g>
                {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                  const y = padTop + ratio * plotHeight
                  const value = max - ratio * span
                  return (
                    <g key={ratio}>
                      <line
                        x1={padLeft}
                        x2={width - padRight}
                        y1={y}
                        y2={y}
                        stroke="#d6e0ea"
                        strokeWidth="1"
                        vectorEffect="non-scaling-stroke"
                      />
                      <text
                        x={padLeft - 10}
                        y={y + 4}
                        textAnchor="end"
                        fill="#5f7185"
                        fontSize="11"
                      >
                        {compact(value)}
                      </text>
                    </g>
                  )
                })}
              </g>
              <path
                d={path}
                fill="none"
                stroke="#166534"
                strokeWidth="2.5"
                vectorEffect="non-scaling-stroke"
              />
              {coords.map((point) => (
                <circle
                  key={point.id}
                  cx={point.x}
                  cy={point.y}
                  r="3.5"
                  fill="#fff"
                  stroke="#166534"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                >
                  <title>{date(point.valuationDate)} · {exact(Number(point.amount))}</title>
                </circle>
              ))}
              <text x={hasDistinctRange ? padLeft : width / 2} y={height - 5} textAnchor={hasDistinctRange ? 'start' : 'middle'} fill="#5f7185" fontSize="11">
                {date(first.valuationDate)}
              </text>
              {hasDistinctRange ? (
                <text x={width - padRight} y={height - 5} textAnchor="end" fill="#5f7185" fontSize="11">
                  {date(last.valuationDate)}
                </text>
              ) : null}
            </svg>
          </div>

        </div>
      )}

      {points.length > 0 ? (
        <p className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
          Each point is a reported valuation on its valuation date, not an interpolated estimate.
        </p>
      ) : null}
    </MagicCard>
  )
}
