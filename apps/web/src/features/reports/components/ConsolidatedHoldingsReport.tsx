import { useMemo, useState } from 'react'
import { UploadIcon, RefreshCwIcon } from 'lucide-react'
import { EmptyState } from '../../../components/EmptyState'
import { ErrorState } from '../../../components/ErrorState'
import { LoadingState } from '../../../components/LoadingState'
import { useConsolidatedHoldings } from '../hooks/useConsolidatedHoldings'
import { useSession } from '../../../auth/sessionStore'
import { LiquidityCsvUploadDialog } from './LiquidityCsvUploadDialog'
import { useLiquidityPerformance } from '../hooks/useLiquidityPerformance'
import {
  EQUITY_SECTORS,
  filterHoldingsBySectors,
  getAssetAllocation,
  getCostBasisQuality,
  getCustodianBreakdown,
  getSectorAllocation,
  getRankableHoldings,
  type EquitySector,
} from '../utils/consolidatedHoldingsAnalytics'
import { AllocationChart } from './AllocationChart'
import { ConsolidatedHoldingsSyncStatus } from './ConsolidatedHoldingsSyncStatus'
import { ConsolidatedHoldingsTable } from './ConsolidatedHoldingsTable'
import { CustodianBreakdown } from './CustodianBreakdown'
import { DataQualityBanner } from './DataQualityBanner'
import { PortfolioHero } from './PortfolioHero'
import { LiquidityPerformanceTracker } from './LiquidityPerformanceTracker'
import { TopHoldings } from './TopHoldings'

