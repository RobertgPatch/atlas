import { createHash } from 'node:crypto'
import type { CsvAccount,CsvIssue,CsvRecord,MappingProfile } from '../liquidity-statement.types.js'
import { CsvError } from '../liquidity-statement.errors.js'
import { emptyAccount,emptyPosition,field,sourceDate,classification,titleAccount } from './fields.js'
import { decimal,format } from './decimal.js'
import { validateDataWidth,validateHeader } from './parse.js'
import { accountIdentifierFingerprints } from './account-identity.js'
export function mappedProfile(records:CsvRecord[],profile:MappingProfile):{accounts:CsvAccount[];issues:CsvIssue[]}{
  const header=records[profile.headerRecord-1];if(!header)throw new CsvError('MALFORMED_CSV')
  validateHeader(header)
  for(const binding of profile.columns)if(header.cells[binding.sourceIndex]!==binding.sourceHeader)throw new CsvError('MALFORMED_CSV')
  for(const r of records.slice(0,profile.headerRecord-1))if(r.role!=='BLANK')r.role='METADATA'
  const accounts=new Map<string,CsvAccount>(),issues:CsvIssue[]=[]
  const accountColumn=profile.columns.find(c=>c.target==='accountIdentifier')
  const makeAccount=(id:string)=>{const a=emptyAccount(id);if(profile.dateFormat==='PROFILE_TITLE'){const candidates=records.slice(0,profile.headerRecord-1).filter(r=>/\bas of\b/i.test(r.cells[0]??'')).map(titleAccount).filter(t=>t.asOfDate.value);if(candidates.length!==1)throw new CsvError('MALFORMED_CSV');const title=candidates[0]!;a.asOfDate=title.asOfDate;a.asOfAt=title.asOfAt;a.asOfPrecision=title.asOfPrecision;a.sourceZone=title.sourceZone;}if(profile.sourceZone)a.sourceZone={...a.sourceZone,value:profile.sourceZone,origin:'REVIEWED',availability:'COMPLETE',reason:'MAPPING_CONVENTION'};a.currency={...a.currency,value:profile.currency,origin:'REVIEWED',availability:'COMPLETE',reason:'MAPPING_CONVENTION'};if(profile.asOfDate){a.asOfDate={...a.asOfDate,value:profile.asOfDate,origin:'REVIEWED',availability:'COMPLETE',reason:'MAPPING_CONVENTION'};a.asOfPrecision='DATE'}return a}
  for(const record of records.slice(profile.headerRecord)){
    if(record.role==='BLANK')continue
    validateDataWidth(record,header.cells.length)
    const sourceId=accountColumn?record.cells[accountColumn.sourceIndex]!.trim():'single-account'
    const id=`account-${createHash('sha256').update(sourceId).digest('hex').slice(0,20)}`
    let a=accounts.get(id);if(!a){a=makeAccount(id);accounts.set(id,a)}
    const p=emptyPosition(record)
    for(const c of profile.columns){
      const raw=record.cells[c.sourceIndex]!
      if(c.target==='ignoredEvidence')continue
      if(c.target==='accountIdentifier'){a.accountMask=field(raw.slice(-4),record,c.sourceIndex,c.sourceHeader);a.identifierFingerprints=accountIdentifierFingerprints(raw);continue}
      if(c.target==='accountName'){a.displayName=field(raw,record,c.sourceIndex,c.sourceHeader);continue}
      if(c.target==='asOfDate'){
        const date=profile.dateFormat==='PROFILE_TITLE'?null:sourceDate(raw,profile.dateFormat)
        if(a.asOfDate.value && a.asOfDate.value!==date)issues.push({code:'MISSING_DATE',severity:'BLOCKING',accountOccurrenceId:id,fieldPath:'asOfDate',sourceRecords:[record.ordinal]})
        a.asOfDate=field(raw,record,c.sourceIndex,c.sourceHeader);a.asOfDate.value=date;a.asOfPrecision=date?'DATE':'UNRESOLVED';continue
      }
      const numeric=!['description','symbol','cusip','isin','brokerSecurityId','assetType','sourceAssetType','currency'].includes(c.target)
      const f=field(raw,record,c.sourceIndex,c.sourceHeader,numeric,c.target.endsWith('Ratio'))
      if(c.target.endsWith('Ratio') && profile.percentUnit==='RATIO'){
        try{const value=decimal(raw,12);f.value=value==null?null:format(value,12);f.reason='RATIO_UNITS';f.availability=value==null?'UNAVAILABLE':'COMPLETE'}catch{f.value=null;f.availability='UNAVAILABLE';f.reason='INVALID_DECIMAL'}
      }
      if(c.target==='assetType'){p.sourceAssetType={...f};f.value=classification(String(f.value??''))}
      p[c.target]=f
    }
    record.role='POSITION';a.positions.push(p)
  }
  if(!accounts.size)accounts.set('account-1',makeAccount('account-1'))
  return {accounts:[...accounts.values()],issues}
}
