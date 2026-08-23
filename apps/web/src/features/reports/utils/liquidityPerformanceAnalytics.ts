import type { LiquidityPerformancePoint } from '../../../../../../packages/types/src/reports'

export type PerformanceRange = '1d' | '1w' | '1m' | 'ytd' | 'custom'

const parseDate = (value: string): Date => new Date(`${value}T00:00:00.000Z`)

const toDateKey = (date: Date): string => date.toISOString().slice(0, 10)

const startDateFor = (range: PerformanceRange, latestDate: string): string => {
  const date = parseDate(latestDate)

  if (range === '1d') date.setUTCDate(date.getUTCDate() - 1)
  if (range === '1w') date.setUTCDate(date.getUTCDate() - 7)
  if (range === '1m') {
    const targetDay = date.getUTCDate()
    date.setUTCDate(1)
    date.setUTCMonth(date.getUTCMonth() - 1)
    const lastDayOfTargetMonth = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
    ).getUTCDate()
    date.setUTCDate(Math.min(targetDay, lastDayOfTargetMonth))
  }
  if (range === 'ytd') date.setUTCMonth(0, 1)

  return toDateKey(date)
}

export const selectPerformancePoints = (
  points: LiquidityPerformancePoint[],
  range: PerformanceRange,
  customStart?: string,
  customEnd?: string,
): LiquidityPerformancePoint[] => {
  const valuedPoints = points
    .filter(
      (point): point is LiquidityPerformancePoint & { totalMarketValue: number } =>
        point.totalMarketValue != null,
    )
    .sort((left, right) => left.date.localeCompare(right.date))
  const latestDate = valuedPoints.at(-1)?.date
  if (!latestDate) return []

  const start = range === 'custom' ? customStart : startDateFor(range, latestDate)
  const end = range === 'custom' ? customEnd : latestDate
  if (!start || !end || start > end) return []

  const inRange = valuedPoints.filter((point) => point.date >= start && point.date <= end)
  const baseline = valuedPoints.findLast((point) => point.date <= start)

  if (baseline && !inRange.some((point) => point.date === baseline.date)) {
    return [baseline, ...inRange]
  }
  return inRange
}
