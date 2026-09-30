import { randomUUID } from 'node:crypto'
import { describe,expect,it } from 'vitest'
import { pool } from '../../src/infra/db/client.js'
import { parseCsv } from '../../src/modules/liquidity-statements/csv/profiles.js'
import { normalizeDraft } from '../../src/modules/liquidity-statements/csv/normalize.js'
import { reconcileDraft } from '../../src/modules/liquidity-statements/csv/reconcile.js'
import { byteHash,csvRepository,hash } from '../../src/modules/liquidity-statements/liquidity-statement.repository.js'
import { buildCsvFixture } from './fixtures/buildCsvFixture.js'
import { csvFixture } from './testHelpers.js'
import { buildMorganStanleyHoldingsFixture } from './fixtures/morgan-stanley/holdings.fixture.js'

describe.skipIf(!pool)('repository compatibility for retained schema-2 imports',()=>{
  it('reads and downloads legacy evidence without rewriting adapter identity, amounts or operation hash',async()=>{
    const fixture=await csvFixture(),source=buildCsvFixture(),upload=await fixture.upload(source)
    const parsed=await parseCsv(Buffer.from(source)),result=reconcileDraft(normalizeDraft(parsed.draft!))
    const canonicalHash=hash(result.draft),run=(await pool!.query('select active_run_id from liquidity_csv_imports where id=$1',[upload.id])).rows[0].active_run_id
    await pool!.query("update liquidity_csv_parse_runs set status='SUCCEEDED',canonical_draft=$2,canonical_hash=$3,reconciliation=$4,completed_at=now() where id=$1",[run,result.draft,canonicalHash,result.accounts])
    await pool!.query("update liquidity_csv_imports set status='NEEDS_REVIEW',version=version+1 where id=$1",[upload.id])
    const detail=await csvRepository.detail(upload.id,fixture.scope)
    expect(detail).toMatchObject({activeRunId:run,sourceSchemaVersion:'2.0.0',storedCanonicalHash:canonicalHash,summary:{adapterId:'positions_v1'}})
    expect(detail.canonicalDraft?.accounts[0]!.positions[0]!.marketValue.value).toBe('800')
    expect(detail.availableAdapterVersions).toEqual(expect.arrayContaining([expect.objectContaining({id:'charles_schwab_positions_csv',version:'1.0.0',fileKind:'CSV',current:false})]))
    expect((await fixture.service.original(upload.id,fixture.scope)).toString('utf8')).toBe(source)
    expect((await fixture.service.download(upload.id,fixture.scope)).url).toContain(`/liquidity-statements/${upload.id}/content`)
    expect((await pool!.query('select canonical_hash,canonical_draft->\'adapter\' as adapter from liquidity_csv_parse_runs where id=$1',[run])).rows[0]).toEqual({canonical_hash:canonicalHash,adapter:{id:'positions_v1',version:'1.3.0'}})
  })

  it('keeps an already approved XLSX original readable when new XLSX ingestion is disabled',async()=>{
    const fixture=await csvFixture(),id=randomUUID(),bytes=buildMorganStanleyHoldingsFixture(),sha256=byteHash(bytes),key=fixture.store.key(fixture.entityId,id,'XLSX'),storageVersion=await fixture.store.putLocal(key,bytes,sha256,bytes.length)
    await pool!.query(`insert into liquidity_csv_imports(id,entity_id,custodian,uploaded_by_user_id,file_name,sha256,size_bytes,content_type,file_kind,storage_key,storage_version,capability_token_hash,capability_expires_at,status,source_identity_retained)
      values($1,$2,'Synthetic Broker',$3,'protected.xlsx',$4,$5,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','XLSX',$6,$7,$8,now()+interval '1 hour','APPLIED',true)`,[id,fixture.entityId,fixture.scope.userId,sha256,bytes.length,key,storageVersion,byteHash('capability')])
    expect(await fixture.service.original(id,fixture.scope)).toEqual(bytes)
    expect((await fixture.service.download(id,fixture.scope)).url).toContain(`/liquidity-statements/${id}/content`)
  })
})
