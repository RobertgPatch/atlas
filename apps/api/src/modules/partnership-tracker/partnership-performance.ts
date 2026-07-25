import { centsToMoney, moneyToCents } from '../k1-tracker/k1-tracker.calculation.js'
import type {
  PartnershipTrackerMetricAvailability,
  PartnershipTrackerPerformanceStatus,
} from './partnership-tracker.contracts.js'

export type PartnershipCashFlowEvent = {
  kind: 'CAPITAL_CALL' | 'DISTRIBUTION' | 'RECALLABLE_DISTRIBUTION'
  activityDate: string
  amount: string
}

export type PartnershipPerformanceInput = {
  cashFlowEvents: PartnershipCashFlowEvent[]
  latestNav: { amount: string; date: string } | null
  inceptionDate?: string | null
  currentCommitment?: string | null
  asOfDate?: string
}

export type PartnershipPerformance = {
  totalCapitalContributions: string
  totalDistributions: string
  totalRecallableDistributions: string
  dpi: string | null
  tvpi: string | null
  irr: string | null
  irrTerminalDate: string | null
  irrUsesCarriedForwardNav: boolean
  simplifiedIrr: string | null
  displayIrr: string | null
  irrType: 'XIRR' | 'SIMPLIFIED' | null
  vintageYear: number | null
  annualizedCashOnCashYield: string | null
  performanceAsOfDate: string
  unfundedCommitmentAmount: string | null
  unfundedCommitmentPercentage: string | null
  performanceStatus: PartnershipTrackerPerformanceStatus
  extendedAvailability: {
    simplifiedIrr: PartnershipTrackerMetricAvailability
  }
}

const zero = 0n
const ratioScale = 100_000_000n
const millisecondsPerDay = 24 * 60 * 60 * 1000
const absolute = (value: bigint): bigint => value < zero ? -value : value
const sum = (values: bigint[]): bigint => values.reduce((total, value) => total + value, zero)
const utcTimestamp = (date: string): number => Date.parse(`${date}T00:00:00Z`)
const today = (): string => new Date().toISOString().slice(0, 10)

const defaultStatus = (): PartnershipTrackerPerformanceStatus => ({
  dpi: 'MISSING_CONTRIBUTIONS',
  tvpi: 'MISSING_CONTRIBUTIONS',
  irr: 'MISSING_CONTRIBUTIONS',
  annualizedCashOnCashYield: 'MISSING_CONTRIBUTIONS',
  unfundedCommitment: 'MISSING_CONTRIBUTIONS',
})

const fixedRatio = (value: number): string | null =>
  Number.isFinite(value) ? value.toFixed(8) : null

const ratio = (numerator: bigint, denominator: bigint): string => {
  const negative = (numerator < zero) !== (denominator < zero)
  const numeratorAbsolute = absolute(numerator)
  const denominatorAbsolute = absolute(denominator)
  const scaled = (numeratorAbsolute * ratioScale + denominatorAbsolute / 2n) / denominatorAbsolute
  const sign = negative && scaled !== zero ? '-' : ''
  return `${sign}${scaled / ratioScale}.${String(scaled % ratioScale).padStart(8, '0')}`
}

const npv = (rate: number, flows: Array<{ at: number; cents: bigint }>, start: number): number => flows.reduce((total, flow) => {
  const years = (flow.at - start) / (365.25 * millisecondsPerDay)
  return total + Number(flow.cents) / Math.pow(1 + rate, years)
}, 0)

const bisect = (low: number, high: number, flows: Array<{ at: number; cents: bigint }>, start: number): number | null => {
  let lowValue = npv(low, flows, start)
  const highValue = npv(high, flows, start)
  if (!Number.isFinite(lowValue) || !Number.isFinite(highValue) || lowValue === 0 && highValue === 0) return null
  if (Math.sign(lowValue) === Math.sign(highValue)) return null
  let left = low
  let right = high
  for (let iteration = 0; iteration < 120; iteration += 1) {
    const mid = (left + right) / 2
    const midValue = npv(mid, flows, start)
    if (!Number.isFinite(midValue)) return null
    if (Math.abs(midValue) < 1e-9) return mid
    if (Math.sign(lowValue) === Math.sign(midValue)) {
      left = mid
      lowValue = midValue
    } else {
      right = mid
    }
  }
  return (left + right) / 2
}

