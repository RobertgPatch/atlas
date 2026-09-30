/* eslint-disable react-refresh/only-export-components */
import { useCallback,useEffect,useMemo,useRef,useState } from 'react'
import type { CsvRecord,StatementStoredRecord } from '../../../../../../packages/types/src/liquidity-statements'
import { liquidityStatementsClient as api } from '../api/liquidityStatementsClient'

type EvidenceRecord=CsvRecord|StatementStoredRecord
export const statementRecordLocation=(record:EvidenceRecord)=>{
  if('sourceLocation' in record){
    const location=record.sourceLocation as {sheetName?:string;address?:string}
    return location.sheetName&&location.address?`${location.sheetName}!${location.address}`:`Workbook record ${record.ordinal}`
  }
  return `CSV line ${record.lineStart}${record.lineEnd!==record.lineStart?`–${record.lineEnd}`:''}`
}
const visibleCells=(record:EvidenceRecord)=>['HEADER','POSITION','SUBTOTAL','TOTAL'].includes(record.role)?record.cells:[]

export function LiquidityStatementEvidence({statementId,initialRecords,nextCursor,targetOrdinal,totalRecords}:{statementId:string;initialRecords:EvidenceRecord[];nextCursor?:string|null;targetOrdinal?:number|null;totalRecords:number}){
  const [records,setRecords]=useState(initialRecords),[cursor,setCursor]=useState(nextCursor??null),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const target=useRef<HTMLTableRowElement>(null)
  const loadedTarget=targetOrdinal==null||records.some(record=>record.ordinal===targetOrdinal)
  const load=useCallback(async()=>{
    if(!cursor||busy)return
    setBusy(true);setError('')
    try{const page=await api.records(statementId,cursor);setRecords(previous=>[...previous,...page.items]);setCursor(page.nextCursor)}catch(error){setError(error instanceof Error?error.message:'Unable to load source evidence.')}
    finally{setBusy(false)}
  },[busy,cursor,statementId])
  useEffect(()=>{
    if(targetOrdinal&&loadedTarget){target.current?.focus({preventScroll:true});return}
    if(!targetOrdinal||!cursor||busy)return
    const timer=setTimeout(()=>void load(),0)
    return ()=>clearTimeout(timer)
  },[targetOrdinal,loadedTarget,cursor,busy,load])
  const ordered=useMemo(()=>[...records].sort((left,right)=>left.ordinal-right.ordinal),[records])
  return <section aria-labelledby="statement-evidence-heading" className="space-y-2 rounded-lg border border-slate-300 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><h4 id="statement-evidence-heading" className="font-semibold">Source evidence</h4><span className="text-xs text-slate-600">{records.length} of {totalRecords} records loaded</span></div>
    <p className="text-xs text-slate-600">Financial cells retain their original text and location. Unknown metadata and note contents remain hidden; use the protected original statement when needed.</p>
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="max-h-72 overflow-auto"><table className="w-full text-left text-xs"><thead><tr><th className="p-2">Location</th><th className="p-2">Role</th><th className="p-2">Source values</th></tr></thead><tbody>{ordered.map(record=><tr key={record.ordinal} ref={record.ordinal===targetOrdinal?target:undefined} tabIndex={record.ordinal===targetOrdinal?-1:undefined} className={record.ordinal===targetOrdinal?'border-t bg-amber-50 outline-none':'border-t'}><td className="p-2">{statementRecordLocation(record)}</td><td className="p-2">{record.role.replaceAll('_',' ').toLowerCase()}</td><td className="p-2 font-mono">{visibleCells(record).length?visibleCells(record).join(' | '):'Content hidden'}</td></tr>)}</tbody></table></div>
    {cursor&&<button type="button" disabled={busy} className="text-sm underline" onClick={()=>void load()}>{busy?'Loading…':'Load more evidence'}</button>}
  </section>
}
