import { createHash } from 'node:crypto'
import { config } from '../../../config.js'
import type { CsvDraft,CsvRecord,MappingProfile } from '../liquidity-statement.types.js'
import { CsvError } from '../liquidity-statement.errors.js'
import { tokenizeCsv,headerKey,validateHeader,type ParseLimits } from './parse.js'
import { positionsProfile,positionsSignature } from './positions.profile.js'
import { merrillProfile,merrillSignature } from './merrill.profile.js'
import { mappedProfile } from './mapped.profile.js'

// Increment whenever persisted canonical output or normalization semantics
// change. Duplicate uploads from older versions are reparsed from their
// immutable source bytes instead of reopening a stale review draft.
export const CSV_ADAPTER_VERSION='1.3.0'

export async function parseCsv(bytes:Buffer,limits:Partial<ParseLimits>={},profile?:MappingProfile):Promise<{draft:CsvDraft|null;records:CsvRecord[]}> {
  const records=await tokenizeCsv(bytes,limits,profile), maxMetadata=limits.maxMetadataRecords??config.liquidityCsv.maxMetadataRecords
  let adapter:'positions_v1'|'merrill_holdings_v1'|'mapped_csv_v1'|undefined,headerIndex=-1
  for(let i=0;i<Math.min(records.length,maxMetadata+1);i++){
    const keys=new Set(records[i]!.cells.map(headerKey))
    if(positionsSignature.every(k=>keys.has(k))){adapter='positions_v1';headerIndex=i;break}
    if(merrillSignature.every(k=>keys.has(k))){adapter='merrill_holdings_v1';headerIndex=i;break}
  }
  if(profile){adapter='mapped_csv_v1';headerIndex=profile.headerRecord-1}
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
  return {records,draft:{schemaVersion:'2.0.0',adapter:{id:adapter,version:CSV_ADAPTER_VERSION},sourceHash:createHash('sha256').update(bytes).digest('hex'),recordCounts:{total:records.length,positions:count('POSITION'),controls:count('TOTAL'),metadata:count('METADATA'),headers:count('HEADER'),blanks:count('BLANK'),unsupported:count('UNSUPPORTED')},...result}}
}
