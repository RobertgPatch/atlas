import type { CsvAccount, CsvIssue, CsvRecord, PositionFieldName } from '../liquidity-statement.types.js'
import { field, emptyPosition, emptyAccount, classification, titleAccount } from './fields.js'
import { headerKey, validateDataWidth } from './parse.js'
import { CsvError } from '../liquidity-statement.errors.js'
export const positionsSignature=['symbol','description','qty (quantity)','mkt val (market value)','cost basis']
const bindings:Record<string,PositionFieldName>={symbol:'symbol',description:'description','qty (quantity)':'quantity',price:'price','mkt val (market value)':'marketValue','cost basis':'costBasis','gain $ (gain/loss $)':'unrealizedGainLoss','gain % (gain/loss %)':'unrealizedGainLossRatio','day chng $ (day change $)':'dayChange','day chng % (day change %)':'dayChangeRatio','asset type':'sourceAssetType'}
export function positionsProfile(records:CsvRecord[],headerIndex:number):{accounts:CsvAccount[];issues:CsvIssue[]} {
  const header=records[headerIndex]!, title=records.slice(0,headerIndex).find(r=>/^Positions for account |\bas of\b/i.test(r.cells[0]??''))
  const account=title?titleAccount(title):emptyAccount('account-1')
  const issues:CsvIssue[]=[]
  for(const record of records.slice(headerIndex+1)){
    if(record.role==='BLANK')continue
    validateDataWidth(record,header.cells.length)
    const isTotal=record.cells.some(c=>c.trim()==='Positions Total')
    const position=emptyPosition(record)
    header.cells.forEach((h,i)=>{
      const target=bindings[headerKey(h)]; if(!target)return
      const numeric=!['symbol','description','sourceAssetType'].includes(target)
      position[target]=field(record.cells[i]!,record,i,h,numeric,target.endsWith('Ratio'))
    })
    if(isTotal){
      if(account.reportedTotal.value!==null) throw new CsvError('MALFORMED_CSV')
      account.reportedTotal=position.marketValue;account.reportedBasis=position.costBasis;account.reportedGain=position.unrealizedGainLoss;record.role='TOTAL';continue
    }
    record.role='POSITION'
    const category=classification(String(position.sourceAssetType.value??''))
    if(category)position.assetType={...position.sourceAssetType,value:category}
    if(position.symbol.value==='Cash & Cash Investments'){
      position.description={...position.symbol};position.symbol={...position.symbol,value:null,origin:'UNAVAILABLE',availability:'NOT_APPLICABLE',reason:'CASH_WITHOUT_SYMBOL'}
      position.assetType={...position.description,value:'cash'}
    }
    account.positions.push(position)
  }
  return {accounts:[account],issues}
}
