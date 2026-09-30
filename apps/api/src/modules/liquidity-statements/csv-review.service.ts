import { randomUUID } from 'node:crypto'
import { withTransaction } from '../../infra/db/client.js'
import { auditRepository } from '../audit/audit.repository.js'
import { liquiditySourceRepository,type Db,type LiquidityScope } from '../liquidity-sources/liquidity-source.repository.js'
import type { AccountBinding,CsvDraft,CsvField,ExcludedAccountDecision,ReviewChange,StatementDraft } from './liquidity-statement.types.js'
import { CsvError } from './liquidity-statement.errors.js'
import { reviewSchema,decimalString,ratioString,dateString,currency } from './liquidity-statement.zod.js'
import { csvRepository,hash,reviewIssues } from './liquidity-statement.repository.js'
import { normalizeDraft } from './csv/normalize.js'
import { reconcileDraft } from './csv/reconcile.js'

export async function validateBindings(row:Record<string,any>,draft:CsvDraft|StatementDraft,bindings:AccountBinding[],scope:LiquidityScope,db:Db,lock=false,excludedAccounts:ExcludedAccountDecision[]=[]){
  const selectedOccurrences=new Set(bindings.map(binding=>binding.occurrenceId)),excludedOccurrences=new Set(excludedAccounts.map(excluded=>excluded.occurrenceId))
  const allOccurrences=new Set(draft.accounts.map(account=>account.occurrenceId))
  const decisions=[...selectedOccurrences,...excludedOccurrences]
  if(!bindings.length||new Set(bindings.map(b=>b.accountId)).size!==bindings.length||decisions.length!==new Set(decisions).size||decisions.length!==allOccurrences.size||decisions.some(id=>!allOccurrences.has(id)))throw new CsvError('BLOCKING_ISSUES')
  const states:Record<string,any>[]=[]
  for(const binding of [...bindings].sort((a,b)=>a.accountId.localeCompare(b.accountId))){
    const a=draft.accounts.find(a=>a.occurrenceId===binding.occurrenceId)
    if(!a||!binding.completeAccount||('completeness'in a&&a.completeness==='UNSUPPORTED_PARTIAL')||(!a.positions.length&&(!binding.emptyAccountConfirmed||!binding.emptyReason?.trim())))throw new CsvError('BLOCKING_ISSUES')
    const target=await liquiditySourceRepository.get(binding.accountId,scope,db,lock)
    if(target.entity_id!==row.entity_id||target.custodian!==row.custodian)throw new CsvError('FORBIDDEN')
    if(target.version!==binding.expectedAccountVersion)throw new CsvError('STALE_VERSION')
    if(a.currency.value!=null&&a.currency.value!==target.currency)throw new CsvError('BLOCKING_ISSUES')
    if(target.identifier_fingerprint&&a.identifierFingerprints.length&&!a.identifierFingerprints.includes(target.identifier_fingerprint))throw new CsvError('BLOCKING_ISSUES')
    states.push(target)
  }
  return states
}
export function applyCorrections<T extends CsvDraft|StatementDraft>(input:T,changes:ReviewChange[]):T {
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
    if(parts[2]!=='positions'&&key==='currency')for(const position of a.positions){
      const source=position.currency as CsvField&{interpretation?:{rule?:string}|null}
      if(source.evidence.length===0||source.reason==='ACCOUNT_CURRENCY'||source.interpretation?.rule==='CONFIRMED_USD_DEFAULT'||source.interpretation?.rule?.includes('USD_EXPORT_DEFAULT'))position.currency={...source,value,origin:'REVIEWED',availability:value==null?'UNAVAILABLE':'COMPLETE',derivation:null,reason:change.reason}
    }
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
    await validateBindings(row,result.draft,input.accountBindings,scope,db,false,input.excludedAccounts)
    const acknowledged=input.accountBindings.flatMap(b=>b.acknowledgedIssueIds??[]),selected=new Set(input.accountBindings.map(binding=>binding.occurrenceId))
    const issues=reviewIssues(result.draft,acknowledged).filter(issue=>issue.accountOccurrenceId===null||selected.has(issue.accountOccurrenceId))
    const ready=issues.every(i=>i.severity==='INFO'||i.severity==='WARNING'&&i.acknowledged)
    const revision=await csvRepository.allocateReviewRevision(id,db),reviewId=randomUUID()
    const fieldAt=(draft:CsvDraft|StatementDraft,path:string)=>path.split('.').reduce<unknown>((value,key)=>(value as Record<string,unknown>)?.[key],draft)
    await db.query(`insert into liquidity_csv_reviews(id,import_id,run_id,revision,actor_id,changes,canonical_draft,canonical_hash,bindings,excluded_accounts,issues,reconciliation) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[reviewId,id,row.active_run_id,revision,scope.userId,JSON.stringify(input.changes.map(c=>({...c,before:fieldAt(current.canonicalDraft!,c.fieldPath),after:fieldAt(result.draft,c.fieldPath)}))),JSON.stringify(result.draft),hash(result.draft),JSON.stringify(input.accountBindings),JSON.stringify(input.excludedAccounts),JSON.stringify(issues),JSON.stringify(result.accounts)])
    await csvRepository.activateReview(id,row.active_run_id,reviewId,ready?'READY_TO_APPLY':'NEEDS_REVIEW',db)
    await auditRepository.record({actorUserId:scope.userId,eventName:'liquidity.csv.review',objectType:'liquidity_csv',objectId:id,after:{revision,changeCount:input.changes.length}},db)
    await auditRepository.record({actorUserId:scope.userId,eventName:'liquidity.statement.selection',objectType:'liquidity_csv',objectId:id,after:{revision,selectedAccountCount:input.accountBindings.length,excludedAccountCount:input.excludedAccounts.length}},db)
    return csvRepository.detail(id,scope,db)
  })
}}
