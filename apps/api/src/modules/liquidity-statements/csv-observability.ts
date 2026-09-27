const stages = ['upload', 'duplicate', 'parse', 'review', 'apply', 'download', 'reservation_expired'] as const
const outcomes = ['success', 'blocked', 'failed', 'disabled', 'quota'] as const
export type CsvStage = typeof stages[number]
type Outcome = typeof outcomes[number]
const counters = new Map<string, number>()
/** Deliberately accepts no labels containing user text, account IDs or amounts. */
export function recordCsvOutcome(stage: CsvStage, outcome: Outcome, elapsedMs?: number) {
  if (!stages.includes(stage) || !outcomes.includes(outcome)) return
  const key = `${stage}:${outcome}`
  counters.set(key, (counters.get(key) ?? 0) + 1)
  if (process.env.NODE_ENV !== 'test') console.info(JSON.stringify({ event: 'liquidity_csv', stage, outcome,
    ...(elapsedMs === undefined ? {} : { elapsedMs: Math.min(120000, Math.max(0, Math.round(elapsedMs))) }) }))
}
export const csvMetrics = () => Object.fromEntries(counters)
const gauges: Record<string, number> = {}
export function recordCsvReportState(quotesEnabled: boolean, overdueAccounts: number) {
  gauges.quotesEnabled = quotesEnabled === true ? 1 : 0
  gauges.overdueAccounts = Number.isFinite(overdueAccounts) ? Math.max(0, Math.min(100000, Math.floor(overdueAccounts))) : 0
}
export const csvGauges = () => ({ ...gauges })
