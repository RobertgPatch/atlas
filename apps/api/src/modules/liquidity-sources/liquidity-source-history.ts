import { pool } from '../../infra/db/client.js'
import { readLiquiditySources } from './liquidity-source.read.js'
import { isoDate,type LiquidityScope } from './liquidity-source.repository.js'
import { decimal,format,sum } from '../liquidity-statements/csv/decimal.js'

/** Effective account composition; neither current holdings nor future quotes are
 * projected backward. Missing earlier accounts remain explicit coverage. */
export async function liquiditySourceHistory(scope:LiquidityScope,query:{from?:string;to?:string}){
  if(!pool)return null
  const sources=await readLiquiditySources(scope)
  if(!sources.neutralAccounts.length)return null
  const ids=sources.accounts.map(a=>a.id)
  const dates=(await pool.query(`select distinct date from (
    select as_of_date as date from liquidity_holdings_snapshots where source_account_id=any($1::uuid[]) and superseded_by_snapshot_id is null and current_eligible
    union select price_at::date from liquidity_source_valuations where source_account_id=any($1::uuid[])
    ) dates where date is not null and ($2::date is null or date>=$2) and ($3::date is null or date<=$3) order by date limit 5000`,[ids,query.from??null,query.to??null])).rows.map(r=>isoDate(r.date)!)
  const points=[]
  for(const date of dates){
    const observations=(await pool.query(`select a.id as account_id,s.id as snapshot_id,s.approved_at from liquidity_source_accounts a
      left join lateral(select * from liquidity_holdings_snapshots s where s.source_account_id=a.id and s.as_of_date<=$2 and s.superseded_by_snapshot_id is null and s.current_eligible order by s.as_of_date desc,s.effective_key desc,s.revision desc limit 1) s on true where a.id=any($1::uuid[])`,[ids,date])).rows
    const snapshotIds=observations.map(r=>r.snapshot_id).filter(Boolean)
    const positions=(await pool.query(`select p.source_account_id as account_id,p.currency,p.cost_basis::text,coalesce(v.market_value,p.market_value)::text as market_value,
      case when v.id is null then p.unrealized_gain_loss else v.unrealized_gain_loss end::text as gain,v.price_at,v.id as quote_id
      from liquidity_source_positions p left join lateral(select * from liquidity_source_valuations v where v.source_position_id=p.id and v.price_at<($2::date+interval '1 day') order by v.price_at desc,v.captured_at desc limit 1) v on true where p.snapshot_id=any($1::uuid[])`,[snapshotIds,date])).rows
    const rows=positions,currencies=new Set(rows.map(r=>r.currency)),complete=observations.every(r=>r.snapshot_id)
    const total=(key:string,requireEveryAccount=true)=>requireEveryAccount&&!complete||currencies.size>1||rows.some(r=>r[key]==null)?null:Number(format(sum(rows.map(r=>decimal(r[key])!))))
    const priced=positions.filter(p=>p.quote_id).length
    points.push({date,totalMarketValue:total('market_value',false),totalCostBasis:total('cost_basis'),totalUnrealizedGainLoss:total('gain'),accountCount:new Set(observations.filter(r=>r.snapshot_id).map(r=>r.account_id)).size,source:priced?'daily_valuation' as const:'custodian_snapshot' as const,capturedAt:observations.map(r=>r.approved_at?new Date(r.approved_at).toISOString():null).filter(Boolean).sort().at(-1)??null,priceAsOf:positions.map(r=>r.price_at?new Date(r.price_at).toISOString():null).filter(Boolean).sort().at(-1)??null,pricedHoldingCount:priced,fallbackHoldingCount:rows.length-priced,coverage:{complete,missingAccounts:ids.length-new Set(observations.filter(r=>r.snapshot_id).map(r=>r.account_id)).size},returnAvailable:false,valuationMode:priced?'MARKET_QUOTE':'CSV_FALLBACK'})
  }
  return {points,availableFrom:points[0]?.date??null,availableTo:points.at(-1)?.date??null,marketCloseAvailableFrom:null}
}
