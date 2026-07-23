import { centsToMoney, moneyToCents } from '../k1-tracker/k1-tracker.calculation.js'
import type {
  PartnershipTrackerMetricAvailability,
  PartnershipTrackerPerformanceStatus,
} from './partnership-tracker.contracts.js'

export type PartnershipAnnualPerformanceValue = {
  taxYear: number
  hasCanonicalContribution: boolean
  capitalContributions: string | null
  legacyCapitalContributions: string | null
  distributions: string | null
}

export type PartnershipPerformanceInput = {
  annualValues: PartnershipAnnualPerformanceValue[]
  cashFlowEvents?: Array<{ kind: 'CAPITAL_CALL' | 'DISTRIBUTION' | 'RECALLABLE_DISTRIBUTION'; activityDate: string; amount: string }>
  latestNav: { amount: string; date: string } | null
  inceptionDate?: string | null
  currentCommitment?: string | null
  latestEndingOutsideBasis?: string | null
  asOfDate?: string
}

export type PartnershipPerformance = {
  totalCapitalContributions: string | null
  totalDistributions: string | null
  dpi: string | null
  tvpi: string | null
  irr: string | null
  irrTerminalDate: string | null
  irrUsesCarriedForwardNav: boolean
  annualizedCashOnCashYield: string | null
  performanceAsOfDate: string
  unfundedCommitmentAmount: string | null
  unfundedCommitmentPercentage: string | null
  unrealizedGain: string | null
  performanceStatus: PartnershipTrackerPerformanceStatus
}

const zero = 0n
const ratioScale = 100_000_000n
const millisecondsPerDay = 24 * 60 * 60 * 1000
const absolute = (value: bigint): bigint => value < zero ? -value : value
const sum = (values: bigint[]): bigint => values.reduce((total, value) => total + value, zero)
const dateAtYearEnd = (taxYear: number): string => `${taxYear}-12-31`
const utcTimestamp = (date: string): number => Date.parse(`${date}T00:00:00Z`)
const today = (): string => new Date().toISOString().slice(0, 10)

