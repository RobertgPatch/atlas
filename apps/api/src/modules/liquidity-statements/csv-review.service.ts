import { randomUUID } from 'node:crypto'
import { withTransaction } from '../../infra/db/client.js'
import { auditRepository } from '../audit/audit.repository.js'
import { liquiditySourceRepository,type Db,type LiquidityScope } from '../liquidity-sources/liquidity-source.repository.js'
import type { AccountBinding,CsvDraft,CsvField,ReviewChange } from './liquidity-statement.types.js'
import { CsvError } from './liquidity-statement.errors.js'
import { reviewSchema,decimalString,ratioString,dateString,currency } from './liquidity-statement.zod.js'
import { csvRepository,hash,reviewIssues } from './liquidity-statement.repository.js'
import { normalizeDraft } from './csv/normalize.js'
import { reconcileDraft } from './csv/reconcile.js'

export async function validateBindings(row:Record<string,any>,draft:CsvDraft,bindings:AccountBinding[],scope:LiquidityScope,db:Db,lock=false){
  if(bindings.length!==draft.accounts.length || new Set(bindings.map(b=>b.accountId)).size!==bindings.length)throw new CsvError('BLOCKING_ISSUES')
  const states:Record<string,any>[]=[]
  for(const binding of [...bindings].sort((a,b)=>a.accountId.localeCompare(b.accountId))){
    const a=draft.accounts.find(a=>a.occurrenceId===binding.occurrenceId)
    if(!a||!binding.completeAccount||!a.positions.length&&(!binding.emptyAccountConfirmed||!binding.emptyReason?.trim()))throw new CsvError('BLOCKING_ISSUES')
    const target=await liquiditySourceRepository.get(binding.accountId,scope,db,lock)
    if(target.entity_id!==row.entity_id||target.custodian!==row.custodian)throw new CsvError('FORBIDDEN')
    if(target.version!==binding.expectedAccountVersion)throw new CsvError('STALE_VERSION')
    if(a.currency.value!=null&&a.currency.value!==target.currency)throw new CsvError('BLOCKING_ISSUES')
    if(target.identifier_fingerprint&&a.identifierFingerprints.length&&!a.identifierFingerprints.includes(target.identifier_fingerprint))throw new CsvError('BLOCKING_ISSUES')
    states.push(target)
  }
  return states
}
export function applyCorrections(input:CsvDraft,changes:ReviewChange[]):CsvDraft {
  const draft=structuredClone(input)
  for(const change of changes){
    const parts=change.fieldPath.split('.'),a=draft.accounts[Number(parts[1])]
    if(!a)throw new CsvError('INVALID_REQUEST')
    const key=parts.at(-1)!,target=parts[2]==='positions'?a.positions[Number(parts[3])]:a
    if(!target || !(key in target))throw new CsvError('INVALID_REQUEST')
    const existing=(target as unknown as Record<string,CsvField>)[key]!
    if(typeof existing!=='object'||!('availability' in existing))throw new CsvError('INVALID_REQUEST')
    const numeric=['quantity','price','marketValue','costBasis','unrealizedGainLoss','dayChange','accruedInterest','quoteMultiplier','reportedTotal','reportedBasis','reportedGain'].includes(key)
    const value=change.value
    if(value!==null){
      if(typeof value!=='string')throw new CsvError('INVALID_REQUEST')
      if(numeric)decimalString.parse(value)
      if(key.endsWith('Ratio'))ratioString.parse(value)
      if(key==='currency')currency.parse(value)
      if(key==='asOfDate')dateString.parse(value)
      if(key==='asOfAt'&&!Number.isFinite(Date.parse(value)))throw new CsvError('INVALID_REQUEST')
      if(key==='assetType'&&!['equity','fund','cash','bond','option','other','unknown'].includes(value))throw new CsvError('INVALID_REQUEST')
    }
    ;(target as unknown as Record<string,CsvField>)[key]={...existing,value,origin:'REVIEWED',availability:value==null?'UNAVAILABLE':'COMPLETE',derivation:null,reason:change.reason}
    if(key==='asOfAt')a.asOfPrecision=value==null?'DATE':'INSTANT'
    if(key==='asOfDate'&&a.asOfAt.value==null)a.asOfPrecision='DATE'
  }
  return draft
}
export const csvReviewService={async review(id:string,body:unknown,scope:LiquidityScope){
  const input=reviewSchema.parse(body)
  return withTransaction(async db=>{
    const row=await csvRepository.get(id,scope,db,true)
    if(row.version!==input.expectedVersion)throw new CsvError('STALE_VERSION')
    if(!['NEEDS_REVIEW','READY_TO_APPLY'].includes(row.status))throw new CsvError('INVALID_STATE')
    const current=await csvRepository.detail(id,scope,db)
    if(!current.canonicalDraft)throw new CsvError('INVALID_STATE')
    const result=reconcileDraft(normalizeDraft(applyCorrections(current.canonicalDraft,input.changes),new Date(),true),true)
    await validateBindings(row,result.draft,input.accountBindings,scope,db)
    const acknowledged=input.accountBindings.flatMap(b=>b.acknowledgedIssueIds??[]),issues=reviewIssues(result.draft,acknowledged)
    const ready=issues.every(i=>i.severity==='INFO'||i.severity==='WARNING'&&i.acknowledged)
    const revision=row.review_revision+1
    const fieldAt=(draft:CsvDraft,path:string)=>path.split('.').reduce<unknown>((value,key)=>(value as Record<string,unknown>)?.[key],draft)
    await db.query(`insert into liquidity_csv_reviews(id,import_id,run_id,revision,actor_id,changes,canonical_draft,canonical_hash,bindings,issues,reconciliation) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[randomUUID(),id,row.active_run_id,revision,scope.userId,JSON.stringify(input.changes.map(c=>({...c,before:fieldAt(current.canonicalDraft!,c.fieldPath),after:fieldAt(result.draft,c.fieldPath)}))),JSON.stringify(result.draft),hash(result.draft),JSON.stringify(input.accountBindings),JSON.stringify(issues),JSON.stringify(result.accounts)])
    await db.query('update liquidity_csv_imports set status=$2,review_revision=$3,version=version+1 where id=$1',[id,ready?'READY_TO_APPLY':'NEEDS_REVIEW',revision])
    await auditRepository.record({actorUserId:scope.userId,eventName:'liquidity.csv.review',objectType:'liquidity_csv',objectId:id,after:{revision,changeCount:input.changes.length}},db)
    return csvRepository.detail(id,scope,db)
  })
}}
