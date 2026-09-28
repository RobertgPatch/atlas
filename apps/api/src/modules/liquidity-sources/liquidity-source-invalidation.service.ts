import { withTransaction } from '../../infra/db/client.js'
// Reports read durable current pointers on each request; no process-local source cache.
// Draining is still durable/idempotent for downstream observers and recovery.
export async function drainLiquidityOutbox(notify:(entityId:string,accounts:string[])=>Promise<void>=async()=>{}){
  return withTransaction(async db=>{
    const rows=(await db.query('select * from liquidity_source_outbox where processed_at is null order by created_at limit 20 for update skip locked')).rows
    for(const row of rows){await notify(row.entity_id,row.account_ids);await db.query('update liquidity_source_outbox set processed_at=now(),attempts=attempts+1 where id=$1',[row.id])}
    return rows.length
  })
}
