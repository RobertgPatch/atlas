import { pathToFileURL } from 'node:url'
import { config } from '../config.js'
import { pool } from '../infra/db/client.js'
import { runMigrations } from '../infra/db/migrate.js'
import { marketDataService } from '../modules/market-data/market-data.service.js'
import { plaidRepository } from '../modules/plaid/plaid.repository.js'
import { admitCostWorkload } from '../modules/abuse-protection/costWorkloadAdmission.js'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const MARKET_CLOSE_SETTLED_MINUTE = 16 * 60 + 20
const MAX_BACKFILL_DAYS = 366

interface BackfillRange {
  from: string
  to: string
}

const parseDate = (value: string): Date => new Date(`${value}T00:00:00.000Z`)

const dateKey = (date: Date): string => date.toISOString().slice(0, 10)

const addDays = (value: string, days: number): string => {
  const date = parseDate(value)
  date.setUTCDate(date.getUTCDate() + days)
  return dateKey(date)
}

const easternDateAndMinute = (now: Date): { date: string; minute: number } => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minute: Number(parts.hour) * 60 + Number(parts.minute),
  }
}

const previousWeekMonday = (today: string): string => {
  const day = parseDate(today).getUTCDay()
  const daysSinceMonday = (day + 6) % 7
  return addDays(today, -daysSinceMonday - 7)
}

const argumentValue = (args: string[], name: string): string | undefined => {
  const inline = args.find((value) => value.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

const assertDate = (value: string, name: string): void => {
  if (!ISO_DATE.test(value) || dateKey(parseDate(value)) !== value) {
    throw new Error(`${name} must be a valid date in YYYY-MM-DD format.`)
  }
}

export const parseBackfillRange = (
  args: string[],
  now = new Date(),
): BackfillRange => {
  const today = easternDateAndMinute(now).date
  const from = argumentValue(args, '--from') ?? previousWeekMonday(today)
  const to = argumentValue(args, '--to') ?? today
  assertDate(from, '--from')
  assertDate(to, '--to')
  if (from > to) throw new Error('--from must be on or before --to.')
  if (to > today) throw new Error('--to cannot be in the future.')
  const span = Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000)
  if (span > MAX_BACKFILL_DAYS) {
    throw new Error(`Backfills are limited to ${MAX_BACKFILL_DAYS} calendar days.`)
  }
  return { from, to }
}

export const completedWeekdaysInRange = (
  range: BackfillRange,
  now = new Date(),
): { dates: string[]; deferredToday: boolean } => {
  const eastern = easternDateAndMinute(now)
  const dates: string[] = []
  let deferredToday = false

  for (let date = range.from; date <= range.to; date = addDays(date, 1)) {
    const weekday = parseDate(date).getUTCDay()
    if (weekday === 0 || weekday === 6) continue
    if (date === eastern.date && eastern.minute < MARKET_CLOSE_SETTLED_MINUTE) {
      deferredToday = true
      continue
    }
    dates.push(date)
  }

  return { dates, deferredToday }
}

const usage = `Backfill saved Liquidity market-close snapshots.

Usage:
  npm run --workspace=api backfill-market-prices
  npm run --workspace=api backfill-market-prices -- --from=2026-08-17 --to=2026-08-25

With no dates, the range starts on Monday of the previous calendar week and ends
today. Weekends are skipped, and today's close is deferred until 4:20 p.m. Eastern.`

export const runBackfill = async (
  args = process.argv.slice(2),
  now = new Date(),
): Promise<void> => {
  if (args.includes('--help') || args.includes('-h')) {
    console.info(usage)
    return
  }
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is required because backfill snapshots must be durable.')
  }

  const range = parseBackfillRange(args, now)
  const { dates, deferredToday } = completedWeekdaysInRange(range, now)
  if (dates.length > config.abuseProtection.quotas.backfill.maximumRowsPerRun) {
    throw new Error('Backfill row ceiling exceeded.')
  }
  await admitCostWorkload({
    workloadKey: 'market_price_backfill',
    controlKey: 'backfills',
    method: 'POST',
    routePattern: '/v1/reports/consolidated-holdings/refresh',
    principal: 'system:market-price-backfill',
    canonicalInputs: { from: range.from, to: range.to },
    globalDailyLimit: config.abuseProtection.quotas.backfill.globalRunsPerDay,
    units: 1,
    leaseTtlSeconds: Math.ceil(config.abuseProtection.timeouts.backfillMs / 1_000),
  })
  await runMigrations((message) => console.info(message))
  await plaidRepository.bootstrapFromDatabase()

  let saved = 0
  let skipped = 0
  let failed = 0
  for (const tradingDate of dates) {
    try {
      const result = await marketDataService.refreshClosingPrices(tradingDate)
      if (result.status === 'success') saved += 1
      else skipped += 1
      console.info(
        JSON.stringify({
          event: 'market_price_backfill_date_finished',
          ...result,
        }),
      )
    } catch (error) {
      failed += 1
      console.error(
        JSON.stringify({
          event: 'market_price_backfill_date_failed',
          tradingDate,
          errorName: error instanceof Error ? error.name : 'UnknownError',
          errorMessage: error instanceof Error ? error.message : String(error),
        }),
      )
    }
  }

  if (deferredToday) {
    console.info(
      JSON.stringify({
        event: 'market_price_backfill_today_deferred',
        tradingDate: easternDateAndMinute(now).date,
        reason: 'The official close is not settled until 4:20 p.m. Eastern.',
      }),
    )
  }
  console.info(
    JSON.stringify({
      event: 'market_price_backfill_finished',
      from: range.from,
      to: range.to,
      requestedDateCount: dates.length,
      savedDateCount: saved,
      skippedDateCount: skipped,
      failedDateCount: failed,
    }),
  )
  if (failed > 0) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runBackfill()
    .catch((error) => {
      console.error(
        JSON.stringify({
          event: 'market_price_backfill_failed',
          errorName: error instanceof Error ? error.name : 'UnknownError',
          errorMessage: error instanceof Error ? error.message : String(error),
        }),
      )
      process.exitCode = 1
    })
    .finally(async () => {
      await pool?.end()
    })
}
