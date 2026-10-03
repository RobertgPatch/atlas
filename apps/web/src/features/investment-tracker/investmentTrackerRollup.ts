import type {
  PartnershipAggregateRow,
  PartnershipAggregationCoveredMoney,
  PartnershipAggregationCoveredRatio,
  PartnershipPortfolioRollup,
} from '../../../../../packages/types/src/partnership-tracker'

export type PartnershipActivityRollup = Pick<PartnershipPortfolioRollup,
  'partnershipCount' | 'ownerRecordCount' | 'committedCapital' | 'paidInCapital' |
  'distributions' | 'latestNav' | 'unfundedCommitment' | 'dpi' | 'tvpi' |
  'asOfDate' | 'navValuationRange'>

const moneyUnits = (value: string): bigint => {
  const negative = value.startsWith('-')
  const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.')
  const amount = BigInt(whole) * 10_000n + BigInt(fraction.padEnd(4, '0').slice(0, 4))
  return negative ? -amount : amount
}

const amountString = (value: bigint) => {
  const absolute = value < 0n ? -value : value
  return `${value < 0n ? '-' : ''}${absolute / 10_000n}.${String(absolute % 10_000n).padStart(4, '0')}`
}

/** Recalculate the summary from the same selected owner records as the register and charts. */
export function buildInvestmentTrackerRollup(
  members: PartnershipAggregateRow[],
  fundCount: number,
  asOfDate: string,
): PartnershipActivityRollup {
  const coveredMoney = (pick: (member: PartnershipAggregateRow) => string | null | undefined): PartnershipAggregationCoveredMoney => {
    let total = 0n
    let knownCount = 0
    for (const member of members) {
      const amount = pick(member)
      if (amount == null) continue
      total += moneyUnits(amount)
      knownCount += 1
    }
    return { amount: knownCount === 0 ? null : amountString(total), knownCount, totalCount: members.length }
  }
  const committedCapital = coveredMoney((member) => member.currentCommittedCapital?.amount)
  const paidInCapital = coveredMoney((member) => member.totalCapitalContributions)
  const distributions = coveredMoney((member) => member.totalDistributions)
  const latestNav = coveredMoney((member) => member.latestNav?.amount)
  const unfundedCommitment = coveredMoney((member) => member.unfundedCommitmentAmount)
  const paidIn = paidInCapital.amount == null ? null : moneyUnits(paidInCapital.amount)
  const distributed = distributions.amount == null ? null : moneyUnits(distributions.amount)
  const nav = latestNav.amount == null ? null : moneyUnits(latestNav.amount)
  // Use the API rollup's ratio rules: divide combined amounts, rather than averaging owner ratios.
  const ratio = (numerator: bigint | null): PartnershipAggregationCoveredRatio => {
    const coverage = {
      numeratorKnownCount: distributions.knownCount,
      denominatorKnownCount: paidInCapital.knownCount,
      totalCount: members.length,
    }
    if (numerator == null || paidIn == null) return { ...coverage, value: null, status: 'NO_DATA' }
    if (paidIn === 0n) return { ...coverage, value: null, status: 'ZERO_DENOMINATOR' }
    const scale = 100_000_000n
    const absoluteNumerator = numerator < 0n ? -numerator : numerator
    const denominator = paidIn < 0n ? -paidIn : paidIn
    const scaled = absoluteNumerator * scale
    let rounded = scaled / denominator
    if (scaled % denominator * 2n >= denominator) rounded += 1n
    const negative = (numerator < 0n) !== (paidIn < 0n) && rounded !== 0n
    return {
      ...coverage,
      value: `${negative ? '-' : ''}${rounded / scale}.${String(rounded % scale).padStart(8, '0')}`,
      status: distributions.knownCount === members.length && paidInCapital.knownCount === members.length
        ? 'AVAILABLE' : 'PARTIAL_COVERAGE',
    }
  }
  const navDates = members.flatMap((member) => member.latestNav?.date ? [member.latestNav.date] : []).sort()
  return {
    partnershipCount: fundCount,
    ownerRecordCount: members.length,
    committedCapital,
    paidInCapital,
    distributions,
    latestNav,
    unfundedCommitment,
    dpi: ratio(distributed),
    tvpi: ratio(distributed == null && nav == null ? null : (distributed ?? 0n) + (nav ?? 0n)),
    asOfDate,
    navValuationRange: { earliest: navDates.at(0) ?? null, latest: navDates.at(-1) ?? null },
  }
}
