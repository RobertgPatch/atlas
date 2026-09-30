import { randomUUID } from 'node:crypto'
import { config } from '../../config.js'
import { withTransaction } from '../../infra/db/client.js'
import { auditRepository } from '../audit/audit.repository.js'
import type { LiquidityScope } from '../liquidity-sources/liquidity-source.repository.js'
import { csvRepository,hash } from './liquidity-statement.repository.js'
import { CsvError } from './liquidity-statement.errors.js'
import { applySchema } from './liquidity-statement.zod.js'
import { buildPreview } from './csv-application-preview.service.js'
import type { AccountBinding,CsvField,CsvPosition,ExcludedAccountDecision,StatementPosition } from './liquidity-statement.types.js'

const financialField=(field:CsvField|undefined)=>field
  ?{value:field.value??null,availability:field.availability}
  :{value:null,availability:'NOT_PROVIDED'}

/**
 * Financial publication identity deliberately excludes evidence, source row and
 * recipe identifiers. Sorting position projections makes source row order
 * irrelevant while retaining repeated, financially identical positions.
 */
export function financialContentDigest(positions:Array<CsvPosition|StatementPosition>):string {
  const financialPositions=positions.map(position=>{
    const p=position as CsvPosition&Record<string,any>
    const convention=p.valuationConvention??{}
    return {
      description:financialField(p.description),
      symbol:financialField(p.symbol),
      cusip:financialField(p.cusip),
      isin:financialField(p.isin),
      brokerSecurityId:financialField(p.brokerSecurityId),
      assetType:financialField(p.assetType),
      sourceAssetType:financialField(p.sourceAssetType),
      currency:financialField(p.currency),
      quantity:financialField(p.quantity),
      price:financialField(p.price),
      marketValue:financialField(p.marketValue),
      costBasis:financialField(p.costBasis),
      unrealizedGainLoss:financialField(p.unrealizedGainLoss),
      unrealizedGainLossRatio:financialField(p.unrealizedGainLossRatio),
      dayChange:financialField(p.dayChange),
      dayChangeRatio:financialField(p.dayChangeRatio),
      accruedInterest:financialField(p.accruedInterest),
      quoteMultiplier:financialField(p.quoteMultiplier),
      sourceOriginalCost:financialField(p.sourceOriginalCost),
      sourceAdjustedCost:financialField(p.sourceAdjustedCost),
      basisSourceField:p.basisSourceField??null,
      valuationConvention:{
        priceUnit:convention.priceUnit??'UNKNOWN',
        quantityUnit:convention.quantityUnit??'UNKNOWN',
        multiplier:convention.multiplier??null,
        accruedInterest:convention.accruedInterest??'UNKNOWN',
        providerIdentity:convention.providerIdentity??null,
      },
    }
  }).map(value=>JSON.stringify(value,(_key,nested)=>nested&&typeof nested==='object'&&!Array.isArray(nested)?Object.fromEntries(Object.keys(nested).sort().map(key=>[key,nested[key]])):nested)).sort()
  return hash(financialPositions)
}

