import { useState } from 'react'
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from '@headlessui/react'
import {
  AlertTriangleIcon,
  CheckIcon,
  ChevronDownIcon,
  FilterIcon,
} from 'lucide-react'
import {
  EQUITY_SECTORS,
  type AllocationDatum,
  type EquitySector,
} from '../utils/consolidatedHoldingsAnalytics'

interface AllocationChartProps {
  assetData: AllocationDatum[]
  sectorData: AllocationDatum[]
  selectedSectors: EquitySector[]
  onSelectedSectorsChange: (sectors: EquitySector[]) => void
}

type AllocationView = 'asset' | 'sector'

function formatCompactCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}K`
  return `$${Math.round(value).toLocaleString()}`
}

function DonutChart({
  data,
  label,
}: {
  data: AllocationDatum[]
  label: string
}) {
  const radius = 64
  const circumference = 2 * Math.PI * radius
  const segments = data.map((datum, index) => {
    const priorPercentage = data
      .slice(0, index)
      .reduce((sum, item) => sum + item.percentage, 0)

    return {
      datum,
      dash: (datum.percentage / 100) * circumference,
      offset: (priorPercentage / 100) * circumference,
    }
  })

  return (
    <svg viewBox="0 0 160 160" className="h-44 w-44" role="img" aria-label={label}>
      <circle
        cx="80"
        cy="80"
        r={radius}
        fill="none"
        stroke="#f1f5f9"
        strokeWidth="18"
      />
      {segments.map(({ datum, dash, offset }) => (
        <circle
          key={datum.name}
          cx="80"
          cy="80"
          r={radius}
          fill="none"
          stroke={datum.color}
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

export function AllocationChart({
  assetData,
  sectorData,
  selectedSectors,
  onSelectedSectorsChange,
}: AllocationChartProps) {
  const [view, setView] = useState<AllocationView>('asset')
  const isSectorView = view === 'sector'
  const selectedSectorSet = new Set(selectedSectors)
  const filteredSectorData = sectorData.filter((datum) =>
    selectedSectorSet.has(datum.name as EquitySector),
  )
  const data = isSectorView ? filteredSectorData : assetData
  const viewLabel = isSectorView ? 'Sector allocation' : 'Asset allocation'
  const concentrationWarning = data.find((datum) => datum.percentage > 40)
  const selectedPercentage = filteredSectorData.reduce(
    (total, datum) => total + datum.percentage,
    0,
  )
  const sectorFilterIsActive = selectedSectors.length !== EQUITY_SECTORS.length

  return (
    <div className="h-full rounded-xl border border-gray-200 bg-white p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <label htmlFor="allocation-view" className="sr-only">
            Allocation view
          </label>
          <div className="relative inline-flex max-w-full items-center">
            <select
              id="allocation-view"
              value={view}
              onChange={(event) => {
                const nextView = event.target.value as AllocationView
                setView(nextView)
                if (nextView === 'asset' && sectorFilterIsActive) {
                  onSelectedSectorsChange([...EQUITY_SECTORS])
                }
              }}
              className="min-h-11 max-w-full appearance-none rounded-lg border border-gray-200 bg-gray-50 py-2 pl-3 pr-9 text-sm font-semibold text-gray-900 outline-none transition-colors hover:border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="asset">Asset allocation</option>
              <option value="sector">Sector allocation</option>
            </select>
            <ChevronDownIcon
              aria-hidden="true"
              className="pointer-events-none absolute right-3 h-4 w-4 text-gray-500"
            />
          </div>
          <p className="mt-0.5 text-xs text-gray-500">
            {isSectorView
              ? sectorFilterIsActive
                ? `${selectedSectors.length} selected · ${selectedPercentage.toFixed(1)}% of direct stocks`
                : `${data.length} sectors · direct stocks only`
              : `${data.length} asset classes`}
          </p>
        </div>
        {concentrationWarning && (
          <div className="flex max-w-full items-center gap-1.5 self-start rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1">
            <AlertTriangleIcon className="h-3.5 w-3.5 text-amber-500" />
            <span className="truncate text-xs font-medium text-amber-700">
              {concentrationWarning.percentage.toFixed(0)}% in{' '}
              {concentrationWarning.name}
            </span>
          </div>
        )}
      </div>

      {isSectorView ? (
        <div className="mb-5 flex flex-wrap items-center gap-2 border-b border-gray-100 pb-4">
          <Listbox
            multiple
            value={selectedSectors}
            onChange={onSelectedSectorsChange}
          >
            <div className="relative">
              <Listbox.Label className="sr-only">Filter sectors</Listbox.Label>
              <ListboxButton className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1">
                <FilterIcon aria-hidden="true" className="h-4 w-4 text-gray-500" />
                <span>
                  {sectorFilterIsActive
                    ? `${selectedSectors.length} sectors`
                    : 'All sectors'}
                </span>
                <ChevronDownIcon
                  aria-hidden="true"
                  className="h-4 w-4 text-gray-400 data-[open]:rotate-180"
                />
              </ListboxButton>
              <ListboxOptions
                transition
                anchor="bottom start"
                className="z-50 mt-1 w-72 max-w-[calc(100vw-3rem)] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl transition duration-100 ease-out focus:outline-none data-[closed]:scale-95 data-[closed]:opacity-0"
              >
                <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-3 py-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Filter positions
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => onSelectedSectorsChange([])}
                      className="text-xs font-semibold text-gray-500 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      None
                    </button>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => onSelectedSectorsChange([...EQUITY_SECTORS])}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      All
                    </button>
                  </div>
                </div>
                <div className="max-h-80 overflow-y-auto py-1">
                  {EQUITY_SECTORS.map((sector) => {
                    const sectorDatum = sectorData.find((datum) => datum.name === sector)

                    return (
                      <ListboxOption
                        key={sector}
                        value={sector}
                        className="flex min-h-10 cursor-pointer items-center gap-2.5 px-3 py-2 text-sm text-gray-700 data-[focus]:bg-blue-50"
                      >
                        {({ selected }) => (
                          <>
                            <span
                              aria-hidden="true"
                              className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${
                                selected
                                  ? 'border-blue-600 bg-blue-600 text-white'
                                  : 'border-gray-300 bg-white text-transparent'
                              }`}
                            >
                              <CheckIcon className="h-3 w-3" />
                            </span>
                            <span className={`min-w-0 flex-1 ${selected ? 'font-semibold' : ''}`}>
                              {sector}
                            </span>
                            <span className="text-xs tabular-nums text-gray-400">
                              {sectorDatum ? `${sectorDatum.percentage.toFixed(1)}%` : '0.0%'}
                            </span>
                          </>
                        )}
                      </ListboxOption>
                    )
                  })}
                </div>
              </ListboxOptions>
            </div>
          </Listbox>
          {sectorFilterIsActive ? (
            <button
              type="button"
              onClick={() => onSelectedSectorsChange([...EQUITY_SECTORS])}
              className="min-h-11 rounded-lg px-2.5 text-xs font-semibold text-blue-600 transition-colors hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Reset sector filter
            </button>
          ) : null}
        </div>
      ) : null}

      {data.length > 0 ? (
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <div className="flex flex-shrink-0 justify-center">
            <DonutChart data={data} label={`${viewLabel} chart`} />
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            {data.map((datum) => {
              const symbolSummary = datum.symbols?.join(', ')

              return (
                <div key={datum.name} className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <div
                      className="mt-1 h-3 w-3 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: datum.color }}
                    />
                    <div className="min-w-0">
                      <p
                        className="truncate text-sm font-medium text-gray-700"
                        title={datum.name}
                      >
                        {datum.name}
                      </p>
                      {symbolSummary ? (
                        <p
                          className="truncate text-xs text-gray-400"
                          title={symbolSummary}
                        >
                          {symbolSummary}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <span className="text-sm font-semibold text-gray-900">
                      {datum.percentage.toFixed(1)}%
                    </span>
                    <span className="ml-2 text-xs text-gray-400">
                      {formatCompactCurrency(datum.value)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="flex min-h-44 items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 px-6 text-center">
          <p className="max-w-xs text-sm text-gray-500">
            {isSectorView && selectedSectors.length === 0
              ? 'No sectors selected. Choose one or more sectors to filter the portfolio.'
              : 'No direct stock positions are available for sector allocation.'}
          </p>
        </div>
      )}

      {isSectorView ? (
        <p className="mt-5 border-t border-gray-100 pt-4 text-xs leading-5 text-gray-500">
          Sector percentages use direct stock value. Funds and ETFs are excluded because
          their underlying sector mix is not included in connected-account data.
        </p>
      ) : null}
    </div>
  )
}
