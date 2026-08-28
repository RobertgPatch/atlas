import { useMemo, useState } from 'react'
import { LinkIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react'
import { EmptyState } from '../../../components/EmptyState'
import { ErrorState } from '../../../components/ErrorState'
import { LoadingState } from '../../../components/LoadingState'
import { useConsolidatedHoldings } from '../hooks/useConsolidatedHoldings'
import { usePlaidAccounts } from '../hooks/usePlaidAccounts'
import { usePlaidLink } from '../hooks/usePlaidLink'
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
import { PlaidAccountSelector } from './PlaidAccountSelector'
import { PortfolioHero } from './PortfolioHero'
import { LiquidityPerformanceTracker } from './LiquidityPerformanceTracker'
import { TopHoldings } from './TopHoldings'

export function ConsolidatedHoldingsReport() {
  const [isAccountSelectorOpen, setIsAccountSelectorOpen] = useState(false)
  const [accountSelectorError, setAccountSelectorError] = useState<string | null>(null)
  const [selectedSectors, setSelectedSectors] = useState<EquitySector[]>(() => [
    ...EQUITY_SECTORS,
  ])
  const holdings = useConsolidatedHoldings()
  const performance = useLiquidityPerformance()
  const plaidAccounts = usePlaidAccounts()
  const plaidLink = usePlaidLink()

  const data = holdings.query.data
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
    : 'Not synced yet'

  const handleClearAccounts = () => {
    plaidAccounts.clearAccounts.mutate(undefined, {
      onSuccess: () => {
        setAccountSelectorError(null)
        setIsAccountSelectorOpen(false)
        void holdings.query.refetch()
      },
    })
  }

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
            Consolidated view across all connected accounts
          </p>
          <p className="mt-1 text-xs text-gray-400">Last updated: {lastUpdated}</p>
          {holdings.isMarketRefreshing ? (
            <p className="mt-1 text-xs font-medium text-primary" aria-live="polite">
              Updating market values in the background…
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          {plaidAccounts.accounts.length > 0 ? (
            <button
              type="button"
              onClick={handleClearAccounts}
              disabled={plaidAccounts.clearAccounts.isPending}
              className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Trash2Icon className="h-4 w-4" />
              {plaidAccounts.clearAccounts.isPending ? 'Clearing...' : 'Clear Accounts'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => holdings.refresh.mutate(undefined)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
          >
            <RefreshCwIcon className="h-4 w-4" />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => {
              setAccountSelectorError(null)
              setIsAccountSelectorOpen(true)
              if (plaidAccounts.accounts.length === 0) {
                void plaidLink.open()
              }
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover"
          >
            <LinkIcon className="h-4 w-4" />
            Connect Accounts
            <span className="ml-0.5 rounded-full bg-blue-500 px-1.5 py-0.5 text-xs font-bold text-white">
              {data?.kpis.selectedAccountCount ?? 0}
            </span>
          </button>
        </div>
      </div>

      <DataQualityBanner
        nullCostBasisCount={quality.nullCostBasisCount}
        affectedAccountCount={quality.affectedAccountCount}
      />

      <PortfolioHero
        totalValue={totalMarketValue}
        totalCostBasis={data?.kpis.totalCostBasis ?? null}
        costBasisIsPartial={quality.costBasisIsPartial}
        totalGainLoss={data?.kpis.totalUnrealizedGainLoss ?? null}
        totalGainLossPercent={data?.kpis.gainLossPercent ?? null}
        totalPositions={rows.length}
        connectedAccounts={data?.kpis.selectedAccountCount ?? 0}
      />

      <LiquidityPerformanceTracker
        points={performance.data?.points ?? []}
        currentPoint={currentPerformancePoint}
        isLoading={performance.isLoading}
        isError={performance.isError}
        onRetry={() => void performance.refetch()}
      />

      <ConsolidatedHoldingsSyncStatus sync={data?.sync} pricing={data?.pricing} />

      {rows.length > 0 ? (
        <>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <AllocationChart
              assetData={assetData}
              sectorData={sectorData}
              selectedSectors={selectedSectors}
              onSelectedSectorsChange={setSelectedSectors}
            />
            <CustodianBreakdown custodians={custodianData} />
          </div>

          {visibleRows.length > 0 ? <TopHoldings holdings={topHoldings} /> : null}
        </>
      ) : null}

      {rows.length === 0 && !holdings.filters.search ? (
        <EmptyState
          title="No holdings are connected yet"
          description="Connect Plaid investment accounts or refresh selected accounts to populate the report."
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

      <div className="space-y-0.5 text-center text-xs text-gray-400">
        <p>
          Positions and cost basis are sourced from Plaid; public-market prices
          refresh on view and after market close
        </p>
        <p>Not investment advice - For informational purposes only</p>
      </div>

      <PlaidAccountSelector
        isOpen={isAccountSelectorOpen}
        accounts={plaidAccounts.accounts}
        onClose={() => setIsAccountSelectorOpen(false)}
        onConnect={() => {
          setAccountSelectorError(null)
          void plaidLink.open()
        }}
        isConnecting={plaidLink.isLoading}
        isSaving={plaidAccounts.updateSelection.isPending}
        errorMessage={accountSelectorError}
        onConfirm={(selectedAccountIds) => {
          setAccountSelectorError(null)
          plaidAccounts.updateSelection.mutate(selectedAccountIds, {
            onSuccess: () => {
              setIsAccountSelectorOpen(false)
              void holdings.refresh.mutate(undefined)
            },
            onError: () => {
              setAccountSelectorError(
                'Unable to apply account selection. Please try again after the API redeploy finishes.',
              )
            },
          })
        }}
      />
    </div>
  )
}

