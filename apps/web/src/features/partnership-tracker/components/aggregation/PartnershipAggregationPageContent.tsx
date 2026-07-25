import { AlertTriangle, Loader2, Plus, RotateCw, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type {
  PartnershipAggregationQuery,
  PartnershipAggregationSort,
} from '../../../../../../../packages/types/src/partnership-tracker'
import { PageHeader } from '../../../../components/shared/PageHeader'
import { serializePartnershipAggregationParams } from '../../api/partnershipTrackerClient'
import { usePartnershipAggregation } from '../../hooks/usePartnershipTracker'
import { AddPartnershipDialog } from '../AddPartnershipDialog'
import { PartnershipViewSwitcher } from '../PartnershipViewSwitcher'
import { humanizeCode } from './aggregationFormatters'
import { PartnershipAggregationFilters, type AggregationFilterKey } from './PartnershipAggregationFilters'
import { PartnershipAggregationKpis } from './PartnershipAggregationKpis'
import { PartnershipAggregationTable } from './PartnershipAggregationTable'
import { aggregationFilterKeys, DEFAULT_AGGREGATION_QUERY, parsePartnershipAggregationSearchParams } from './partnershipAggregationQueryState'

export function PartnershipAggregationPageContent({ canEdit }: { canEdit: boolean }) {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const query = useMemo(() => parsePartnershipAggregationSearchParams(params), [params])
  const [searchDraft, setSearchDraft] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const aggregation = usePartnershipAggregation(query)

  const setQuery = useCallback((next: PartnershipAggregationQuery, replace = true) => {
    setParams(new URLSearchParams(serializePartnershipAggregationParams(next)), { replace })
  }, [setParams])

  useEffect(() => {
    if (searchDraft == null) return
    const nextSearch = searchDraft.trim().slice(0, 200)
    if (nextSearch === (query.search ?? '')) return
    const timer = window.setTimeout(() => {
      setQuery({ ...query, search: nextSearch || undefined, page: 1 })
      setSearchDraft(null)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [searchDraft, query, setQuery])

  useEffect(() => {
    if (!aggregation.data || aggregation.isPlaceholderData) return
    const requested = serializePartnershipAggregationParams(query)
    const normalized = serializePartnershipAggregationParams(aggregation.data.query)
    if (requested !== normalized) setParams(new URLSearchParams(normalized), { replace: true })
  }, [aggregation.data, aggregation.isPlaceholderData, query, setParams])

  const searchValue = searchDraft ?? query.search ?? ''
  const activeCount = (query.search ? 1 : 0) + aggregationFilterKeys.reduce((total, key) => total + query[key].length, 0)
  const toggleFilter = (key: AggregationFilterKey, value: string) => {
    const values = query[key] as string[]
    const next = values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
    setQuery({ ...query, [key]: next, page: 1 } as PartnershipAggregationQuery)
  }
  const setFilter = (key: AggregationFilterKey, values: string[]) => {
    setQuery({ ...query, [key]: values, page: 1 } as PartnershipAggregationQuery)
  }
  const sortBy = (sort: PartnershipAggregationSort) => setQuery({
    ...query,
    sort,
    direction: query.sort === sort && query.direction === 'asc' ? 'desc' : 'asc',
    page: 1,
  })
  const clearAll = () => {
    setSearchDraft(null)
    setQuery({ ...DEFAULT_AGGREGATION_QUERY, sort: query.sort, direction: query.direction, pageSize: query.pageSize })
  }

  const facetOptions = aggregation.data?.facets
  const labelFor = (key: AggregationFilterKey, value: string) => {
    const facetKey = key === 'ownerIds' ? 'owners' : key
    const option = facetOptions?.[facetKey].find((item) => item.value === value)
    return option?.label ?? humanizeCode(value)
  }
  const activeFilters = aggregationFilterKeys.flatMap((key) => (query[key] as string[]).map((value) => ({ key, value, label: labelFor(key, value) })))
  const hasBaseRows = Boolean(facetOptions?.owners.length)
  const hasPartialData = Boolean(aggregation.data?.items.some((row) => row.dataQuality !== 'COMPLETE'))

  return (
    <div className="relative border-l-4 border-jackson-gold pl-3 sm:pl-5">
      <PageHeader
        title="Partnership aggregation"
        subtitle="A filterable, exact-value ledger of every partnership in your permitted portfolio."
        actions={<><PartnershipViewSwitcher view="aggregation" />{canEdit && <button type="button" onClick={() => setAdding(true)} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-jackson-gold px-4 text-sm font-bold text-gray-950 shadow-sm hover:bg-jackson-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jackson-gold focus-visible:ring-offset-2"><Plus className="h-4 w-4" /> Add partnership</button>}</>}
      />

      <PartnershipAggregationFilters query={query} facets={facetOptions} searchValue={searchValue} activeCount={activeCount} onSearchChange={setSearchDraft} onFilterChange={setFilter} onClear={clearAll} />
      <main className="mt-5 min-w-0" aria-label="Partnership aggregation results">
          <div className="mb-3 flex min-h-11 flex-wrap items-center gap-2">
            <p className="mr-auto text-sm font-semibold text-gray-700" aria-live="polite" aria-atomic="true">
              {aggregation.data ? `${aggregation.data.pageInfo.totalItems} ${aggregation.data.pageInfo.totalItems === 1 ? 'partnership' : 'partnerships'} in results` : 'Loading partnership count'}
            </p>
            {query.search && <button type="button" onClick={() => { setSearchDraft(null); setQuery({ ...query, search: undefined, page: 1 }) }} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jackson-gold">Search: “{query.search}” <X className="h-3 w-3" /></button>}
            {activeFilters.map((filter) => <button key={`${filter.key}-${filter.value}`} type="button" onClick={() => toggleFilter(filter.key, filter.value)} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jackson-gold">{filter.label} <X className="h-3 w-3" /></button>)}
            {activeCount > 0 && <button type="button" onClick={clearAll} className="min-h-9 px-2 text-xs font-bold text-gray-600 underline decoration-jackson-gold underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jackson-gold">Clear all</button>}
            {aggregation.isFetching && !aggregation.isLoading && <span className="hidden items-center gap-2 text-xs text-gray-500 lg:inline-flex"><Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> Updating ledger</span>}
          </div>

          {aggregation.isLoading ? (
            <section aria-label="Loading partnership aggregation" className="border border-gray-300 bg-white p-6">
              <div className="h-24 animate-pulse bg-gray-100 motion-reduce:animate-none" />
              <div className="mt-5 space-y-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-12 animate-pulse bg-gray-100 motion-reduce:animate-none" />)}</div>
            </section>
          ) : aggregation.isError ? (
            <section role="alert" className="border border-red-300 bg-red-50 p-6">
              <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" /><div><h2 className="font-serif text-xl font-semibold text-red-950">The portfolio ledger could not be loaded</h2><p className="mt-2 text-sm text-red-800">The database may be unavailable, or the request was interrupted. Your filters are still preserved in the URL.</p></div></div>
              <button type="button" onClick={() => void aggregation.refetch()} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-md border border-red-400 bg-white px-4 text-sm font-bold text-red-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700"><RotateCw className="h-4 w-4" /> Try again</button>
            </section>
          ) : aggregation.data && !hasBaseRows ? (
            <section className="border border-dashed border-gray-400 bg-white px-6 py-16 text-center"><p className="text-xs font-bold uppercase tracking-[0.16em] text-jackson-hover">Portfolio index</p><h2 className="mt-2 font-serif text-2xl font-semibold text-gray-950">No partnerships in your scope</h2><p className="mx-auto mt-3 max-w-lg text-sm text-gray-600">{canEdit ? 'Add the first partnership to begin building the portfolio ledger.' : 'No partnership records are available for your permitted owners.'}</p>{canEdit && <button type="button" onClick={() => setAdding(true)} className="mt-6 min-h-11 rounded-md bg-gray-950 px-5 text-sm font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jackson-gold focus-visible:ring-offset-2">Add partnership</button>}</section>
          ) : aggregation.data ? (
            <div className="space-y-5">
              <PartnershipAggregationKpis rollup={aggregation.data.rollup} />
              {hasPartialData && <div className="flex items-start gap-3 border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-950"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p><strong>Partial data in this page.</strong> Coverage labels show which totals are complete; unreported distributions display as $0 while other missing values remain explicit.</p></div>}
              {aggregation.data.pageInfo.totalItems === 0 ? (
                <section className="border border-dashed border-gray-400 bg-white px-6 py-14 text-center"><h2 className="font-serif text-2xl font-semibold text-gray-950">No partnerships match these filters</h2><p className="mt-3 text-sm text-gray-600">The portfolio is still intact. Clear one or more filters to widen the result set.</p><button type="button" onClick={clearAll} className="mt-5 min-h-11 rounded-md border border-gray-400 bg-white px-4 text-sm font-bold text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jackson-gold">Clear all filters</button></section>
              ) : <PartnershipAggregationTable items={aggregation.data.items} rollup={aggregation.data.rollup} sort={aggregation.data.query.sort} direction={aggregation.data.query.direction} pageInfo={aggregation.data.pageInfo} onSort={sortBy} onPageChange={(page) => setQuery({ ...query, page }, false)} onPageSizeChange={(pageSize) => setQuery({ ...query, pageSize, page: 1 })} />}
            </div>
          ) : null}
      </main>
      {canEdit && <AddPartnershipDialog open={adding} onClose={() => setAdding(false)} onCreated={(id) => navigate(`/partnership-tracker?partnership=${encodeURIComponent(id)}&area=k1`)} />}
    </div>
  )
}
