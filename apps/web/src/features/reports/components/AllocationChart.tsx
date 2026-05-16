import { AlertTriangleIcon } from 'lucide-react'
import type { SectorAllocationDatum } from '../utils/consolidatedHoldingsAnalytics'

interface AllocationChartProps {
  sectorData: SectorAllocationDatum[]
}

function formatCompactCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}K`
  return `$${value.toFixed(2)}`
}

function DonutChart({ sectorData }: { sectorData: SectorAllocationDatum[] }) {
  const radius = 64
  const circumference = 2 * Math.PI * radius
  const segments = sectorData.map((sector, index) => {
    const priorPercentage = sectorData
      .slice(0, index)
      .reduce((sum, item) => sum + item.percentage, 0)

    return {
      sector,
      dash: (sector.percentage / 100) * circumference,
      offset: (priorPercentage / 100) * circumference,
    }
  })

  return (
    <svg viewBox="0 0 160 160" className="h-44 w-44" role="img" aria-label="Asset allocation">
      <circle
        cx="80"
        cy="80"
        r={radius}
        fill="none"
        stroke="#f1f5f9"
        strokeWidth="18"
      />
      {segments.map(({ sector, dash, offset }) => (
        <circle
          key={sector.name}
          cx="80"
          cy="80"
          r={radius}
          fill="none"
          stroke={sector.color}
          strokeDasharray={`${dash} ${circumference - dash}`}
          strokeDashoffset={-offset}
          strokeLinecap="round"
          strokeWidth="18"
          transform="rotate(-90 80 80)"
        />
      ))}
    </svg>
  )
}

export function AllocationChart({ sectorData }: AllocationChartProps) {
  const concentrationWarning = sectorData.find((sector) => sector.percentage > 40)

  return (
    <div className="h-full rounded-xl border border-gray-200 bg-white p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Asset Allocation</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            {sectorData.length} categories
          </p>
        </div>
        {concentrationWarning && (
          <div className="flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1">
            <AlertTriangleIcon className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-xs font-medium text-amber-700">
              {concentrationWarning.percentage.toFixed(0)}% in{' '}
              {concentrationWarning.name}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <div className="flex flex-shrink-0 justify-center">
          <DonutChart sectorData={sectorData} />
        </div>
        <div className="flex-1 space-y-3">
          {sectorData.map((sector) => (
            <div key={sector.name} className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <div
                  className="h-3 w-3 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: sector.color }}
                />
                <span className="truncate text-sm font-medium text-gray-700" title={sector.name}>
                  {sector.name}
                </span>
              </div>
              <div className="flex-shrink-0 text-right">
                <span className="text-sm font-semibold text-gray-900">
                  {sector.percentage.toFixed(1)}%
                </span>
                <span className="ml-2 text-xs text-gray-400">
                  {formatCompactCurrency(sector.value)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
