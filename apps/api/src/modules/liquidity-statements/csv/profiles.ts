import { createHash } from 'node:crypto'
import { config } from '../../../config.js'
import type { CsvDraft,CsvRecord,MappingProfile } from '../liquidity-statement.types.js'
import { CsvError } from '../liquidity-statement.errors.js'
import { tokenizeCsv,headerKey,validateHeader,type ParseLimits } from './parse.js'
import { positionsProfile } from './positions.profile.js'
import { merrillProfile } from './merrill.profile.js'
import { mappedProfile } from './mapped.profile.js'
import { createInitialStatementAdapterRegistry } from '../adapters/registry.js'
import { detectStatementAdapters } from '../adapters/detect.js'
import type { StatementDocument } from '../statement-document.types.js'

// Increment whenever persisted canonical output or normalization semantics
// change. Duplicate uploads from older versions are reparsed from their
// immutable source bytes instead of reopening a stale review draft.
export const CSV_ADAPTER_VERSION='1.3.0'

const detectionDocument=(records:CsvRecord[],sourceHash:string):StatementDocument=>{
  const statementRecords=records.map(record=>({
    ordinal:record.ordinal,
    location:{kind:'CSV' as const,record:record.ordinal,lineStart:record.lineStart,lineEnd:record.lineEnd,column:null,header:null},
    role:record.role,
    dispositionRule:null,
    cells:record.cells.map((lexical,index)=>({column:index+1,address:null,type:lexical?'TEXT' as const:'BLANK' as const,lexical,styleId:null,numberFormat:null,formula:null,formulaCache:'NONE' as const,mergeAnchor:null})),
  }))
  return {kind:'CSV',sourceHash,reader:{id:'legacy_csv_detection',version:CSV_ADAPTER_VERSION},resources:{uploadedBytes:0,inflatedBytes:0,zipEntries:0,worksheets:1,populatedCells:statementRecords.reduce((sum,record)=>sum+record.cells.filter(cell=>cell.type!=='BLANK').length,0),sharedStrings:0,decodedStringBytes:0,styles:0,relationships:0},sheets:[{id:'csv',name:'CSV',order:1,visibility:'VISIBLE',dateSystem:'1900',records:statementRecords}],records:statementRecords}
}

export async function parseCsv(bytes:Buffer,limits:Partial<ParseLimits>={},profile?:MappingProfile):Promise<{draft:CsvDraft|null;records:CsvRecord[]}> {
  const records=await tokenizeCsv(bytes,limits,profile), maxMetadata=limits.maxMetadataRecords??config.liquidityCsv.maxMetadataRecords
  const sourceHash=createHash('sha256').update(bytes).digest('hex')
  let adapter:'positions_v1'|'merrill_holdings_v1'|'mapped_csv_v1'|undefined,headerIndex=-1
  if(profile){adapter='mapped_csv_v1';headerIndex=profile.headerRecord-1}
  else {
    const detection=detectStatementAdapters(detectionDocument(records,sourceHash),createInitialStatementAdapterRegistry())
    if(detection.outcome==='AMBIGUOUS_LAYOUT')throw new CsvError('MALFORMED_CSV')
    const detected=detection.matches[0]?.adapterId
    if(detected==='charles_schwab_positions_csv')adapter='positions_v1'
    if(detected==='merrill_holdings_csv')adapter='merrill_holdings_v1'
    if(adapter){
      for(let i=0;i<Math.min(records.length,maxMetadata+1);i++){
        const labels=new Set(records[i]!.cells.map(headerKey))
        if(adapter==='positions_v1'&&labels.has('symbol')&&labels.has('description')&&labels.has('mkt val (market value)')){headerIndex=i;break}
        if(adapter==='merrill_holdings_v1'&&labels.has('cob date')&&labels.has('account #')&&labels.has('value ($)')){headerIndex=i;break}
      }
    }
  }
  if(!adapter)return {draft:null,records}
  if(!records[headerIndex])throw new CsvError('MALFORMED_CSV')
  validateHeader(records[headerIndex]!)
  for(const record of records.slice(0,headerIndex)){
    if(record.role==='BLANK')continue
    if(adapter==='mapped_csv_v1' || adapter==='positions_v1' && /^Positions for account |\bas of\b/i.test(record.cells[0]??'') && record.cells.slice(1).every(c=>!c.trim()))record.role='METADATA'
    else throw new CsvError('MALFORMED_CSV')
  }
  const result=adapter==='mapped_csv_v1'?mappedProfile(records,profile!):adapter==='positions_v1'?positionsProfile(records,headerIndex):merrillProfile(records,headerIndex)
  if(result.accounts.length>100 || result.accounts.reduce((n,a)=>n+a.positions.length,0)>(limits.maxRows??config.liquidityCsv.maxRows))throw new CsvError('RESOURCE_LIMIT')
  const count=(role:CsvRecord['role'])=>records.filter(r=>r.role===role).length
  return {records,draft:{schemaVersion:'2.0.0',adapter:{id:adapter,version:CSV_ADAPTER_VERSION},sourceHash,recordCounts:{total:records.length,positions:count('POSITION'),controls:count('TOTAL'),metadata:count('METADATA'),headers:count('HEADER'),blanks:count('BLANK'),unsupported:count('UNSUPPORTED')},...result}}
}
