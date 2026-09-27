import { useState } from 'react'
import { mappingTargets, type CsvDetail, type MappingProfile } from '../../../../../../packages/types/src/liquidity-statements'
import { csvButton, csvInput } from './LiquidityCsvDialog'

export function LiquidityCsvMapping({ detail, busy, onSave }: { detail: CsvDetail; busy: boolean; onSave: (profile: MappingProfile) => void }) {
  const [headerRecord, setHeaderRecord] = useState(1)
  const [targets, setTargets] = useState<Record<number, typeof mappingTargets[number]>>({})
  const [currency, setCurrency] = useState('USD')
  const [asOfDate, setAsOfDate] = useState('')
  const [dateFormat, setDateFormat] = useState<MappingProfile['dateFormat']>('YYYY-MM-DD')
  const [percentUnit, setPercentUnit] = useState<MappingProfile['percentUnit']>('PERCENT_POINTS')
  const [delimiter, setDelimiter] = useState<MappingProfile['delimiter']>(',')
  const [encoding, setEncoding] = useState<MappingProfile['encoding']>('UTF8')
  const [manualHeaders, setManualHeaders] = useState('')
  const needsManualHeaders = delimiter !== ',' || detail.records.length === 0
  const cells = needsManualHeaders ? manualHeaders.split('\n').filter(Boolean) : detail.records.find(r => r.ordinal === headerRecord)?.cells
  return <form className="space-y-4" onSubmit={event => {
    event.preventDefault()
    if (!cells?.length) return
    onSave({ name: `${detail.summary.custodian} CSV`, delimiter, encoding, headerRecord, dateFormat, percentUnit, currency,
      ...(asOfDate ? { asOfDate } : {}), columns: cells.map((sourceHeader, sourceIndex) => ({ sourceHeader, sourceIndex, target: targets[sourceIndex] ?? 'ignoredEvidence' })) })
  }}>
    <p>This layout needs a column mapping. Unmapped columns remain available as source evidence.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <label>Separator<select className={csvInput} value={delimiter} onChange={e=>{setDelimiter(e.target.value as MappingProfile['delimiter']);setTargets({})}}><option value=",">Comma</option><option value=";">Semicolon</option><option value={'\t'}>Tab</option></select></label>
      <label>Text encoding<select className={csvInput} value={encoding} onChange={e=>setEncoding(e.target.value as MappingProfile['encoding'])}><option value="UTF8">UTF-8</option><option value="UTF16LE">UTF-16 little endian (BOM required)</option><option value="UTF16BE">UTF-16 big endian (BOM required)</option><option value="WINDOWS1252">Windows-1252</option></select></label>
    </div>
    {needsManualHeaders ? <>
      <label className="block text-sm">Header record<input className={csvInput} type="number" min={1} max={101} required value={headerRecord} onChange={e=>setHeaderRecord(Number(e.target.value))}/></label>
      <label className="block text-sm">Exact header names, one per line in file order<textarea className={csvInput} required value={manualHeaders} onChange={e=>{setManualHeaders(e.target.value);setTargets({})}}/></label>
      <p className="text-sm">Copy the column names from the file. The parser will verify their order and spelling before creating holdings.</p>
    </> : <label className="block text-sm">Header record<select className={csvInput} value={headerRecord} onChange={e => { setHeaderRecord(Number(e.target.value)); setTargets({}) }}>
      {detail.records.slice(0, 101).map(r => <option key={r.ordinal} value={r.ordinal}>{r.ordinal}: {r.cells.join(' | ').slice(0, 180)}</option>)}
    </select></label>}
    <div className="grid gap-3 sm:grid-cols-2">
      <label>Currency<input className={csvInput} required pattern="[A-Z]{3}" value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())}/></label>
      <label>Holdings date (if absent from file)<input className={csvInput} type="date" value={asOfDate} onChange={e => setAsOfDate(e.target.value)}/></label>
      <label>Date format<select className={csvInput} value={dateFormat} onChange={e => setDateFormat(e.target.value as MappingProfile['dateFormat'])}><option>YYYY-MM-DD</option><option>M/D/YYYY</option><option>YYYY/MM/DD</option></select></label>
      <label>Percentage convention<select className={csvInput} value={percentUnit} onChange={e => setPercentUnit(e.target.value as MappingProfile['percentUnit'])}><option value="PERCENT_POINTS">5 means 5%</option><option value="RATIO">0.05 means 5%</option></select></label>
    </div>
    {cells?.map((cell, i) => <label className="grid grid-cols-2 items-center gap-3 text-sm" key={i}><span>Column {i + 1}: {cell || '(blank)'}</span><select className={csvInput} value={targets[i] ?? 'ignoredEvidence'} onChange={e => setTargets(t => ({ ...t, [i]: e.target.value as typeof mappingTargets[number] }))}>
      {mappingTargets.map(target => <option key={target} value={target}>{target === 'ignoredEvidence' ? 'Keep as evidence only' : target}</option>)}
    </select></label>)}
    <button className={csvButton} disabled={busy || !cells?.length}>Save mapping and parse again</button>
  </form>
}
