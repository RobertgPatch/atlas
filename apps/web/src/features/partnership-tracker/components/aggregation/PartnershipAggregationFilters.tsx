import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'
import { Filter, Search, X } from 'lucide-react'
import { useState } from 'react'
import { PARTNERSHIP_TYPES } from '../../../../../../../packages/types/src/partnership-tracker'
import type {
  PartnershipAggregationFacetOption,
  PartnershipAggregationFacetSet,
  PartnershipAggregationQuery,
} from '../../../../../../../packages/types/src/partnership-tracker'

export type AggregationFilterKey = 'ownerIds' | 'partnershipTypes' | 'statuses' | 'workflowStatuses' | 'dataQuality'

interface PartnershipAggregationFiltersProps {
  query: PartnershipAggregationQuery
  facets?: PartnershipAggregationFacetSet
  searchValue: string
  activeCount: number
  onSearchChange: (value: string) => void
  onToggle: (key: AggregationFilterKey, value: string) => void
  onClear: () => void
}

const groupLabels: Array<{ key: AggregationFilterKey; label: string; facet: keyof PartnershipAggregationFacetSet; description?: string }> = [
  { key: 'ownerIds', label: 'Owner', facet: 'owners' },
  { key: 'partnershipTypes', label: 'Partnership type', facet: 'partnershipTypes', description: 'Filter by the partnership classifications in your portfolio.' },
  { key: 'statuses', label: 'Lifecycle', facet: 'statuses' },
  { key: 'workflowStatuses', label: 'K-1 workflow', facet: 'workflowStatuses' },
  { key: 'dataQuality', label: 'Data quality', facet: 'dataQuality' },
]

type FilterOption = Omit<PartnershipAggregationFacetOption, 'count'> & { count?: number }

const optionsForGroup = (
  group: (typeof groupLabels)[number],
  facets?: PartnershipAggregationFacetSet,
): FilterOption[] => {
  const facetOptions = (facets?.[group.facet] ?? []) as PartnershipAggregationFacetOption[]
  if (group.key !== 'partnershipTypes') return facetOptions

  return PARTNERSHIP_TYPES.map((value) => {
    const facet = facetOptions.find((option) => option.value === value)
    return facet ?? { value, label: value }
  })
}

function FilterPanel({ query, facets, searchValue, activeCount, onSearchChange, onToggle, onClear, onDone }: PartnershipAggregationFiltersProps & { onDone?: () => void }) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex items-start justify-between border-b border-gray-200 px-4 py-4">
        <div>
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-jackson-hover">Portfolio index</p>
          <h2 className="mt-1 font-serif text-xl font-semibold text-gray-950">Refine the book</h2>
        </div>
        {onDone && <button type="button" aria-label="Close filters" onClick={onDone} className="grid min-h-11 min-w-11 place-items-center rounded-md text-gray-500 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jackson-gold"><X className="h-5 w-5" /></button>}
      </div>
      <div data-testid={onDone ? 'aggregation-filter-scroll-mobile' : 'aggregation-filter-scroll'} className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        <label htmlFor={onDone ? 'aggregation-search-mobile' : 'aggregation-search'} className="text-xs font-bold uppercase tracking-[0.12em] text-gray-600">Search partnerships</label>
        <div className="relative mt-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input id={onDone ? 'aggregation-search-mobile' : 'aggregation-search'} type="search" value={searchValue} onChange={(event) => onSearchChange(event.target.value)} placeholder="Name or owner" className="min-h-11 w-full rounded-md border border-gray-300 bg-gray-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-jackson-gold focus:ring-2 focus:ring-jackson-gold/30" />
        </div>

        <div className="mt-6 divide-y divide-gray-200 border-y border-gray-200">
          {groupLabels.map((group) => {
            const options = optionsForGroup(group, facets)
            const selected = query[group.key] as string[]
            return (
              <fieldset key={group.key} className="py-4">
                <legend className="text-xs font-bold uppercase tracking-[0.12em] text-gray-700">{group.label}</legend>
                {group.description && <p className="mt-1 text-xs leading-5 text-gray-500">{group.description}</p>}
                <div className="mt-2 space-y-1">
                  {options.length ? options.map((option) => (
                    <label key={option.value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-sm text-gray-700 hover:bg-gray-50">
                      <input
                        type="checkbox"
                        aria-label={option.label}
                        data-filter-key={group.key}
                        data-filter-value={option.value}
                        checked={selected.includes(option.value)}
                        onChange={() => onToggle(group.key, option.value)}
                        className="h-4 w-4 rounded border-gray-300 text-jackson-gold focus:ring-jackson-gold"
                      />
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                      {option.count != null && <span className="font-mono text-xs tabular-nums text-gray-400">{option.count}</span>}
                    </label>
                  )) : <p className="py-2 text-xs text-gray-400">No options in your scope</p>}
                </div>
              </fieldset>
            )
          })}
        </div>
      </div>
      <div className="flex gap-3 border-t border-gray-200 p-4">
        <button type="button" onClick={onClear} disabled={activeCount === 0} className="min-h-11 flex-1 rounded-md border border-gray-300 px-3 text-sm font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jackson-gold">Clear all{activeCount ? ` (${activeCount})` : ''}</button>
        {onDone && <button type="button" onClick={onDone} className="min-h-11 flex-1 rounded-md bg-gray-950 px-3 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jackson-gold focus-visible:ring-offset-2">Show results</button>}
      </div>
    </div>
  )
}

export function PartnershipAggregationFilters(props: PartnershipAggregationFiltersProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  return (
    <div className="w-full lg:w-[17rem] lg:shrink-0">
      <aside aria-label="Partnership filters" className="hidden lg:block">
        <div data-testid="aggregation-filter-rail" className="sticky top-0 h-[calc(100vh-8rem)] min-h-0 overflow-hidden border border-gray-300 bg-white shadow-sm">
          <FilterPanel {...props} />
        </div>
      </aside>
      <button type="button" onClick={() => setDrawerOpen(true)} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-800 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jackson-gold lg:hidden">
        <Filter className="h-4 w-4" /> Filters {props.activeCount ? <span className="rounded-full bg-gray-950 px-2 py-0.5 text-xs text-white">{props.activeCount}</span> : null}
      </button>
      <Dialog open={drawerOpen} onClose={setDrawerOpen} className="relative z-50 lg:hidden">
        <div className="fixed inset-0 bg-gray-950/60" aria-hidden="true" />
        <div className="fixed inset-0 flex justify-end">
          <DialogPanel className="h-full w-full max-w-sm shadow-2xl">
            <DialogTitle className="sr-only">Partnership filters</DialogTitle>
            <FilterPanel {...props} onDone={() => setDrawerOpen(false)} />
          </DialogPanel>
        </div>
      </Dialog>
    </div>
  )
}
