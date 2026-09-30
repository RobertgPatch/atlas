import { liquiditySourceRepository,isoDate,type LiquidityScope } from './liquidity-source.repository.js'
import type { SourceHoldingRecord,ReportSourceAccount } from './liquidity-source.types.js'
import type { CsvPosition } from '../liquidity-statements/liquidity-statement.types.js'
import { isKnownEquitySymbol } from '../liquidity-statements/csv/equity-symbols.js'
const asNumber=(v:unknown)=>v==null?null:Number(v)
export function sourcePositionHolding(row:Record<string,any>):SourceHoldingRecord {
  const p=row.canonical as CsvPosition
  const storedType=String(p.assetType?.value??'other'),symbol=p.symbol?.value as string|null
  // Upgrade older, immutable drafts that predate symbol classification without
  // overriding an explicit reviewed category.
  const type=storedType==='unknown'&&isKnownEquitySymbol(symbol)?'equity':storedType
  // Plain listed symbols only; punctuation aliases require explicit mapping later.
  const sourceKind=row.source_kind==='STATEMENT'?'STATEMENT':'CSV'
  const convention=(p as any).valuationConvention
  const eligible=['equity','fund'].includes(type)&&row.currency==='USD'&&!!symbol&&/^[A-Z][A-Z0-9.-]{0,19}$/.test(symbol)&&row.quantity!=null
    &&convention?.priceUnit==='PER_UNIT'&&convention?.quantityUnit==='SHARES'&&convention?.multiplier==='1'
    &&convention?.accruedInterest==='EXCLUDED'&&typeof convention?.providerIdentity==='string'&&!!convention.providerIdentity.trim()
  return {id:row.id,syncSnapshotId:row.snapshot_id,accountId:row.source_account_id,symbol,description:String(p.description?.value??'Unidentified holding'),type:({equity:'Stock',fund:'Fund',cash:'Cash',bond:'Bond',option:'Option'} as Record<string,string>)[type]??'Other',sector:null,industry:null,cusip:p.cusip?.value as string|null,isin:p.isin?.value as string|null,currencyCode:row.currency,quantity:asNumber(row.quantity),costBasis:asNumber(row.cost_basis),institutionPrice:asNumber(row.price),marketValue:asNumber(row.market_value),unrealizedGainLoss:asNumber(row.unrealized_gain_loss),asOfDate:isoDate(row.as_of_date),sourceAsOfDate:isoDate(row.as_of_date),sourceAsOfAt:row.as_of_at?new Date(row.as_of_at).toISOString():null,sourceKind,fileKind:row.file_kind??null,adapterId:row.adapter_id??null,adapterVersion:row.adapter_version??null,priceUnit:convention?.priceUnit,quantityUnit:convention?.quantityUnit,quoteMultiplier:convention?.multiplier??null,accruedInterestConvention:convention?.accruedInterest,quoteEligible:eligible,providerSymbol:eligible?symbol:null,exact:{quantity:row.quantity,costBasis:row.cost_basis,institutionPrice:row.price,marketValue:row.market_value,unrealizedGainLoss:row.unrealized_gain_loss}}
}
export async function readLiquiditySources(scope:LiquidityScope){
  const neutral=await liquiditySourceRepository.current(scope)
  const accounts:ReportSourceAccount[]=neutral.accounts.map(a=>({id:a.id,name:a.name,custodianName:a.custodian,mask:a.accountMask,type:'investment',subtype:null,officialName:null,selectedForHoldingsReport:true,syncStatus:a.latestSnapshotId?'success':'never_synced',lastSyncedAt:a.uploadedAt,entityId:a.entityId,sourceKind:a.activeSource,cadence:a.cadence,holdingsAsOfDate:a.holdingsAsOfDate,nextExpectedDate:a.nextExpectedDate,version:a.version}))
  return {accounts,holdings:neutral.positions.map(sourcePositionHolding),neutralAccounts:neutral.accounts}
}
