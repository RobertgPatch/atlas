import { createHash } from 'node:crypto'
import type { CsvAccount,CsvIssue,CsvRecord,PositionFieldName } from '../liquidity-statement.types.js'
import { emptyAccount,emptyPosition,field,sourceDate } from './fields.js'
import { headerKey,validateDataWidth } from './parse.js'
import { accountIdentifierFingerprints } from './account-identity.js'
export const merrillSignature=['cob date','security #','security description','account #','value ($)','unrealized gain/loss ($)']
const bindings:Record<string,PositionFieldName>={'security #':'brokerSecurityId',symbol:'symbol','cusip #':'cusip','security description':'description',quantity:'quantity','price ($)':'price','value ($)':'marketValue','unrealized gain/loss ($)':'unrealizedGainLoss','unrealized gain/loss (%)':'unrealizedGainLossRatio','accrued interest ($)':'accruedInterest'}
export function merrillProfile(records:CsvRecord[],headerIndex:number):{accounts:CsvAccount[];issues:CsvIssue[]} {
  const header=records[headerIndex]!, accounts=new Map<string,CsvAccount>(),issues:CsvIssue[]=[]
  const index=(key:string)=>header.cells.findIndex(c=>headerKey(c)===key)
  for(const record of records.slice(headerIndex+1)){
    if(record.role==='BLANK')continue
    validateDataWidth(record,header.cells.length)
    const id=record.cells[index('account #')]!.trim()
    const occurrenceId=`account-${createHash('sha256').update(id).digest('hex').slice(0,20)}`
    let account=accounts.get(id)
    const dateRaw=record.cells[index('cob date')]!,date=sourceDate(dateRaw,'M/D/YYYY')
    if(!account){
      account=emptyAccount(occurrenceId)
      account.identifierFingerprints=accountIdentifierFingerprints(id)
      const nameIndex=index('account nickname')
      account.displayName=field(record.cells[nameIndex]??'',record,nameIndex,'Account Nickname')
      account.accountMask=field(id.slice(-4),record,index('account #'),'Account #')
      account.asOfDate=field(dateRaw,record,index('cob date'),'COB Date');account.asOfDate.value=date
      account.asOfPrecision=date?'DATE':'UNRESOLVED'
      accounts.set(id,account)
      if(!id)issues.push({code:'AMBIGUOUS_ACCOUNT',severity:'BLOCKING',accountOccurrenceId:occurrenceId,fieldPath:null,sourceRecords:[record.ordinal]})
    }else if(account.asOfDate.value!==date)issues.push({code:'MISSING_DATE',severity:'BLOCKING',accountOccurrenceId:occurrenceId,fieldPath:'asOfDate',sourceRecords:[record.ordinal]})
    const position=emptyPosition(record)
    header.cells.forEach((h,i)=>{const target=bindings[headerKey(h)];if(target)position[target]=field(record.cells[i]!,record,i,h,!['brokerSecurityId','symbol','cusip','description'].includes(target),target.endsWith('Ratio'))})
    record.role='POSITION';account.positions.push(position)
  }
  if(!accounts.size)accounts.set('',emptyAccount('account-1'))
  return {accounts:[...accounts.values()],issues}
}
