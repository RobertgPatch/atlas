import type { Coverage,CsvControlComparison,CsvDraft,CsvField,CsvReconciliation,StatementDraft,StatementField,StatementPosition } from '../liquidity-statement.types.js'
import { abs,decimal,format,sum } from './decimal.js'
import { amount } from './normalize.js'
export const RECONCILIATION_RULESET_VERSION='2.0.0'
const originalAmount=(field:Pick<CsvField,'origin'|'raw'|'value'|'availability'|'derivation'>):bigint|null=>{
  if(field.origin!=='REVIEWED')return amount(field)
  let token=field.raw[0]?.trim()
  if(!token||/^(?:--|-|N\/A|Incomplete)$/iu.test(token))return null
  const accounting=token.startsWith('(')&&token.endsWith(')')
  if(accounting)token=token.slice(1,-1)
  token=token.replace(/^\$/u,'').replaceAll(',','')
  if(!/^[+-]?(?:\d+)(?:\.\d+)?$/u.test(token)||accounting&&/^[+-]/u.test(token))return null
  try{return decimal(`${accounting?'-':''}${token}`)}catch{return null}
}
export function coverage(fields:Array<Pick<CsvField,'availability'|'value'|'derivation'>>):Coverage {
  const known=fields.filter(f=>amount(f)!=null),unknown=fields.length-known.length
  const subtotal=format(sum(known.map(f=>amount(f)!)))
  return {knownRows:known.length,unknownRows:unknown,estimatedRows:known.filter(f=>f.derivation?.estimated||['CASH_AT_PAR','CASH_VALUE_BASIS'].includes(f.derivation?.rule??'')).length,status:unknown===0?'COMPLETE':known.length?'PARTIAL':'UNAVAILABLE',knownSubtotal:subtotal,total:unknown?null:subtotal}
}
export function reconcileDraft(input:StatementDraft,inPlace?:boolean):{draft:StatementDraft;accounts:Record<string,CsvReconciliation>}
export function reconcileDraft(input:CsvDraft,inPlace?:boolean):{draft:CsvDraft;accounts:Record<string,CsvReconciliation>}
export function reconcileDraft(input:CsvDraft|StatementDraft,inPlace?:boolean):{draft:CsvDraft|StatementDraft;accounts:Record<string,CsvReconciliation>}
export function reconcileDraft(input:CsvDraft|StatementDraft,inPlace=false):{draft:CsvDraft|StatementDraft;accounts:Record<string,CsvReconciliation>} {
  if(input.schemaVersion==='3.0.0')return reconcileStatementDraft(input,inPlace)
  const draft=inPlace?input:structuredClone(input),accounts:Record<string,CsvReconciliation>={}
  draft.issues=draft.issues.filter(i=>!['TOTAL_NOT_PROVIDED','TOTAL_MISMATCH','PARTIAL_SOURCE_COVERAGE'].includes(i.code))
  for(const [ai,a] of draft.accounts.entries()){
    const values=a.positions.map(p=>amount(p.marketValue)),total=sum(values.filter((v):v is bigint=>v!=null)),reported=amount(a.reportedTotal)
    const currencies=new Set(a.positions.map(p=>p.currency.value).filter(Boolean))
    const mixed=currencies.size>1 || [...currencies].some(c=>c!==a.currency.value)
    let status:CsvReconciliation['status']=reported==null?'NOT_PROVIDED':abs(total-reported)<=1000000n?'MATCHED':'BLOCKED'
    if(values.some(v=>v==null)||mixed)status='BLOCKED'
    if(status==='BLOCKED')draft.issues.push({code:'TOTAL_MISMATCH',severity:'BLOCKING',accountOccurrenceId:a.occurrenceId,fieldPath:`accounts.${ai}.reportedTotal`,sourceRecords:[]})
    const basisCoverage=coverage(a.positions.map(p=>p.costBasis)),gainCoverage=coverage(a.positions.map(p=>p.unrealizedGainLoss))
    const controls:CsvControlComparison[]=[]
    for(const [footer,cover,footerField] of [[a.reportedBasis,basisCoverage,'reportedBasis'],[a.reportedGain,gainCoverage,'reportedGain']] as const){
      if(!footer||amount(footer)==null)continue
      const fields=a.positions.map(p=>footerField==='reportedBasis'?p.costBasis:p.unrealizedGainLoss)
      const fieldPath=`accounts.${ai}.${footerField}`,reported=amount(footer)!
      const sourceValues=fields.map(field=>{try{return field.raw[0]===undefined?null:decimal(field.raw[0])}catch{return null}})
      const coveredIndexes=sourceValues.flatMap((value,index)=>value===null?[]:[index])
      const originalObserved=coveredIndexes.length?sum(coveredIndexes.map(index=>sourceValues[index]!)):null
      const effectiveValues=coveredIndexes.map(index=>amount(fields[index]!))
      const effectiveObserved=effectiveValues.length&&effectiveValues.every((value):value is bigint=>value!==null)?sum(effectiveValues):null
      const comparison=(observed:bigint|null):CsvControlComparison['originalStatus']=>observed===null?'UNVERIFIABLE':abs(observed-reported)<=1000000n?'MATCHED':'MISMATCH'
      const originalStatus=comparison(originalObserved),effectiveStatus=comparison(effectiveObserved)
      controls.push({fieldPath,originalStatus,effectiveStatus,reported:format(reported),originalObserved:originalObserved===null?null:format(originalObserved),effectiveObserved:effectiveObserved===null?null:format(effectiveObserved)})
      if(coveredIndexes.length<fields.length||cover.unknownRows>0)draft.issues.push({code:'PARTIAL_SOURCE_COVERAGE',severity:'WARNING',accountOccurrenceId:a.occurrenceId,fieldPath,sourceRecords:[]})
      if(effectiveStatus==='MISMATCH'){status='BLOCKED';draft.issues.push({code:'TOTAL_MISMATCH',severity:'BLOCKING',accountOccurrenceId:a.occurrenceId,fieldPath,sourceRecords:[]})}
    }
    accounts[a.occurrenceId]={status,totalValue:format(total),difference:reported==null?null:format(total-reported),basisCoverage,gainCoverage,controls}
  }
  return {draft,accounts}
}

