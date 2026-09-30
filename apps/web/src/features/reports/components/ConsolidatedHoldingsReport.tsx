import { useMemo, useState } from 'react'
import { Building2Icon,StarIcon,UploadIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../../../components/EmptyState'
import { ErrorState } from '../../../components/ErrorState'
import { LoadingState } from '../../../components/LoadingState'
import { useConsolidatedHoldings } from '../hooks/useConsolidatedHoldings'
import { useSession } from '../../../auth/sessionStore'
import { useLiquidityPerformance } from '../hooks/useLiquidityPerformance'
import {
  SECTOR_FILTER_OPTIONS,
  filterHoldingsByAccounts,
  filterHoldingsBySectors,
  getAssetAllocation,
  getCostBasisQuality,
  getCustodianBreakdown,
  getSectorAllocation,
  getRankableHoldings,
  type SectorFilterOption,
} from '../utils/consolidatedHoldingsAnalytics'
import { AllocationChart } from './AllocationChart'
import { ConsolidatedHoldingsSyncStatus } from './ConsolidatedHoldingsSyncStatus'
import { ConsolidatedHoldingsTable } from './ConsolidatedHoldingsTable'
import { CustodianBreakdown } from './CustodianBreakdown'
import { DataQualityBanner } from './DataQualityBanner'
import { PortfolioHero } from './PortfolioHero'
import { LiquidityPerformanceTracker } from './LiquidityPerformanceTracker'
import { TopHoldings } from './TopHoldings'

export function ConsolidatedHoldingsReport({entities=[],entityId,defaultEntityId,entitiesLoading=false,onEntityChange=()=>undefined,onMakeDefault=()=>undefined}:{entities?:Array<{id:string;name:string}>;entityId?:string;defaultEntityId?:string;entitiesLoading?:boolean;onEntityChange?:(id:string)=>void;onMakeDefault?:()=>void}) {
  const [selectedSectors, setSelectedSectors] = useState<SectorFilterOption[]>(() => [
    ...SECTOR_FILTER_OPTIONS,
  ])
  const [accountSelections,setAccountSelections]=useState<Record<string,string[]>>({})
  const holdings = useConsolidatedHoldings(entityId)
  const session = useSession()
  const isAdmin = session.session?.role === 'Admin'

  const data = holdings.query.data
  const rows = useMemo(() => data?.rows ?? [], [data?.rows])
  const allAccountIds=useMemo(()=>data?.selectedAccounts.map(account=>account.id)??[],[data?.selectedAccounts])
  const selectionKey=entityId??''
  const explicitAccountSelection=accountSelections[selectionKey]
  const selectedAccountIds=useMemo(()=>explicitAccountSelection===undefined?allAccountIds:explicitAccountSelection.filter(id=>allAccountIds.includes(id)),[allAccountIds,explicitAccountSelection])
  const accountFilterIsActive=selectedAccountIds.length!==allAccountIds.length
  const performance = useLiquidityPerformance(entityId,accountFilterIsActive?selectedAccountIds:undefined)
  const accountScopedRows=useMemo(()=>accountFilterIsActive?filterHoldingsByAccounts(rows,selectedAccountIds):rows,[accountFilterIsActive,rows,selectedAccountIds])
  const selectedAccounts=useMemo(()=>data?.selectedAccounts.filter(account=>selectedAccountIds.includes(account.id))??[],[data?.selectedAccounts,selectedAccountIds])
  const scopedKpis=useMemo(()=>{
    if(!data)return null
    if(!accountFilterIsActive)return data.kpis
    const completeTotal=(key:'costBasis'|'unrealizedGainLoss')=>accountScopedRows.every(row=>row[key]!=null)?accountScopedRows.reduce((total,row)=>total+(row[key]??0),0):null
    const totalMarketValue=accountScopedRows.reduce((total,row)=>total+(row.marketValue??0),0)
    const totalCostBasis=completeTotal('costBasis'),totalUnrealizedGainLoss=completeTotal('unrealizedGainLoss')
    return {totalMarketValue,totalCostBasis,totalUnrealizedGainLoss,gainLossPercent:totalCostBasis!=null&&totalCostBasis!==0&&totalUnrealizedGainLoss!=null?totalUnrealizedGainLoss/totalCostBasis*100:null,uniqueAssetCount:accountScopedRows.length,selectedAccountCount:selectedAccountIds.length}
  },[accountFilterIsActive,accountScopedRows,data,selectedAccountIds.length])
  const scopedCurrencies=useMemo(()=>[...new Set(accountScopedRows.map(row=>row.currencyCode??'USD'))],[accountScopedRows])
  const portfolioCurrency = scopedCurrencies.length === 1 ? scopedCurrencies[0]! : 'USD'
  const mixedCurrencies = scopedCurrencies.length > 1
  const totalMarketValue = scopedKpis?.totalMarketValue ?? 0
  const quality = useMemo(() => getCostBasisQuality(accountScopedRows), [accountScopedRows])
  const assetData = useMemo(
    () => getAssetAllocation(accountScopedRows, totalMarketValue),
    [accountScopedRows, totalMarketValue],
  )
  const sectorData = useMemo(() => getSectorAllocation(accountScopedRows), [accountScopedRows])
  const sectorFilterIsActive = selectedSectors.length !== SECTOR_FILTER_OPTIONS.length
  const visibleRows = useMemo(
    () =>
      sectorFilterIsActive
        ? filterHoldingsBySectors(accountScopedRows, selectedSectors)
        : accountScopedRows,
    [accountScopedRows, sectorFilterIsActive, selectedSectors],
  )
  const custodianData = useMemo(
    () => (data ? getCustodianBreakdown(data, data.kpis.totalMarketValue ?? 0) : []),
    [data],
  )
  const visibleMarketValue = useMemo(
    () => visibleRows.reduce((total, row) => total + (row.marketValue ?? 0), 0),
    [visibleRows],
  )
  const topHoldings = useMemo(
    () => getRankableHoldings(visibleRows, visibleMarketValue),
    [visibleMarketValue, visibleRows],
  )
  const currentPerformancePoint = useMemo(() => {
    const date = data?.pricing.priceAsOf?.slice(0, 10) ?? data?.sync.dataAsOfDate
    if (!data || !date || scopedKpis?.totalMarketValue == null || selectedAccountIds.length===0) return null

    return {
      date,
      totalMarketValue: scopedKpis.totalMarketValue,
      totalCostBasis: scopedKpis.totalCostBasis,
      totalUnrealizedGainLoss: scopedKpis.totalUnrealizedGainLoss,
      accountCount: selectedAccountIds.length,
      source: 'current' as const,
      capturedAt: data.pricing.refreshedAt ?? data.sync.lastSuccessfulSyncAt,
      priceAsOf: data.pricing.priceAsOf,
      pricedHoldingCount: data.pricing.pricedHoldingCount,
      fallbackHoldingCount: data.pricing.fallbackHoldingCount,
    }
  }, [data,scopedKpis,selectedAccountIds.length])
  const setAccountSelection=(next:string[])=>setAccountSelections(current=>{
    const normalized=[...new Set(next)].filter(id=>allAccountIds.includes(id))
    if(normalized.length===allAccountIds.length){
      const rest={...current}
      delete rest[selectionKey]
      return rest
    }
    return {...current,[selectionKey]:normalized}
  })
  const toggleAccount=(accountId:string)=>setAccountSelection(selectedAccountIds.includes(accountId)?selectedAccountIds.filter(id=>id!==accountId):[...selectedAccountIds,accountId])
  const toggleInstitution=(accountIds:string[])=>{
    const selected=new Set(selectedAccountIds),allInstitutionSelected=accountIds.every(id=>selected.has(id))
    accountIds.forEach(id=>allInstitutionSelected?selected.delete(id):selected.add(id))
    setAccountSelection([...selected])
  }
  const scopedGainUnknown=accountScopedRows.filter(row=>row.unrealizedGainLoss==null).length
  const scopedKnownGain=accountScopedRows.reduce((total,row)=>total+(row.unrealizedGainLoss??0),0)
  const lastUpdatedAt = data?.pricing.priceAsOf ?? data?.sync.lastSuccessfulSyncAt
  const lastUpdated = lastUpdatedAt
    ? new Intl.DateTimeFormat('en-US', {
        dateStyle: 'full',
        timeStyle: 'short',
      }).format(new Date(lastUpdatedAt))
    : 'No snapshot yet'

  if (entitiesLoading || holdings.query.isLoading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white" data-testid="holdings-loading">
        <LoadingState rows={8} columns={8} />
      </div>
    )
  }

  if (holdings.query.isError) {
    return (
      <ErrorState
        title="Unable to load Consolidated Holdings"
        message="Try again or reopen Liquidity after the latest statement is applied."
        onRetry={() => void holdings.query.refetch()}
      />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">
            Portfolio Overview
          </h2>
          <p className="mt-0.5 text-sm text-gray-500">
            {entities.find(entity => entity.id === entityId)?.name
              ? `Consolidated view for ${entities.find(entity => entity.id === entityId)?.name}`
              : 'Consolidated view across the selected entity\'s accounts'}
          </p>
          <p className="mt-1 text-xs text-gray-400">Last updated: {lastUpdated}</p>
        </div>
        {isAdmin && <Link to={`/liquidity/statements${entityId ? `?entityId=${encodeURIComponent(entityId)}` : ''}`} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover">
          <UploadIcon className="h-4 w-4" /> Statement workspace
        </Link>}
      </div>

      <section aria-label="Liquidity entity" className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-end sm:justify-between">
        <label className="block min-w-0 flex-1 text-sm font-semibold text-slate-700">
          <span className="mb-1.5 flex items-center gap-2"><Building2Icon className="h-4 w-4 text-primary" /> Entity</span>
          <select
            aria-label="Liquidity entity"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            value={entityId ?? ''}
            disabled={entitiesLoading || entities.length === 0}
            onChange={event => onEntityChange(event.target.value)}
          >
            {entities.length === 0 ? <option value="">No entities available</option> : null}
            {entities.map(entity => <option key={entity.id} value={entity.id}>{entity.name}</option>)}
          </select>
        </label>
        <button
          type="button"
          disabled={!entityId || entityId === defaultEntityId}
          onClick={onMakeDefault}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-primary/40 hover:bg-primary/5 disabled:cursor-default disabled:bg-slate-50 disabled:text-slate-400"
        >
          <StarIcon className="h-4 w-4" />
          {entityId === defaultEntityId ? 'Default entity' : 'Make default'}
        </button>
      </section>

      <DataQualityBanner
        nullCostBasisCount={quality.nullCostBasisCount}
        affectedAccountCount={quality.affectedAccountCount}
      />

      <PortfolioHero
        currencyCode={portfolioCurrency}
        totalValue={scopedKpis?.totalMarketValue ?? null}
        totalCostBasis={scopedKpis?.totalCostBasis ?? null}
        costBasisIsPartial={quality.costBasisIsPartial}
        totalGainLoss={scopedKpis?.totalUnrealizedGainLoss ?? null}
        totalGainLossPercent={scopedKpis?.gainLossPercent ?? null}
        totalPositions={scopedKpis?.uniqueAssetCount ?? accountScopedRows.length}
        connectedAccounts={selectedAccountIds.length}
      />

      <LiquidityPerformanceTracker
        currencyCode={portfolioCurrency}
        points={mixedCurrencies||selectedAccountIds.length===0 ? [] : performance.data?.points ?? []}
        currentPoint={currentPerformancePoint}
        isLoading={performance.isLoading}
        isError={performance.isError}
        onRetry={() => void performance.refetch()}
      />

      <ConsolidatedHoldingsSyncStatus sync={data?.sync} pricing={data?.pricing} />
      {scopedGainUnknown>0 && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Gain/loss is incomplete for {scopedGainUnknown} holdings. {!mixedCurrencies && <>Known gain/loss subtotal: {scopedKnownGain.toLocaleString('en-US',{style:'currency',currency:portfolioCurrency})}. </>} The portfolio gain/loss total is unavailable.</p>}
      {selectedAccounts.some(a => a.sourceKind === 'CSV'||a.sourceKind === 'STATEMENT') && <div className="flex flex-wrap gap-3 text-xs text-gray-500">{selectedAccounts.map(a => <span key={a.id}>{a.custodianName} · {a.name}: {a.sourceKind==='STATEMENT'?'statement':'CSV'} holdings as of {a.holdingsAsOfDate ?? 'unavailable'}{a.nextExpectedDate ? ` · next expected ${a.nextExpectedDate}` : ''}</span>)}</div>}
      {data && data.page.total > data.page.size && <p className="text-sm text-gray-600">Charts and rankings show this page of holdings. Portfolio metrics include all matching holdings.</p>}

      {rows.length > 0 && (data?.coverage?.currencies.length ?? 1) <= 1 ? (
        <>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <AllocationChart
              manageSectorsHref={isAdmin ? `/liquidity/sectors${entityId ? `?entityId=${encodeURIComponent(entityId)}` : ''}` : undefined}
              currencyCode={portfolioCurrency}
              assetData={assetData}
              sectorData={sectorData}
              selectedSectors={selectedSectors}
              onSelectedSectorsChange={setSelectedSectors}
            />
            <CustodianBreakdown custodians={custodianData} currencyCode={portfolioCurrency} selectedAccountIds={selectedAccountIds} onToggleInstitution={toggleInstitution} onToggleAccount={toggleAccount} onShowAll={()=>setAccountSelection(allAccountIds)} />
          </div>

          {visibleRows.length > 0 ? <TopHoldings holdings={topHoldings} currencyCode={portfolioCurrency} /> : null}
        </>
      ) : null}

      {rows.length === 0 && !holdings.filters.search ? (
        <EmptyState
          title="No holdings available yet"
          description="An administrator can upload a complete holdings statement, review it, and apply it to populate this page."
        />
      ) : (
        <ConsolidatedHoldingsTable
          rows={visibleRows}
          selectedAccountCount={selectedAccountIds.length}
          search={holdings.filters.search}
          sort={holdings.filters.sort}
          direction={holdings.filters.direction}
          onSearchChange={(value) => holdings.updateFilter('search', value)}
          onSortChange={(sort, direction) => {
            holdings.updateFilter('sort', sort)
            holdings.updateFilter('direction', direction)
          }}
          sectorFilter={
            sectorFilterIsActive
              ? {
                  sectors: selectedSectors,
                  onClear: () => setSelectedSectors([...SECTOR_FILTER_OPTIONS]),
                }
              : undefined
          }
        />
      )}

      {data && data.page.total > data.page.size && <nav aria-label="Holdings pages" className="flex items-center justify-between text-sm">
        <button type="button" disabled={data.page.offset === 0} onClick={()=>holdings.setPage(holdings.filters.page-1)}>Previous page</button>
        <span>{data.page.offset+1}–{Math.min(data.page.offset+data.page.size,data.page.total)} of {data.page.total}</span>
        <button type="button" disabled={data.page.offset+data.page.size>=data.page.total} onClick={()=>holdings.setPage(holdings.filters.page+1)}>Next page</button>
      </nav>}
      <div className="space-y-0.5 text-center text-xs text-gray-400">
        <p>
          {data?.pricingCapability?.realTimeEquitiesEnabled
            ? 'Quantities and cost basis come from account snapshots. Supported equities use market quotes when available.'
            : 'Values reflect the latest applied account snapshots. Upload a new statement to update holdings.'}
        </p>
        <p>Not investment advice - For informational purposes only</p>
      </div>

    </div>
  )
}