async function priorFinancialPublication(db:Parameters<Parameters<typeof withTransaction>[0]>[0],input:{importId:string;accountId:string;effectiveKey:string;digest:string}){
  const candidates=(await db.query(`select id,coverage from liquidity_holdings_snapshots
    where import_id=$1 and source_account_id=$2 and effective_key=$3
    order by revision desc`,[input.importId,input.accountId,input.effectiveKey])).rows
  for(const candidate of candidates){
    const storedDigest=candidate.coverage?.financialDigest
    if(storedDigest===input.digest)return candidate.id as string
    if(storedDigest)continue
    const positions=(await db.query('select canonical from liquidity_source_positions where snapshot_id=$1 order by id',[candidate.id])).rows.map(row=>row.canonical) as CsvPosition[]
    if(financialContentDigest(positions)===input.digest)return candidate.id as string
  }
  return null
}
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
    const bindings=application.bindings as AccountBinding[],excludedAccounts=application.excluded_accounts as ExcludedAccountDecision[],detail=await csvRepository.detail(id,scope,db)
    const built=await buildPreview(row,detail,bindings,scope,db,excludedAccounts)
    if(built.summaryHash!==input.summaryHash||built.canonicalHash!==application.canonical_hash||hash(built.accountStates)!==hash(application.account_states))throw new CsvError('STALE_VERSION')
    const snapshotIds:string[]=[],publishedAccountIds:string[]=[]
    const statementSource=(built.result.draft as any).schemaVersion==='3.0.0'
    const sourceKind=statementSource?'STATEMENT':'CSV'
    for(const [i,binding] of bindings.entries()){
      const a=built.result.draft.accounts.find(a=>a.occurrenceId===binding.occurrenceId)!,r=built.result.accounts[a.occurrenceId]!,order=built.orders[i]!,snapshotId=randomUUID()
      const financialDigest=financialContentDigest(a.positions)
      const unchangedSnapshotId=await priorFinancialPublication(db,{importId:id,accountId:binding.accountId,effectiveKey:order.effectiveKey,digest:financialDigest})
      if(unchangedSnapshotId){snapshotIds.push(unchangedSnapshotId);continue}
      const prior=(await db.query(`select max(revision) as revision,
        (select id from liquidity_holdings_snapshots where source_account_id=$1 and effective_key=$2 and current_eligible and superseded_by_snapshot_id is null order by revision desc limit 1) as id
        from liquidity_holdings_snapshots where source_account_id=$1 and effective_key=$2`,[binding.accountId,order.effectiveKey])).rows[0]
      const reportedTotal=statementSource?(built.result.draft as any).controls.find((control:any)=>control.accountOccurrenceId===a.occurrenceId&&control.metric==='MARKET_VALUE'&&control.scope.kind==='COMPLETE_ACCOUNT')?.reported?.value??null:(a as any).reportedTotal?.value??null
      await db.query(`insert into liquidity_holdings_snapshots(id,source_account_id,entity_id,source_kind,import_id,run_id,application_id,as_of_date,as_of_at,as_of_precision,source_zone,effective_key,revision,approved_by,reported_total,position_total,reconciliation,coverage,supersedes_snapshot_id,current_eligible)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,[snapshotId,binding.accountId,row.entity_id,sourceKind,id,row.active_run_id,application.id,a.asOfDate.value,a.asOfAt.value,a.asOfPrecision,a.sourceZone.value,order.effectiveKey,(prior?.revision??0)+1,scope.userId,reportedTotal,r.totalValue,r.status,JSON.stringify({basis:r.basisCoverage,gain:r.gainCoverage,financialDigest}),order.eligible?(prior?.id??null):null,order.eligible])
      const positions=a.positions.map(p=>({id:randomUUID(),source_occurrence:p.occurrenceId,source_record:p.sourceRecord,quantity:p.quantity.value,price:p.price.value,market_value:p.marketValue.value,cost_basis:p.costBasis.availability==='COMPLETE'?p.costBasis.value:null,unrealized_gain_loss:p.unrealizedGainLoss.availability==='COMPLETE'?p.unrealizedGainLoss.value:null,unrealized_gain_loss_ratio:p.unrealizedGainLossRatio.availability==='COMPLETE'?p.unrealizedGainLossRatio.value:null,currency:p.currency.value,canonical:p}))
      if(positions.length)await db.query(`insert into liquidity_source_positions(id,snapshot_id,source_account_id,source_occurrence,source_record,quantity,price,market_value,cost_basis,unrealized_gain_loss,unrealized_gain_loss_ratio,currency,canonical)
        select x.id,$1,$2,x.source_occurrence,x.source_record,x.quantity,x.price,x.market_value,x.cost_basis,x.unrealized_gain_loss,x.unrealized_gain_loss_ratio,x.currency,x.canonical from jsonb_to_recordset($3::jsonb) as x(id uuid,source_occurrence text,source_record integer,quantity numeric,price numeric,market_value numeric,cost_basis numeric,unrealized_gain_loss numeric,unrealized_gain_loss_ratio numeric,currency text,canonical jsonb)`,[snapshotId,binding.accountId,JSON.stringify(positions)])
      if(prior?.id&&order.eligible)await db.query('update liquidity_holdings_snapshots set superseded_by_snapshot_id=$2 where id=$1',[prior.id,snapshotId])
      await db.query(`update liquidity_source_accounts set current_snapshot_id=case when $3 then $2 else current_snapshot_id end,active_source=$5,identifier_fingerprint=coalesce($4,identifier_fingerprint),version=version+1,updated_at=now() where id=$1`,[binding.accountId,snapshotId,order.willBecomeCurrent,a.identifierFingerprints[0]??null,sourceKind])
      snapshotIds.push(snapshotId)
      publishedAccountIds.push(binding.accountId)
    }
    await auditRepository.record({actorUserId:scope.userId,eventName:'liquidity.csv.apply',objectType:'liquidity_csv',objectId:id,after:{applicationId:application.id,snapshotIds}},db)
    await db.query("update liquidity_csv_applications set status='APPLIED',idempotency_key=$2,payload_hash=$3,snapshot_ids=$4,applied_at=now() where id=$1",[application.id,input.idempotencyKey,payloadHash,JSON.stringify(snapshotIds)])
    await db.query("update liquidity_csv_imports set status='APPLIED',source_identity_retained=true,applied_at=now(),version=version+1 where id=$1",[id])
    if(publishedAccountIds.length)await db.query('insert into liquidity_source_outbox(id,application_id,entity_id,account_ids) values($1,$2,$3,$4)',[randomUUID(),application.id,row.entity_id,JSON.stringify(publishedAccountIds)])
    return {applicationId:application.id,snapshotIds}
  })
}}
