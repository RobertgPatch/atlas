import type { PartnershipTrackerSummary } from '../../../../../../packages/types/src/partnership-tracker'

const money = (value: string | null) => value == null ? 'Not entered' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value))
const availability = (value: string) => value.replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\w/g, (letter) => letter.toUpperCase())
const multiple = (value: string | null, status: string) => value == null ? availability(status) : `${Number(value).toFixed(2)}x`
const percent = (value: string | null, status: string) => value == null ? availability(status) : `${(Number(value) * 100).toFixed(2)}%`

export function PerformanceMetricStrip({ summary }: { summary: PartnershipTrackerSummary }) {
  const status = summary.performanceStatus ?? {
    dpi: 'MISSING_CONTRIBUTIONS',
    tvpi: 'MISSING_CONTRIBUTIONS',
    irr: 'MISSING_CONTRIBUTIONS',
    annualizedCashOnCashYield: 'MISSING_INCEPTION_DATE',
    unfundedCommitment: 'MISSING_COMMITMENT',
    unrealizedGain: 'MISSING_OUTSIDE_BASIS',
  }
  const unfundedValue = summary.unfundedCommitmentAmount == null
    ? availability(status.unfundedCommitment)
    : `${money(summary.unfundedCommitmentAmount)} (${percent(summary.unfundedCommitmentPercentage, status.unfundedCommitment)})`
  const metrics = [
    { label: 'Paid-in capital', value: money(summary.totalCapitalContributions), detail: 'K-1 capital contributions' },
    { label: 'Distributions', value: money(summary.totalDistributions), detail: 'Cumulative Box 19' },
    { label: 'Capital account', value: money(summary.latestSectionLCapital), detail: summary.latestTaxYear ? `Section L, ${summary.latestTaxYear}` : 'Latest Section L' },
    { label: 'Outside basis', value: money(summary.latestEndingOutsideBasis), detail: summary.latestTaxYear ? `Ending basis, ${summary.latestTaxYear}` : 'Latest annual position' },
    { label: 'NAV', value: money(summary.latestNav?.amount ?? null), detail: summary.latestNav ? `As of ${summary.latestNav.date}` : 'Latest valuation' },
    { label: 'DPI', value: multiple(summary.dpi, status.dpi), detail: 'Distributions / paid-in' },
    { label: 'TVPI', value: multiple(summary.tvpi, status.tvpi), detail: '(Distributions + NAV) / paid-in' },
    { label: 'IRR', value: percent(summary.irr, status.irr), detail: 'Dated K-1 cash flows and NAV' },
    { label: 'Annualized Cash on Cash Yield', value: percent(summary.annualizedCashOnCashYield, status.annualizedCashOnCashYield), detail: `Through ${summary.performanceAsOfDate}` },
    { label: 'Unfunded commitment', value: unfundedValue, detail: 'Commitment minus paid-in capital' },
    { label: 'Unrealized gain', value: money(summary.unrealizedGain), detail: 'NAV minus ending outside basis' },
  ]
  return <section aria-label="Partnership performance" className="border-y border-gray-200 bg-white"><div className="grid divide-y divide-gray-200 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">{metrics.map((metric) => <div key={metric.label} className="min-w-0 px-4 py-4"><p className="text-xs font-medium text-gray-500">{metric.label}</p><p className="mt-1 break-words text-lg font-semibold text-gray-950" title={metric.value}>{metric.value}</p><p className="mt-1 text-xs text-gray-500">{metric.detail}</p></div>)}</div></section>
}
