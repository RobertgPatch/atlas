import type { K1TrackerCashFlowEvent } from '../../../../../../../packages/types/src/k1-tracker'
import { inKindLotsFor } from './MagicPatternOperationalUtils'
import { MagicCard, MagicStatusBadge } from './MagicPatternPrimitives'

const money = (value: number): string => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(value)

const shares = (value: number): string => new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 8,
}).format(value)

const date = (value: string): string => new Intl.DateTimeFormat('en-US', {
  month: '2-digit',
  day: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
}).format(new Date(`${value}T00:00:00Z`))

export function MagicPatternInKindPositionsCard({ events }: { events: K1TrackerCashFlowEvent[] }) {
  const lots = inKindLotsFor(events)

  return (
    <MagicCard className="overflow-hidden" data-testid="securities-received-in-kind">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">Securities received in kind</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Distribution lots settled as securities, with the cost basis carried over from the fund.
            Values are stated as of each distribution date.
          </p>
        </div>
        <MagicStatusBadge tone="info">{lots.length} lot{lots.length === 1 ? '' : 's'}</MagicStatusBadge>
      </div>

      {lots.length === 0 ? (
        <p className="border-t border-slate-200 bg-slate-50 px-5 py-6 text-sm text-slate-500">
          No in-kind distributions recorded. Cash-settled activity appears in the ledger above.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[70rem] border-collapse text-sm">
            <caption className="sr-only">
              Securities received in kind, with share counts, cost basis, and distribution value in USD
            </caption>
            <thead>
              <tr className="border-y border-slate-200 bg-slate-100 text-left text-[0.65rem] font-semibold uppercase tracking-wide text-slate-600">
                <th scope="col" className="px-5 py-2">Distribution date</th>
                <th scope="col" className="px-5 py-2">Security</th>
                <th scope="col" className="px-5 py-2 text-right">Shares</th>
                <th scope="col" className="px-5 py-2 text-right">Cost basis / share (USD)</th>
                <th scope="col" className="px-5 py-2 text-right">Total cost basis (USD)</th>
                <th scope="col" className="px-5 py-2 text-right">FMV / share (USD)</th>
                <th scope="col" className="px-5 py-2 text-right">Distribution value (USD)</th>
              </tr>
            </thead>
            <tbody>
              {lots.map(({ activity, security }, index) => {
                const totalBasis = security.shares * security.costBasisPerShare
                const totalValue = security.shares * security.fmvPerShare
                return (
                  <tr key={activity.id} className={`border-b border-slate-200 last:border-b-0 ${index % 2 ? 'bg-slate-50' : 'bg-white'}`}>
                    <td className="whitespace-nowrap px-5 py-2.5 font-mono text-xs tabular-nums text-slate-600">{date(activity.activityDate)}</td>
                    <td className="px-5 py-2.5">
                      <p className="font-mono text-xs font-semibold text-slate-950">{security.ticker}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{security.name}</p>
                    </td>
                    <td className="px-5 py-2.5 text-right font-mono text-xs tabular-nums text-slate-950">{shares(security.shares)}</td>
                    <td className="px-5 py-2.5 text-right font-mono text-xs tabular-nums text-slate-600">{money(security.costBasisPerShare)}</td>
                    <td className="px-5 py-2.5 text-right font-mono text-xs tabular-nums text-slate-950">{money(totalBasis)}</td>
                    <td className="px-5 py-2.5 text-right font-mono text-xs tabular-nums text-slate-600">{money(security.fmvPerShare)}</td>
                    <td className="px-5 py-2.5 text-right font-mono text-xs font-semibold tabular-nums text-emerald-700">{money(totalValue)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </MagicCard>
  )
}