const solveIrr = (flows: Array<{ date: string; cents: bigint }>): { value: string | null; status: PartnershipTrackerMetricAvailability } => {
  const ordered = flows
    .filter((flow) => flow.cents !== zero)
    .map((flow) => ({ ...flow, at: utcTimestamp(flow.date) }))
    .sort((left, right) => left.at - right.at)
  if (!ordered.some((flow) => flow.cents < zero) || !ordered.some((flow) => flow.cents > zero)) {
    return { value: null, status: 'INSUFFICIENT_CASH_FLOWS' }
  }

  const start = ordered[0]!.at
  const rates = [-0.9999]
  for (let rate = -0.99; rate <= 1; rate += 0.01) rates.push(Number(rate.toFixed(4)))
  for (let rate = 1.25; rate <= 1_000; rate = rate < 10 ? rate + 0.25 : rate < 100 ? rate + 2.5 : rate + 25) rates.push(rate)
  const roots: number[] = []
  for (let index = 1; index < rates.length; index += 1) {
    const found = bisect(rates[index - 1]!, rates[index]!, ordered, start)
    if (found != null && !roots.some((root) => Math.abs(root - found) < 0.0000001)) roots.push(found)
  }
  if (roots.length !== 1) return { value: null, status: 'AMBIGUOUS_IRR' }
  return { value: roots[0]!.toFixed(8), status: 'AVAILABLE' }
}

