import { randomUUID } from 'node:crypto'
import { config } from '../../config.js'
import { withTransaction } from '../../infra/db/client.js'
import { liquiditySourceRepository,isoDate,type Db,type LiquidityScope } from '../liquidity-sources/liquidity-source.repository.js'
import { resolveSnapshotOrder } from '../liquidity-sources/snapshot-ordering.js'
import type { AccountBinding,ApplicationPreview,CsvDetail,CsvPosition,ExcludedAccountDecision,StatementPosition } from './liquidity-statement.types.js'
import { csvRepository,hash,reviewIssues } from './liquidity-statement.repository.js'
import { CsvError } from './liquidity-statement.errors.js'
import { previewSchema } from './liquidity-statement.zod.js'
import { validateBindings } from './csv-review.service.js'
import { normalizeDraft } from './csv/normalize.js'
import { reconcileDraft } from './csv/reconcile.js'
import { decimal,format,sum } from './csv/decimal.js'

function key(p:CsvPosition|StatementPosition){
  const position=p as CsvPosition&{valuationConvention?:{priceUnit?:string;quantityUnit?:string;multiplier?:string|null}}
  const convention=position.valuationConvention
  const compatibility=[p.currency.value,p.assetType.value,convention?.priceUnit??'UNKNOWN',convention?.quantityUnit??'UNKNOWN',convention?.multiplier??null]
  const symbol=String(p.symbol.value??'').trim().toLocaleUpperCase('en-US')
  if(symbol)return JSON.stringify(['SYMBOL',symbol,...compatibility])
  const cusip=String(p.cusip.value??'').trim().toLocaleUpperCase('en-US')
  if(cusip)return JSON.stringify(['CUSIP',cusip,...compatibility])
  const isin=String(p.isin.value??'').trim().toLocaleUpperCase('en-US')
  if(isin)return JSON.stringify(['ISIN',isin,...compatibility])
  return JSON.stringify(['SOURCE',p.brokerSecurityId.value,p.description.value,...compatibility])
}
function diff(before:Array<CsvPosition|StatementPosition>,after:Array<CsvPosition|StatementPosition>){
  const prior=new Map<string,Array<CsvPosition|StatementPosition>>()
  for(const p of before){const k=key(p);prior.set(k,[...(prior.get(k)??[]),p])}
  let added=0,changed=0
  for(const p of after){const old=prior.get(key(p))?.shift();if(!old)added++;else if(hash([old.quantity.value,old.marketValue.value,old.costBasis.value])!==hash([p.quantity.value,p.marketValue.value,p.costBasis.value]))changed++}
  return {added,changed,removed:[...prior.values()].reduce((n,v)=>n+v.length,0)}
}
const decisionHash=(bindings:AccountBinding[],excluded:ExcludedAccountDecision[])=>hash({
  bindings:[...bindings].sort((left,right)=>left.occurrenceId.localeCompare(right.occurrenceId)),
  excluded:[...excluded].sort((left,right)=>left.occurrenceId.localeCompare(right.occurrenceId)),
})
export async function buildPreview(row:Record<string,any>,detail:CsvDetail,bindings:AccountBinding[],scope:LiquidityScope,db:Db,excludedAccounts:ExcludedAccountDecision[]=[]){
  if(!detail.canonicalDraft||!row.review_revision)throw new CsvError('INVALID_STATE')
  if(decisionHash(bindings,excludedAccounts)!==decisionHash(detail.accountBindings,detail.excludedAccounts??[]))throw new CsvError('STALE_VERSION')
  const result=reconcileDraft(normalizeDraft(detail.canonicalDraft),true)
  const states=await validateBindings(row,result.draft,bindings,scope,db,true,excludedAccounts)
  const selected=new Set(bindings.map(binding=>binding.occurrenceId))
  const issues=reviewIssues(result.draft,bindings.flatMap(b=>b.acknowledgedIssueIds??[])).filter(issue=>issue.accountOccurrenceId===null||selected.has(issue.accountOccurrenceId))
  if(issues.some(i=>i.severity==='BLOCKING'||i.severity==='WARNING'&&!i.acknowledged))throw new CsvError('BLOCKING_ISSUES')
  const accounts:ApplicationPreview['accounts']=[],orders:ReturnType<typeof resolveSnapshotOrder>[]=[]
  for(const binding of bindings){
    const account=result.draft.accounts.find(a=>a.occurrenceId===binding.occurrenceId)!,state=states.find(s=>s.id===binding.accountId)!
    const previous=state.current_snapshot_id?await liquiditySourceRepository.positions(state.current_snapshot_id,state.id,db):[]
    const incoming={asOfDate:String(account.asOfDate.value),asOfAt:account.asOfAt.value as string|null}
    const current=state.current_snapshot_id?{id:state.current_snapshot_id,asOfDate:isoDate(state.as_of_date)!,asOfAt:state.as_of_at?new Date(state.as_of_at).toISOString():null,effectiveKey:state.effective_key}:null
    const order=resolveSnapshotOrder(incoming,current,binding.effectiveOrderDecision)
    orders.push(order)
    const r=result.accounts[account.occurrenceId]!
    accounts.push({accountId:state.id,...incoming,...diff(previous.map(p=>p.canonical),account.positions),previousValue:format(sum(previous.map(p=>decimal(p.market_value)!))),nextValue:r.totalValue,reconciliation:r.status,basisCoverage:r.basisCoverage,gainCoverage:r.gainCoverage,controls:r.controls??[],willBecomeCurrent:order.willBecomeCurrent})
  }
  const accountStates=states.map(s=>({id:s.id,version:s.version,currentSnapshotId:s.current_snapshot_id}))
  const excludedSummary=excludedAccounts.map(excluded=>{const account=result.draft.accounts.find(account=>account.occurrenceId===excluded.occurrenceId)!;return {...excluded,displayName:String(account.displayName.value??'Account'),positionCount:account.positions.length}})
  return {result,accounts,orders,accountStates,excludedAccounts:excludedSummary,canonicalHash:hash(result.draft),summaryHash:hash({accounts,bindings,excludedAccounts:excludedSummary,accountStates,draft:result.draft,runId:row.active_run_id,profileId:row.profile_id,reviewRevision:row.review_revision})}
}
export const csvApplicationPreviewService={async preview(id:string,body:unknown,scope:LiquidityScope):Promise<ApplicationPreview>{
  const input=previewSchema.parse(body)
  if(!config.liquidityCsv.applyEnabled)throw new CsvError('DISABLED')
  return withTransaction(async db=>{
    const row=await csvRepository.get(id,scope,db,true)
    if(row.version!==input.expectedVersion)throw new CsvError('STALE_VERSION')
    if(!['READY_TO_APPLY','NEEDS_REVIEW'].includes(row.status))throw new CsvError('INVALID_STATE')
    const d=await csvRepository.detail(id,scope,db),built=await buildPreview(row,d,input.accountBindings,scope,db,input.excludedAccounts)
    const preview:ApplicationPreview={id:randomUUID(),expectedVersion:row.version,summaryHash:built.summaryHash,expiresAt:new Date(Date.now()+config.liquidityCsv.previewTtlSeconds*1000).toISOString(),canApply:true,accounts:built.accounts,excludedAccounts:built.excludedAccounts}
    await db.query(`insert into liquidity_csv_applications(id,import_id,run_id,review_revision,expected_version,summary_hash,canonical_hash,bindings,excluded_accounts,account_states,preview,expires_at,actor_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,[preview.id,id,row.active_run_id,row.review_revision,row.version,preview.summaryHash,built.canonicalHash,JSON.stringify(input.accountBindings),JSON.stringify(input.excludedAccounts),JSON.stringify(built.accountStates),JSON.stringify(preview),preview.expiresAt,scope.userId])
    return preview
  })
}}
