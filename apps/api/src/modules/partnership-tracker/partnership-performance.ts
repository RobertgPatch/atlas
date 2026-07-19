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
  latestNav: { amount: string; date: string } | null
}

export type PartnershipPerformance = {
  totalCapitalContributions: string | null
  totalDistributions: string | null
  dpi: string | null
  tvpi: string | null
  irr: string | null
  performanceStatus: PartnershipTrackerPerformanceStatus
}

const zero = 0n
const absolute = (value: bigint): bigint => value < zero ? -value : value
const sum = (values: bigint[]): bigint => values.reduce((total, value) => total + value, zero)
const dateAtYearEnd = (taxYear: number): string => `${taxYear}-12-31`
const utcTimestamp = (date: string): number => Date.parse(`${date}T00:00:00Z`)
const defaultStatus = (): PartnershipTrackerPerformanceStatus => ({
  dpi: 'MISSING_CONTRIBUTIONS',
  tvpi: 'MISSING_CONTRIBUTIONS',
  irr: 'MISSING_CONTRIBUTIONS',
})

const ratio = (numerator: bigint, denominator: bigint): string => {
  const negative = (numerator < zero) !== (denominator < zero)
  const numeratorAbsolute = numerator < zero ? -numerator : numerator
  const denominatorAbsolute = denominator < zero ? -denominator : denominator
  const value = (numeratorAbsolute * 10_000n + denominatorAbsolute / 2n) / denominatorAbsolute
  const sign = negative && value !== zero ? '-' : ''
  return `${sign}${value / 10_000n}.${String(value % 10_000n).padStart(4, '0')}`
}

const npv = (rate: number, flows: Array<{ at: number; cents: bigint }>, start: number): number => flows.reduce((total, flow) => {
  const years = (flow.at - start) / (365.25 * 24 * 60 * 60 * 1000)
  return total + Number(flow.cents) / Math.pow(1 + rate, years)
}, 0)

const bisect = (low: number, high: number, flows: Array<{ at: number; cents: bigint }>, start: number): number | null => {
  let lowValue = npv(low, flows, start)
  const highValue = npv(high, flows, start)
  if (!Number.isFinite(lowValue) || !Number.isFinite(highValue) || lowValue === 0 && highValue === 0) return null
  if (Math.sign(lowValue) === Math.sign(highValue)) return null
  let left = low
  let right = high
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const mid = (left + right) / 2
    const midValue = npv(mid, flows, start)
    if (!Number.isFinite(midValue)) return null
    if (Math.abs(midValue) < 1e-7) return mid
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
    if (found != null && !roots.some((root) => Math.abs(root - found) < 0.0001)) roots.push(found)
  }
  if (roots.length !== 1) return { value: null, status: 'AMBIGUOUS_IRR' }
  return { value: roots[0]!.toFixed(4), status: 'AVAILABLE' }
}

export const composePartnershipPerformance = ({ annualValues, latestNav }: PartnershipPerformanceInput): PartnershipPerformance => {
  const contributions = annualValues.flatMap((year) => {
    const amount = year.hasCanonicalContribution ? year.capitalContributions : year.legacyCapitalContributions
    const cents = moneyToCents(amount)
    return cents == null ? [] : [{ taxYear: year.taxYear, cents }]
  })
  const distributions = annualValues.flatMap((year) => {
    const cents = moneyToCents(year.distributions)
    return cents == null ? [] : [{ taxYear: year.taxYear, cents: absolute(cents) }]
  })
  const totalContributionCents = contributions.length ? sum(contributions.map((item) => item.cents)) : null
  const totalDistributionCents = distributions.length ? sum(distributions.map((item) => item.cents)) : null
  const status = defaultStatus()

  if (totalContributionCents != null && totalContributionCents > zero) {
    status.dpi = 'AVAILABLE'
  }
  if (totalContributionCents != null && totalContributionCents > zero && latestNav != null) {
    status.tvpi = 'AVAILABLE'
  } else if (totalContributionCents != null && totalContributionCents > zero) {
    status.tvpi = 'MISSING_NAV'
  }

  let irr: string | null = null
  if (totalContributionCents != null && totalContributionCents > zero) {
    if (!latestNav) {
      status.irr = 'MISSING_NAV'
    } else {
      const cashFlowYears = [...contributions, ...distributions].map((entry) => entry.taxYear)
      const latestAnnualDate = cashFlowYears.length ? dateAtYearEnd(Math.max(...cashFlowYears)) : null
      if (latestAnnualDate && latestNav.date < latestAnnualDate) {
        status.irr = 'NAV_PRECEDES_CASH_FLOWS'
      } else {
        const cashFlows = new Map<string, bigint>()
        for (const entry of contributions) {
          const date = dateAtYearEnd(entry.taxYear)
          cashFlows.set(date, (cashFlows.get(date) ?? zero) - entry.cents)
        }
        for (const entry of distributions) {
          const date = dateAtYearEnd(entry.taxYear)
          cashFlows.set(date, (cashFlows.get(date) ?? zero) + entry.cents)
        }
        const navCents = moneyToCents(latestNav.amount) ?? zero
        cashFlows.set(latestNav.date, (cashFlows.get(latestNav.date) ?? zero) + navCents)
        const result = solveIrr([...cashFlows.entries()].map(([date, cents]) => ({ date, cents })))
        irr = result.value
        status.irr = result.status
      }
    }
  }

  return {
    totalCapitalContributions: centsToMoney(totalContributionCents),
    totalDistributions: centsToMoney(totalDistributionCents),
    dpi: status.dpi === 'AVAILABLE' ? ratio(totalDistributionCents ?? zero, totalContributionCents!) : null,
    tvpi: status.tvpi === 'AVAILABLE'
      ? ratio((totalDistributionCents ?? zero) + (moneyToCents(latestNav?.amount) ?? zero), totalContributionCents!)
      : null,
    irr,
    performanceStatus: status,
  }
}
