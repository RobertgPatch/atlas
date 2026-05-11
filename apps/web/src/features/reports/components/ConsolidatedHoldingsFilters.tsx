import type { PlaidInvestmentAccount } from '../../../../../../packages/types/src/plaid'
import type { ConsolidatedHoldingsFilters as FilterState } from '../hooks/useConsolidatedHoldings'

interface ConsolidatedHoldingsFiltersProps {
  filters: FilterState
  accounts: PlaidInvestmentAccount[]
  assetTypes: string[]
  onChange: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void
  onClear: () => void
}

export function ConsolidatedHoldingsFilters({
  filters,
  accounts,
  assetTypes,
  onChange,
  onClear,
}: ConsolidatedHoldingsFiltersProps) {
  const custodians = [...new Set(accounts.map((account) => account.custodianName))].sort()

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
      <select
        value={filters.custodian}
        onChange={(event) => onChange('custodian', event.target.value)}
        className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
        aria-label="Custodian"
      >
        <option value="">All custodians</option>
        {custodians.map((custodian) => (
          <option key={custodian} value={custodian}>
            {custodian}
          </option>
        ))}
      </select>
      <select
        value={filters.accountId}
        onChange={(event) => onChange('accountId', event.target.value)}
        className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
        aria-label="Account"
      >
        <option value="">All accounts</option>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.custodianName} - {account.name}
          </option>
        ))}
      </select>
      <select
        value={filters.type}
        onChange={(event) => onChange('type', event.target.value)}
        className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
        aria-label="Asset type"
      >
        <option value="">All types</option>
        {assetTypes.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </select>
      <select
        value={filters.gainLossState}
        onChange={(event) =>
          onChange('gainLossState', event.target.value as FilterState['gainLossState'])
        }
        className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
        aria-label="Gain loss state"
      >
        <option value="">All gain/loss</option>
        <option value="gain">Gain</option>
        <option value="loss">Loss</option>
        <option value="flat">Flat</option>
        <option value="unknown">Unknown</option>
      </select>
      <button
        type="button"
        onClick={onClear}
        className="text-sm font-medium text-blue-600 hover:text-blue-700"
      >
        Clear
      </button>
    </div>
  )
}
