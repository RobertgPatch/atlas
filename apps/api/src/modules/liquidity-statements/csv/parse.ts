import { parse } from 'csv-parse'
import { Readable } from 'node:stream'
import { config } from '../../../config.js'
import { CsvError } from '../liquidity-statement.errors.js'
import type { CsvRecord, MappingProfile } from '../liquidity-statement.types.js'

export type ParseLimits = Pick<typeof config.liquidityCsv,'maxBytes'|'maxRows'|'maxColumns'|'maxRecordBytes'|'maxFieldBytes'|'maxMetadataRecords'|'parseTimeoutMs'>
export function decodeCsv(bytes: Buffer, encoding?: MappingProfile['encoding']): string {
  let codec='utf-8'
  if(bytes[0]===0xff && bytes[1]===0xfe) codec='utf-16le'
  else if(bytes[0]===0xfe && bytes[1]===0xff) codec='utf-16be'
  else if(encoding==='UTF16LE' || encoding==='UTF16BE') throw new CsvError('UNSUPPORTED_ENCODING')
  else if(encoding==='WINDOWS1252') codec='windows-1252'
  try {
    const text=new TextDecoder(codec,{fatal:true}).decode(bytes)
    if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffd]/.test(text) || /^\s*(%PDF-|PK\u0003)/.test(text)) throw new Error('binary')
    return text
  } catch { throw new CsvError('UNSUPPORTED_ENCODING') }
}
/** Tokenizer permits preamble widths; profiles MUST enforce exact widths on every
 * populated data/control record. No skip-on-error or object/header casting. */
export async function tokenizeCsv(bytes: Buffer, overrides: Partial<ParseLimits> = {}, profile?: MappingProfile): Promise<CsvRecord[]> {
  const limits={...config.liquidityCsv,...overrides}
  if(!bytes.length) throw new CsvError('MALFORMED_CSV')
  if(bytes.length>limits.maxBytes) throw new CsvError('RESOURCE_LIMIT')
  const content=decodeCsv(bytes,profile?.encoding)
  const parser=parse({ bom:true, delimiter:profile?.delimiter ?? ',', cast:false, columns:false, relax_column_count:true, skip_empty_lines:false, max_record_size:limits.maxRecordBytes, raw:true, info:true })
  const records:CsvRecord[]=[]; let priorLine=0
  const timeout=setTimeout(()=>parser.destroy(new CsvError('RESOURCE_LIMIT')),limits.parseTimeoutMs)
  const chunks=function*(){for(let start=0;start<content.length;start+=4096)yield content.slice(start,start+4096)}
  Readable.from(chunks()).pipe(parser)
  try {
    for await (const item of parser) {
      const cells=item.record as string[], end=item.info.lines as number
      if(cells.length>limits.maxColumns || cells.some(c=>Buffer.byteLength(c)>limits.maxFieldBytes) || Buffer.byteLength(item.raw)>limits.maxRecordBytes || records.length >= limits.maxRows+limits.maxMetadataRecords+200) throw new CsvError('RESOURCE_LIMIT')
      records.push({ordinal:records.length+1,lineStart:priorLine+1,lineEnd:end,cells,role:cells.every(c=>!c.trim())?'BLANK':'UNSUPPORTED'})
      priorLine=end
    }
  } catch(error) { parser.destroy(); throw error instanceof CsvError ? error : new CsvError('MALFORMED_CSV') }
  finally {clearTimeout(timeout)}
  if(!records.some(r=>r.role!=='BLANK')) throw new CsvError('MALFORMED_CSV')
  return records
}
export const headerKey=(value:string)=>value.trim().toLowerCase().replace(/\s+/g,' ')
export function validateHeader(record:CsvRecord) {
  const keys=record.cells.map(headerKey)
  if(new Set(keys).size!==keys.length || keys.some(k=>['__proto__','prototype','constructor',''].includes(k))) throw new CsvError('MALFORMED_CSV')
  record.role='HEADER'
}
export function validateDataWidth(record:CsvRecord,width:number) {
  if(record.role!=='BLANK' && record.cells.length!==width) throw new CsvError('MALFORMED_CSV')
}
