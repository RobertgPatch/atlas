import { centsToMoney, moneyToCents } from '../k1-tracker/k1-tracker.calculation.js'
import type { PartnershipManagementFeeEstimate } from './partnership-tracker.contracts.js'

type Commitment = { amount: string; effectiveDate: string }

export type ManagementFeeInput = {
  partnershipId: string
  inceptionDate: string | null
  annualRate: string | null
  asOfDate: string
  commitments: Commitment[]
}

const rateScale = 100_000_000n
const millisecondsPerDay = 24 * 60 * 60 * 1000
const dateValue = (value: string) => Date.parse(`${value}T00:00:00Z`)
const dateString = (value: Date) => value.toISOString().slice(0, 10)
const addDays = (value: string, days: number) => dateString(new Date(dateValue(value) + days * millisecondsPerDay))
const daysBetween = (start: string, endExclusive: string) => Math.round((dateValue(endExclusive) - dateValue(start)) / millisecondsPerDay)
const daysInYear = (year: number): 365 | 366 => new Date(Date.UTC(year, 1, 29)).getUTCDate() === 29 ? 366 : 365
const parseRate = (value: string): bigint => {
  const [whole = '0', fraction = ''] = value.split('.')
  return BigInt(whole) * rateScale + BigInt((fraction + '00000000').slice(0, 8))
}
const roundFraction = (numerator: bigint, denominator: bigint): bigint => (numerator + denominator / 2n) / denominator

export const calculateManagementFeeEstimate = ({
  partnershipId,
  inceptionDate,
  annualRate,
  asOfDate,
  commitments,
}: ManagementFeeInput): PartnershipManagementFeeEstimate => {
  const unavailable = (status: PartnershipManagementFeeEstimate['status']): PartnershipManagementFeeEstimate => ({
    partnershipId,
    inceptionDate,
    annualRate,
    asOfDate,
    status,
    annualRows: [],
    cumulativeEstimatedFee: null,
  })

  if (!inceptionDate) return unavailable('MISSING_INCEPTION_DATE')
  if (!annualRate) return unavailable('MISSING_MANAGEMENT_FEE_RATE')
  if (asOfDate < inceptionDate) throw new RangeError('Management fee as-of date cannot be before inception.')
  if (!commitments.length) return unavailable('MISSING_COMMITMENT')

  const orderedCommitments = commitments
    .map((commitment, index) => ({ ...commitment, index, cents: moneyToCents(commitment.amount) ?? 0n }))
    .sort((left, right) => left.effectiveDate.localeCompare(right.effectiveDate) || left.index - right.index)
  const rateUnits = parseRate(annualRate)
  const annualRows: PartnershipManagementFeeEstimate['annualRows'] = []
  let cumulativeCents = 0n
  let missingCommitment = false

  for (let year = Number(inceptionDate.slice(0, 4)); year <= Number(asOfDate.slice(0, 4)); year += 1) {
    const periodStart = inceptionDate > `${year}-01-01` ? inceptionDate : `${year}-01-01`
    const periodEnd = asOfDate < `${year}-12-31` ? asOfDate : `${year}-12-31`
    const endExclusive = addDays(periodEnd, 1)
    const boundaries = [
      periodStart,
      ...orderedCommitments
        .map((commitment) => commitment.effectiveDate)
        .filter((effectiveDate) => effectiveDate > periodStart && effectiveDate <= periodEnd),
      endExclusive,
    ].filter((value, index, all) => all.indexOf(value) === index).sort()
    const activeDays = daysBetween(periodStart, endExclusive)
    const denominatorDays = daysInYear(year)
    let weightedNumerator = 0n
    let feeNumerator = 0n
    let rowMissingCommitment = false

    for (let index = 0; index < boundaries.length - 1; index += 1) {
      const segmentStart = boundaries[index]!
      const segmentEnd = boundaries[index + 1]!
      const segmentDays = daysBetween(segmentStart, segmentEnd)
      const commitment = orderedCommitments.filter((item) => item.effectiveDate <= segmentStart).at(-1)
      if (!commitment) {
        rowMissingCommitment = true
        continue
      }
      weightedNumerator += commitment.cents * BigInt(segmentDays)
      feeNumerator += commitment.cents * rateUnits * BigInt(segmentDays)
    }

    missingCommitment ||= rowMissingCommitment
    const annualFeeCents = rowMissingCommitment ? null : roundFraction(feeNumerator, rateScale * BigInt(denominatorDays))
    if (annualFeeCents != null) cumulativeCents += annualFeeCents
    annualRows.push({
      calendarYear: year,
      periodStart,
      periodEnd,
      activeDays,
      daysInYear: denominatorDays,
      weightedCommittedCapital: rowMissingCommitment ? null : centsToMoney(roundFraction(weightedNumerator, BigInt(activeDays))),
      annualRate,
      estimatedFee: centsToMoney(annualFeeCents),
    })
  }

  return {
    partnershipId,
    inceptionDate,
    annualRate,
    asOfDate,
    status: missingCommitment ? 'MISSING_COMMITMENT' : 'AVAILABLE',
    annualRows,
    cumulativeEstimatedFee: missingCommitment ? null : centsToMoney(cumulativeCents),
  }
}