const defaultStatus = (): PartnershipTrackerPerformanceStatus => ({
  dpi: 'MISSING_CONTRIBUTIONS',
  tvpi: 'MISSING_CONTRIBUTIONS',
  irr: 'MISSING_CONTRIBUTIONS',
  annualizedCashOnCashYield: 'MISSING_CONTRIBUTIONS',
  unfundedCommitment: 'MISSING_CONTRIBUTIONS',
  unrealizedGain: 'MISSING_NAV',
})

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
  annualValues,
  cashFlowEvents = [],
  latestNav,
  inceptionDate = null,
  currentCommitment = null,
  latestEndingOutsideBasis = null,
  asOfDate = today(),
}: PartnershipPerformanceInput): PartnershipPerformance => {
  const contributions = annualValues.flatMap((year) => {
    const cents = moneyToCents(year.capitalContributions)
    return cents == null ? [] : [{ taxYear: year.taxYear, cents }]
  })
  const distributions = annualValues.flatMap((year) => {
    const cents = moneyToCents(year.distributions)
    return cents == null ? [] : [{ taxYear: year.taxYear, cents: absolute(cents) }]
  })
  const datedContributions = cashFlowEvents.filter((event) => event.kind === 'CAPITAL_CALL').map((event) => ({
    date: event.activityDate,
    taxYear: Number(event.activityDate.slice(0, 4)),
    cents: absolute(moneyToCents(event.amount) ?? zero),
  }))
  const datedDistributions = cashFlowEvents.filter((event) => event.kind === 'DISTRIBUTION' || event.kind === 'RECALLABLE_DISTRIBUTION').map((event) => ({
    date: event.activityDate,
    taxYear: Number(event.activityDate.slice(0, 4)),
    cents: absolute(moneyToCents(event.amount) ?? zero),
  }))
  const totalContributionCents = contributions.length ? sum(contributions.map((item) => item.cents)) : null
  const totalDistributionCents = distributions.length ? sum(distributions.map((item) => item.cents)) : null
  const navCents = moneyToCents(latestNav?.amount)
  const commitmentCents = moneyToCents(currentCommitment)
  const outsideBasisCents = moneyToCents(latestEndingOutsideBasis)
  const status = defaultStatus()

  if (totalContributionCents != null && totalContributionCents > zero) status.dpi = 'AVAILABLE'
  if (totalContributionCents != null && totalContributionCents > zero) status.tvpi = latestNav ? 'AVAILABLE' : 'MISSING_NAV'

  let irr: string | null = null
  let irrTerminalDate: string | null = null
  let irrUsesCarriedForwardNav = false
  if (totalContributionCents != null && totalContributionCents > zero) {
    if (!latestNav) {
      status.irr = 'MISSING_NAV'
    } else {
      const cashFlows = new Map<string, bigint>()
      const datedContributionYears = new Set(datedContributions.map((entry) => entry.taxYear))
      const datedDistributionYears = new Set(datedDistributions.map((entry) => entry.taxYear))
      for (const entry of contributions.filter((item) => !datedContributionYears.has(item.taxYear))) {
        const date = dateAtYearEnd(entry.taxYear)
        cashFlows.set(date, (cashFlows.get(date) ?? zero) - entry.cents)
      }
      for (const entry of distributions.filter((item) => !datedDistributionYears.has(item.taxYear))) {
        const date = dateAtYearEnd(entry.taxYear)
        cashFlows.set(date, (cashFlows.get(date) ?? zero) + entry.cents)
      }
      for (const entry of datedContributions) cashFlows.set(entry.date, (cashFlows.get(entry.date) ?? zero) - entry.cents)
      for (const entry of datedDistributions) cashFlows.set(entry.date, (cashFlows.get(entry.date) ?? zero) + entry.cents)
      const latestAnnualDate = cashFlows.size ? [...cashFlows.keys()].sort().at(-1)! : latestNav.date
      irrTerminalDate = latestNav.date > latestAnnualDate ? latestNav.date : latestAnnualDate
      irrUsesCarriedForwardNav = irrTerminalDate > latestNav.date
      cashFlows.set(irrTerminalDate, (cashFlows.get(irrTerminalDate) ?? zero) + (navCents ?? zero))
      const result = solveIrr([...cashFlows.entries()].map(([date, cents]) => ({ date, cents })))
      irr = result.value
      status.irr = result.status
    }
  }

  let annualizedCashOnCashYield: string | null = null
  if (!inceptionDate) {
    status.annualizedCashOnCashYield = 'MISSING_INCEPTION_DATE'
  } else if (totalContributionCents == null || totalContributionCents <= zero) {
    status.annualizedCashOnCashYield = 'MISSING_CONTRIBUTIONS'
  } else if (totalDistributionCents == null) {
    status.annualizedCashOnCashYield = 'MISSING_DISTRIBUTIONS'
  } else {
    const elapsedDays = Math.max(1, Math.round((utcTimestamp(asOfDate) - utcTimestamp(inceptionDate)) / millisecondsPerDay))
    annualizedCashOnCashYield = ratio(totalDistributionCents * 1461n, totalContributionCents * BigInt(elapsedDays) * 4n)
    status.annualizedCashOnCashYield = 'AVAILABLE'
  }

  let unfundedCommitmentAmount: string | null = null
  let unfundedCommitmentPercentage: string | null = null
  if (commitmentCents == null) {
    status.unfundedCommitment = 'MISSING_COMMITMENT'
  } else if (totalContributionCents == null) {
    status.unfundedCommitment = 'MISSING_CONTRIBUTIONS'
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

  let unrealizedGain: string | null = null
  if (navCents == null) {
    status.unrealizedGain = 'MISSING_NAV'
  } else if (outsideBasisCents == null) {
    status.unrealizedGain = 'MISSING_OUTSIDE_BASIS'
  } else {
    unrealizedGain = centsToMoney(navCents - outsideBasisCents)
    status.unrealizedGain = 'AVAILABLE'
  }

  return {
    totalCapitalContributions: centsToMoney(totalContributionCents),
    totalDistributions: centsToMoney(totalDistributionCents),
    dpi: status.dpi === 'AVAILABLE' ? ratio(totalDistributionCents ?? zero, totalContributionCents!) : null,
    tvpi: status.tvpi === 'AVAILABLE' ? ratio((totalDistributionCents ?? zero) + (navCents ?? zero), totalContributionCents!) : null,
    irr,
    irrTerminalDate,
    irrUsesCarriedForwardNav,
    annualizedCashOnCashYield,
    performanceAsOfDate: asOfDate,
    unfundedCommitmentAmount,
    unfundedCommitmentPercentage,
    unrealizedGain,
    performanceStatus: status,
  }
}
