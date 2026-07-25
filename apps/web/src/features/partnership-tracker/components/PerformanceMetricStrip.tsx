import type { PartnershipTrackerSummary } from '../../../../../../packages/types/src/partnership-tracker'

const money = (value: string | null) => value == null ? 'Not entered' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(value))
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
  }
  const unfundedValue = summary.unfundedCommitmentAmount == null
    ? availability(status.unfundedCommitment)
    : `${money(summary.unfundedCommitmentAmount)} (${percent(summary.unfundedCommitmentPercentage, status.unfundedCommitment)})`
  const metrics = [
    { label: 'Total invested', value: money(summary.totalCapitalContributions), detail: 'Dated capital calls' },
    { label: 'Non-recallable distributions', value: money(summary.totalDistributions), detail: 'Included in DPI and TVPI' },
    { label: 'Recallable distributions', value: money(summary.totalRecallableDistributions), detail: 'Included in XIRR; excluded from DPI and TVPI' },
    { label: 'NAV', value: money(summary.latestNav?.amount ?? null), detail: summary.latestNav ? `Actual valuation as of ${summary.latestNav.date}` : 'No valuation entered' },
    { label: 'DPI', value: multiple(summary.dpi, status.dpi), detail: 'Non-recallable distributions / total invested' },
    { label: 'TVPI', value: multiple(summary.tvpi, status.tvpi), detail: '(Non-recallable distributions + NAV) / total invested' },
    { label: summary.irrType === 'SIMPLIFIED' ? 'Simplified return' : 'XIRR', value: percent(summary.displayIrr, status.irr), detail: summary.irrUsesCarriedForwardNav ? `NAV carried through ${summary.irrTerminalDate}` : 'Exact-dated operational flows and NAV' },
    { label: 'Annualized Cash on Cash Yield', value: percent(summary.annualizedCashOnCashYield, status.annualizedCashOnCashYield), detail: `Through ${summary.performanceAsOfDate}` },
    { label: 'Unfunded commitment', value: unfundedValue, detail: 'Commitment minus paid-in capital' },
  ]
  return <section aria-label="Partnership performance" className="border-y border-gray-200 bg-white"><div className="grid divide-y divide-gray-200 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">{metrics.map((metric) => <div key={metric.label} className="min-w-0 px-4 py-4"><p className="text-xs font-medium text-gray-500">{metric.label}</p><p className="mt-1 break-words text-lg font-semibold text-gray-950" title={metric.value}>{metric.value}</p><p className="mt-1 text-xs text-gray-500">{metric.detail}</p></div>)}</div></section>
}
