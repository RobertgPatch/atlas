import type { InvestmentPerformance } from './partnership-tracker.contracts.js'
import { solveIrr } from './partnership-performance.js'

type CashFlow = {
  kind: 'CAPITAL_CALL' | 'DISTRIBUTION' | 'RECALLABLE_DISTRIBUTION'
  activityDate: string
  /** Gross cash paid or distributed, before fees and carry. */
  amount: string
  feesAndCarry?: string
  settlementStatus?: 'ANNOUNCED' | 'SETTLED'
}

// Four decimal places preserve the workbook's half-cent gross distribution/fee.
const units = (value: string): bigint => {
  const [whole = '0', fraction = ''] = value.replace(/^-/, '').split('.')
  const parsed = BigInt(whole) * 10_000n + BigInt((fraction + '0000').slice(0, 4))
  return value.startsWith('-') ? -parsed : parsed
}
const money = (value: bigint): string => {
  const absolute = value < 0n ? -value : value
  return `${value < 0n ? '-' : ''}${absolute / 10_000n}.${String(absolute % 10_000n).padStart(4, '0')}`
}
const sum = (values: bigint[]) => values.reduce((total, value) => total + value, 0n)
const ratio = (numerator: bigint, denominator: bigint) => denominator === 0n ? null : (Number(numerator) / Number(denominator)).toFixed(8)
const timestamp = (date: string) => Date.parse(`${date}T00:00:00Z`)

/** Investment Anaylsis_Project Jackson.xlsx, No Target!B9:B22 / A26:I32. */
export function calculateInvestmentPerformance(input: {
  cashFlowEvents: CashFlow[]
  committedCapital: string | null
  latestNav: { amount: string; date: string } | null
  finalLiquidationDate?: string | null
}): InvestmentPerformance {
  const flows = input.cashFlowEvents.filter((flow) => flow.settlementStatus !== 'ANNOUNCED')
    .sort((a, b) => a.activityDate.localeCompare(b.activityDate))
    .map((flow) => {
      const rawAmount = units(flow.amount)
      const amount = rawAmount < 0n ? -rawAmount : rawAmount
      const gross = flow.kind === 'CAPITAL_CALL' ? -amount : amount
      const fee = units(flow.feesAndCarry ?? '0')
      return { date: flow.activityDate, contribution: flow.kind === 'CAPITAL_CALL', gross, net: gross - fee, fee }
    })
  const paidIn = -sum(flows.filter((flow) => flow.contribution).map((flow) => flow.gross))
  const grossDistributions = sum(flows.filter((flow) => !flow.contribution).map((flow) => flow.gross))
  const fees = -sum(flows.map((flow) => flow.fee))
  const netDistributions = grossDistributions + fees
  const netGain = netDistributions > paidIn ? netDistributions - paidIn : 0n
  const residual = units(input.latestNav?.amount ?? '0')
  const gross = solveIrr(flows.map((flow) => ({ date: flow.date, cents: flow.gross })), 365)
  const netFlows = flows.map((flow) => ({ date: flow.date, cents: flow.net }))
  const net = solveIrr(netFlows, 365)
  // Never place a terminal valuation before a later cash flow. Without a recorded
  // liquidation date, use the valuation date (or last cash flow when NAV is zero).
  const terminalDate = [input.finalLiquidationDate ?? input.latestNav?.date, flows.at(-1)?.date]
    .filter((value): value is string => Boolean(value)).sort().at(-1) ?? null
  const inclusive = solveIrr(terminalDate ? [...netFlows, { date: terminalDate, cents: residual }] : netFlows, 365)
  const finalDate = input.finalLiquidationDate ?? null
  const firstDate = flows[0]?.date
  return {
    finalLiquidationDate: finalDate,
    committedCapital: input.committedCapital,
    residualValue: money(residual),
    residualValueDate: input.latestNav?.date ?? null,
    paidInCapital: money(paidIn),
    grossDistributions: money(grossDistributions),
    feesAndCarry: money(fees),
    netDistributions: money(netDistributions),
    commitmentCalled: input.committedCapital == null ? null : ratio(paidIn, units(input.committedCapital)),
    grossMoic: ratio(grossDistributions, paidIn),
    netMoicDpi: ratio(netDistributions, paidIn),
    grossXirr: gross.value,
    netXirr: net.value,
    netGain: money(netGain),
    holdingPeriodYears: finalDate && firstDate && finalDate >= flows.at(-1)!.date
      ? ((timestamp(finalDate) - timestamp(firstDate)) / (365 * 86_400_000)).toFixed(8) : null,
    rvpi: ratio(residual, paidIn),
    tvpi: ratio(netDistributions + residual, paidIn),
    netXirrIncludingResidual: inclusive.value,
    xirrTerminalDate: terminalDate,
    xirrStatus: { gross: gross.status, net: net.status, includingResidual: inclusive.status },
  }
}
