export interface SourceHoldingRecord {
  id:string;syncSnapshotId:string;accountId:string
  symbol:string|null;description:string;type:string;sector:string|null;industry:string|null;cusip:string|null;isin:string|null;currencyCode:string|null
  quantity:number|null;costBasis:number|null;institutionPrice:number|null;marketValue:number|null;unrealizedGainLoss:number|null;asOfDate:string|null
  sourceKind?:'CSV'|'STATEMENT'
  fileKind?:'CSV'|'XLSX'|null
  adapterId?:string|null
  adapterVersion?:string|null
  priceUnit?:'PER_UNIT'|'PERCENT_OF_PAR'|'PER_CONTRACT'|'UNKNOWN'
  quantityUnit?:'SHARES'|'PRINCIPAL'|'CONTRACTS'|'CURRENCY'|'UNKNOWN'
  quoteMultiplier?:string|null
  accruedInterestConvention?:'INCLUDED'|'EXCLUDED'|'UNKNOWN'
  sourceAsOfAt?:string|null
  sourceAsOfDate?:string|null
  quoteEligible?:boolean
  providerSymbol?:string|null
  exact?:{quantity:string|null;costBasis:string|null;institutionPrice:string|null;marketValue:string|null;unrealizedGainLoss:string|null}
}
export interface ReportSourceAccount {
  id:string;name:string;custodianName:string;mask:string|null;type:string;subtype:string|null;officialName:string|null
  selectedForHoldingsReport:boolean;syncStatus:'never_synced'|'pending'|'success'|'failed'|'needs_user_action';lastSyncedAt:string|null
  entityId?:string;sourceKind?:'CSV'|'STATEMENT';cadence?:string;holdingsAsOfDate?:string|null;nextExpectedDate?:string|null;version?:number
}
