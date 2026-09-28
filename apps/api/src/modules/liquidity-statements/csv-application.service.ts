import { randomUUID } from 'node:crypto'
import { config } from '../../config.js'
import { withTransaction } from '../../infra/db/client.js'
import { auditRepository } from '../audit/audit.repository.js'
import type { LiquidityScope } from '../liquidity-sources/liquidity-source.repository.js'
import { csvRepository,hash } from './liquidity-statement.repository.js'
import { CsvError } from './liquidity-statement.errors.js'
import { applySchema } from './liquidity-statement.zod.js'
import { buildPreview } from './csv-application-preview.service.js'
import type { AccountBinding } from './liquidity-statement.types.js'
export const csvApplicationService={async apply(id:string,body:unknown,scope:LiquidityScope):Promise<{applicationId:string;snapshotIds:string[]}>{
  const input=applySchema.parse(body)
  if(!config.liquidityCsv.applyEnabled)throw new CsvError('DISABLED')
  return withTransaction(async db=>{
    const row=await csvRepository.get(id,scope,db,true),payloadHash=hash(input)
    const replay=(await db.query("select * from liquidity_csv_applications where import_id=$1 and idempotency_key=$2 and status='APPLIED'",[id,input.idempotencyKey])).rows[0]
    if(replay){if(replay.payload_hash!==payloadHash)throw new CsvError('STALE_VERSION');return {applicationId:replay.id,snapshotIds:replay.snapshot_ids}}
    if(row.version!==input.expectedVersion)throw new CsvError('STALE_VERSION')
    if(!['NEEDS_REVIEW','READY_TO_APPLY'].includes(row.status))throw new CsvError('INVALID_STATE')
    const application=(await db.query('select * from liquidity_csv_applications where id=$1 and import_id=$2 for update',[input.previewId,id])).rows[0]
    if(!application||application.status!=='PREVIEW'||new Date(application.expires_at).valueOf()<Date.now()||application.expected_version!==row.version||application.summary_hash!==input.summaryHash||application.review_revision!==row.review_revision||application.run_id!==row.active_run_id)throw new CsvError('STALE_VERSION')
    const bindings=application.bindings as AccountBinding[],detail=await csvRepository.detail(id,scope,db)
    const built=await buildPreview(row,detail,bindings,scope,db)
    if(built.summaryHash!==input.summaryHash||built.canonicalHash!==application.canonical_hash||hash(built.accountStates)!==hash(application.account_states))throw new CsvError('STALE_VERSION')
    const snapshotIds:string[]=[]
    for(const [i,binding] of bindings.entries()){
      const a=built.result.draft.accounts.find(a=>a.occurrenceId===binding.occurrenceId)!,r=built.result.accounts[a.occurrenceId]!,order=built.orders[i]!,snapshotId=randomUUID()
      const prior=(await db.query(`select max(revision) as revision,
        (select id from liquidity_holdings_snapshots where source_account_id=$1 and effective_key=$2 and current_eligible and superseded_by_snapshot_id is null order by revision desc limit 1) as id
        from liquidity_holdings_snapshots where source_account_id=$1 and effective_key=$2`,[binding.accountId,order.effectiveKey])).rows[0]
      await db.query(`insert into liquidity_holdings_snapshots(id,source_account_id,entity_id,source_kind,import_id,run_id,application_id,as_of_date,as_of_at,as_of_precision,source_zone,effective_key,revision,approved_by,reported_total,position_total,reconciliation,coverage,supersedes_snapshot_id,current_eligible)
        values($1,$2,$3,'CSV',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,[snapshotId,binding.accountId,row.entity_id,id,row.active_run_id,application.id,a.asOfDate.value,a.asOfAt.value,a.asOfPrecision,a.sourceZone.value,order.effectiveKey,(prior?.revision??0)+1,scope.userId,a.reportedTotal.value,r.totalValue,r.status,JSON.stringify({basis:r.basisCoverage,gain:r.gainCoverage}),order.eligible?(prior?.id??null):null,order.eligible])
      const positions=a.positions.map(p=>({id:randomUUID(),source_occurrence:p.occurrenceId,source_record:p.sourceRecord,quantity:p.quantity.value,price:p.price.value,market_value:p.marketValue.value,cost_basis:p.costBasis.availability==='COMPLETE'?p.costBasis.value:null,unrealized_gain_loss:p.unrealizedGainLoss.availability==='COMPLETE'?p.unrealizedGainLoss.value:null,unrealized_gain_loss_ratio:p.unrealizedGainLossRatio.availability==='COMPLETE'?p.unrealizedGainLossRatio.value:null,currency:p.currency.value,canonical:p}))
      if(positions.length)await db.query(`insert into liquidity_source_positions(id,snapshot_id,source_account_id,source_occurrence,source_record,quantity,price,market_value,cost_basis,unrealized_gain_loss,unrealized_gain_loss_ratio,currency,canonical)
        select x.id,$1,$2,x.source_occurrence,x.source_record,x.quantity,x.price,x.market_value,x.cost_basis,x.unrealized_gain_loss,x.unrealized_gain_loss_ratio,x.currency,x.canonical from jsonb_to_recordset($3::jsonb) as x(id uuid,source_occurrence text,source_record integer,quantity numeric,price numeric,market_value numeric,cost_basis numeric,unrealized_gain_loss numeric,unrealized_gain_loss_ratio numeric,currency text,canonical jsonb)`,[snapshotId,binding.accountId,JSON.stringify(positions)])
      if(prior?.id&&order.eligible)await db.query('update liquidity_holdings_snapshots set superseded_by_snapshot_id=$2 where id=$1',[prior.id,snapshotId])
      await db.query(`update liquidity_source_accounts set current_snapshot_id=case when $3 then $2 else current_snapshot_id end,active_source='CSV',identifier_fingerprint=coalesce($4,identifier_fingerprint),version=version+1,updated_at=now() where id=$1`,[binding.accountId,snapshotId,order.willBecomeCurrent,a.identifierFingerprints[0]??null])
      snapshotIds.push(snapshotId)
    }
    await auditRepository.record({actorUserId:scope.userId,eventName:'liquidity.csv.apply',objectType:'liquidity_csv',objectId:id,after:{applicationId:application.id,snapshotIds}},db)
    await db.query("update liquidity_csv_applications set status='APPLIED',idempotency_key=$2,payload_hash=$3,snapshot_ids=$4,applied_at=now() where id=$1",[application.id,input.idempotencyKey,payloadHash,JSON.stringify(snapshotIds)])
    await db.query("update liquidity_csv_imports set status='APPLIED',applied_at=now(),version=version+1 where id=$1",[id])
    await db.query('insert into liquidity_source_outbox(id,application_id,entity_id,account_ids) values($1,$2,$3,$4)',[randomUUID(),application.id,row.entity_id,JSON.stringify(bindings.map(b=>b.accountId))])
    return {applicationId:application.id,snapshotIds}
  })
}}
