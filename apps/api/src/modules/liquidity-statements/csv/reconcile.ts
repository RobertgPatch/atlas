import type { Coverage,CsvDraft,CsvField,CsvReconciliation } from '../liquidity-statement.types.js'
import { abs,format,sum } from './decimal.js'
import { amount } from './normalize.js'
export function coverage(fields:CsvField[]):Coverage {
  const known=fields.filter(f=>amount(f)!=null),unknown=fields.length-known.length
  const subtotal=format(sum(known.map(f=>amount(f)!)))
  return {knownRows:known.length,unknownRows:unknown,estimatedRows:known.filter(f=>f.derivation?.estimated||['CASH_AT_PAR','CASH_VALUE_BASIS'].includes(f.derivation?.rule??'')).length,status:unknown===0?'COMPLETE':known.length?'PARTIAL':'UNAVAILABLE',knownSubtotal:subtotal,total:unknown?null:subtotal}
}
export function reconcileDraft(input:CsvDraft,inPlace=false):{draft:CsvDraft;accounts:Record<string,CsvReconciliation>} {
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
    for(const [footer,cover,footerField] of [[a.reportedBasis,basisCoverage,'reportedBasis'],[a.reportedGain,gainCoverage,'reportedGain']] as const){
      if(!footer||amount(footer)==null)continue
      const fields=a.positions.map(p=>footerField==='reportedBasis'?p.costBasis:p.unrealizedGainLoss)
      const sourceScopeChanged=footer.origin!=='REVIEWED'&&fields.some(field=>field.origin==='REVIEWED'||field.derivation?.rule==='CASH_VALUE_BASIS')
      if(cover.unknownRows>0||sourceScopeChanged)draft.issues.push({code:'PARTIAL_SOURCE_COVERAGE',severity:'WARNING',accountOccurrenceId:a.occurrenceId,fieldPath:`accounts.${ai}.${footerField}`,sourceRecords:[]})
      else {
        const values=fields.map(field=>amount(field)!)
        if(abs(sum(values)-amount(footer)!)>1000000n){status='BLOCKED';draft.issues.push({code:'TOTAL_MISMATCH',severity:'BLOCKING',accountOccurrenceId:a.occurrenceId,fieldPath:`accounts.${ai}.${footerField}`,sourceRecords:[]})}
      }
    }
    accounts[a.occurrenceId]={status,totalValue:format(total),difference:reported==null?null:format(total-reported),basisCoverage,gainCoverage}
  }
  return {draft,accounts}
}