export const composePartnershipPerformance = ({
  cashFlowEvents,
  latestNav,
  inceptionDate = null,
  currentCommitment = null,
  asOfDate = today(),
}: PartnershipPerformanceInput): PartnershipPerformance => {
  const eligibleEvents = cashFlowEvents.filter((event) => event.activityDate <= asOfDate)
  const calls = eligibleEvents.filter((event) => event.kind === 'CAPITAL_CALL').map((event) => ({
    date: event.activityDate,
    cents: absolute(moneyToCents(event.amount) ?? zero),
  }))
  const distributions = eligibleEvents.filter((event) => event.kind === 'DISTRIBUTION').map((event) => ({
    date: event.activityDate,
    cents: absolute(moneyToCents(event.amount) ?? zero),
  }))
  const recallableDistributions = eligibleEvents.filter((event) => event.kind === 'RECALLABLE_DISTRIBUTION').map((event) => ({
    date: event.activityDate,
    cents: absolute(moneyToCents(event.amount) ?? zero),
  }))
  const totalContributionCents = sum(calls.map((item) => item.cents))
  const totalDistributionCents = sum(distributions.map((item) => item.cents))
  const totalRecallableDistributionCents = sum(recallableDistributions.map((item) => item.cents))
  const eligibleNav = latestNav && latestNav.date <= asOfDate ? latestNav : null
  const navCents = moneyToCents(eligibleNav?.amount)
  const commitmentCents = moneyToCents(currentCommitment)
  const status = defaultStatus()

  if (totalContributionCents > zero) status.dpi = 'AVAILABLE'
  if (totalContributionCents > zero) status.tvpi = eligibleNav ? 'AVAILABLE' : 'MISSING_NAV'

  let irr: string | null = null
  let irrTerminalDate: string | null = null
  let irrUsesCarriedForwardNav = false
  if (totalContributionCents > zero) {
    if (!eligibleNav) {
      status.irr = 'MISSING_NAV'
    } else {
      const cashFlows = new Map<string, bigint>()
      for (const entry of calls) cashFlows.set(entry.date, (cashFlows.get(entry.date) ?? zero) - entry.cents)
      for (const entry of [...distributions, ...recallableDistributions]) {
        cashFlows.set(entry.date, (cashFlows.get(entry.date) ?? zero) + entry.cents)
      }
      const latestCashDate = cashFlows.size ? [...cashFlows.keys()].sort().at(-1)! : eligibleNav.date
      irrTerminalDate = eligibleNav.date > latestCashDate ? eligibleNav.date : latestCashDate
      irrUsesCarriedForwardNav = irrTerminalDate > eligibleNav.date
      cashFlows.set(irrTerminalDate, (cashFlows.get(irrTerminalDate) ?? zero) + (navCents ?? zero))
      const result = solveIrr([...cashFlows.entries()].map(([date, cents]) => ({ date, cents })))
      irr = result.value
      status.irr = result.status
    }
  }

  const earliestCallDate = calls.map((call) => call.date).sort()[0] ?? null
  const vintageYear = earliestCallDate == null ? null : Number(earliestCallDate.slice(0, 4))
  let simplifiedIrr: string | null = null
  let simplifiedStatus: PartnershipTrackerMetricAvailability = totalContributionCents > zero
    ? eligibleNav ? 'INSUFFICIENT_HOLDING_PERIOD' : 'MISSING_NAV'
    : 'MISSING_CONTRIBUTIONS'
  if (earliestCallDate && eligibleNav && totalContributionCents > zero) {
    const holdingDays = Math.floor((utcTimestamp(asOfDate) - utcTimestamp(earliestCallDate)) / millisecondsPerDay)
    const terminalValue = Number(totalDistributionCents + (navCents ?? zero)) / Number(totalContributionCents)
    if (holdingDays >= 1 && terminalValue > 0) {
      simplifiedIrr = fixedRatio(Math.pow(terminalValue, 365.25 / holdingDays) - 1)
      simplifiedStatus = simplifiedIrr == null ? 'INSUFFICIENT_CASH_FLOWS' : 'AVAILABLE'
    }
  }
  const displayIrr = irr ?? simplifiedIrr
  const irrType = irr != null ? 'XIRR' : simplifiedIrr != null ? 'SIMPLIFIED' : null

  let annualizedCashOnCashYield: string | null = null
  const yieldStart = earliestCallDate ?? inceptionDate
  if (!yieldStart) {
    status.annualizedCashOnCashYield = 'MISSING_INCEPTION_DATE'
  } else if (totalContributionCents <= zero) {
    status.annualizedCashOnCashYield = 'MISSING_CONTRIBUTIONS'
  } else {
    const elapsedDays = Math.max(1, Math.round((utcTimestamp(asOfDate) - utcTimestamp(yieldStart)) / millisecondsPerDay))
    annualizedCashOnCashYield = ratio(totalDistributionCents * 1461n, totalContributionCents * BigInt(elapsedDays) * 4n)
    status.annualizedCashOnCashYield = 'AVAILABLE'
  }

  let unfundedCommitmentAmount: string | null = null
  let unfundedCommitmentPercentage: string | null = null
  if (commitmentCents == null) {
    status.unfundedCommitment = 'MISSING_COMMITMENT'
  } else {
    const unfundedCents = commitmentCents - totalContributionCents
    unfundedCommitmentAmount = centsToMoney(unfundedCents)
    if (commitmentCents === zero) {
      status.unfundedCommitment = 'MISSING_COMMITMENT'
    } else {
      unfundedCommitmentPercentage = ratio(unfundedCents, commitmentCents)
      status.unfundedCommitment = 'AVAILABLE'
    }
  }

  return {
    totalCapitalContributions: centsToMoney(totalContributionCents)!,
    totalDistributions: centsToMoney(totalDistributionCents)!,
    totalRecallableDistributions: centsToMoney(totalRecallableDistributionCents)!,
    dpi: status.dpi === 'AVAILABLE' ? ratio(totalDistributionCents, totalContributionCents) : null,
    tvpi: status.tvpi === 'AVAILABLE' ? ratio(totalDistributionCents + (navCents ?? zero), totalContributionCents) : null,
    irr,
    irrTerminalDate,
    irrUsesCarriedForwardNav,
    simplifiedIrr,
    displayIrr,
    irrType,
    vintageYear,
    annualizedCashOnCashYield,
    performanceAsOfDate: asOfDate,
    unfundedCommitmentAmount,
    unfundedCommitmentPercentage,
    performanceStatus: status,
    extendedAvailability: {
      simplifiedIrr: simplifiedStatus,
    },
  }
}