function reconcileStatementDraft(input:StatementDraft,inPlace=false):{draft:StatementDraft;accounts:Record<string,CsvReconciliation>}{
  const draft=inPlace?input:structuredClone(input),accounts:Record<string,CsvReconciliation>={}
  draft.issues=draft.issues.filter(issue=>!['TOTAL_NOT_PROVIDED','TOTAL_MISMATCH','PARTIAL_SOURCE_COVERAGE'].includes(issue.code))
  for(const [accountIndex,account] of draft.accounts.entries()){
    const positionById=new Map(account.positions.map(position=>[position.occurrenceId,position]))
    const values=account.positions.map(position=>amount(position.marketValue)),total=sum(values.filter((value):value is bigint=>value!==null))
    const currencies=new Set(account.positions.map(position=>position.currency.value).filter(Boolean))
    const mixed=currencies.size>1||[...currencies].some(currency=>currency!==account.currency.value)
    const valueControl=draft.controls.find(control=>control.accountOccurrenceId===account.occurrenceId&&control.metric==='MARKET_VALUE'&&control.scope.kind==='COMPLETE_ACCOUNT')
    const reported=valueControl?amount(valueControl.reported):null
    let status:CsvReconciliation['status']=reported===null?'NOT_PROVIDED':abs(total-reported)<=decimal(valueControl?.tolerance??'0.01')!?'MATCHED':'BLOCKED'
    if(values.some(value=>value===null)||mixed)status='BLOCKED'
    const controls:CsvControlComparison[]=[]
    for(const sourceControl of draft.controls.filter(control=>control.accountOccurrenceId===account.occurrenceId)){
      const reportedAmount=amount(sourceControl.reported)
      const operands=sourceControl.scope.occurrenceIds.map(id=>{
        const position=positionById.get(id) as (StatementPosition&Record<string,StatementField|undefined>)|undefined
        return position?.[sourceControl.scope.operandField]
      })
      const originalOperands=operands.map(field=>field?originalAmount(field):null)
      const effectiveOperands=sourceControl.scope.occurrenceIds.map((id,index)=>{
        const position=positionById.get(id)
        const effectiveField=sourceControl.scope.operandField==='sourceAdjustedCost'&&position?.basisSourceField?.startsWith('ADJUSTED_COST')
          ?position.costBasis
          :operands[index]
        return effectiveField?amount(effectiveField):null
      })
      const originalObserved=reportedAmount===null||!operands.length||originalOperands.some(value=>value===null)?null:sum(originalOperands as bigint[])
      const effectiveObserved=reportedAmount===null||!operands.length||effectiveOperands.some(value=>value===null)?null:sum(effectiveOperands as bigint[])
      const tolerance=decimal(sourceControl.tolerance)!
      const comparison=(observed:bigint|null):CsvControlComparison['originalStatus']=>observed===null?'UNVERIFIABLE':abs(observed-reportedAmount!)<=tolerance?'MATCHED':'MISMATCH'
      const originalStatus=comparison(originalObserved),effectiveStatus=comparison(effectiveObserved)
      controls.push({fieldPath:`controls.${sourceControl.id}`,originalStatus,effectiveStatus,reported:reportedAmount===null?String(sourceControl.reported.value??''):format(reportedAmount),originalObserved:originalObserved===null?null:format(originalObserved),effectiveObserved:effectiveObserved===null?null:format(effectiveObserved)})
      if(sourceControl.scope.kind!=='COMPLETE_ACCOUNT'||operands.length<account.positions.length)draft.issues.push({code:'PARTIAL_SOURCE_COVERAGE',severity:'WARNING',accountOccurrenceId:account.occurrenceId,fieldPath:`controls.${sourceControl.id}`,sourceRecords:sourceControl.scope.occurrenceIds.flatMap(id=>positionById.get(id)?.sourceRecord??[])})
      if(effectiveStatus==='MISMATCH'){
        status='BLOCKED'
        draft.issues.push({code:'TOTAL_MISMATCH',severity:'BLOCKING',accountOccurrenceId:account.occurrenceId,fieldPath:`controls.${sourceControl.id}`,sourceRecords:sourceControl.scope.occurrenceIds.flatMap(id=>positionById.get(id)?.sourceRecord??[])})
      }
    }
    if(status==='BLOCKED'&&!draft.issues.some(issue=>issue.code==='TOTAL_MISMATCH'&&issue.accountOccurrenceId===account.occurrenceId))draft.issues.push({code:'TOTAL_MISMATCH',severity:'BLOCKING',accountOccurrenceId:account.occurrenceId,fieldPath:valueControl?`controls.${valueControl.id}`:`accounts.${accountIndex}`,sourceRecords:[]})
    const basisCoverage=coverage(account.positions.map(position=>position.costBasis)),gainCoverage=coverage(account.positions.map(position=>position.unrealizedGainLoss))
    accounts[account.occurrenceId]={status,totalValue:format(total),difference:reported===null?null:format(total-reported),basisCoverage,gainCoverage,controls}
  }
  return {draft,accounts}
}
