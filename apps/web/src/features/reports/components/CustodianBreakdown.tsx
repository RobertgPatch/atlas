import { CheckIcon, ClockIcon, MinusIcon } from 'lucide-react'
import type { CustodianBreakdownDatum } from '../utils/consolidatedHoldingsAnalytics'

interface CustodianBreakdownProps {
  currencyCode?: string
  custodians: CustodianBreakdownDatum[]
  selectedAccountIds: readonly string[]
  onToggleInstitution: (accountIds: string[]) => void
  onToggleAccount: (accountId: string) => void
  onShowAll: () => void
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

function formatCompactCurrency(value: number, currencyCode = 'USD'): string {
  if (currencyCode !== 'USD') return new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode, notation: 'compact', maximumFractionDigits: 1 }).format(value)
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}K`
  return `$${Math.round(value).toLocaleString()}`
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

function SelectionMark({checked,mixed=false}:{checked:boolean;mixed?:boolean}){
  return <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border transition ${checked||mixed?'border-primary bg-primary text-white':'border-slate-300 bg-white text-transparent'}`}>
    {mixed?<MinusIcon className="h-3.5 w-3.5"/>:<CheckIcon className="h-3.5 w-3.5"/>}
  </span>
}

export function CustodianBreakdown({ custodians, currencyCode = 'USD', selectedAccountIds, onToggleInstitution, onToggleAccount, onShowAll }: CustodianBreakdownProps) {
  const selected=new Set(selectedAccountIds)
  const totalAccounts=custodians.reduce((total,custodian)=>total+custodian.accounts.length,0)
  const allSelected=selected.size===totalAccounts
  return (
    <div className="h-full rounded-xl border border-gray-200 bg-white p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            Custodian Breakdown
          </h3>
          <p className="mt-0.5 text-xs text-gray-500">
            {allSelected?`${custodians.length} institutions · all ${totalAccounts} accounts`:`Viewing ${selected.size} of ${totalAccounts} accounts`}
          </p>
        </div>
        {!allSelected?<button type="button" onClick={onShowAll} className="rounded-md px-2 py-1 text-xs font-semibold text-primary transition hover:bg-primary/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">Show all</button>:null}
      </div>

      <div className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
        {custodians.map((custodian) => {
          const accountIds=custodian.accounts.map(account=>account.id)
          const selectedCount=accountIds.filter(accountId=>selected.has(accountId)).length
          const checked=selectedCount===accountIds.length
          const mixed=selectedCount>0&&!checked
          return <div key={custodian.institution} className={`overflow-hidden rounded-xl border transition ${checked?'border-primary/30 bg-primary/[0.025]':mixed?'border-primary/20 bg-primary/[0.015]':'border-slate-200 bg-white'}`}>
            <button type="button" role="checkbox" aria-checked={mixed?'mixed':checked} aria-label={`${checked?'Hide':'Show'} all ${custodian.institution} accounts`} onClick={()=>onToggleInstitution(accountIds)} className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition hover:bg-slate-50/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40">
              <div className="flex min-w-0 items-center gap-2.5">
                <SelectionMark checked={checked} mixed={mixed}/>
                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-gray-800 text-[9px] font-bold text-white">
                  {custodian.logo}
                </div>
                <div className="min-w-0"><span className="block truncate text-sm font-semibold text-gray-800" title={custodian.institution}>{custodian.institution}</span><span className="block text-[11px] text-gray-400">{selectedCount}/{custodian.accountCount} accounts selected</span></div>
              </div>
              <div className="flex flex-shrink-0 items-center gap-3">
                <span className="text-sm font-semibold text-gray-900">
                  {formatCompactCurrency(custodian.totalValue, currencyCode)}
                </span>
                <span className="w-12 text-right text-xs text-gray-400">
                  {custodian.percentage.toFixed(1)}%
                </span>
              </div>
            </button>
            <div className="mx-3 h-1.5 overflow-hidden rounded-full bg-gray-100">
              <div
                className={`h-full rounded-full transition-all ${
                  barColors[custodian.institution] ?? 'bg-gray-400'
                }`}
                style={{ width: `${Math.max(custodian.percentage, 1)}%` }}
              />
            </div>
            <div className="mx-3 mt-1 flex items-center gap-1">
              <ClockIcon className="h-3 w-3 text-gray-300" />
              <span className="text-[11px] text-gray-400">
                Synced {timeAgo(custodian.lastSyncedAt)}
              </span>
            </div>
            <div className="mt-2 border-t border-slate-100 bg-slate-50/55 p-1.5">
              {custodian.accounts.map(account=>{
                const accountChecked=selected.has(account.id)
                return <button key={account.id} type="button" role="checkbox" aria-checked={accountChecked} aria-label={`${accountChecked?'Hide':'Show'} ${custodian.institution} ${account.name}${account.mask?` ending ${account.mask}`:''}`} onClick={()=>onToggleAccount(account.id)} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
                  <SelectionMark checked={accountChecked}/>
                  <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium text-slate-700">{account.name}</span>{account.mask?<span className="block text-[10px] tracking-wide text-slate-400">····{account.mask}</span>:null}</span>
                  <span className="text-right"><span className="block text-xs font-semibold tabular-nums text-slate-700">{formatCompactCurrency(account.totalValue,currencyCode)}</span><span className="block text-[10px] tabular-nums text-slate-400">{account.percentage.toFixed(1)}%</span></span>
                </button>
              })}
            </div>
          </div>
        })}
      </div>
    </div>
  )
}
