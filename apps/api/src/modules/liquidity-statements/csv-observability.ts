const stages = ['upload', 'duplicate', 'parse', 'review', 'apply', 'download', 'reprocess', 'selection', 'correction', 'cancel', 'reservation_expired'] as const
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
const readers=new Set(['bounded_csv','bounded_ooxml_xlsx','legacy_csv','unknown'])
const adapters=new Set(['merrill_holdings_csv','charles_schwab_positions_csv','morgan_stanley_holdings_xlsx','mapped_csv','composite_statement','unknown'])
const versions=new Set(['1.0.0','1.3.0','unknown'])
const statementOutcomes=new Set(['matched','needs_adapter','ambiguous','blocked','failed'])
const resourceBuckets=new Set(['small','ordinary','large','limit'])
const statementCounters=new Map<string,number>()
export function recordStatementOutcome(input:{reader:string;adapter:string;version:string;outcome:string;resourceBucket:string;correlationId?:string}){
  const reader=readers.has(input.reader)?input.reader:'unknown',adapter=adapters.has(input.adapter)?input.adapter:'unknown',version=versions.has(input.version)?input.version:'unknown'
  if(!statementOutcomes.has(input.outcome)||!resourceBuckets.has(input.resourceBucket))return
  const key=[reader,adapter,version,input.outcome,input.resourceBucket].join(':')
  statementCounters.set(key,(statementCounters.get(key)??0)+1)
  if(process.env.NODE_ENV!=='test')console.info(JSON.stringify({event:'liquidity_statement_parse',reader,adapter,version,outcome:input.outcome,resourceBucket:input.resourceBucket,...(/^[a-f0-9-]{36}$/iu.test(input.correlationId??'')?{correlationId:input.correlationId}:{})}))
}
export const statementMetrics=()=>Object.fromEntries(statementCounters)
const gauges: Record<string, number> = {}
export function recordCsvReportState(quotesEnabled: boolean, overdueAccounts: number) {
  gauges.quotesEnabled = quotesEnabled === true ? 1 : 0
  gauges.overdueAccounts = Number.isFinite(overdueAccounts) ? Math.max(0, Math.min(100000, Math.floor(overdueAccounts))) : 0
}
export const csvGauges = () => ({ ...gauges })
