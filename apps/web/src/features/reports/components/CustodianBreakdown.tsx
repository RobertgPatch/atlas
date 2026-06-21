import { ClockIcon } from 'lucide-react'
import type { CustodianBreakdownDatum } from '../utils/consolidatedHoldingsAnalytics'

interface CustodianBreakdownProps {
  custodians: CustodianBreakdownDatum[]
}

const barColors: Record<string, string> = {
  Fidelity: 'bg-green-500',
  'Charles Schwab': 'bg-blue-600',
  Vanguard: 'bg-red-600',
  'TD Ameritrade': 'bg-green-600',
  Robinhood: 'bg-emerald-400',
  'E*Trade': 'bg-purple-500',
  'Merrill Lynch': 'bg-blue-700',
}

function formatCompactCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}K`
  return `$${value.toFixed(2)}`
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Not synced'

  const then = new Date(dateStr)
  const diffMs = Date.now() - then.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  if (diffHours < 1) return 'Just now'
  if (diffHours < 24) return `${diffHours}h ago`
  return `${Math.floor(diffHours / 24)}d ago`
}

export function CustodianBreakdown({ custodians }: CustodianBreakdownProps) {
  return (
    <div className="h-full rounded-xl border border-gray-200 bg-white p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            Custodian Breakdown
          </h3>
          <p className="mt-0.5 text-xs text-gray-500">
            {custodians.length} institutions
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {custodians.map((custodian) => (
          <div key={custodian.institution}>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-gray-800 text-[9px] font-bold text-white">
                  {custodian.logo}
                </div>
                <span
                  className="truncate text-sm font-medium text-gray-800"
                  title={custodian.institution}
                >
                  {custodian.institution}
                </span>
                <span className="flex-shrink-0 text-xs text-gray-400">
                  {custodian.accountCount} acct
                  {custodian.accountCount > 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex flex-shrink-0 items-center gap-3">
                <span className="text-sm font-semibold text-gray-900">
                  {formatCompactCurrency(custodian.totalValue)}
                </span>
                <span className="w-12 text-right text-xs text-gray-400">
                  {custodian.percentage.toFixed(1)}%
                </span>
              </div>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-100">
              <div
                className={`h-full rounded-full transition-all ${
                  barColors[custodian.institution] ?? 'bg-gray-400'
                }`}
                style={{ width: `${Math.max(custodian.percentage, 1)}%` }}
              />
            </div>
            <div className="mt-1 flex items-center gap-1">
              <ClockIcon className="h-3 w-3 text-gray-300" />
              <span className="text-[11px] text-gray-400">
                Synced {timeAgo(custodian.lastSyncedAt)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
