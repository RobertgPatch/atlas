import type { AccountBinding } from '../liquidity-statements/liquidity-statement.types.js'
import { CsvError } from '../liquidity-statements/liquidity-statement.errors.js'
export interface EffectiveObservation { asOfDate:string;asOfAt:string|null }
export function resolveSnapshotOrder(incoming:EffectiveObservation,current:(EffectiveObservation&{id:string;effectiveKey:string})|null,decision?:AccountBinding['effectiveOrderDecision']){
  let effectiveKey=incoming.asOfAt?`INSTANT:${new Date(incoming.asOfAt).toISOString()}`:`DATE:${incoming.asOfDate}`
  const eligible=decision?.kind!=='HISTORICAL_ONLY'
  if(!current)return {effectiveKey,willBecomeCurrent:eligible,eligible}
  if(incoming.asOfDate!==current.asOfDate)return {effectiveKey,willBecomeCurrent:eligible&&incoming.asOfDate>current.asOfDate,eligible}
  if(Boolean(incoming.asOfAt)!==Boolean(current.asOfAt)){
    if(decision?.kind==='HISTORICAL_ONLY')return {effectiveKey,willBecomeCurrent:false,eligible:false}
    if(decision?.kind!=='CORRECTION'||decision.replacesSnapshotId!==current.id)throw new CsvError('BLOCKING_ISSUES')
    effectiveKey=current.effectiveKey
  }
  const willBecomeCurrent=eligible&&(effectiveKey===current.effectiveKey||!incoming.asOfAt||!current.asOfAt||Date.parse(incoming.asOfAt)>=Date.parse(current.asOfAt))
  return {effectiveKey,willBecomeCurrent,eligible}
}
