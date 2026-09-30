import type { CsvDraft,CsvField,CsvIssue,CsvDerivation,IssueCode,StatementDraft } from '../liquidity-statement.types.js'
import { positionFields } from '../liquidity-statement.types.js'
import { abs,decimal,divide,format,RATIO_SCALE,subtract } from './decimal.js'
import { unavailable } from './fields.js'
import { isKnownEquitySymbol } from './equity-symbols.js'

export const NORMALIZATION_RULESET_VERSION='2.0.0'
export const amount=(f:Pick<CsvField,'availability'|'value'>,scale=8):bigint|null=>f.availability==='COMPLETE' && typeof f.value==='string'?decimal(f.value,scale):null
export function derived(value:bigint,rule:CsvDerivation['rule'],operands:string[],scale=8,estimated=false):CsvField {
  return {value:format(value,scale),raw:[],origin:'DERIVED',availability:'COMPLETE',evidence:[],derivation:{rule,version:'1.0.0',operands,estimated},reason:null}
}
const defaulted=(value:string,reason:string):CsvField=>({value,raw:[],origin:'DERIVED',availability:'COMPLETE',evidence:[],derivation:null,reason})
const dynamicIssues=new Set<IssueCode>(['MALFORMED_RECORD','MISSING_DATE','MISSING_CURRENCY','MISSING_VALUE','UNKNOWN_ASSET_TYPE','DUPLICATE_ROW','INCOMPLETE_BASIS','MISSING_BASIS','MISSING_DAY_CHANGE','FIELD_ARITHMETIC_MISMATCH','PERCENT_MISMATCH','PARTIAL_SOURCE_COVERAGE','TOTAL_NOT_PROVIDED','TOTAL_MISMATCH'])
export function normalizeDraft(input:StatementDraft,now?:Date,inPlace?:boolean):StatementDraft
export function normalizeDraft(input:CsvDraft,now?:Date,inPlace?:boolean):CsvDraft
export function normalizeDraft(input:CsvDraft|StatementDraft,now?:Date,inPlace?:boolean):CsvDraft|StatementDraft
export function normalizeDraft(input:CsvDraft|StatementDraft,now=new Date(),inPlace=false):CsvDraft|StatementDraft {
  const draft=inPlace?input:structuredClone(input)
  draft.issues=draft.issues.filter(i=>!dynamicIssues.has(i.code) || i.code==='MISSING_DATE' && i.sourceRecords.length>0)
  draft.accounts.forEach((account,ai)=>{
    const issue=(code:IssueCode,severity:CsvIssue['severity'],fieldPath:string|null,sourceRecords:number[]=[])=>draft.issues.push({code,severity,accountOccurrenceId:account.occurrenceId,fieldPath,sourceRecords})
    const zone=typeof account.sourceZone.value==='string'?account.sourceZone.value:'UTC'
    let today=now.toISOString().slice(0,10)
    try {today=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now)} catch {issue('MISSING_DATE','BLOCKING',`accounts.${ai}.sourceZone`)}
    const date=account.asOfDate.value
    if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date>today)issue('MISSING_DATE','BLOCKING',`accounts.${ai}.asOfDate`)
    if(account.currency.value==null)account.currency=defaulted('USD','DEFAULT_USD')
    if(typeof account.currency.value!=='string'||!/^[A-Z]{3}$/.test(account.currency.value))issue('MISSING_CURRENCY','BLOCKING',`accounts.${ai}.currency`)
    const seen=new Set<string>()
    for(const [pi,p] of account.positions.entries()){
      const path=`accounts.${ai}.positions.${pi}`
      for(const key of positionFields){
        // Only shared financial derivations are recomputed. Adapter
        // interpretations (for example a tested product classification or
        // confirmed source currency) may also be represented as DERIVED but
        // have no derivation payload and must remain intact.
        if(p[key].derivation)p[key]=unavailable()
        if(p[key].reason==='INVALID_DECIMAL')issue('MALFORMED_RECORD','BLOCKING',`${path}.${key}`,[p.sourceRecord])
      }
      if((p.currency.value==null || p.currency.reason==='ACCOUNT_CURRENCY') && account.currency.value!=null)(p as any).currency={...account.currency,raw:[],evidence:account.currency.evidence,reason:'ACCOUNT_CURRENCY'}
      if(p.currency.value==null)issue('MISSING_CURRENCY','BLOCKING',`${path}.currency`,[p.sourceRecord])
      const description=String(p.description.value??'').trim().toLocaleUpperCase('en-US')
      if(p.assetType.value==null&&['ML BANK DEPOSIT PROGRAM','ML BANK DEPOSITY PROGRAM','BLF FEDFUND'].includes(description))p.assetType=defaulted('cash','KNOWN_CASH_PROGRAM')
      if(p.assetType.value==null&&isKnownEquitySymbol(p.symbol.value))p.assetType=defaulted('equity','KNOWN_EQUITY_SYMBOL')
      if(p.assetType.value==null)p.assetType=defaulted('other','DEFAULT_OTHER_ASSET_TYPE')
      const m=amount(p.marketValue);let b=amount(p.costBasis),g=amount(p.unrealizedGainLoss)
      const ratio=amount(p.unrealizedGainLossRatio,RATIO_SCALE),price=amount(p.price),quantity=amount(p.quantity)
      const cashValueAtPar=p.assetType.value==='cash'&&quantity==null&&price==null
      const cashUnitAtPar=p.assetType.value==='cash'&&price===100000000n
      if(m==null)issue('MISSING_VALUE','BLOCKING',`${path}.marketValue`,[p.sourceRecord])
      if(p.costBasis.availability==='INCOMPLETE'&&m!=null&&g==null&&ratio==null&&(cashValueAtPar||cashUnitAtPar)){
        b=m;p.costBasis=derived(b,cashValueAtPar?'CASH_VALUE_BASIS':'CASH_AT_PAR',[`${path}.marketValue`,cashValueAtPar?`${path}.assetType`:`${path}.price`])
      }else if(p.costBasis.availability==='INCOMPLETE'){
        issue('INCOMPLETE_BASIS','WARNING',`${path}.costBasis`,[p.sourceRecord])
        p.unrealizedGainLoss.availability=p.unrealizedGainLoss.value==null?'UNAVAILABLE':'INCOMPLETE'
        p.unrealizedGainLossRatio.availability=p.unrealizedGainLossRatio.value==null?'UNAVAILABLE':'INCOMPLETE'
        g=null
      }else if(b==null && m!=null && g!=null){
        b=subtract(m,g);p.costBasis=derived(b,'BASIS_FROM_VALUE_GAIN',[`${path}.marketValue`,`${path}.unrealizedGainLoss`])
      }else if(b==null && m!=null && ratio!=null && ratio>-(10n**BigInt(RATIO_SCALE))){
        b=divide(m,10n**BigInt(RATIO_SCALE)+ratio,RATIO_SCALE)
        p.costBasis=derived(b,'BASIS_FROM_PERCENT_ESTIMATE',[`${path}.marketValue`,`${path}.unrealizedGainLossRatio`],8,true)
      }else if(b==null && m!=null && g==null && ratio==null && cashValueAtPar){
        b=m;p.costBasis=derived(b,'CASH_VALUE_BASIS',[`${path}.marketValue`,`${path}.assetType`])
      }else if(b==null && m!=null && g==null && ratio==null && cashUnitAtPar){
        b=m;p.costBasis=derived(b,'CASH_AT_PAR',[`${path}.marketValue`,`${path}.price`])
      }else if(b==null)issue('MISSING_BASIS','WARNING',`${path}.costBasis`,[p.sourceRecord])
      if(m!=null && b!=null && g==null && p.costBasis.availability==='COMPLETE'){
        g=subtract(m,b);p.unrealizedGainLoss=derived(g,'GAIN_FROM_VALUE_BASIS',[`${path}.marketValue`,`${path}.costBasis`])
      }
      if(m!=null&&b!=null&&g!=null&&abs(m-b-g)>1000000n)issue('FIELD_ARITHMETIC_MISMATCH','BLOCKING',path,[p.sourceRecord])
      if(b!=null && b>0n && g!=null){
        const calculated=divide(g,b,12),reported=amount(p.unrealizedGainLossRatio,12)
        if(reported==null)p.unrealizedGainLossRatio=derived(calculated,'PERCENT_FROM_GAIN_BASIS',[`${path}.unrealizedGainLoss`,`${path}.costBasis`],12)
        else if(p.costBasis.derivation?.rule!=='BASIS_FROM_PERCENT_ESTIMATE'){
          const raw=p.unrealizedGainLossRatio.raw[0]??''
          const sourceScale='interpretation' in p.unrealizedGainLossRatio?p.unrealizedGainLossRatio.interpretation?.sourceScale:undefined
          const tolerance=sourceScale===undefined
            ? (10n**BigInt((p.unrealizedGainLossRatio.reason==='RATIO_UNITS'?12:10)-Math.min((raw.replace(/%$/,'').split('.')[1]??'').length,p.unrealizedGainLossRatio.reason==='RATIO_UNITS'?12:10)))/2n
            : (10n**BigInt(12-Math.min(12,Math.max(0,sourceScale))))/2n
          if(abs(calculated-reported)>tolerance)issue('PERCENT_MISMATCH','BLOCKING',`${path}.unrealizedGainLossRatio`,[p.sourceRecord])
        }
      }else if(b===0n)p.unrealizedGainLossRatio=unavailable('ZERO_BASIS')
      const identity=JSON.stringify(positionFields.map(k=>p[k].raw))
      if(seen.has(identity))issue('DUPLICATE_ROW','WARNING',path,[p.sourceRecord]);seen.add(identity)
    }
  })
  return draft
}
