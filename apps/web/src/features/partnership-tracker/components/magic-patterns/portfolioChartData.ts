import type { PartnershipAggregateRow, PartnershipType } from '../../../../../../../packages/types/src/partnership-tracker'
import { PARTNERSHIP_TYPES } from '../../../../../../../packages/types/src/partnership-tracker'

export const portfolioMoneyUnits = (value: string): bigint => {
  const negative = value.startsWith('-')
  const [whole = '0', fraction = ''] = (negative ? value.slice(1) : value).split('.')
  const amount = BigInt(whole) * 10_000n + BigInt((fraction + '0000').slice(0, 4))
  return negative ? -amount : amount
}

export const portfolioMoney = (value: bigint): string => {
  const absolute = value < 0n ? -value : value
  const cents = (absolute + 50n) / 100n
  return `${value < 0n && cents > 0n ? '-' : ''}$${new Intl.NumberFormat('en-US').format(cents / 100n)}.${String(cents % 100n).padStart(2, '0')}`
}

const magnitude = (value: bigint) => value < 0n ? -value : value

export interface PortfolioChartData {
  recordCount: number
  commitment: { committed: bigint; paidIn: bigint; ringPaid: bigint; remaining: bigint; coveredCount: number }
  distributions: { byType: Array<{ type: PartnershipType; amount: bigint }>; coveredCount: number; total: bigint }
  funding: { committed: bigint; called: bigint; coveredCount: number; years: Array<{ year: number; called: bigint; cumulative: bigint }> }
  cash: { paid: bigint; returned: bigint; eventCount: number }
}

export function buildPortfolioChartData(members: PartnershipAggregateRow[]): PortfolioChartData {
  let committed = 0n
  let paidIn = 0n
  let ringPaid = 0n
  let remaining = 0n
  let commitmentCovered = 0
  let distributionCovered = 0
  let cashPaid = 0n
  let cashReturned = 0n
  let eventCount = 0
  let fundingCommitted = 0n
  let fundingCovered = 0
  let firstFundingYear = Infinity
  let lastFundingYear = -Infinity
  const distributions = new Map<PartnershipType, bigint>()
  const annualCalls = new Map<number, bigint>()

  for (const member of members) {
    const commitmentAmount = member.currentCommittedCapital?.amount
    const paidInAmount = member.totalCapitalContributions
    const remainingAmount = member.unfundedCommitmentAmount
    if (commitmentAmount != null && paidInAmount != null && remainingAmount != null) {
      const rowCommitted = portfolioMoneyUnits(commitmentAmount)
      const rowPaidIn = portfolioMoneyUnits(paidInAmount)
      committed += rowCommitted
      paidIn += rowPaidIn
      ringPaid += rowPaidIn > rowCommitted ? rowCommitted : rowPaidIn
      remaining += portfolioMoneyUnits(remainingAmount)
      commitmentCovered += 1
    }

    if (member.totalDistributions != null) {
      const amount = portfolioMoneyUnits(member.totalDistributions)
      if (amount > 0n) distributions.set(member.partnership.partnershipType, (distributions.get(member.partnership.partnershipType) ?? 0n) + amount)
      distributionCovered += 1
    }

    const fundingCommitment = commitmentAmount == null ? 0n : portfolioMoneyUnits(commitmentAmount)
    if (fundingCommitment > 0n) {
      fundingCommitted += fundingCommitment
      fundingCovered += 1
    }

    for (const event of member.cashFlowEvents ?? []) {
      const gross = magnitude(portfolioMoneyUnits(event.amount))
      const fees = magnitude(portfolioMoneyUnits(event.feesAndCarry ?? '0'))
      const isCall = event.kind === 'CAPITAL_CALL'
      if (isCall) cashPaid += gross + fees
      else cashReturned += gross - fees
      eventCount += 1
      if (fundingCommitment > 0n) {
        const year = Number(event.activityDate.slice(0, 4))
        if (Number.isInteger(year) && isCall) {
          firstFundingYear = Math.min(firstFundingYear, year)
          lastFundingYear = Math.max(lastFundingYear, year)
          annualCalls.set(year, (annualCalls.get(year) ?? 0n) + gross)
        }
      }
    }
  }

  const byType = PARTNERSHIP_TYPES.flatMap((type) => {
    const amount = distributions.get(type) ?? 0n
    return amount > 0n ? [{ type, amount }] : []
  })
  let cumulativeCalled = 0n
  const fundingYears = Number.isFinite(firstFundingYear)
    ? Array.from({ length: lastFundingYear - firstFundingYear + 1 }, (_, index) => {
      const year = firstFundingYear + index
      const called = annualCalls.get(year) ?? 0n
      cumulativeCalled += called
      return { year, called, cumulative: cumulativeCalled }
    })
    : []
  return {
    recordCount: members.length,
    commitment: { committed, paidIn, ringPaid, remaining, coveredCount: commitmentCovered },
    distributions: { byType, coveredCount: distributionCovered, total: byType.reduce((sum, item) => sum + item.amount, 0n) },
    funding: { committed: fundingCommitted, called: cumulativeCalled, coveredCount: fundingCovered, years: fundingYears },
    cash: { paid: cashPaid, returned: cashReturned, eventCount },
  }
}
