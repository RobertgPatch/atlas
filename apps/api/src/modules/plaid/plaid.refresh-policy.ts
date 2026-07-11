import type {
  HoldingsRefreshAttempt,
  HoldingsSnapshotMetadata,
  PlaidRefreshPolicy,
} from './plaid.repository.js'

export type PlaidSnapshotFreshnessStatus =
  | 'fresh'
  | 'stale'
  | 'refreshing'
  | 'failed'
  | 'unavailable'

export interface PlaidFreshnessEvaluation {
  status: PlaidSnapshotFreshnessStatus
  cutoffAt: string
  nextRefreshAt: string
  dataAsOfDate: string | null
  dataFetchedAt: string | null
  warnings: string[]
}

interface ZonedDateParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

const parseRefreshTimeLocal = (refreshTimeLocal: string) => {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(refreshTimeLocal)
  if (!match) {
    return { hour: 5, minute: 0, warning: 'Invalid refresh time; using 05:00.' }
  }
  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
    warning: null,
  }
}

const getZonedDateParts = (date: Date, timezone: string): ZonedDateParts => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const byType = new Map(parts.map((part) => [part.type, part.value]))
  const hour = Number(byType.get('hour') ?? '0')
  return {
    year: Number(byType.get('year')),
    month: Number(byType.get('month')),
    day: Number(byType.get('day')),
    hour: hour === 24 ? 0 : hour,
    minute: Number(byType.get('minute') ?? '0'),
    second: Number(byType.get('second') ?? '0'),
  }
}

const localPartsToComparableUtc = (parts: ZonedDateParts) =>
  Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  )

const addLocalDays = (
  parts: Pick<ZonedDateParts, 'year' | 'month' | 'day'>,
  days: number,
) => {
  const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days))
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  }
}

const zonedTimeToUtc = (
  input: Pick<ZonedDateParts, 'year' | 'month' | 'day' | 'hour' | 'minute'>,
  timezone: string,
) => {
  let utcMillis = Date.UTC(
    input.year,
    input.month - 1,
    input.day,
    input.hour,
    input.minute,
  )

  for (let iteration = 0; iteration < 3; iteration += 1) {
    const actualParts = getZonedDateParts(new Date(utcMillis), timezone)
    const desiredMillis = Date.UTC(
      input.year,
      input.month - 1,
      input.day,
      input.hour,
      input.minute,
      0,
    )
    const actualMillis = localPartsToComparableUtc({
      ...actualParts,
      second: 0,
    })
    utcMillis -= actualMillis - desiredMillis
  }

  return new Date(utcMillis)
}

export const getRefreshCutoffAt = (
  policy: PlaidRefreshPolicy,
  now = new Date(),
): Date => {
  const { hour, minute } = parseRefreshTimeLocal(policy.refreshTimeLocal)
  const nowLocal = getZonedDateParts(now, policy.timezone)
  let cutoff = zonedTimeToUtc(
    {
      year: nowLocal.year,
      month: nowLocal.month,
      day: nowLocal.day,
      hour,
      minute,
    },
    policy.timezone,
  )

  if (cutoff.getTime() > now.getTime()) {
    const previousDay = addLocalDays(nowLocal, -1)
    cutoff = zonedTimeToUtc(
      {
        ...previousDay,
        hour,
        minute,
      },
      policy.timezone,
    )
  }

  return cutoff
}

export const getNextRefreshAt = (
  policy: PlaidRefreshPolicy,
  now = new Date(),
): Date => {
  const { hour, minute } = parseRefreshTimeLocal(policy.refreshTimeLocal)
  const nowLocal = getZonedDateParts(now, policy.timezone)
  const todayRefresh = zonedTimeToUtc(
    {
      year: nowLocal.year,
      month: nowLocal.month,
      day: nowLocal.day,
      hour,
      minute,
    },
    policy.timezone,
  )

  if (todayRefresh.getTime() > now.getTime()) {
    return todayRefresh
  }

  const tomorrow = addLocalDays(nowLocal, 1)
  return zonedTimeToUtc(
    {
      ...tomorrow,
      hour,
      minute,
    },
    policy.timezone,
  )
}

export const isSnapshotFresh = (
  policy: PlaidRefreshPolicy,
  snapshot: HoldingsSnapshotMetadata | null | undefined,
  now = new Date(),
) => {
  if (!snapshot) return false
  if (snapshot.status !== 'success' && snapshot.status !== 'partial_success') {
    return false
  }

  const fetchedAt = snapshot.fetchedAt ?? snapshot.completedAt
  if (!fetchedAt) return false

  return new Date(fetchedAt).getTime() >= getRefreshCutoffAt(policy, now).getTime()
}

export const evaluateSnapshotFreshness = (input: {
  policy: PlaidRefreshPolicy
  snapshot: HoldingsSnapshotMetadata | null
  activeAttempt?: HoldingsRefreshAttempt | null
  now?: Date
}): PlaidFreshnessEvaluation => {
  const now = input.now ?? new Date()
  const warnings: string[] = []
  const parsedTime = parseRefreshTimeLocal(input.policy.refreshTimeLocal)
  if (parsedTime.warning) warnings.push(parsedTime.warning)

  const cutoffAt = getRefreshCutoffAt(input.policy, now)
  const nextRefreshAt = getNextRefreshAt(input.policy, now)
  const dataFetchedAt = input.snapshot?.fetchedAt ?? input.snapshot?.completedAt ?? null
  const dataAsOfDate =
    input.snapshot?.dataAsOfDate ??
    input.snapshot?.dataAsOfMaxDate ??
    input.snapshot?.completedAt?.slice(0, 10) ??
    null

  if (input.activeAttempt?.status === 'pending') {
    return {
      status: 'refreshing',
      cutoffAt: cutoffAt.toISOString(),
      nextRefreshAt: nextRefreshAt.toISOString(),
      dataAsOfDate,
      dataFetchedAt,
      warnings,
    }
  }

  if (!input.snapshot) {
    return {
      status: 'unavailable',
      cutoffAt: cutoffAt.toISOString(),
      nextRefreshAt: nextRefreshAt.toISOString(),
      dataAsOfDate: null,
      dataFetchedAt: null,
      warnings,
    }
  }

  if (input.snapshot.status === 'failed') {
    return {
      status: 'failed',
      cutoffAt: cutoffAt.toISOString(),
      nextRefreshAt: nextRefreshAt.toISOString(),
      dataAsOfDate,
      dataFetchedAt,
      warnings,
    }
  }

  return {
    status: isSnapshotFresh(input.policy, input.snapshot, now) ? 'fresh' : 'stale',
    cutoffAt: cutoffAt.toISOString(),
    nextRefreshAt: nextRefreshAt.toISOString(),
    dataAsOfDate,
    dataFetchedAt,
    warnings,
  }
}
