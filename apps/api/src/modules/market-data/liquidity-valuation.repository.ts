import { randomUUID } from 'node:crypto'
import { pool,withTransaction } from '../../infra/db/client.js'
import { config } from '../../config.js'
import type { SourceHoldingRecord } from '../liquidity-sources/liquidity-source.types.js'
import type { MarketPriceObservation } from './market-data.types.js'
import { decimal,format,multiply,subtract } from '../liquidity-statements/csv/decimal.js'

export async function saveNeutralValuations(holdings:SourceHoldingRecord[],prices:MarketPriceObservation[]):Promise<void>{
  if(!pool||!config.marketData.realTimeEquitiesEnabled)return
  await withTransaction(async db=>{
    for(const h of holdings){
      if(h.sourceKind!=='CSV'||!h.quoteEligible||!h.exact?.quantity)continue
      const price=prices.filter(p=>p.symbol===h.providerSymbol&&p.currencyCode==='USD').sort((a,b)=>b.providerTimestamp.localeCompare(a.providerTimestamp))[0]
      if(!price||h.sourceAsOfAt&&Date.parse(price.providerTimestamp)<Date.parse(h.sourceAsOfAt)||!h.sourceAsOfAt&&h.sourceAsOfDate&&price.providerTimestamp.slice(0,10)<=h.sourceAsOfDate)continue
      const value=multiply(decimal(h.exact.quantity)!,decimal(String(price.price))!),basis=h.exact.costBasis==null?null:decimal(h.exact.costBasis)
      await db.query(`insert into liquidity_source_valuations(id,source_position_id,source_snapshot_id,source_account_id,price_at,price,market_value,unrealized_gain_loss,provider,mode) values($1,$2,$3,$4,$5,$6,$7,$8,$9,'MARKET_QUOTE') on conflict(source_position_id,price_at,provider) do nothing`,[randomUUID(),h.id,h.syncSnapshotId,h.accountId,price.providerTimestamp,String(price.price),format(value),basis==null?null:format(subtract(value,basis)),price.provider])
    }
  })
}