export function ConsolidatedHoldingsReport() {
  const [isAccountSelectorOpen, setIsAccountSelectorOpen] = useState(false)
  const [selectedSectors, setSelectedSectors] = useState<EquitySector[]>(() => [
    ...EQUITY_SECTORS,
  ])
  const holdings = useConsolidatedHoldings()
  const performance = useLiquidityPerformance()
  const session = useSession()
  const isAdmin = session.session?.role === 'Admin'

  const data = holdings.query.data
  const portfolioCurrency = data?.coverage?.currencies.length === 1 ? data.coverage.currencies[0] : 'USD'
  const mixedCurrencies = (data?.coverage?.currencies.length ?? 1) > 1
  const rows = useMemo(() => data?.rows ?? [], [data?.rows])
  const totalMarketValue = data?.kpis.totalMarketValue ?? 0
  const quality = useMemo(() => getCostBasisQuality(rows), [rows])
  const assetData = useMemo(
    () => getAssetAllocation(rows, totalMarketValue),
    [rows, totalMarketValue],
  )
  const sectorData = useMemo(() => getSectorAllocation(rows), [rows])
  const sectorFilterIsActive = selectedSectors.length !== EQUITY_SECTORS.length
  const visibleRows = useMemo(
    () =>
      sectorFilterIsActive
        ? filterHoldingsBySectors(rows, selectedSectors)
        : rows,
    [rows, sectorFilterIsActive, selectedSectors],
  )
  const custodianData = useMemo(
    () => (data ? getCustodianBreakdown(data, totalMarketValue) : []),
    [data, totalMarketValue],
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
    if (!date || data?.kpis.totalMarketValue == null) return null

    return {
      date,
      totalMarketValue: data.kpis.totalMarketValue,
      totalCostBasis: data.kpis.totalCostBasis,
      totalUnrealizedGainLoss: data.kpis.totalUnrealizedGainLoss,
      accountCount: data.kpis.selectedAccountCount,
      source: 'current' as const,
      capturedAt: data.pricing.refreshedAt ?? data.sync.lastSuccessfulSyncAt,
      priceAsOf: data.pricing.priceAsOf,
      pricedHoldingCount: data.pricing.pricedHoldingCount,
      fallbackHoldingCount: data.pricing.fallbackHoldingCount,
    }
  }, [data])
  const lastUpdatedAt = data?.pricing.priceAsOf ?? data?.sync.lastSuccessfulSyncAt
  const lastUpdated = lastUpdatedAt
    ? new Intl.DateTimeFormat('en-US', {
        dateStyle: 'full',
        timeStyle: 'short',
      }).format(new Date(lastUpdatedAt))
    : 'No snapshot yet'

  if (holdings.query.isLoading) {
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
        message="Try again or refresh connected account data."
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
            Consolidated view across your included accounts
          </p>
          <p className="mt-1 text-xs text-gray-400">Last updated: {lastUpdated}</p>
          {holdings.isMarketRefreshing ? (
            <p className="mt-1 text-xs font-medium text-primary" aria-live="polite">
              Updating market values in the background…
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => holdings.refresh.mutate(undefined)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
          >
            <RefreshCwIcon className="h-4 w-4" />
            Refresh
          </button>
          {isAdmin && <button type="button" onClick={() => setIsAccountSelectorOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover">
            <UploadIcon className="h-4 w-4" /> Upload CSV / Manage accounts
          </button>}
        </div>
      </div>

      <DataQualityBanner
        nullCostBasisCount={quality.nullCostBasisCount}
        affectedAccountCount={quality.affectedAccountCount}
      />

      <PortfolioHero
        currencyCode={portfolioCurrency}
        totalValue={data?.kpis.totalMarketValue ?? null}
        totalCostBasis={data?.kpis.totalCostBasis ?? null}
        costBasisIsPartial={quality.costBasisIsPartial}
        totalGainLoss={data?.kpis.totalUnrealizedGainLoss ?? null}
        totalGainLossPercent={data?.kpis.gainLossPercent ?? null}
        totalPositions={data?.kpis.uniqueAssetCount ?? rows.length}
        connectedAccounts={data?.kpis.selectedAccountCount ?? 0}
      />

      <LiquidityPerformanceTracker
        currencyCode={portfolioCurrency}
        points={mixedCurrencies ? [] : performance.data?.points ?? []}
        currentPoint={currentPerformancePoint}
        isLoading={performance.isLoading}
        isError={performance.isError}
        onRetry={() => void performance.refetch()}
      />

      <ConsolidatedHoldingsSyncStatus sync={data?.sync} pricing={data?.pricing} />
      {data?.coverage?.gain.status !== undefined && data.coverage.gain.status !== 'COMPLETE' && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Gain/loss is incomplete for {data.coverage.gain.unknownRows} holdings. {!mixedCurrencies && <>Known gain/loss subtotal: {data.coverage.gain.knownSubtotal} {portfolioCurrency}. </>} The portfolio gain/loss total is unavailable.</p>}
      {data?.selectedAccounts.some(a => a.sourceKind === 'CSV') && <div className="flex flex-wrap gap-3 text-xs text-gray-500">{data.selectedAccounts.map(a => <span key={a.id}>{a.custodianName} · {a.name}: holdings as of {a.holdingsAsOfDate ?? 'unavailable'}{a.nextExpectedDate ? ` · next expected ${a.nextExpectedDate}` : ''}</span>)}</div>}
      {data && data.page.total > data.page.size && <p className="text-sm text-gray-600">Charts and rankings show this page of holdings. Portfolio metrics include all matching holdings.</p>}

      {rows.length > 0 && (data?.coverage?.currencies.length ?? 1) <= 1 ? (
        <>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <AllocationChart
              currencyCode={portfolioCurrency}
              assetData={assetData}
              sectorData={sectorData}
              selectedSectors={selectedSectors}
              onSelectedSectorsChange={setSelectedSectors}
            />
            <CustodianBreakdown custodians={custodianData} currencyCode={portfolioCurrency} />
          </div>

          {visibleRows.length > 0 ? <TopHoldings holdings={topHoldings} currencyCode={portfolioCurrency} /> : null}
        </>
      ) : null}

      {rows.length === 0 && !holdings.filters.search ? (
        <EmptyState
          title="No holdings available yet"
          description="An administrator can upload a complete holdings CSV, review it, and apply it to populate this page."
        />
      ) : (
        <ConsolidatedHoldingsTable
          rows={visibleRows}
          selectedAccountCount={data?.kpis.selectedAccountCount ?? 0}
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
                  onClear: () => setSelectedSectors([...EQUITY_SECTORS]),
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
            : 'Values reflect the latest applied account snapshots. Upload a new CSV to update holdings.'}
        </p>
        <p>Not investment advice - For informational purposes only</p>
      </div>

      {isAccountSelectorOpen && isAdmin && <LiquidityCsvUploadDialog onClose={() => setIsAccountSelectorOpen(false)}/>}
    </div>
  )
}

