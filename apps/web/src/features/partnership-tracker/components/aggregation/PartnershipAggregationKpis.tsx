import type { PartnershipPortfolioRollup } from '../../../../../../../packages/types/src/partnership-tracker'
import { formatLedgerDate } from './aggregationFormatters'
import { partnershipRollupMetrics } from './partnershipAggregationRollup'

export function PartnershipAggregationKpis({ rollup }: { rollup: PartnershipPortfolioRollup }) {
  const metrics = partnershipRollupMetrics(rollup)

  return (
    <section aria-labelledby="portfolio-rollup-title" className="overflow-hidden border-y border-gray-300 bg-white">
      <div className="flex items-baseline justify-between gap-4 border-b border-gray-200 bg-gray-950 px-4 py-3 text-white sm:px-5">
        <h2 id="portfolio-rollup-title" className="font-serif text-lg tracking-wide">Filtered portfolio rollup</h2>
        <p className="text-xs uppercase tracking-[0.18em] text-gray-400">As of {formatLedgerDate(rollup.asOfDate)}</p>
      </div>
      <dl className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-7">
        {metrics.map((metric) => (
          <div key={metric.label} className="min-w-0 border-b border-r border-gray-200 px-4 py-4 last:border-r-0 sm:px-5 xl:border-b-0">
            <dt className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-gray-500">{metric.label}</dt>
            <dd className="mt-2 truncate font-serif text-xl font-semibold tabular-nums text-gray-950" title={metric.value ?? 'Not available'}>{metric.value ?? '-'}</dd>
            <dd className="mt-1 min-h-8 text-xs leading-4 text-gray-500">{metric.detail}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
