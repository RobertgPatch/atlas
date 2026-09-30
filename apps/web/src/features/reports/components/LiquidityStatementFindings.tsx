/* eslint-disable react-refresh/only-export-components */
import { useEffect,useMemo,useRef } from 'react'
import type { CsvReconciliation,ReviewIssue,StatementStoredRecord,CsvRecord } from '../../../../../../packages/types/src/liquidity-statements'
import { formatCurrencyWithCents } from '../utils/formatters'

export function statementIssueDescription(issue:ReviewIssue){
  const path=issue.fieldPath??''
  if(issue.code==='TOTAL_MISMATCH'){
    if(path.endsWith('.reportedTotal'))return 'Holdings value total does not match the CSV footer.'
    if(path.endsWith('.reportedBasis'))return 'Cost-basis control total does not match the CSV footer.'
    if(path.endsWith('.reportedGain'))return 'Gain/loss control total does not match the CSV footer.'
    return 'A reported holdings, basis, or gain/loss control total does not match the statement.'
  }
  if(issue.code==='PARTIAL_SOURCE_COVERAGE'){
    if(path.endsWith('.reportedBasis'))return 'The statement cost-basis control covers only part of the holdings. Review and acknowledge this warning.'
    if(path.endsWith('.reportedGain'))return 'The statement gain/loss control covers only part of the holdings. Review and acknowledge this warning.'
  }
  return issue.code.replaceAll('_',' ')
}

const money=(value:string|null|undefined)=>value==null?'Unknown':formatCurrencyWithCents(Number(value),'USD')
const severityRank={BLOCKING:0,WARNING:1,INFO:2} as const
const recordLocation=(record:CsvRecord|StatementStoredRecord|undefined)=>{
  if(!record)return 'Location unavailable'
  if('sourceLocation' in record){
    const location=record.sourceLocation as {sheetName?:string;address?:string;row?:number}
    return location.sheetName&&location.address?`${location.sheetName}!${location.address}`:`workbook record ${record.ordinal}`
  }
  return `CSV line ${record.lineStart}${record.lineEnd!==record.lineStart?`–${record.lineEnd}`:''}`
}

export function LiquidityStatementFindings({issues,reconciliations,records,onLocate}:{
  issues:ReviewIssue[]
  reconciliations:Record<string,CsvReconciliation>
  records:Array<CsvRecord|StatementStoredRecord>
  onLocate:(ordinal:number)=>void
}){
  const heading=useRef<HTMLHeadingElement>(null)
  const sorted=useMemo(()=>[...issues].sort((left,right)=>severityRank[left.severity]-severityRank[right.severity]),[issues])
  const hasBlocking=sorted.some(issue=>issue.severity==='BLOCKING')
  useEffect(()=>{if(hasBlocking)heading.current?.focus({preventScroll:true})},[hasBlocking,issues.length])
  if(!issues.length)return null
  return <section aria-labelledby="statement-findings-heading" className="space-y-2 rounded-lg border border-slate-300 p-3">
    <h4 id="statement-findings-heading" ref={heading} tabIndex={-1} className="font-semibold outline-none">Review findings ({issues.length})</h4>
    <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr>{['Severity','Finding','Location','Expected','Actual','Difference','Action'].map(label=><th key={label} className="p-2">{label}</th>)}</tr></thead><tbody>{sorted.map(issue=>{
      const comparison=Object.values(reconciliations).flatMap(value=>value.controls??[]).find(value=>value.fieldPath===issue.fieldPath)
      const ordinal=issue.sourceRecords[0],record=records.find(item=>item.ordinal===ordinal)
      const difference=comparison?.effectiveObserved==null?null:Number(comparison.effectiveObserved)-Number(comparison.reported)
      return <tr key={issue.id} className="border-t align-top"><td className="p-2 font-semibold">{issue.severity}</td><td className="p-2">{statementIssueDescription(issue)}</td><td className="p-2">{recordLocation(record)}</td><td className="p-2 tabular-nums">{money(comparison?.reported)}</td><td className="p-2 tabular-nums">{money(comparison?.effectiveObserved)}</td><td className="p-2 tabular-nums">{difference==null?'Unknown':formatCurrencyWithCents(difference,'USD')}</td><td className="p-2">{ordinal?<button type="button" className="underline" onClick={()=>onLocate(ordinal)}>View source</button>:issue.severity==='BLOCKING'?'Correct the affected field':'Review and acknowledge'}</td></tr>
    })}</tbody></table></div>
  </section>
}
