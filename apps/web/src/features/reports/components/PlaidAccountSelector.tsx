import { useEffect, useMemo, useState } from 'react'
import { BuildingIcon, CheckIcon, LinkIcon, XIcon } from 'lucide-react'
import type { PlaidInvestmentAccount } from '../../../../../../packages/types/src/plaid'

interface PlaidAccountSelectorProps {
  isOpen: boolean
  accounts: PlaidInvestmentAccount[]
  onClose: () => void
  onConfirm: (selectedAccountIds: string[]) => void
  onConnect: () => void
  isConnecting?: boolean
  isSaving?: boolean
  errorMessage?: string | null
}

export function PlaidAccountSelector({
  isOpen,
  accounts,
  onClose,
  onConfirm,
  onConnect,
  isConnecting = false,
  isSaving = false,
  errorMessage = null,
}: PlaidAccountSelectorProps) {
  const [localSelected, setLocalSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    setLocalSelected(
      new Set(
        accounts
          .filter((account) => account.selectedForHoldingsReport)
          .map((account) => account.id),
      ),
    )
  }, [accounts, isOpen])

  const grouped = useMemo(() => {
    const groups = new Map<string, PlaidInvestmentAccount[]>()
    for (const account of accounts) {
      const rows = groups.get(account.custodianName) ?? []
      rows.push(account)
      groups.set(account.custodianName, rows)
    }
    return [...groups.entries()]
  }, [accounts])

  if (!isOpen) return null

  const allSelected = accounts.length > 0 && localSelected.size === accounts.length

  const toggleAccount = (id: string) => {
    setLocalSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    setLocalSelected(allSelected ? new Set() : new Set(accounts.map((account) => account.id)))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close connected accounts"
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100">
              <LinkIcon className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Connected Accounts</h2>
              <p className="text-sm text-gray-500">
                Select accounts to include in your report
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-3">
          <span className="text-sm text-gray-500">
            {localSelected.size} of {accounts.length} accounts selected
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onConnect}
              disabled={isConnecting}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 transition-colors hover:text-blue-700"
            >
              <BuildingIcon className="h-4 w-4" />
              {isConnecting ? 'Connecting...' : 'Connect'}
            </button>
            <button
              type="button"
              onClick={toggleAll}
              className="text-sm font-medium text-blue-600 transition-colors hover:text-blue-700"
            >
              {allSelected ? 'Deselect All' : 'Select All'}
            </button>
          </div>
        </div>

        {errorMessage && (
          <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4">
          {grouped.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500">
              No investment accounts connected yet.
            </div>
          ) : (
            grouped.map(([custodian, custodianAccounts]) => (
              <div key={custodian}>
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-700 text-[10px] font-bold text-white">
                    {custodian.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="text-sm font-semibold text-gray-700">{custodian}</span>
                </div>
                <div className="space-y-1.5">
                  {custodianAccounts.map((account) => {
                    const isSelected = localSelected.has(account.id)
                    return (
                      <button
                        key={account.id}
                        type="button"
                        onClick={() => toggleAccount(account.id)}
                        className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all ${
                          isSelected
                            ? 'border-blue-200 bg-blue-50/50'
                            : 'border-gray-200 bg-white hover:bg-gray-50'
                        }`}
                      >
                        <div
                          className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
                            isSelected ? 'border-blue-600 bg-blue-600' : 'border-gray-300'
                          }`}
                        >
                          {isSelected && <CheckIcon className="h-3.5 w-3.5 text-white" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-gray-900">
                            {account.name}
                          </div>
                          <div className="text-xs text-gray-500">
                            {account.mask ? `****${account.mask}` : 'No mask'} ·{' '}
                            {account.subtype ?? account.type}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={() => onConfirm([...localSelected])}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? 'Applying...' : `Apply Selection (${localSelected.size})`}
          </button>
        </div>
      </div>
    </div>
  )
}
