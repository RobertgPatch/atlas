import { RotateCcw } from 'lucide-react'
import type {
  PartnershipType,
  PrivateInvestmentFacetSet,
  PrivateInvestmentQuery,
} from '../../../../../../../packages/types/src/partnership-tracker'
import { PrivateInvestmentFilterCombobox } from './PrivateInvestmentFilterCombobox'

export function PrivateInvestmentFilters({
  query,
  facets,
  onChange,
}: {
  query: PrivateInvestmentQuery
  facets: PrivateInvestmentFacetSet
  onChange: (query: PrivateInvestmentQuery) => void
}) {
  const change = (patch: Partial<PrivateInvestmentQuery>) => onChange({ ...query, ...patch, page: 1 })
  const activeCount = query.assetClasses.length + query.entityIds.length + query.partnershipIds.length
  const partnershipsForAssetClasses = facets.partnerships.filter((option) => (
    (!query.entityIds.length || query.entityIds.includes(option.entityId))
    && (!query.partnershipIds.length || query.partnershipIds.includes(option.value))
  ))
  const availableAssetClasses = new Set(partnershipsForAssetClasses.map((option) => option.assetClass))
  const assetClassOptions = facets.assetClasses.filter((option) => availableAssetClasses.has(option.value))

  const partnershipsForEntities = facets.partnerships.filter((option) => (
    (!query.assetClasses.length || query.assetClasses.includes(option.assetClass))
    && (!query.partnershipIds.length || query.partnershipIds.includes(option.value))
  ))
  const availableEntityIds = new Set(partnershipsForEntities.map((option) => option.entityId))
  const entityOptions = facets.entities.filter((option) => availableEntityIds.has(option.value))

  const fundOptions = facets.partnerships
    .filter((option) => (
      (!query.assetClasses.length || query.assetClasses.includes(option.assetClass))
      && (!query.entityIds.length || query.entityIds.includes(option.entityId))
    ))
    .map((option) => ({ ...option, context: `${option.entityName} · ${option.assetClass}` }))

  const changeAssetClasses = (assetClasses: string[]) => {
    const selected = assetClasses as PartnershipType[]
    const validPartnershipIds = new Set(
      facets.partnerships
        .filter((option) => (
          (!selected.length || selected.includes(option.assetClass))
          && (!query.entityIds.length || query.entityIds.includes(option.entityId))
        ))
        .map((option) => option.value),
    )
    change({
      assetClasses: selected,
      partnershipIds: query.partnershipIds.filter((id) => validPartnershipIds.has(id)),
    })
  }

  const changeEntityIds = (entityIds: string[]) => {
    const validPartnershipIds = new Set(
      facets.partnerships
        .filter((option) => (
          (!query.assetClasses.length || query.assetClasses.includes(option.assetClass))
          && (!entityIds.length || entityIds.includes(option.entityId))
        ))
        .map((option) => option.value),
    )
    change({
      entityIds,
      partnershipIds: query.partnershipIds.filter((id) => validPartnershipIds.has(id)),
    })
  }

  const clear = () => {
    onChange({
      assetClasses: [],
      entityIds: [],
      partnershipIds: [],
      dateFrom: null,
      dateTo: null,
      amountMin: null,
      amountMax: null,
      page: 1,
      pageSize: query.pageSize,
    })
  }

  return (
    <section aria-labelledby="private-investment-filters-title" className="border border-gray-300 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="mr-auto"><p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-jackson-hover">Activity ledger</p><h2 id="private-investment-filters-title" className="mt-1 font-serif text-xl font-semibold text-gray-950">Filter investments</h2></div>
        <p className="text-xs font-semibold text-gray-600" aria-live="polite">{activeCount ? `${activeCount} active filter${activeCount === 1 ? '' : 's'}` : 'Showing full permitted portfolio'}</p>
        <button type="button" onClick={clear} disabled={activeCount === 0} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-gray-300 bg-white px-3 text-xs font-bold text-gray-800 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jackson-gold"><RotateCcw className="h-3.5 w-3.5" /> Clear all</button>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <PrivateInvestmentFilterCombobox id="investment-asset-class-filter" label="Asset class" options={assetClassOptions} values={query.assetClasses} onChange={changeAssetClasses} />
        <PrivateInvestmentFilterCombobox id="investment-entity-filter" label="Entity" options={entityOptions} values={query.entityIds} onChange={changeEntityIds} />
        <PrivateInvestmentFilterCombobox id="investment-fund-filter" label="Fund" options={fundOptions} values={query.partnershipIds} onChange={(partnershipIds) => change({ partnershipIds })} />
      </div>
    </section>
  )
}
