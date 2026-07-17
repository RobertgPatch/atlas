import type { PartnershipPortfolioRollup } from '../../../../../../../packages/types/src/partnership-tracker'
import { formatLedgerDate, formatMultiple, formatWholeMoney, humanizeCode } from './aggregationFormatters'

export interface PartnershipRollupMetric {
  label: string
  value: string | null
  detail: string
}

const coverage = (known: number, total: number) => `${known} of ${total} partnerships`

export function partnershipRollupMetrics(rollup: PartnershipPortfolioRollup): PartnershipRollupMetric[] {
  const navDetail = rollup.navValuationRange.earliest && rollup.navValuationRange.latest
    ? `${formatLedgerDate(rollup.navValuationRange.earliest)} - ${formatLedgerDate(rollup.navValuationRange.latest)}`
    : 'No NAV dates in scope'

  return [
    { label: 'Committed capital', value: formatWholeMoney(rollup.committedCapital.amount), detail: coverage(rollup.committedCapital.knownCount, rollup.committedCapital.totalCount) },
    { label: 'Paid-in capital', value: formatWholeMoney(rollup.paidInCapital.amount), detail: coverage(rollup.paidInCapital.knownCount, rollup.paidInCapital.totalCount) },
    { label: 'Distributions', value: formatWholeMoney(rollup.distributions.amount ?? '0.00'), detail: coverage(rollup.distributions.knownCount, rollup.distributions.totalCount) },
    { label: 'Latest NAV', value: formatWholeMoney(rollup.latestNav.amount), detail: navDetail },
    { label: 'Unfunded', value: formatWholeMoney(rollup.unfundedCommitment.amount), detail: coverage(rollup.unfundedCommitment.knownCount, rollup.unfundedCommitment.totalCount) },
    { label: 'Portfolio DPI', value: formatMultiple(rollup.dpi.value), detail: humanizeCode(rollup.dpi.status) },
    { label: 'Portfolio TVPI', value: formatMultiple(rollup.tvpi.value), detail: humanizeCode(rollup.tvpi.status) },
  ]
}
