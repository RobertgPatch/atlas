export interface FundingHistoryBar {
  label: string
  startYear: number
  endYear: number
  called: bigint
  cumulative: bigint
}

export interface FundingProjectionYear {
  year: number
  amount: bigint
}

export function estimateFutureFunding(remaining: bigint, startYear: number | null, currentYear: number): FundingProjectionYear[] {
  if (remaining <= 0n) return []
  const age = startYear == null ? 0 : Math.max(0, currentYear - startYear)
  // Older investments with uncalled capital receive a new five-year window.
  const yearsLeft = age >= 5 ? 5 : 5 - age
  // Allocate whole cents, then put the remainder in the last year so displayed
  // amounts also reconcile to the remaining commitment.
  const annual = remaining / (BigInt(yearsLeft) * 100n) * 100n
  return Array.from({ length: yearsLeft }, (_, index) => ({
    year: currentYear + index + 1,
    amount: index === yearsLeft - 1 ? remaining - annual * BigInt(yearsLeft - 1) : annual,
  }))
}

export function groupHistoricFunding(
  years: Array<{ year: number; called: bigint }>,
  startYear: number,
  currentYear: number,
): FundingHistoryBar[] {
  const firstYear = Math.min(startYear, currentYear)
  const span = currentYear - firstYear
  const pastBarCount = Math.min(5, span)
  const ranges = Array.from({ length: pastBarCount }, (_, index) => ({
    startYear: firstYear + Math.floor(index * span / pastBarCount),
    endYear: firstYear + Math.floor((index + 1) * span / pastBarCount) - 1,
  }))
  ranges.push({ startYear: currentYear, endYear: currentYear })
  let cumulative = 0n
  return ranges.map(({ startYear: from, endYear: to }) => {
    const called = years.filter(({ year }) => year >= from && year <= to).reduce((sum, item) => sum + item.called, 0n)
    cumulative += called
    return {
      label: from === to ? String(from) : `${from}–${to}`,
      startYear: from,
      endYear: to,
      called,
      cumulative,
    }
  })
}
