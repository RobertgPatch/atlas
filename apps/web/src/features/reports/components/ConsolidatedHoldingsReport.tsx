import { useEffect, useState } from 'react'
import { LinkIcon, RefreshCwIcon } from 'lucide-react'
import { EmptyState } from '../../../components/EmptyState'
import { ErrorState } from '../../../components/ErrorState'
import { LoadingState } from '../../../components/LoadingState'
import { reportsClient } from '../api/reportsClient'
import { useConsolidatedHoldings } from '../hooks/useConsolidatedHoldings'
import { usePlaidAccounts } from '../hooks/usePlaidAccounts'
import { usePlaidLink } from '../hooks/usePlaidLink'
import { ConsolidatedHoldingsSummaryCards } from './ConsolidatedHoldingsSummaryCards'
import { ConsolidatedHoldingsFilters } from './ConsolidatedHoldingsFilters'
import { ConsolidatedHoldingsSyncStatus } from './ConsolidatedHoldingsSyncStatus'
import { ConsolidatedHoldingsTable } from './ConsolidatedHoldingsTable'
import { PlaidAccountSelector } from './PlaidAccountSelector'

export function ConsolidatedHoldingsReport() {
  const [isAccountSelectorOpen, setIsAccountSelectorOpen] = useState(false)
  const [exportMessage, setExportMessage] = useState<string | null>(null)
  const [accountSelectorError, setAccountSelectorError] = useState<string | null>(null)
  const holdings = useConsolidatedHoldings()
  const plaidAccounts = usePlaidAccounts()
  const plaidLink = usePlaidLink()

  useEffect(() => {
    void plaidLink.prepare().catch(() => {
      // Surface token creation errors only when the user actively opens Link.
    })
  }, [plaidLink.prepare])

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

  const data = holdings.query.data
  const rows = data?.rows ?? []
  const assetTypes = [...new Set(rows.map((row) => row.type))].sort()
  const lastUpdated = data?.sync.lastSuccessfulSyncAt
    ? new Intl.DateTimeFormat('en-US', {
        dateStyle: 'full',
        timeStyle: 'short',
      }).format(new Date(data.sync.lastSuccessfulSyncAt))
    : 'Not synced yet'

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">
            Consolidated Holdings Report
          </h2>
          <p className="mt-1 text-sm text-gray-500">Last updated: {lastUpdated}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={async () => {
              const result = await reportsClient.exportConsolidatedHoldings({
                ...holdings.queryInput,
                format: 'csv',
              })
              setExportMessage(`Export ready: ${result.fileName ?? 'holdings.csv'}`)
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
          >
            CSV
          </button>
          <button
            type="button"
            onClick={() => holdings.refresh.mutate()}
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
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            <LinkIcon className="h-4 w-4" />
            Connect Accounts
            <span className="ml-0.5 rounded-full bg-blue-500 px-1.5 py-0.5 text-xs font-bold text-white">
              {data?.kpis.selectedAccountCount ?? 0}
            </span>
          </button>
        </div>
      </div>

      <ConsolidatedHoldingsSummaryCards kpis={data?.kpis} />

      {exportMessage && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {exportMessage}
        </div>
      )}

      <ConsolidatedHoldingsSyncStatus sync={data?.sync} />

      <ConsolidatedHoldingsFilters
        filters={holdings.filters}
        accounts={data?.selectedAccounts ?? []}
        assetTypes={assetTypes}
        onChange={holdings.updateFilter}
        onClear={holdings.clearFilters}
      />

      {rows.length === 0 && !holdings.filters.search ? (
        <EmptyState
          title="No holdings are connected yet"
          description="Connect Plaid investment accounts or refresh selected accounts to populate the report."
        />
      ) : (
        <ConsolidatedHoldingsTable
          rows={rows}
          selectedAccountCount={data?.kpis.selectedAccountCount ?? 0}
          search={holdings.filters.search}
          sort={holdings.filters.sort}
          direction={holdings.filters.direction}
          onSearchChange={(value) => holdings.updateFilter('search', value)}
          onSortChange={(sort, direction) => {
            holdings.updateFilter('sort', sort)
            holdings.updateFilter('direction', direction)
          }}
        />
      )}

      <div className="text-center text-xs text-gray-400">
        Data sourced via Plaid API · Prices may be delayed · For informational purposes only
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
              void holdings.refresh.mutate()
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
