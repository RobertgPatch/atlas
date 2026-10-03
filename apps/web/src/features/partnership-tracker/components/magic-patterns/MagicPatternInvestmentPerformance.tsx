import type { InvestmentPerformance, PartnershipAggregationCoveredRatio } from '../../../../../../../packages/types/src/partnership-tracker'
import { MagicPatternActivitySummaryTable } from './MagicPatternActivitySummaryTable'

const money = (value: string | null) => value == null ? 'n/a' : new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', currencySign: 'accounting', maximumFractionDigits: 0, minimumFractionDigits: 0,
}).format(Number(value))
const nonNegativeMoney = (value: string | null) => value == null ? 'n/a' : money(String(Math.max(0, Number(value))))
const multiple = (value: string | null) => value == null ? 'n/a' : `${Number(value).toFixed(2)}x`
const percent = (value: string | null) => value == null ? 'n/a' : `${(Number(value) * 100).toFixed(1)}%`
const date = (value: string | null) => value ? new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: '2-digit', day: '2-digit', year: 'numeric' }).format(new Date(`${value}T00:00:00Z`)) : 'Not recorded'

export function MagicPatternInvestmentPerformance({ performance: p, partnershipName, portfolioCount = 1, cashYieldCoverage, cashOnCashYield = null, cashOnCashEndDate = null }: { portfolioCount?: number; cashYieldCoverage?: PartnershipAggregationCoveredRatio; performance: InvestmentPerformance; partnershipName: string; cashOnCashYield?: string | null; cashOnCashEndDate?: string | null }) {
  const xirrBasis = (kind: keyof InvestmentPerformance['xirrStatus'], basis: string) => p.xirrStatus[kind] === 'AVAILABLE'
    ? basis : p.xirrStatus[kind] === 'INSUFFICIENT_CASH_FLOWS'
      ? `${basis}; requires both inflows and outflows on different dates`
      : `${basis}; no unique XIRR could be determined`
  return <MagicPatternActivitySummaryTable
    title="Investment Performance"
    description="Settled activity across all dates · USD. Actual fees and carry; XIRR uses dated cash flows and a 365-day year. Announced activity is excluded."
    ariaLabel={`Investment Performance for ${partnershipName}`}
    basisInTooltip
    groups={[
      { label: 'Inputs', rows: [
        { label: 'Final liquidation date', value: date(p.finalLiquidationDate), basis: 'From a final liquidation distribution or Edit partnership; blank for an ongoing investment', context: '' },
        { label: 'Committed capital ($)', value: money(p.committedCapital), basis: 'Current recorded capital commitment', context: '' },
        { label: 'Residual / ending valuation ($)', value: money(p.residualValue), basis: 'Unrealized NAV remaining; defaults to zero when no valuation is recorded', context: p.residualValueDate ? date(p.residualValueDate) : 'No valuation; using $0' },
      ] },
      { label: 'Results', rows: [
        { label: 'Cash-on-cash yield', value: percent(cashOnCashYield), basis: portfolioCount > 1 ? 'Average of partnership cash-on-cash yields, weighted by paid-in capital. Each yield uses that partnership’s inception and liquidation dates.' : 'Called capital ÷ gross distributions (including recallable) ÷ years from inception (days ÷ 365.25)', context: portfolioCount > 1 && cashYieldCoverage ? `${cashYieldCoverage.numeratorKnownCount} of ${cashYieldCoverage.totalCount} owner records covered` : `${p.finalLiquidationDate ? 'Through liquidation' : 'As of'} ${date(cashOnCashEndDate)}` },
        { label: 'Paid-in capital (contributions)', value: money(p.paidInCapital), basis: 'Total gross contributions', context: 'All settled dates' },
        { label: 'Gross distributions', value: money(p.grossDistributions), basis: 'Before fees & carry; includes recallable distributions', context: 'All settled dates' },
        { label: 'Fees & carry', value: money(p.feesAndCarry), basis: 'Actual deductions from the activity schedule; not estimated management fees', context: 'All settled dates' },
        { label: 'Net distributions to LP', value: money(p.netDistributions), basis: 'Gross distributions less fees & carry', context: '' },
        { label: '% of commitment called', value: percent(p.commitmentCalled), basis: 'Paid-in capital ÷ committed capital', context: '' },
        { label: 'Gross MOIC (x)', value: multiple(p.grossMoic), basis: 'Gross distributions ÷ paid-in capital', context: '' },
        { label: 'Net MOIC / DPI (x)', value: multiple(p.netMoicDpi), basis: 'Net distributions ÷ paid-in capital; excludes residual value', context: '' },
        { label: 'Gross XIRR', value: percent(p.grossXirr), basis: xirrBasis('gross', 'Before fees & carry; excludes residual value'), context: '' },
        { label: 'Net XIRR', value: percent(p.netXirr), basis: xirrBasis('net', 'After fees & carry; excludes residual value'), context: '' },
        { label: 'Net gain / (loss) ($)', value: nonNegativeMoney(p.netGain), basis: 'Net distributions less paid-in capital, with a minimum of zero; excludes residual value', context: '' },
        { label: 'Holding period to liquidation (years)', value: p.holdingPeriodYears == null ? 'n/a' : Number(p.holdingPeriodYears).toFixed(2), basis: 'Days from first settled cash flow to final liquidation ÷ 365', context: p.holdingPeriodYears == null ? 'Record a liquidation date on or after the last cash flow' : '' },
        { label: 'RVPI — residual value / paid-in (x)', value: multiple(p.rvpi), basis: 'Ending / residual valuation ÷ paid-in capital', context: '' },
        { label: 'TVPI — total value / paid-in (x)', value: multiple(p.tvpi), basis: 'Net DPI + RVPI; distributions plus residual value', context: '' },
        { label: 'Net XIRR incl. residual value', value: percent(p.netXirrIncludingResidual), basis: xirrBasis('includingResidual', 'Net cash flows plus residual value as a terminal inflow'), context: p.xirrTerminalDate ? date(p.xirrTerminalDate) : '' },
      ] },
    ]}
  />
}
