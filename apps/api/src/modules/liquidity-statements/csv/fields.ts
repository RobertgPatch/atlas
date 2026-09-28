import { decimal, format, percent } from './decimal.js'
import { positionFields, type CsvField, type CsvPosition, type CsvRecord, type CsvAccount } from '../liquidity-statement.types.js'
export const unavailable=(reason='NOT_PROVIDED'):CsvField=>({value:null,raw:[],origin:'UNAVAILABLE',availability:'UNAVAILABLE',evidence:[],derivation:null,reason})
export function field(raw:string,record:CsvRecord,column:number,header:string,numeric=false,ratio=false):CsvField {
  const base:CsvField={value:null,raw:[raw],origin:'IMPORTED',availability:'COMPLETE',evidence:[{record:record.ordinal,lineStart:record.lineStart,lineEnd:record.lineEnd,column,header}],derivation:null,reason:null}
  if(/^(?:|--|-|N\/A|Incomplete)$/i.test(raw.trim())) return {...base,origin:'UNAVAILABLE',availability:/^incomplete$/i.test(raw.trim())?'INCOMPLETE':'UNAVAILABLE',reason:/^incomplete$/i.test(raw.trim())?'INCOMPLETE_SOURCE':'NOT_PROVIDED'}
  try {base.value=numeric?format((ratio?percent(raw,'PERCENT_POINTS'):decimal(raw))!,ratio?12:8):raw.trim()}
  catch {return {...base,availability:'UNAVAILABLE',origin:'UNAVAILABLE',reason:'INVALID_DECIMAL'}}
  return base
}
export function importedText(value:string,record:CsvRecord):CsvField {return field(value,record,0,'source metadata')}
export function emptyPosition(record:CsvRecord):CsvPosition {
  const fields=Object.fromEntries(positionFields.map(k=>[k,unavailable()])) as Record<typeof positionFields[number],CsvField>
  return {occurrenceId:`row-${record.ordinal}`,sourceRecord:record.ordinal,...fields}
}
export function emptyAccount(id:string):CsvAccount {return {occurrenceId:id,identifierFingerprints:[],displayName:unavailable(),accountMask:unavailable(),currency:unavailable(),asOfDate:unavailable(),asOfAt:unavailable(),sourceZone:unavailable(),asOfPrecision:'UNRESOLVED',reportedTotal:unavailable(),positions:[]}}
export function sourceDate(raw:string,format:'M/D/YYYY'|'YYYY/MM/DD'|'YYYY-MM-DD'):string|null {
  const m=/^(\d{1,4})[/-](\d{1,2})[/-](\d{1,4})$/.exec(raw.trim()); if(!m)return null
  const [year,month,day]=format==='M/D/YYYY'?[m[3]!,m[1]!,m[2]!]:[m[1]!,m[2]!,m[3]!]
  const iso=`${year.padStart(4,'0')}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`
  const date=new Date(iso);return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0,10)===iso?iso:null
}
export function classification(label:string):string|null {
  const value=label.toLowerCase()
  if(value==='equity'||value==='stock')return 'equity'
  if(value.includes('etf')||value.includes('closed end')||value==='fund'||value.includes('mutual fund'))return 'fund'
  if(value.includes('cash')||value.includes('money market'))return 'cash'
  if(value.includes('bond')||value.includes('fixed income'))return 'bond'
  if(value.includes('option'))return 'option'
  return value==='other'?'other':null
}
export function titleAccount(record:CsvRecord):CsvAccount {
  const a=emptyAccount('account-1'), title=record.cells[0] ?? ''
  a.displayName=importedText(title.replace(/\s+as of.*$/i,'').replace(/^Positions for account\s*/i,''),record)
  const dateToken=title.match(/\d{4}[/-]\d{1,2}[/-]\d{1,2}/)?.[0] ?? title.match(/\d{1,2}\/\d{1,2}\/\d{4}/)?.[0]
  const date=dateToken?sourceDate(dateToken,/^\d{4}/.test(dateToken)?'YYYY/MM/DD':'M/D/YYYY'):null
  if(!date)return a
  a.asOfDate=importedText(date,record);a.asOfPrecision='DATE'
  const time=/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)\s+ET/i.exec(title)
  if(time){
    const hour=Number(time[1])%12+(time[4]!.toUpperCase()==='PM'?12:0)
    if(Number(time[1])<1||Number(time[1])>12||Number(time[2])>59)return a
    const local=new Date(`${date}T${String(hour).padStart(2,'0')}:${time[2]}:${time[3]??'00'}Z`)
    const formatter=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'})
    const candidates=[4,5].map(offset=>new Date(local.valueOf()+offset*3600000)).filter(candidate=>{
      const parts=Object.fromEntries(formatter.formatToParts(candidate).map(p=>[p.type,p.value]))
      return `${parts.year}-${parts.month}-${parts.day}`===date && Number(parts.hour)===hour && parts.minute===time[2]
    })
    if(candidates.length===1){a.asOfAt=importedText(candidates[0]!.toISOString(),record);a.sourceZone=importedText('America/New_York',record);a.asOfPrecision='INSTANT'}
  }
  return a
}
